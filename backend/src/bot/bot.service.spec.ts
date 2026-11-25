import { BotService } from './bot.service';
import { defaultAutoRoleConfig } from '../shared/auto-roles';
import { Events, MessageFlags } from 'discord.js';

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

describe('BotService economy interaction acknowledgement', () => {
  async function dispatchEconomyCommand(deferReply: jest.Mock, onHandle: () => Promise<void> = async () => undefined) {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const client = {
      once: jest.fn(),
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
      login: jest.fn().mockResolvedValue('token'),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const economyCommands = { handle: jest.fn(onHandle) };
    const service = new BotService(
      { discordBotToken: 'test-token' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      economyCommands as never,
    );
    Object.defineProperty(service, 'client', { value: client });
    const logger = (service as unknown as { logger: { warn: (message: string) => void } }).logger;
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await service.onApplicationBootstrap();

    const interaction = {
      guild: { id: '100000000000000001' },
      commandName: 'reward',
      createdTimestamp: Date.now() - 50,
      deferred: false,
      replied: false,
      isChatInputCommand: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
      isAutocomplete: () => false,
      deferReply,
    };
    listeners.get(Events.InteractionCreate)?.(interaction);
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { interaction, economyCommands, warn };
  }

  it('defers before dispatching economy command work', async () => {
    const order: string[] = [];
    const deferReply = jest.fn(async () => {
      order.push('defer');
    });
    const { economyCommands } = await dispatchEconomyCommand(deferReply, async () => {
      order.push('handle');
    });

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(order).toEqual(['defer', 'handle']);
    expect(economyCommands.handle).toHaveBeenCalledTimes(1);
  });

  it('logs expired interactions without dispatching command work', async () => {
    const deferReply = jest.fn().mockRejectedValue({ code: 10062 });
    const { economyCommands, warn } = await dispatchEconomyCommand(deferReply);

    expect(economyCommands.handle).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expired before acknowledgement'));
  });
});
