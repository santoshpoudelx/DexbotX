import { BotService } from './bot.service';
import { defaultAutoRoleConfig } from '../shared/auto-roles';

function makeHarness() {
  const config = defaultAutoRoleConfig();
  config.enabled = true;
  config.roleIds = ['900000000000000001'];
  const seenJoinKeys = new Set<string>();
  const settings = { get: jest.fn(async () => ({ autoRoles: config })) };
  const queue = {
    queue: { getJobCounts: jest.fn(async () => ({ waiting: 0 })) },
    enqueueAutoRole: jest.fn(async () => undefined),
  };
  const pendingJoinKeys = new Set<string>();
  const redisClient = {
    get: jest.fn(async (_key: string) => null as string | null),
    del: jest.fn(async (key: string) => {
      pendingJoinKeys.delete(key);
      return 1;
    }),
    exists: jest.fn(async (key: string) => key.includes('autorole-pending') && pendingJoinKeys.has(key) ? 1 : 0),
    set: jest.fn(async (key: string) => {
      if (key.includes('autorole-pending')) pendingJoinKeys.add(key);
      if (!key.includes(':autorole:queued:')) return 'OK' as string | null;
      if (seenJoinKeys.has(key)) return null;
      seenJoinKeys.add(key);
      return 'OK' as string | null;
    }),
    eval: jest.fn(async (script: string, ..._args: Array<string | number>) =>
      script.includes("redis.call('set', key, reserved") ? 0 : 0),
  };
  const sync = {
    getRoles: jest.fn(async () => [{
      id: config.roleIds[0], name: 'Member', color: 0, position: 2,
      permissions: '0', managed: false, tags: {},
    }]),
    getBotStatus: jest.fn(async () => ({ highestPosition: 10, highestRoleId: null, manageRoles: true })),
  };
  const service = new BotService(
    {} as never,
    settings as never,
    queue as never,
    {} as never,
    sync as never,
    {} as never,
    {} as never,
    {} as never,
    { client: redisClient } as never,
    {} as never,
    { db: { insert: jest.fn(() => ({ values: jest.fn() })) } } as never,
  );
  const event = (pending: boolean) => ({
    id: '900000000000000003',
    guild: { id: '900000000000000002' },
    user: { id: '900000000000000003', username: 'member', bot: false },
    pending,
    joinedTimestamp: 123,
  });
  const call = (method: 'handleAutoRoleMemberJoin' | 'handleAutoRoleMemberUpdate', ...args: unknown[]) =>
    (service as unknown as Record<string, (...values: unknown[]) => Promise<void>>)[method](...args);

  return { config, queue, redisClient, service, event, call };
}

describe('BotService auto-role scheduling', () => {
  it('waits for screening and de-duplicates the screening-complete gateway event', async () => {
    const harness = makeHarness();
    const pending = harness.event(true);
    const screened = harness.event(false);

    await harness.call('handleAutoRoleMemberJoin', pending);
    expect(harness.queue.enqueueAutoRole).not.toHaveBeenCalled();

    await harness.call('handleAutoRoleMemberUpdate', screened);
    await harness.call('handleAutoRoleMemberUpdate', screened);

    expect(harness.queue.enqueueAutoRole).toHaveBeenCalledTimes(1);
    expect(harness.queue.enqueueAutoRole).toHaveBeenCalledWith(expect.objectContaining({
      readyTimestamp: expect.any(Number),
      pending: false,
    }), expect.any(Number));
    expect(harness.redisClient.del).toHaveBeenCalledWith('guild:900000000000000002:autorole-pending:900000000000000003');
    harness.service.client.destroy();
  });

  it('never queues a pending member even when legacy settings disable screening waits', async () => {
    const harness = makeHarness();
    harness.config.waitForScreening = false;
    await harness.call('handleAutoRoleMemberJoin', harness.event(true));
    expect(harness.queue.enqueueAutoRole).not.toHaveBeenCalled();
    harness.service.client.destroy();
  });
});
