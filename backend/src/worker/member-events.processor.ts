import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DelayedError, Job, UnrecoverableError, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../core/config';
import { ChannelAccessService } from '../discord/channel-access.service';
import { DiscordApiError, DiscordRestService } from '../discord/discord-rest.service';
import { MetricsService } from '../metrics/metrics.service';
import { MEMBER_EVENTS_QUEUE, MemberEventJob, AutoRoleJob } from '../queue/member-events.queue';
import { SettingsCache } from '../redis/settings-cache.service';
import { AssetFetcher } from '../render/asset-fetcher.service';
import { MessageBuilder } from '../render/message-builder.service';
import { AssetStorage } from '../storage/asset-storage.service';
import { StatsService } from '../admin/stats.service';
import { DatabaseService } from '../db/database.service';
import { RedisService } from '../redis/redis.service';
import { guilds, autoRoleEvents } from '../db/schema';
import { eq, lte } from 'drizzle-orm';
import { GuildSyncService } from '../bot/guild-sync.service';
import type { APIEmbed } from 'discord.js';
import {
  getAutoRoleSafetyReason,
  renderAutoRoleEmbed,
  renderAutoRoleTemplate,
  type AutoRoleConfig,
} from '../shared/auto-roles';

/** A welcome that is this late is more confusing than helpful. */
const MAX_JOB_AGE_MS = 30 * 60 * 1000;

export type JobResult = 'sent' | 'skipped-disabled' | 'skipped-stale';

/**
 * Consumes member-events jobs: loads the latest settings, renders the card, posts through the REST API.
 * Runs in its own process, so CPU-heavy rendering never blocks the gateway connection.
 */
