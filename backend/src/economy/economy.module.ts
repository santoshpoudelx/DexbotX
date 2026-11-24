import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { DiscordModule } from '../discord/discord.module';
import { GuildsModule } from '../guilds/guilds.module';
import { EconomySetupService } from './economy-setup.service';
import { WalletService } from './wallet.service';
import { EconomyController } from './economy.controller';
import { EconomyQueue } from './economy.queue';
import { EconomyWindowService } from './economy-window.service';
import { EconomyMessageService } from './economy-message.service';

@Module({
  imports: [CoreModule, DiscordModule, GuildsModule],
  controllers: [EconomyController],
  providers: [EconomySetupService, WalletService, EconomyQueue, EconomyWindowService, EconomyMessageService],
  exports: [EconomySetupService, WalletService, EconomyQueue, EconomyWindowService, EconomyMessageService],
})
export class EconomyModule {}
