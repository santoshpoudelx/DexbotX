import type { StatsService } from '../admin/stats.service';
import type { AppConfig } from '../core/config';
import type { RedisService } from '../redis/redis.service';
import { DiscordApiError, DiscordRestService } from './discord-rest.service';

describe('DiscordRestService message edit rate limits', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not retry the permanent edit limit for old messages', async () => {
    const stats = {
      recordDiscordRestCall: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
      pushEvent: jest.fn().mockResolvedValue(undefined),
    };
    const redis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      },
    };
    const service = new DiscordRestService(
      { discordBotToken: 'test-token', discordClientId: '900000000000000001' } as AppConfig,
      stats as unknown as StatsService,
      redis as unknown as RedisService,
    );
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'Maximum number of edits to messages older than 1 hour reached.',
      retry_after: 2.716,
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(service.editChannelMessage('300000000000000001', '400000000000000001', {
      content: 'Updated store',
    })).rejects.toMatchObject({
      status: 429,
      message: 'Maximum number of edits to messages older than 1 hour reached.',
    } satisfies Partial<DiscordApiError>);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
