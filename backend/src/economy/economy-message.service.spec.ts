import type { DatabaseService } from '../db/database.service';
import { economySettings } from '../db/schema';
import { DiscordApiError } from '../discord/discord-rest.service';
import type { DiscordRestService } from '../discord/discord-rest.service';
import type { RedisService } from '../redis/redis.service';
import { defaultEconomySettings } from './economy.schema';
import { EconomyMessageService } from './economy-message.service';

const guildId = '100000000000000001';
const robberId = '200000000000000001';
const targetId = '200000000000000002';
const channelId = '300000000000000001';

function createService(
  storeItems: Record<string, unknown>[] = [],
  rowOverrides: Record<string, unknown> = {},
) {
  const row = {
    guildId,
    config: defaultEconomySettings(),
    enabled: true,
    paused: false,
    announcementsChannelId: channelId,
    storeChannelId: channelId,
    ...rowOverrides,
  };
  const updates: Record<string, unknown>[] = [];
  const database = {
    db: {
      select: jest.fn(() => ({
        from: jest.fn((table: unknown) => ({
          where: jest.fn(() => table === economySettings
            ? { limit: jest.fn().mockResolvedValue([row]) }
            : { orderBy: jest.fn().mockResolvedValue(storeItems) }),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: Record<string, unknown>) => {
          updates.push(values);
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
    },
  };
  const discord = {
    createChannelMessage: jest.fn().mockResolvedValue({ id: '400000000000000001' }),
    getChannelMessage: jest.fn(),
    editChannelMessage: jest.fn(),
    deleteChannelMessage: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EconomyMessageService(
    database as unknown as DatabaseService,
    discord as unknown as DiscordRestService,
    {} as RedisService,
  );
  return { service, discord, updates };
}

function storeItem(itemId: string, kind: string, name: string, price: number, description: string) {
  return { itemId, kind, name, price, description, sortOrder: 0 };
}

describe('EconomyMessageService bounty announcements', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('announces bounty amount and target without buyer details or mention notifications', async () => {
    const { service, discord } = createService();
    const pending = service.postBountyAnnouncement(guildId, 100, targetId);

    await jest.advanceTimersByTimeAsync(800);
    await pending;

    expect(discord.createChannelMessage).toHaveBeenCalledWith(channelId, {
      content: `100 Dex bounty has been set on <@${targetId}>.`,
      allowed_mentions: { parse: [] },
    });
  });

  describe('EconomyMessageService store catalog', () => {
    it('renders categorized items with prices and item purchase buttons', async () => {
      const items = [
        storeItem('rob-tool', 'rob_tool', 'Robbingusertool', 400, 'One success, capped at 200.'),
        storeItem('shield', 'shield', 'Shield', 150, 'Blocks two robbery attempts.'),
        storeItem('bronze-role', 'role', 'Bronze Member', 400, 'A cosmetic role.'),
      ];
      const { service, discord } = createService(items);

      await service.updateStore(guildId);

      const payload = discord.createChannelMessage.mock.calls[0][1] as {
        embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
        components: Array<{ components: Array<{ custom_id: string; label: string }> }>;
      };
      expect(payload.embeds[0].title).toBe('Dex Economy | Store');
      expect(payload.embeds[0].fields.map((field) => field.name)).toEqual(['Robbing', 'Protection', 'Server roles']);
      expect(payload.embeds[0].fields[0].value).toContain('`400 Dex`');
      expect(payload.embeds[0].fields[1].value).toContain('Blocks two robbery attempts.');
      expect(payload.components.flatMap((row) => row.components.map((component) => component.custom_id)))
        .toEqual(['economy:buy:rob-tool', 'economy:buy:shield', 'economy:buy:bronze-role']);
    });

    it('uses a select menu when category-grouped buttons would exceed Discord row limits', async () => {
      const items = [
        ...Array.from({ length: 6 }, (_, index) => storeItem(`rob-${index}`, 'rob_tool', `Rob tool ${index}`, 400, 'Robbing tool.')),
        ...Array.from({ length: 6 }, (_, index) => storeItem(`shield-${index}`, 'shield', `Shield ${index}`, 150, 'Protection.')),
        ...Array.from({ length: 6 }, (_, index) => storeItem(`boost-${index}`, 'daily_boost', `Boost ${index}`, 150, 'Daily boost.')),
      ];
      const { service, discord } = createService(items);

      await service.updateStore(guildId);

      const payload = discord.createChannelMessage.mock.calls[0][1] as {
        components: Array<{ components: Array<{ type: number; options: Array<{ value: string }> }> }>;
      };
      expect(payload.components).toHaveLength(1);
      expect(payload.components[0].components[0].type).toBe(3);
      expect(payload.components[0].components[0].options).toHaveLength(18);
    });

    it('shows a useful empty state when no store items are enabled', async () => {
      const { service, discord } = createService();

      await service.updateStore(guildId);

      const payload = discord.createChannelMessage.mock.calls[0][1] as {
        embeds: Array<{ description: string }>;
        components: unknown[];
      };
      expect(payload.embeds[0].description).toBe('No store items are available right now.');
      expect(payload.components).toEqual([]);
    });

    it('replaces a store message when Discord blocks further edits to old messages', async () => {
      const oldMessageId = '400000000000000002';
      const newMessageId = '500000000000000001';
      const { service, discord, updates } = createService([], { storeMessageId: oldMessageId });
      discord.editChannelMessage.mockRejectedValue(new DiscordApiError(
        429,
        undefined,
        'Maximum number of edits to messages older than 1 hour reached.',
        2.7,
      ));
      discord.createChannelMessage.mockResolvedValue({ id: newMessageId });

      await service.updateStore(guildId);

      expect(updates).toContainEqual({ storeMessageId: newMessageId });
      expect(discord.deleteChannelMessage).toHaveBeenCalledWith(channelId, oldMessageId);
    });

    it('replaces only the rules message that hit the old-message edit limit', async () => {
      const rulesMessageIds = Array.from({ length: 6 }, (_, index) => `60000000000000000${index}`);
      const oldMessageId = rulesMessageIds[0];
      const newMessageId = '700000000000000001';
      const { service, discord, updates } = createService([], {
        rulesChannelId: channelId,
        commandsChannelId: channelId,
        rulesMessageIds,
        rulesHash: 'stale-hash',
      });
      discord.editChannelMessage.mockRejectedValueOnce(new DiscordApiError(
        429,
        undefined,
        'Maximum number of edits to messages older than 1 hour reached.',
        2.7,
      ));
      discord.createChannelMessage.mockResolvedValue({ id: newMessageId });

      await service.updateRules(guildId, 'Test server');

      expect(discord.createChannelMessage).toHaveBeenCalledTimes(1);
      expect(updates).toContainEqual({
        rulesMessageIds: [newMessageId, ...rulesMessageIds.slice(1)],
        rulesHash: expect.any(String),
      });
      expect(discord.deleteChannelMessage).toHaveBeenCalledWith(channelId, oldMessageId);
    });
  });

  it('announces the claimant, bounty amount and target without exposing the buyer', async () => {
    const { service, discord } = createService();
    const pending = service.postBountyClaimAnnouncement(guildId, robberId, 100, targetId);

    await jest.advanceTimersByTimeAsync(800);
    await pending;

    expect(discord.createChannelMessage).toHaveBeenCalledWith(channelId, {
      content: `<@${robberId}> claimed 100 Dex by robbing <@${targetId}>.`,
      allowed_mentions: { parse: [] },
    });
  });
});
