import { AdminUsersContentService } from './admin-users-content.service';
import { DatabaseService } from '../db/database.service';
import { RedisService } from '../redis/redis.service';
import { SettingsCache } from '../redis/settings-cache.service';
import { AssetStorage } from '../storage/asset-storage.service';
import { AdminAuditService } from './admin-audit.service';
import { FeatureFlagsService } from '../core/feature-flags.service';
import { SessionService } from '../auth/session.service';

describe('AdminUsersContentService.revokeUser', () => {
  it('revokes sessions from the per-user index without scanning Redis', async () => {
    const redisClient = { del: jest.fn(async () => 1), scan: jest.fn() };
    const sessions = { destroyAllForUser: jest.fn(async () => 3) };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new AdminUsersContentService(
      {} as DatabaseService,
      { client: redisClient } as unknown as RedisService,
      {} as SettingsCache,
      {} as AssetStorage,
      audit as unknown as AdminAuditService,
      {} as FeatureFlagsService,
      sessions as unknown as SessionService,
    );

    await expect(service.revokeUser('admin', '111111111111111111')).resolves.toEqual({ revoked: 3 });

    expect(sessions.destroyAllForUser).toHaveBeenCalledWith('111111111111111111');
    expect(redisClient.scan).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith('admin', 'user.revoke_sessions', '111111111111111111', { revoked: 3 });
  });
});
