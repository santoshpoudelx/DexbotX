import { DelayedError, type Job } from 'bullmq';
import { AutoRoleJob } from '../queue/member-events.queue';
import { DiscordApiError } from '../discord/discord-rest.service';
import { defaultAutoRoleConfig } from '../shared/auto-roles';
import { MemberEventsProcessor, type JobResult } from './member-events.processor';

function makeHarness() {
  const config = defaultAutoRoleConfig();
  config.enabled = true;
  config.roleIds = ['900000000000000001'];
  const events: Array<Record<string, unknown>> = [];
  const scheduledTimes: number[] = [];
  let batch: string[] = [];
  const settings = { get: jest.fn(async () => ({ autoRoles: config })) };
  const redisClient = {
    get: jest.fn(async (_key: string) => null as string | null),
    set: jest.fn(async (_key: string, _value: string, ..._args: Array<string | number>) => 'OK' as string | null),
    eval: jest.fn(async (script: string) =>
      script.includes('LRANGE') ? batch : script.includes('now+tonumber(ARGV[2])') ? 0 : 1),
    scan: jest.fn(async (_cursor: string, ..._args: Array<string | number>) => ['0', []] as [string, string[]]),
    rpush: jest.fn(async (_key: string, _value: string) => 1),
    expire: jest.fn(async (_key: string, _seconds: number) => 1),
  };
  const deleteWhere = jest.fn(async (_condition: unknown) => undefined);
  const database = {
    db: {
      insert: jest.fn(() => ({
        values: jest.fn(async (value: Record<string, unknown>) => { events.push(value); }),
      })),
      delete: jest.fn(() => ({ where: deleteWhere })),
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [{ name: 'Test Guild', memberCount: 12 }]),
          })),
        })),
      })),
    },
  };
  const discord = {
    addMemberRole: jest.fn(async () => undefined),
    createMessage: jest.fn(async (
      _channelId: string,
      _message: {
        content: string;
        embeds: Array<{ color?: number; title?: string; description?: string; footer?: { text: string } }>;
      },
      _allowedMentions: { users: string[] },
    ) => undefined),
  };
  const channelAccess = { ensureChannelAccess: jest.fn(async () => 'fixed' as const) };
  const guildSync = {
    getRoles: jest.fn(async () => [{
      id: config.roleIds[0], name: 'Member', color: 0, position: 2,
      permissions: '0', managed: false, tags: {},
    }]),
    getBotStatus: jest.fn(async () => ({ highestPosition: 10, highestRoleId: null, manageRoles: true })),
  };
  const processor = new MemberEventsProcessor(
    { workerConcurrency: 1 } as never,
    settings as never,
    {} as never,
    {} as never,
    {} as never,
    discord as never,
    channelAccess as never,
    { memberEvents: { inc: jest.fn() } } as never,
    {} as never,
    database as never,
    { client: redisClient } as never,
    guildSync as never,
  );
  const makeJob = (overrides: Partial<AutoRoleJob> = {}) => ({
    data: {
      kind: 'auto-role',
      guildId: '900000000000000002',
      userId: '900000000000000003',
      username: 'member',
      joinTimestamp: Date.now(),
      readyTimestamp: Date.now(),
      pending: false,
      memberRoleIds: [],
      ...overrides,
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateData: jest.fn(async (_data: AutoRoleJob) => undefined),
    moveToDelayed: jest.fn(async (timestamp: number, _token?: string) => { scheduledTimes.push(timestamp); }),
  }) as unknown as Job<AutoRoleJob>;
  const process = (job: Job<AutoRoleJob>, token = 'active-token') =>
    (processor as unknown as {
      processAutoRole(job: Job<AutoRoleJob>, token?: string): Promise<JobResult>;
    }).processAutoRole(job, token);

  return {
    config,
    events,
    makeJob,
    process,
    processor,
    redisClient,
    discord,
    channelAccess,
    guildSync,
    scheduledTimes,
    deleteWhere,
    setBatch(entries: string[]) { batch = entries; },
  };
}

