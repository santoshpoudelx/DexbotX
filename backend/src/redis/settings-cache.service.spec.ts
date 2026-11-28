import { SettingsCache } from './settings-cache.service';
import type { RedisService } from './redis.service';

describe('SettingsCache', () => {
  const guildId = '123456789012345678';
  const redis = {
    client: { publish: jest.fn().mockResolvedValue(1) },
    cache: {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    },
    subscribe: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads and fills the shared guild-settings cache through the secondary connection', async () => {
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const database = { db: { select: jest.fn(() => query) } };
    const stats = { hit: jest.fn().mockResolvedValue(undefined), miss: jest.fn().mockResolvedValue(undefined) };
    redis.cache.get = jest.fn().mockResolvedValue(null);

    const cache = new SettingsCache(redis, database as never, stats as never);
    await cache.get(guildId);

    expect(redis.cache.get).toHaveBeenCalledWith(`guild:${guildId}:settings`);
    expect(redis.cache.set).toHaveBeenCalledWith(
      `guild:${guildId}:settings`,
      expect.any(String),
      'EX',
      60 * 60,
    );
    expect(redis.client.publish).not.toHaveBeenCalled();
  });

  it('invalidates the secondary cache and publishes through the primary connection', async () => {
    const cache = new SettingsCache(redis, {} as never, {} as never);

    await cache.invalidate(guildId);

    expect(redis.cache.del).toHaveBeenCalledWith(`guild:${guildId}:settings`);
    expect(redis.client.publish).toHaveBeenCalledWith('dexbotx:guilds:settings', guildId);
  });
});
