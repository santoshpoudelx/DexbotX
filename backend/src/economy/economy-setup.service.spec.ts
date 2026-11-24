import { PermissionFlagsBits } from 'discord.js';
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
  ['rulesChannelId', 'economy-rules'],
  ['commandsChannelId', 'economy-commands'],
  ['leaderboardChannelId', 'leaderboard'],
  ['storeChannelId', 'store'],
  ['heistLogChannelId', 'heist-log'],
  ['announcementsChannelId', 'economy-announcements'],
] as const;

function createHarness(existing?: Record<string, unknown>) {
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
      select: jest.fn(() => ({
        from: jest.fn((table: unknown) => ({
          where: jest.fn(() => {
            const rows = table === economySettings && existing ? [existing] : [];
            return {
              limit: jest.fn().mockResolvedValue(rows),
              orderBy: jest.fn(() => orderedRows),
            };
          }),
        })),
      })),
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
  const redis = { client: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) } };
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
  return { service, discord, channelIds };
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

  it('creates public channels, allows slash commands only in economy-commands, and blocks member text', async () => {
    const { service, discord } = createHarness();

    const result = await service.enable(guildId, 'Test server', botId, 'dashboard');

    expect(result.ok).toBe(true);
    expect(discord.createGuildChannel).toHaveBeenCalledTimes(7);
    const calls = discord.createGuildChannel.mock.calls as unknown as Array<[string, {
      name?: string;
      type?: number;
      permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
    }]>;
    const view = PermissionFlagsBits.ViewChannel;
    const send = PermissionFlagsBits.SendMessages;
    const appCommands = PermissionFlagsBits.UseApplicationCommands;

    const category = calls.find(([, body]) => body.type === 4)?.[1];
    expect(BigInt(category!.permission_overwrites!.find((overwrite) => overwrite.id === guildId)!.allow) & view).toBe(view);

    for (const [, body] of calls.filter(([, item]) => item.type === 0)) {
      const everyone = body.permission_overwrites!.find((overwrite) => overwrite.id === guildId)!;
      const bot = body.permission_overwrites!.find((overwrite) => overwrite.id === botId)!;
      expect(BigInt(everyone.allow) & view).toBe(view);
      expect(BigInt(everyone.deny) & send).toBe(send);
      expect(BigInt(bot.allow) & send).toBe(send);
      if (body.name === 'economy-commands') {
        expect(BigInt(everyone.allow) & appCommands).toBe(appCommands);
        expect(BigInt(everyone.deny) & appCommands).toBe(0n);
      } else {
        expect(BigInt(everyone.deny) & appCommands).toBe(appCommands);
      }
    }
  });

  it('repairs visibility and command restrictions on existing economy channels', async () => {
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
  });
});
