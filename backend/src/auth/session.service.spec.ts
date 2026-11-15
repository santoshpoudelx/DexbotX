import { SessionService } from './session.service';
import { RedisService } from '../redis/redis.service';
import type { SessionData } from '../common/types';

describe('SessionService.findActiveForUser', () => {
  it('uses the per-user session index and removes missing or expired sessions', async () => {
    const active: SessionData = {
      userId: '111111111111111111',
      username: 'user',
      globalName: null,
      avatarHash: null,
      accessTokenEnc: 'encrypted',
      createdAt: 1,
      expiresAt: Date.now() + 60_000,
    };
    const expired: SessionData = { ...active, expiresAt: Date.now() - 1 };
    const redisClient = {
      smembers: jest.fn(async () => ['active-hash', 'expired-hash', 'missing-hash']),
      mget: jest.fn(async () => [JSON.stringify(active), JSON.stringify(expired), null]),
      srem: jest.fn(async () => 2),
      scan: jest.fn(),
    };
    const service = new SessionService({} as never, { client: redisClient } as unknown as RedisService);

    await expect(service.findActiveForUser(active.userId)).resolves.toEqual(active);

    expect(redisClient.smembers).toHaveBeenCalledWith(`usess:${active.userId}`);
    expect(redisClient.mget).toHaveBeenCalledWith('sess:active-hash', 'sess:expired-hash', 'sess:missing-hash');
    expect(redisClient.srem).toHaveBeenCalledWith(`usess:${active.userId}`, 'expired-hash', 'missing-hash');
    expect(redisClient.scan).not.toHaveBeenCalled();
  });

  it('returns null without fetching sessions when the per-user index is empty', async () => {
    const redisClient = {
      smembers: jest.fn(async () => []),
      mget: jest.fn(),
    };
    const service = new SessionService({} as never, { client: redisClient } as unknown as RedisService);

    await expect(service.findActiveForUser('111111111111111111')).resolves.toBeNull();
    expect(redisClient.mget).not.toHaveBeenCalled();
  });
});
