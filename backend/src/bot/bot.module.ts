import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { QueueModule } from '../queue/queue.module';
import { DiscordModule } from '../discord/discord.module';
import { MetricsModule } from '../metrics/metrics.module';
import { BotService } from './bot.service';
import { GuildSyncService } from './guild-sync.service';
import { ModerationService } from './moderation.service';
import { EconomyModule } from '../economy/economy.module';
import { EconomyCommandService } from './economy-command.service';

@Module({
  imports: [CoreModule, QueueModule, DiscordModule, MetricsModule, EconomyModule],
  providers: [BotService, GuildSyncService, ModerationService, EconomyCommandService],
})
export class BotModule {}