describe('MemberEventsProcessor auto roles', () => {
  it('re-reads settings and skips a role after the feature was disabled', async () => {
    const harness = makeHarness();
    harness.config.enabled = false;

    await expect(harness.process(harness.makeJob())).resolves.toBe('skipped-disabled');
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.events).toHaveLength(0);
  });

  it('never processes a pending member', async () => {
    const harness = makeHarness();

    await expect(harness.process(harness.makeJob({ pending: true }))).resolves.toBe('skipped-disabled');
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.events).toMatchObject([{ outcome: 'skipped_pending', delaySeconds: expect.any(Number) }]);
  });

  it('records elapsed ready-to-assignment delay in seconds', async () => {
    const harness = makeHarness();
    const readyTimestamp = Date.now() - 4500;

    await expect(harness.process(harness.makeJob({ readyTimestamp }))).resolves.toBe('sent');
    expect(harness.events[0]).toMatchObject({ outcome: 'assigned', delaySeconds: 4 });
  });

  it('keeps rate-limited auto roles delayed until Discord permits the assignment', async () => {
    const harness = makeHarness();
    harness.discord.addMemberRole.mockRejectedValue(new DiscordApiError(429, 0, 'Rate limited', 1));
    const job = harness.makeJob();

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(harness.process(job)).rejects.toBeInstanceOf(DelayedError);
    }

    expect(harness.discord.addMemberRole).toHaveBeenCalledTimes(3);
    expect(harness.scheduledTimes).toHaveLength(3);
    expect(harness.events).toHaveLength(0);
  });

  it('skips a member that already has the role in the current role cache', async () => {
    const harness = makeHarness();
    harness.redisClient.get.mockImplementation(async (key) =>
      key.includes(':member:') ? JSON.stringify(harness.config.roleIds) : null);

    await expect(harness.process(harness.makeJob())).resolves.toBe('sent');
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.events[0]).toMatchObject({ outcome: 'skipped_has_role' });
  });

  it('skips a departed member returned as Discord unknown-member', async () => {
    const harness = makeHarness();
    harness.discord.addMemberRole.mockRejectedValue(new DiscordApiError(404, 10007, 'Unknown Member'));

    await expect(harness.process(harness.makeJob())).resolves.toBe('sent');
    expect(harness.events[0]).toMatchObject({ outcome: 'skipped_left' });
  });

  it('skips a role that became unsafe before the delayed job ran', async () => {
    const harness = makeHarness();
    harness.guildSync.getRoles.mockResolvedValue([]);

    await expect(harness.process(harness.makeJob())).resolves.toBe('sent');
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.events[0]).toMatchObject({ outcome: 'skipped_unsafe' });
  });

  it('skips a role moved to the bot role position before assignment', async () => {
    const harness = makeHarness();
    harness.guildSync.getRoles.mockResolvedValue([{
      id: harness.config.roleIds[0], name: 'Member', color: 0, position: 10,
      permissions: '0', managed: false, tags: {},
    }]);

    await expect(harness.process(harness.makeJob())).resolves.toBe('sent');
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.events[0]).toMatchObject({ outcome: 'skipped_unsafe' });
  });

  it('waits for the per-guild assignment lock instead of assigning concurrently', async () => {
    const harness = makeHarness();
    harness.redisClient.set.mockResolvedValueOnce(null);
    const job = harness.makeJob();
    const now = Date.now();

    await expect(harness.process(job)).rejects.toBeInstanceOf(DelayedError);
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.scheduledTimes[0]).toBeGreaterThanOrEqual(now + 900);
    expect(harness.scheduledTimes[0]).toBeLessThanOrEqual(now + 1100);
  });

  it('reschedules a rate-limited role assignment for Discord retryAfter', async () => {
    const harness = makeHarness();
    harness.discord.addMemberRole.mockRejectedValue(new DiscordApiError(429, 0, 'Rate limited', 3));
    const job = harness.makeJob();
    const now = Date.now();

    await expect(harness.process(job)).rejects.toBeInstanceOf(DelayedError);
    expect(job.updateData).not.toHaveBeenCalled();
    const [scheduledAt] = harness.scheduledTimes;
    expect(scheduledAt).toBeGreaterThanOrEqual(now + 2900);
    expect(scheduledAt).toBeLessThanOrEqual(now + 3100);
    expect(harness.events).toHaveLength(0);
  });

  it('reschedules while the shared Discord cooldown is active', async () => {
    const harness = makeHarness();
    harness.redisClient.get.mockImplementation(async (key) =>
      key === 'discord:blocked_until' ? String(Date.now() + 5000) : null);
    const job = harness.makeJob();
    const now = Date.now();

    await expect(harness.process(job)).rejects.toBeInstanceOf(DelayedError);
    expect(harness.discord.addMemberRole).not.toHaveBeenCalled();
    expect(harness.scheduledTimes[0]).toBeGreaterThan(now + 4500);
    expect(harness.scheduledTimes[0]).toBeLessThanOrEqual(now + 5200);
  });

  it('uses the assignment audit reason and queues announcements only after a new assignment', async () => {
    const harness = makeHarness();
    harness.config.announce.enabled = true;
    harness.config.announce.channelId = '900000000000000004';

    await expect(harness.process(harness.makeJob())).resolves.toBe('sent');

    expect(harness.discord.addMemberRole).toHaveBeenCalledWith(
      '900000000000000002',
      '900000000000000003',
      harness.config.roleIds[0],
      'DexBotX auto role',
    );
    expect(harness.redisClient.rpush).toHaveBeenCalledTimes(1);
    expect(harness.events[0]).toMatchObject({ outcome: 'assigned' });
    expect(harness.discord.addMemberRole.mock.invocationCallOrder[0])
      .toBeLessThan(harness.redisClient.rpush.mock.invocationCallOrder[0]);
  });

  it('keeps an assigned role when the announcement delivery fails', async () => {
    const harness = makeHarness();
    harness.config.announce.enabled = true;
    harness.config.announce.channelId = '900000000000000004';
    await harness.process(harness.makeJob());
    const queuedEntry = harness.redisClient.rpush.mock.calls[0]?.[1];
    if (!queuedEntry) throw new Error('Expected the successful role assignment to queue an announcement');
    harness.setBatch([queuedEntry]);
    harness.discord.createMessage.mockRejectedValue(new Error('channel unavailable'));

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    expect(harness.discord.addMemberRole).toHaveBeenCalledTimes(1);
    expect(harness.events[0]).toMatchObject({ outcome: 'assigned' });
    expect(harness.discord.createMessage).toHaveBeenCalledTimes(1);
  });

  it('repairs announcement channel access once after a permission failure', async () => {
    const harness = makeHarness();
    harness.setBatch([JSON.stringify({
      userId: '900000000000000003',
      username: 'member',
      roleName: 'Member',
      template: 'Welcome {user}',
    })]);
    harness.discord.createMessage
      .mockRejectedValueOnce(new DiscordApiError(403, 50013, 'Missing permissions'))
      .mockResolvedValueOnce(undefined);

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    expect(harness.channelAccess.ensureChannelAccess).toHaveBeenCalledTimes(1);
    expect(harness.discord.createMessage).toHaveBeenCalledTimes(2);
  });

  it('recovers pending announcement batches from Redis after worker startup', async () => {
    const harness = makeHarness();
    const key = 'guild:900000000000000002:autorole-announcements:900000000000000004';
    harness.redisClient.scan.mockResolvedValueOnce(['0', [key]]);
    const processor = harness.processor as unknown as {
      recoverPendingAutoRoleAnnouncements(): Promise<void>;
      announcementTimers: Map<string, ReturnType<typeof setTimeout>>;
    };

    await processor.recoverPendingAutoRoleAnnouncements();

    expect(harness.redisClient.scan).toHaveBeenCalledWith(
      '0', 'MATCH', 'guild:*:autorole-announcements:*', 'COUNT', 100,
    );
    expect(processor.announcementTimers.has(key)).toBe(true);
    clearTimeout(processor.announcementTimers.get(key));
  });

  it('flushes pending announcement batches during graceful shutdown', async () => {
    const harness = makeHarness();
    const key = 'guild:900000000000000002:autorole-announcements:900000000000000004';
    harness.setBatch([JSON.stringify({
      userId: '900000000000000003',
      username: 'member',
      roleName: 'Member',
      template: 'Welcome {user}',
    })]);
    const processor = harness.processor as unknown as {
      queueAutoRoleAnnouncement(
        guildId: string,
        channelId: string,
        userId: string,
        username: string,
        roleName: string,
        template: string,
      ): Promise<void>;
    };

    await processor.queueAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      '900000000000000003',
      'member',
      'Member',
      'Welcome {user}',
    );
    await harness.processor.onModuleDestroy();

    expect(harness.discord.createMessage).toHaveBeenCalledTimes(1);
    expect(harness.redisClient.expire).toHaveBeenCalledWith(key, 30 * 60);
  });

  it('waits for in-flight jobs before collecting announcement batches on shutdown', async () => {
    const harness = makeHarness();
    const processor = harness.processor as unknown as {
      worker?: { close: () => Promise<void> };
      queueAutoRoleAnnouncement(
        guildId: string,
        channelId: string,
        userId: string,
        username: string,
        roleName: string,
        template: string,
      ): Promise<void>;
    };
    processor.worker = {
      close: async () => {
        await processor.queueAutoRoleAnnouncement(
          '900000000000000002',
          '900000000000000004',
          '900000000000000003',
          'member',
          'Member',
          'Welcome {user}',
        );
        harness.setBatch([JSON.stringify({
          userId: '900000000000000003',
          username: 'member',
          roleName: 'Member',
          template: 'Welcome {user}',
        })]);
      },
    };

    await harness.processor.onModuleDestroy();

    expect(harness.redisClient.rpush).toHaveBeenCalledTimes(1);
    expect(harness.discord.createMessage).toHaveBeenCalledTimes(1);
  });

  it('purges expired activity events', async () => {
    const harness = makeHarness();
    const processor = harness.processor as unknown as {
      purgeOldAutoRoleEvents(): Promise<void>;
    };

    await processor.purgeOldAutoRoleEvents();

    expect(harness.deleteWhere).toHaveBeenCalledTimes(1);
    expect(harness.deleteWhere.mock.calls[0][0]).toBeDefined();
  });

  it.each([
    [1, 1],
    [5, 1],
    [15, 2],
  ])('batches %i members into %i text-only message(s) with exact mention allowlists', async (count, expectedMessages) => {
    const harness = makeHarness();
    harness.config.announce.enabled = true;
    harness.config.announce.channelId = '900000000000000004';
    harness.config.announce.message = 'Welcome {user}: {role}';
    const entries = Array.from({ length: count }, (_, index) => JSON.stringify({
      userId: `9000000000000001${String(index).padStart(2, '0')}`,
      username: `member-${index}`,
      roleName: 'Member',
      template: harness.config.announce.message,
    }));
    harness.setBatch(entries);

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    expect(harness.discord.createMessage).toHaveBeenCalledTimes(expectedMessages);
    for (const [index, [channelId, message, allowedMentions]] of harness.discord.createMessage.mock.calls.entries()) {
      expect(channelId).toBe('900000000000000004');
      expect(message.embeds).toEqual([]);
      const start = index * 10;
      const expectedUsers = Array.from(
        { length: Math.min(count - start, 10) },
        (_, offset) => `9000000000000001${String(start + offset).padStart(2, '0')}`,
      );
      expect(allowedMentions).toEqual({ users: expectedUsers });
    }
  });

  it('keeps recipient-specific and mixed announcement settings in separate messages', async () => {
    const harness = makeHarness();
    harness.setBatch([
      {
        userId: '900000000000000003',
        username: 'alice',
        roleName: 'Member',
        template: 'Welcome {username}',
      },
      {
        userId: '900000000000000004',
        username: 'bob',
        roleName: 'Member',
        template: 'Welcome {username}',
      },
      {
        userId: '900000000000000005',
        username: 'carol',
        roleName: 'Member',
        template: 'Greetings {user}',
        embed: {
          enabled: true,
          title: 'Hello {username}',
          description: '{role}',
          color: '#ff0000',
          footer: '',
        },
      },
      {
        userId: '900000000000000006',
        username: 'dave',
        roleName: 'Helper',
        template: 'Greetings {user}',
      },
    ].map((entry) => JSON.stringify(entry)));

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    const messages = harness.discord.createMessage.mock.calls.map(([, message]) => message);
    expect(messages).toHaveLength(4);
    expect(messages.map((message) => message.content)).toEqual([
      'Welcome alice',
      'Welcome bob',
      'Greetings <@900000000000000005>',
      'Greetings <@900000000000000006>',
    ]);
    expect(messages[2].embeds).toEqual([{
      color: 16711680,
      title: 'Hello carol',
      description: 'Member',
    }]);
  });

  it('bounds expanded announcement text and embed fields to Discord limits', async () => {
    const harness = makeHarness();
    harness.config.announce.embed = {
      enabled: true,
      title: '{user}'.repeat(42),
      description: '{user}'.repeat(333),
      color: '#ff0000',
      footer: '{user}'.repeat(33),
    };
    harness.setBatch(Array.from({ length: 10 }, (_, index) => JSON.stringify({
      userId: `9000000000000001${String(index).padStart(2, '0')}`,
      username: `member-${index}`,
      roleName: 'Member',
      template: '{user}'.repeat(37),
      embed: harness.config.announce.embed,
    })));

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    const [, message] = harness.discord.createMessage.mock.calls[0];
    expect(message.content.length).toBeLessThanOrEqual(2000);
    expect(message.embeds[0].title?.length).toBeLessThanOrEqual(256);
    expect(message.embeds[0].description?.length).toBeLessThanOrEqual(2000);
    expect(message.embeds[0].footer?.text.length).toBeLessThanOrEqual(200);
  });

  it('sends an embed alongside the rendered announcement text', async () => {
    const harness = makeHarness();
    harness.config.announce.embed = {
      enabled: true,
      title: 'Role assigned',
      description: '{user} received {role}',
      color: '#ff0000',
      footer: '{server}',
    };
    harness.setBatch([JSON.stringify({
      userId: '900000000000000003',
      username: 'member',
      roleName: 'Member',
      template: 'Welcome {user}',
      embed: harness.config.announce.embed,
    })]);

    await (harness.processor as unknown as {
      flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void>;
    }).flushAutoRoleAnnouncement(
      '900000000000000002',
      '900000000000000004',
      'guild:900000000000000002:autorole-announcements:900000000000000004',
    );

    const [, message] = harness.discord.createMessage.mock.calls[0];
    expect(message.content).toBe('Welcome <@900000000000000003>');
    expect(message.embeds).toEqual([{
      color: 16711680,
      title: 'Role assigned',
      description: '<@900000000000000003> received Member',
      footer: { text: 'Test Guild' },
    }]);
  });
});
