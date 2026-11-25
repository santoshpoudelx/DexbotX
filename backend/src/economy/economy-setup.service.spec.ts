import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import type { DatabaseService } from '../db/database.service';
import type { DiscordRestService } from '../discord/discord-rest.service';
import type { RedisService } from '../redis/redis.service';
import { economySettings } from '../db/schema';
import { defaultEconomySettings } from './economy.schema';
import type { EconomyMessageService } from './economy-message.service';
import type { EconomyWindowService } from './economy-window.service';
import { EconomySetupService } from './economy-setup.service';

const guildId = '100000000000000001';
const botId = '900000000000000001';
const categoryId = '300000000000000001';
const channelDefs = [
  ['announcementsChannelId', 'economy-announcements'],
  ['rulesChannelId', 'economy-rules'],
  ['leaderboardChannelId', 'leaderboard'],
  ['commandsChannelId', 'economy-commands'],
  ['storeChannelId', 'store'],
  ['heistLogChannelId', 'heist-log'],
] as const;

function createHarness(existing?: Record<string, unknown>, selectError?: Error) {
  const channelIds = channelDefs.map((_, index) => `40000000000000000${index + 1}`);
  let createdChannelIndex = 0;
  const existingChannels = existing ? [
    { id: categoryId, type: 4, name: 'Dex Economy', parent_id: null },
    ...channelDefs.map(([, name], index) => ({
      id: channelIds[index],
      type: 0,
      name,
      parent_id: categoryId,
      permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: String(PermissionFlagsBits.ViewChannel) }],
    })),
  ] : [];
  const discord = {
    getGuildAsBot: jest.fn().mockResolvedValue({ name: 'Test server' }),
    getGuildRoles: jest.fn().mockResolvedValue([{ id: guildId, permissions: '8' }]),
    getGuildMember: jest.fn().mockResolvedValue({ roles: [] }),
    getGuildChannels: jest.fn().mockResolvedValue(existingChannels),
    createGuildChannel: jest.fn(async (_id: string, body: Record<string, unknown>) => ({
      id: body.type === 4 ? categoryId : channelIds[createdChannelIndex++],
    })),
    editGuildChannel: jest.fn().mockResolvedValue({}),
    createRole: jest.fn().mockResolvedValue({ id: '500000000000000001' }),
    createChannelMessage: jest.fn().mockResolvedValue({ id: '600000000000000001' }),
    getChannelMessage: jest.fn().mockResolvedValue({ id: '700000000000000001' }),
    pinChannelMessage: jest.fn().mockResolvedValue(undefined),
  };
  const orderedRows = Object.assign([] as unknown[], {
    limit: jest.fn().mockResolvedValue([]),
  });
  const database = {
    db: {
      select: jest.fn(() => {
        if (selectError) throw selectError;
        return {
          from: jest.fn((table: unknown) => ({
            where: jest.fn(() => {
              const rows = table === economySettings && existing ? [existing] : [];
              return {
                limit: jest.fn().mockResolvedValue(rows),
                orderBy: jest.fn(() => orderedRows),
              };
            }),
          })),
        };
      }),
      insert: jest.fn(() => ({
        values: jest.fn(() => ({
          onConflictDoNothing: jest.fn().mockResolvedValue([]),
          onConflictDoUpdate: jest.fn().mockResolvedValue([]),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })),
      })),
    },
  };
  const redis = {
    client: {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
    },
  };
  const messages = {
    updateRules: jest.fn().mockResolvedValue(undefined),
    updateStore: jest.fn().mockResolvedValue(undefined),
    refreshLeaderboard: jest.fn().mockResolvedValue(undefined),
    updateRobbingInfo: jest.fn().mockResolvedValue(undefined),
  };
  const windows = { reconcile: jest.fn().mockResolvedValue(undefined) };
  const service = new EconomySetupService(
    database as unknown as DatabaseService,
    redis as unknown as RedisService,
    discord as unknown as DiscordRestService,
    windows as unknown as EconomyWindowService,
    messages as unknown as EconomyMessageService,
  );
  return { service, discord, channelIds, redis };
}

