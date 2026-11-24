import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export const ECONOMY_QUEUE = 'economy';

export interface EconomyWindowJob {
  kind: 'economy-window-open' | 'economy-window-close';
  guildId: string;
  windowId: string;
}

@Injectable()
export class EconomyQueue implements OnModuleDestroy {
  readonly queue: Queue<EconomyWindowJob>;

  constructor(redis: RedisService) {
    this.queue = new Queue<EconomyWindowJob>(ECONOMY_QUEUE, { connection: redis.client });
  }

  async removeGuildJobs(guildId: string) {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(jobs
      .filter((job) => job.data.guildId === guildId)
      .map((job) => job.remove()));
  }

  async removeAllWindowJobs() {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(jobs.map((job) => job.remove()));
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
