import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { economySettings, stealWindows } from '../db/schema';
import { EconomyQueue } from './economy.queue';

@Injectable()
export class EconomyWindowService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: EconomyQueue,
  ) {}

  async reconcile(guildId: string) {
    await this.cancelScheduledJobs(guildId);
  }

  async cancelScheduledJobs(guildId: string) {
    await this.queue.removeGuildJobs(guildId);
    await this.database.db.update(stealWindows).set({ status: 'closed' })
      .where(and(
        eq(stealWindows.guildId, guildId),
        inArray(stealWindows.status, ['scheduled', 'open']),
      ));
  }

  async reconcileEnabledServers() {
    await this.database.db.update(stealWindows).set({ status: 'closed' })
      .where(inArray(stealWindows.status, ['scheduled', 'open']));
    await this.queue.removeAllWindowJobs();
  }

  async getEnabledGuildIds(): Promise<string[]> {
    const rows = await this.database.db.select({ guildId: economySettings.guildId })
      .from(economySettings).where(eq(economySettings.enabled, true));
    return rows.map((row) => row.guildId);
  }
}