describe('EconomySetupService channel permissions', () => {
  const previousBotId = process.env.DISCORD_CLIENT_ID;

  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = botId;
  });

  afterAll(() => {
    if (previousBotId === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = previousBotId;
  });

  it('surfaces database setup failures and releases the setup lock', async () => {
    const { service, redis } = createHarness(undefined, new Error('economy_settings table missing'));

    await expect(service.enable(guildId, 'Test server', botId, 'dashboard'))
      .rejects.toMatchObject({
        status: 500,
        message: 'Economy setup failed. Verify database migrations are applied and try again.',
      });
    expect(redis.client.del).toHaveBeenCalledWith(`guild:${guildId}:economy-setup-lock`);
  });

  it('creates channels in the requested order with explicit everyone permissions', async () => {
    const { service, discord } = createHarness();

    const result = await service.enable(guildId, 'Test server', botId, 'dashboard');

    expect(result.ok).toBe(true);
    expect(discord.createGuildChannel).toHaveBeenCalledTimes(7);
    const calls = discord.createGuildChannel.mock.calls as unknown as Array<[string, {
      name?: string;
      type?: number;
      position?: number;
      permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
    }]>;
    const view = PermissionFlagsBits.ViewChannel;
    const history = PermissionFlagsBits.ReadMessageHistory;
    const send = PermissionFlagsBits.SendMessages;
    const appCommands = PermissionFlagsBits.UseApplicationCommands;
    const reactions = PermissionFlagsBits.AddReactions;
    const memberAllow = view | history | send | appCommands | reactions;
    const readOnlyAllow = view | history;

    const category = calls.find(([, body]) => body.type === 4)?.[1];
    const categoryEveryone = category!.permission_overwrites!.find((overwrite) => overwrite.id === guildId)!;
    expect(BigInt(categoryEveryone.allow)).toBe(memberAllow);
    expect(BigInt(categoryEveryone.deny)).toBe(PermissionsBitField.All & ~memberAllow);

    const channels = calls.filter(([, item]) => item.type === 0);
    expect(channels.map(([, body]) => body.name)).toEqual([
      'economy-announcements',
      'economy-rules',
      'leaderboard',
      'economy-commands',
      'store',
      'heist-log',
    ]);

    for (const [index, [, body]] of channels.entries()) {
      const everyone = body.permission_overwrites!.find((overwrite) => overwrite.id === guildId)!;
      const bot = body.permission_overwrites!.find((overwrite) => overwrite.id === botId)!;
      const readOnly = ['economy-announcements', 'economy-rules', 'leaderboard', 'heist-log'].includes(body.name!);
      const expectedAllow = readOnly ? readOnlyAllow : memberAllow;
      expect(body.position).toBe(index);
      expect(BigInt(everyone.allow)).toBe(expectedAllow);
      expect(BigInt(everyone.deny)).toBe(PermissionsBitField.All & ~expectedAllow);
      expect(BigInt(bot.allow) & send).toBe(send);
      expect(BigInt(bot.allow) & history).toBe(history);
      if (body.name === 'economy-commands' || body.name === 'store') {
        expect(body.permission_overwrites).toEqual(category!.permission_overwrites);
      }
    }
  });

  it('repairs permissions, names, and order on existing economy channels', async () => {
    const existing = {
      guildId,
      enabled: false,
      paused: false,
      config: defaultEconomySettings(),
      categoryId,
      defaultsSeeded: true,
      panelMessageId: '700000000000000001',
      storeMessageId: '700000000000000002',
      leaderboardMessageId: '700000000000000003',
      countdownMessageId: '700000000000000004',
      rulesMessageIds: ['700000000000000005'],
      ...Object.fromEntries(channelDefs.map(([field], index) => [field, `40000000000000000${index + 1}`])),
    };
    const { service, discord } = createHarness(existing);

    const result = await service.enable(guildId, 'Test server', botId, 'dashboard');

    expect(result.ok).toBe(true);
    expect(discord.createGuildChannel).not.toHaveBeenCalled();
    expect(discord.editGuildChannel).toHaveBeenCalledTimes(7);
    const edits = discord.editGuildChannel.mock.calls as unknown as Array<[string, {
      name?: string;
      parent_id?: string;
      position?: number;
      permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
    }]>;
    expect(edits.slice(1).map(([, body]) => body.name)).toEqual([
      'economy-announcements',
      'economy-rules',
      'leaderboard',
      'economy-commands',
      'store',
      'heist-log',
    ]);
    expect(edits.slice(1).map(([, body]) => body.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(edits.slice(1).every(([, body]) => body.parent_id === categoryId)).toBe(true);

    const memberAllow = PermissionFlagsBits.ViewChannel
      | PermissionFlagsBits.ReadMessageHistory
      | PermissionFlagsBits.SendMessages
      | PermissionFlagsBits.UseApplicationCommands
      | PermissionFlagsBits.AddReactions;
    const readOnlyAllow = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
    for (const [, body] of edits) {
      const everyone = body.permission_overwrites!.find((overwrite) => overwrite.id === guildId)!;
      const expectedAllow = ['economy-announcements', 'economy-rules', 'leaderboard', 'heist-log'].includes(body.name!)
        ? readOnlyAllow
        : memberAllow;
      expect(BigInt(everyone.allow)).toBe(expectedAllow);
      expect(BigInt(everyone.deny)).toBe(PermissionsBitField.All & ~expectedAllow);
    }
  });
});
