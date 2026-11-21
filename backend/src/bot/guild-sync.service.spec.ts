import { describe, expect, it, jest } from '@jest/globals';
import { DatabaseService } from '../db/database.service';
import { guildChannels, guildRoles } from '../db/schema';
import { DiscordRestService } from '../discord/discord-rest.service';
import { RedisService } from '../redis/redis.service';
import { SettingsCache } from '../redis/settings-cache.service';
import { GUILD_CHANNELS_CHANGED_CHANNEL, GUILD_SYNCED_CHANNEL, guildChannelsCacheKey } from '../guilds/guild-events';
import { getAutoRoleSafetyReason } from '../shared/auto-roles';
import { GuildSyncService } from './guild-sync.service';

function makeService(
  inserted = true,
  roleFixtures = [{ id: 'role-live', name: 'member', color: 0, position: 1 }],
  botRoleIds: string[] = [],
) {
  const deletes: Array<{ table: unknown; condition: unknown }> = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const makeInsert = (table: unknown) => ({
    values: jest.fn((values: unknown) => {
      inserts.push({ table, values });
      return {
        onConflictDoUpdate: jest.fn(async () => undefined),
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(async () => inserted ? [{ id: 'guild-123' }] : []),
        })),
      };
    }),
  });
  const tx = {
    insert: jest.fn((table: unknown) => makeInsert(table)),
    delete: jest.fn((table: unknown) => ({
      where: jest.fn(async (condition: unknown) => {
        deletes.push({ table, condition });
        return [];
      }),
    })),
  };
  const database = {
    db: {
      transaction: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) => work(tx)),
      insert: jest.fn((table: unknown) => makeInsert(table)),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [{
              id: 'guild-123',
              name: 'Guild',
              iconHash: null,
              bannerHash: null,
              ownerId: 'owner-123',
              memberCount: 10,
              installed: true,
              joinedAt: new Date(),
              leftAt: null,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            }]),
          })),
        })),
      })),
      delete: jest.fn((table: unknown) => ({
        where: jest.fn(async (condition: unknown) => {
          deletes.push({ table, condition });
          return [];
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({
            returning: jest.fn(async () => [{ id: 'guild-123' }]),
          })),
        })),
      })),
    },
  } as unknown as DatabaseService;
  const redisClient = {
    get: jest.fn(async (_key: string) => null as string | null),
    set: jest.fn(async (..._args: unknown[]) => 'OK' as string | null),
    del: jest.fn(async (..._args: unknown[]) => 1),
    publish: jest.fn(async (..._args: unknown[]) => 1),
    incr: jest.fn(async (..._args: unknown[]) => 1),
  };
  const redis = { client: redisClient } as unknown as RedisService;
  const discord = {
    getGuildAsBot: jest.fn(async () => ({
      id: 'guild-123',
      name: 'Guild',
      icon: null,
      owner_id: 'owner-123',
      approximate_member_count: 10,
    })),
    getGuildChannels: jest.fn(async () => [
      { id: 'channel-live', name: 'general', type: 0, position: 1, parent_id: null },
    ]),
    getGuildRoles: jest.fn(async () => roleFixtures),
    getGuildMember: jest.fn(async () => ({ roles: botRoleIds })),
  } as unknown as DiscordRestService;
  const settings = { get: jest.fn(async () => ({ welcome: {}, goodbye: {} })) } as unknown as SettingsCache;
  const stats = { incr: jest.fn(async (_name: string) => undefined) };
  const service = new GuildSyncService({ discordClientId: '123456789012345678' } as never, database, redis, discord, settings, stats as never);
  return { service, database, redisClient, discord, stats, deletes, inserts };
}

