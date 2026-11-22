import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import type { MessageKind } from '../shared/message-config';
import { AUTO_ROLE_MAX_DELAY_SECONDS, secondsToMilliseconds } from '../shared/auto-roles';
import { makeJobId } from '../shared/job-id';

export const MEMBER_EVENTS_QUEUE = 'member-events';

/**
 * Everything the worker needs that only the gateway knows. Settings are NOT copied here:
 * the worker reads the latest config, so edits made while a job waits still apply.
 */
export interface MemberEventJob {
  kind: MessageKind;
  guildId: string;
  /** Channel already verified by the shard to belong to this server. */
  channelId: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string };
  guild: { name: string; memberCount: number; bannerUrl: string | null };
}

export interface AutoRoleJob {
  kind: 'auto-role';
  guildId: string;
  userId: string;
  username: string;
  joinTimestamp: number;
  readyTimestamp: number;
  pending: boolean;
  memberRoleIds: string[];
}

/** Producer side: bot shards enqueue here, the worker process consumes. */
@Injectable()
export class MemberEventsQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MemberEventsQueue.name);
  readonly queue: Queue<MemberEventJob | AutoRoleJob>;

  constructor(redis: RedisService) {
    this.queue = new Queue<MemberEventJob | AutoRoleJob>(MEMBER_EVENTS_QUEUE, {
      connection: redis.client,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600, count: 5000 },
      },
    });
    this.queue.on('error', (err) => this.logger.error(`Queue error: ${err.message}`));
  }

  async enqueue(job: MemberEventJob): Promise<void> {
    // The 15s bucket drops duplicate gateway deliveries of the same join/leave.
    const bucket = Math.floor(Date.now() / 15_000);
    await this.queue.add(job.kind, job, {
      jobId: makeJobId(job.kind, job.guildId, job.user.id, bucket),
      removeOnComplete: { age: 300, count: 500 },
      removeOnFail: { age: 3600, count: 1000 },
    });
  }

  async enqueueAutoRole(job: AutoRoleJob, delaySeconds: number): Promise<void> {
    await this.queue.add('auto-role', job, {
      jobId: makeJobId('autorole', job.guildId, job.userId, job.joinTimestamp),
      delay: secondsToMilliseconds(Math.max(0, Math.min(AUTO_ROLE_MAX_DELAY_SECONDS, delaySeconds))),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: { age: 3600, count: 1000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
