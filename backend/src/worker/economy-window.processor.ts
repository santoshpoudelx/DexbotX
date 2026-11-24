import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { APP_CONFIG, AppConfig } from '../core/config';
import { RedisService } from '../redis/redis.service';
import { ECONOMY_QUEUE, type EconomyWindowJob } from '../economy/economy.queue';
import { EconomyWindowService } from '../economy/economy-window.service';
import { EconomyMessageService } from '../economy/economy-message.service';

@Injectable()
export class EconomyWindowProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EconomyWindowProcessor.name);
  private worker?: Worker<EconomyWindowJob>;
  private hourlyTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly windows: EconomyWindowService,
    private readonly messages: EconomyMessageService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.windows.reconcileEnabledServers();
    this.worker = new Worker<EconomyWindowJob>(ECONOMY_QUEUE, async (_job: Job<EconomyWindowJob>) => undefined, {
      connection: this.redis.client,
      concurrency: Math.max(1, Math.min(5, this.config.workerConcurrency)),
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Economy job ${job?.id ?? '<unknown>'} failed: ${error.message}`);
    });
    await this.worker.waitUntilReady();
    this.hourlyTimer = setInterval(() => {
      void this.refreshEnabledEconomies();
    }, 60 * 60 * 1000);
    this.hourlyTimer.unref();
  }

  private async refreshEnabledEconomies(): Promise<void> {
    const settings = await this.windows.getEnabledGuildIds();
    await Promise.all(settings.map(async (guildId) => {
      await this.messages.repairAll(guildId);
    }));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.hourlyTimer) clearInterval(this.hourlyTimer);
    await this.worker?.close();
  }
}