describe('GuildSyncService', () => {
  it('syncs snapshots and removes channel and role rows absent from Discord', async () => {
    const { service, discord, redisClient, deletes, inserts } = makeService();

    const result = await service.syncGuild('guild-123');

    expect(result.channels).toEqual([{ id: 'channel-live', name: 'general', category: null }]);
    expect(result.roles).toEqual([{
      id: 'role-live', name: 'member', color: 0, position: 1,
      permissions: '0', managed: false, tags: {},
    }]);
    expect(discord.getGuildAsBot).toHaveBeenCalledWith('guild-123');
    expect(discord.getGuildChannels).toHaveBeenCalledWith('guild-123');
    expect(discord.getGuildRoles).toHaveBeenCalledWith('guild-123');
    expect(inserts.map(({ table }) => table)).toEqual(expect.arrayContaining([guildChannels, guildRoles]));
    expect(deletes.map(({ table }) => table)).toEqual(expect.arrayContaining([guildChannels, guildRoles]));
    expect(redisClient.set).toHaveBeenCalledWith(guildChannelsCacheKey('guild-123'), JSON.stringify(result.channels), 'EX', 3600);
    expect(redisClient.publish).toHaveBeenCalledWith(GUILD_SYNCED_CHANNEL, 'guild-123');
  });

  it('stores the highest bot role using Discord tie-breaking for equal positions', async () => {
    const botRoleId = '100000000000000001';
    const lowerRoleId = '100000000000000002';
    const { service, redisClient } = makeService(true, [
      { id: lowerRoleId, name: 'bot role', color: 0, position: 3 },
      { id: botRoleId, name: 'other bot role', color: 0, position: 3 },
    ], [botRoleId, lowerRoleId]);

    await service.syncGuild('guild-123');

    expect(redisClient.set).toHaveBeenCalledWith(
      'guild:guild-123:bot-status',
      JSON.stringify({ highestPosition: 3, highestRoleId: botRoleId, manageRoles: false }),
      'EX',
      12 * 60,
    );
  });

  it('refreshes legacy bot hierarchy cache entries that lack the highest role ID', async () => {
    const botRoleId = '100000000000000001';
    const memberRoleId = '100000000000000002';
    const roles = [
      { id: botRoleId, name: 'DexBotX', color: 0, position: 5, permissions: '268435456', managed: true, tags: {} },
      { id: memberRoleId, name: 'Member', color: 0, position: 2, permissions: '0', managed: false, tags: {} },
    ];
    const { service, redisClient, discord } = makeService(true, roles, [botRoleId]);
    redisClient.get.mockResolvedValueOnce(JSON.stringify({ highestPosition: 5, manageRoles: true }));

    const status = await service.getBotStatus('guild-123', roles);
    expect(status).toEqual({
      highestPosition: 5,
      highestRoleId: botRoleId,
      manageRoles: true,
    });
    expect(getAutoRoleSafetyReason('guild-123', roles[1], status)).toBeNull();

    expect(discord.getGuildMember).toHaveBeenCalledWith('guild-123', '123456789012345678');
    expect(redisClient.set).toHaveBeenCalledWith(
      'guild:guild-123:bot-status',
      JSON.stringify({ highestPosition: 5, highestRoleId: botRoleId, manageRoles: true }),
      'EX',
      12 * 60,
    );
  });

  it('syncs a gateway snapshot without calling Discord REST', async () => {
    const { service, discord, redisClient, inserts } = makeService();
    const guild = {
      id: 'guild-123',
      name: 'Gateway Guild',
      icon: null,
      banner: null,
      ownerId: 'owner-123',
      memberCount: 12,
      systemChannelId: 'channel-system',
      channels: {
        cache: new Map([
          ['category-1', { id: 'category-1', name: 'General', type: 4, position: 0, parentId: null }],
          ['channel-live', { id: 'channel-live', name: 'chat', type: 0, position: 1, parentId: 'category-1' }],
        ]),
      },
      roles: {
        cache: new Map([
          ['role-live', { id: 'role-live', name: 'Member', color: 2, position: 1, permissions: { bitfield: 1024n }, managed: false, tags: {} }],
        ]),
      },
      members: {
        me: {
          roles: { highest: { id: 'role-live', position: 20 } },
          permissions: { has: () => false },
        },
      },
    } as never;

    const result = await service.syncGuildFromGateway(guild);

    expect(result.guild).toMatchObject({ id: 'guild-123', name: 'Gateway Guild', memberCount: 12 });
    expect(result.channels).toEqual([{ id: 'channel-live', name: 'chat', category: 'General' }]);
    expect(result.roles).toEqual([{
      id: 'role-live', name: 'Member', color: 2, position: 1,
      permissions: '1024', managed: false, tags: {},
    }]);
    expect(inserts.map(({ table }) => table)).toEqual(expect.arrayContaining([guildChannels, guildRoles]));
    expect(redisClient.set).toHaveBeenCalledWith(
      'guild:guild-123:bot-status',
      JSON.stringify({ highestPosition: 20, highestRoleId: 'role-live', manageRoles: false }),
      'EX',
      12 * 60,
    );
    expect(redisClient.set).toHaveBeenCalledWith(
      guildChannelsCacheKey('guild-123'),
      JSON.stringify(result.channels),
      'EX',
      3600,
    );
    expect(discord.getGuildAsBot).not.toHaveBeenCalled();
    expect(discord.getGuildChannels).not.toHaveBeenCalled();
    expect(discord.getGuildRoles).not.toHaveBeenCalled();
  });

  it('refreshes cached bot hierarchy after a role event', async () => {
    const { service, redisClient } = makeService();
    const guild = {
      id: 'guild-123',
      members: {
        me: {
          roles: { highest: { id: '100000000000000001', position: 9 } },
          permissions: { has: () => true },
        },
      },
    } as never;

    await service.refreshBotStatusFromGateway(guild);

    expect(redisClient.set).toHaveBeenCalledWith(
      'guild:guild-123:bot-status',
      JSON.stringify({
        highestPosition: 9,
        highestRoleId: '100000000000000001',
        manageRoles: true,
      }),
      'EX',
      12 * 60,
    );
  });

  it('uses a distributed 30-second per-guild refresh cooldown', async () => {
    const { service, redisClient } = makeService();
    redisClient.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    await expect(service.tryAcquireRefreshCooldown('guild-123')).resolves.toBe(true);
    await expect(service.tryAcquireRefreshCooldown('guild-123')).resolves.toBe(false);
    expect(redisClient.set).toHaveBeenCalledWith('guild:guild-123:refresh-cooldown', '1', 'EX', 30, 'NX');
  });

  it('records guild joins and leaves', async () => {
    const { service, stats, redisClient } = makeService();
    await expect(service.upsert({ id: 'guild-123' } as never)).resolves.toBe(true);
    await service.markLeft('guild-123');
    expect(stats.incr).toHaveBeenCalledWith('guild_joins');
    expect(stats.incr).toHaveBeenCalledWith('guild_leaves');
    expect(redisClient.incr).toHaveBeenCalledTimes(2);
    expect(redisClient.incr).toHaveBeenNthCalledWith(1, 'guild:guild-123:rev');
    expect(redisClient.incr).toHaveBeenNthCalledWith(2, 'guild:guild-123:rev');
  });

  it('reports an existing guild as not newly inserted', async () => {
    const { service, database } = makeService(false);

    await expect(service.upsert({ id: 'guild-123' } as never)).resolves.toBe(false);
    expect(database.db.update).toHaveBeenCalled();
  });

  it('invalidates the exact channel key after an incremental channel write', async () => {
    const { service, redisClient } = makeService();

    await service.upsertChannel('guild-123', {
      id: 'channel-new',
      name: 'new-channel',
      type: 0,
      position: 2,
      parent_id: null,
    });

    expect(redisClient.del).toHaveBeenCalledWith(
      guildChannelsCacheKey('guild-123'),
      `discord:cache:channels:guild-123`,
      'chan:channel-new',
    );
    expect(redisClient.publish).toHaveBeenCalledWith(GUILD_CHANNELS_CHANGED_CHANNEL, 'guild-123');
    expect(redisClient.incr).toHaveBeenCalledWith('guild:guild-123:rev');
    expect(redisClient.publish).toHaveBeenCalledWith(
      'guild:guild-123:events',
      JSON.stringify({
        type: 'updated',
        guildId: 'guild-123',
        kind: 'channels',
        data: { channelId: 'channel-new' },
        rev: 1,
      }),
    );
  });

  it('uses a safe position when a role-create event has no position yet', async () => {
    const { service, inserts } = makeService();

    await service.upsertRole('guild-123', { id: 'role-new', name: 'DexBotX', color: 0 });

    expect(inserts).toContainEqual({
      table: guildRoles,
      values: {
        guildId: 'guild-123', id: 'role-new', name: 'DexBotX', color: 0, position: 0,
        permissions: '0', managed: false, tags: {},
      },
    });
  });
});