@Injectable()
export class MemberEventsProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MemberEventsProcessor.name);
  private worker?: Worker<MemberEventJob | AutoRoleJob, JobResult>;
  private purgeTimer?: ReturnType<typeof setInterval>;
  private readonly announcementTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsCache,
    private readonly builder: MessageBuilder,
    private readonly assets: AssetFetcher,
    private readonly storage: AssetStorage,
    private readonly discord: DiscordRestService,
    private readonly channelAccess: ChannelAccessService,
    private readonly metrics: MetricsService,
    private readonly stats: StatsService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly guildSync: GuildSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.worker = new Worker<MemberEventJob | AutoRoleJob, JobResult>(MEMBER_EVENTS_QUEUE, (job, token) => {
      if (job.data.kind === 'auto-role') return this.processAutoRole(job as Job<AutoRoleJob>, token);
      return this.process(job as Job<MemberEventJob>);
    }, {
      connection: this.redis.client,
      concurrency: this.config.workerConcurrency,
      // Global cap across all workers; Discord's own per-channel limits are handled by 429 back-off below.
      limiter: { max: 40, duration: 1000 },
    });
    this.worker.on('completed', (job, result) => {
      this.metrics.memberEvents.inc({ result });
      if (result === 'sent') {
        void this.stats.incr('msg_sent');
        void this.database.db.update(guilds)
          .set({ lastMessageAt: new Date() })
          .where(eq(guilds.id, job.data.guildId))
          .catch((error: unknown) => this.logger.warn(`Could not record last message time: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
    this.worker.on('failed', (job, err) => {
      const final = !job || job.attemptsMade >= (job.opts.attempts ?? 1) || err instanceof UnrecoverableError;
      if (final) {
        this.metrics.memberEvents.inc({ result: 'failed' });
        void this.stats.incr('msg_failed');
        if (job) {
          void this.stats.pushEvent('failed_posts', {
            guildId: job.data.guildId,
            kind: job.data.kind,
            reason: err.message,
            at: new Date().toISOString(),
          });
        }
      }
      this.logger.warn(`Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
    this.worker.on('error', (err) => this.logger.error(`Worker error: ${err.message}`));
    this.logger.log(`Worker started (concurrency ${this.config.workerConcurrency})`);
    await this.worker.waitUntilReady();
    await this.recoverPendingAutoRoleAnnouncements();
    void this.purgeOldAutoRoleEvents().catch((error: unknown) => {
      this.logger.error(`Could not purge auto-role activity: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.purgeTimer = setInterval(() => {
      void this.purgeOldAutoRoleEvents().catch((error: unknown) => {
        this.logger.error(`Could not purge auto-role activity: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 24 * 60 * 60 * 1000);
    this.purgeTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    // Waits for in-flight jobs, so a deploy never drops a half-sent welcome.
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    await this.worker?.close();
    const pendingAnnouncementKeys = [...this.announcementTimers.keys()];
    for (const timer of this.announcementTimers.values()) clearTimeout(timer);
    this.announcementTimers.clear();
    await Promise.all(pendingAnnouncementKeys.map(async (key) => {
      const match = /^guild:(\d{17,20}):autorole-announcements:(\d{17,20})$/.exec(key);
      if (!match) return;
      try {
        await this.flushAutoRoleAnnouncement(match[1], match[2], key);
      } catch (error) {
        this.logger.error(`Could not flush auto-role announcements during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }

  private async processAutoRole(job: Job<AutoRoleJob>, token?: string): Promise<JobResult> {
    const data = job.data;
    if (Date.now() - data.joinTimestamp > MAX_JOB_AGE_MS) {
      return 'skipped-stale';
    }
    const settings = await this.settings.get(data.guildId);
    if (!settings.autoRoles.enabled) return 'skipped-disabled';
    if (data.pending && settings.autoRoles.waitForScreening) return 'skipped-disabled';

    const lockKey = `guild:${data.guildId}:autorole-lock`;
    const lockToken = randomUUID();
    const lock = await this.redis.client.set(lockKey, lockToken, 'PX', 30_000, 'NX');
    if (lock !== 'OK') return this.deferAutoRole(job, token, 1, settings.autoRoles.roleIds[0] ?? '', false);

    try {
      const currentSettings = await this.settings.get(data.guildId);
      const config = currentSettings.autoRoles;
      if (!config.enabled) return 'skipped-disabled';
      if (data.pending && config.waitForScreening) return 'skipped-disabled';

      const roleId = config.roleIds[0];
      if (!roleId) return 'skipped-disabled';

      const rolesKey = `guild:${data.guildId}:member:${data.userId}:roles`;
      const cachedRoleIds = await this.redis.client.get(rolesKey);
      let memberRoleIds = data.memberRoleIds;
      if (cachedRoleIds !== null) {
        try {
          const parsed: unknown = JSON.parse(cachedRoleIds);
          if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) memberRoleIds = parsed;
          else this.logger.warn(`Ignoring invalid member role cache for guild=${data.guildId} user=${data.userId}`);
        } catch {
          this.logger.warn(`Ignoring malformed member role cache for guild=${data.guildId} user=${data.userId}`);
        }
      }
      if (memberRoleIds.includes(roleId)) {
        await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'skipped_has_role');
        return 'sent';
      }

      const roles = await this.guildSync.getRoles(data.guildId);
      const role = roles.find((item) => item.id === roleId);
      const botStatus = await this.guildSync.getBotStatus(data.guildId, roles);
      if (!role || getAutoRoleSafetyReason(data.guildId, role, botStatus)) {
        await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'skipped_unsafe');
        return 'sent';
      }

      const blockedUntil = Number(await this.redis.client.get('discord:blocked_until') ?? 0);
      if (blockedUntil > Date.now()) {
        return this.deferAutoRole(job, token, (blockedUntil - Date.now()) / 1000, roleId);
      }

      try {
        await this.discord.addMemberRole(data.guildId, data.userId, roleId, 'DexBotX auto role');
      } catch (error) {
        if (error instanceof DiscordApiError) {
          if (error.status === 429) return this.deferAutoRole(job, token, error.retryAfter ?? 1, roleId);
          if (error.status === 404 && error.discordCode === 10011) {
            await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'skipped_unsafe');
            return 'sent';
          }
          if (error.status === 404 && (error.discordCode === 10007 || error.discordCode === undefined)) {
            await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'skipped_left');
            return 'sent';
          }
          if (error.status === 403) {
            await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'skipped_unsafe');
            return 'sent';
          }
        }
        await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'failed');
        throw error;
      }

      const updatedRoleIds = new Set(memberRoleIds);
      updatedRoleIds.add(roleId);
      await this.redis.client.set(rolesKey, JSON.stringify([...updatedRoleIds]), 'EX', 30 * 60)
        .catch((error: unknown) => this.logger.warn(`Could not update member role cache guild=${data.guildId} user=${data.userId}: ${error instanceof Error ? error.message : String(error)}`));
      await this.recordAutoRoleEvent(data.guildId, data.userId, roleId, 'assigned');
      if (config.announce.enabled && config.announce.channelId) {
        try {
          await this.queueAutoRoleAnnouncement(
            data.guildId,
            config.announce.channelId,
            data.userId,
            data.username,
            role.name,
            config.announce.message,
            config.announce.embed,
          );
        } catch (error) {
          this.logger.warn(`Could not queue auto-role announcement guild=${data.guildId} user=${data.userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return 'sent';
    } finally {
      try {
        await this.redis.client.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey,
          lockToken,
        );
      } catch (error) {
        this.logger.warn(`Could not release auto-role assignment lock guild=${data.guildId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async deferAutoRole(
    job: Job<AutoRoleJob>,
    token: string | undefined,
    delaySeconds: number,
    roleId: string,
    countRateLimit = true,
  ): Promise<never> {
    if (!token) throw new Error('BullMQ worker did not provide an active job token');
    if (countRateLimit) {
      const retries = job.data.rateLimitReschedules ?? 0;
      if (retries >= 2) {
        await this.recordAutoRoleEvent(job.data.guildId, job.data.userId, roleId, 'failed');
        throw new Error('Auto-role assignment exhausted Discord rate-limit reschedules');
      }
      await job.updateData({ ...job.data, rateLimitReschedules: retries + 1 });
    }
    await job.moveToDelayed(Date.now() + Math.max(1000, Math.ceil(delaySeconds * 1000)), token);
    throw new DelayedError();
  }


  private async recordAutoRoleEvent(guildId: string, userId: string, roleId: string, outcome: 'assigned' | 'skipped_left' | 'skipped_has_role' | 'skipped_unsafe' | 'failed'): Promise<void> {
    await this.database.db.insert(autoRoleEvents).values({ guildId, userId, roleId, outcome });
  }

  private async queueAutoRoleAnnouncement(
    guildId: string,
    channelId: string,
    userId: string,
    username: string,
    roleName: string,
    template: string,
    embed: AutoRoleConfig['announce']['embed'],
  ): Promise<void> {
    const key = `guild:${guildId}:autorole-announcements:${channelId}`;
    await this.redis.client.rpush(key, JSON.stringify({ userId, username, roleName, template, embed }));
    await this.redis.client.expire(key, 30 * 60);
    this.scheduleAutoRoleAnnouncementFlush(guildId, channelId, key, 20_000);
  }

  private scheduleAutoRoleAnnouncementFlush(
    guildId: string,
    channelId: string,
    key: string,
    delayMilliseconds: number,
  ): void {
    if (this.announcementTimers.has(key)) return;
    const timer = setTimeout(() => {
      void this.flushAutoRoleAnnouncement(guildId, channelId, key).catch((error: unknown) => {
        this.logger.error(`Auto-role announcement flush failed guild=${guildId} channel=${channelId}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, delayMilliseconds);
    timer.unref();
    this.announcementTimers.set(key, timer);
  }

  private async recoverPendingAutoRoleAnnouncements(): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        'guild:*:autorole-announcements:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const key of keys) {
        const match = /^guild:(\d{17,20}):autorole-announcements:(\d{17,20})$/.exec(key);
        if (match) this.scheduleAutoRoleAnnouncementFlush(match[1], match[2], key, 1000);
      }
    } while (cursor !== '0');
  }

  private async flushAutoRoleAnnouncement(guildId: string, channelId: string, key: string): Promise<void> {
    this.announcementTimers.delete(key);
    const lockKey = `${key}:lock`;
    const lockToken = randomUUID();
    const lock = await this.redis.client.set(lockKey, lockToken, 'PX', 30_000, 'NX');
    if (lock !== 'OK') {
      const timer = setTimeout(() => {
        void this.flushAutoRoleAnnouncement(guildId, channelId, key).catch((error: unknown) => {
          this.logger.error(`Auto-role announcement retry failed guild=${guildId} channel=${channelId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, 1000);
      timer.unref();
      this.announcementTimers.set(key, timer);
      return;
    }
    try {
    const raw = await this.redis.client.eval(
      'local entries=redis.call("LRANGE", KEYS[1], 0, -1); redis.call("DEL", KEYS[1]); return entries',
      1,
      key,
    ) as string[];
    const entries = raw.map((value) => {
      try {
        return JSON.parse(value) as {
          userId: string;
          username: string;
          roleName: string;
          template: string;
          embed?: AutoRoleConfig['announce']['embed'];
        };
      } catch {
        return null;
      }
    }).filter((entry): entry is {
      userId: string;
      username: string;
      roleName: string;
      template: string;
      embed?: AutoRoleConfig['announce']['embed'];
    } => !!entry);
    if (!entries.length) return;

    const guild = await this.database.db.select({ name: guilds.name, memberCount: guilds.memberCount })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    const serverName = guild[0]?.name ?? 'Server';
    const memberCount = guild[0]?.memberCount ?? 0;

    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const embedConfig = entry.embed?.enabled
        ? [entry.embed.title, entry.embed.description, entry.embed.color, entry.embed.footer]
        : null;
      const usesUsername = /\{username\}/.test(entry.template)
        || (!!entry.embed?.enabled
          && [entry.embed.title, entry.embed.description, entry.embed.footer].some((value) => /\{username\}/.test(value)));
      const groupKey = JSON.stringify([
        entry.template,
        entry.roleName,
        embedConfig,
        usesUsername ? entry.userId : null,
      ]);
      const group = groups.get(groupKey) ?? [];
      group.push(entry);
      groups.set(groupKey, group);
    }

    const chunks: typeof entries[] = [];
    for (const group of groups.values()) {
      for (let index = 0; index < group.length; index += 10) {
        chunks.push(group.slice(index, index + 10));
      }
    }

    for (const chunk of chunks) {
      const roleName = chunk[0].roleName;
      const mentionIds = [...new Set(chunk.map((entry) => entry.userId))];
      const values = {
        username: chunk[0].username,
        roleName,
        serverName,
        memberCount,
        userMentions: mentionIds.map((id) => `<@${id}>`),
      };
      const content = renderAutoRoleTemplate(chunk[0].template, values).slice(0, 2000);
      const embeds: APIEmbed[] = [];
      const embedConfig = chunk[0].embed;
      if (embedConfig?.enabled) {
        embeds.push(renderAutoRoleEmbed(embedConfig, values));
      }
      try {
        await this.discord.createMessage(channelId, { content, embeds }, { users: mentionIds });
      } catch (error) {
        let failure = error;
        if (error instanceof DiscordApiError && error.status === 403) {
          const access = await this.channelAccess.ensureChannelAccess(guildId, channelId);
          if (access === 'fixed') {
            try {
              await this.discord.createMessage(channelId, { content, embeds }, { users: mentionIds });
              continue;
            } catch (retryError) {
              failure = retryError;
            }
          }
        }
        this.logger.warn(`Auto-role announcement failed guild=${guildId} channel=${channelId}: ${failure instanceof Error ? failure.message : String(failure)}`);
      }
    }
    } finally {
      try {
        await this.redis.client.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey,
          lockToken,
        );
      } catch (error) {
        this.logger.warn(`Could not release auto-role announcement lock guild=${guildId} channel=${channelId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async purgeOldAutoRoleEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    await this.database.db.delete(autoRoleEvents).where(lte(autoRoleEvents.createdAt, cutoff));
  }

  async process(job: Job<MemberEventJob, JobResult>): Promise<JobResult> {
    const { kind, guildId, channelId, user, guild } = job.data;
    if (Date.now() - job.timestamp > MAX_JOB_AGE_MS) return 'skipped-stale';

    const config = (await this.settings.get(guildId))[kind];
    // Re-check against the latest settings: the feature may have been turned off or moved while the job waited.
    if (!config.enabled || config.channelId !== channelId) return 'skipped-disabled';

    const wantsImage = config.image.enabled;
    const [avatar, banner, background] = await Promise.all([
      wantsImage ? this.assets.fetch(user.avatarUrl) : null,
      wantsImage && config.image.useServerBanner ? this.assets.fetch(guild.bannerUrl) : null,
      wantsImage && config.image.backgroundPath ? this.storage.get(config.image.backgroundPath) : null,
    ]);

    const message = await this.builder.build(
      config,
      { userId: user.id, username: user.username, displayName: user.displayName, serverName: guild.name, memberCount: guild.memberCount },
      { avatar, banner, background },
    );

    try {
      await this.discord.createMessage(channelId, message, kind === 'welcome' ? [user.id] : []);
    } catch (err) {
      if (err instanceof DiscordApiError) {
        if (err.status === 429) {
          const wait = Math.ceil((err.retryAfter ?? 1) * 1000);
          await this.worker?.rateLimit(wait);
          throw Worker.RateLimitError();
        }
        if (err.status === 403 && (err.discordCode === 50013 || err.discordCode === 50001)) {
          const result = await this.channelAccess.ensureChannelAccess(guildId, channelId);
          if (result === 'fixed') {
            try {
              await this.discord.createMessage(channelId, message, kind === 'welcome' ? [user.id] : []);
            } catch (retryError) {
              await this.handleDiscordPostError(retryError);
            }
            return 'sent';
          }
        }
        // Missing access/permissions or deleted channel: retrying cannot help.
        if (err.status === 403 || err.status === 404) {
          throw new UnrecoverableError(`Discord refused the post (${err.status}${err.discordCode ? `/${err.discordCode}` : ''})`);
        }
      }
      throw err;
    }
    return 'sent';
  }

  private async handleDiscordPostError(err: unknown): Promise<never> {
    if (err instanceof DiscordApiError) {
      if (err.status === 429) {
        const wait = Math.ceil((err.retryAfter ?? 1) * 1000);
        await this.worker?.rateLimit(wait);
        throw Worker.RateLimitError();
      }
      if (err.status === 403 || err.status === 404) {
        throw new UnrecoverableError(`Discord refused the post (${err.status}${err.discordCode ? `/${err.discordCode}` : ''})`);
      }
    }
    throw err;
  }
}
