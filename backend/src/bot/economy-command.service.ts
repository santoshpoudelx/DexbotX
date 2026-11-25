import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import {
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import { DatabaseService } from '../db/database.service';
import {
  economyAuditLog,
  economyBounties,
  economyTransactions,
  economyWallets,
  shopItems,
  walletEffects,
} from '../db/schema';
import { DiscordRestService } from '../discord/discord-rest.service';
import { EconomySetupService } from '../economy/economy-setup.service';
import { defaultEconomySettings } from '../economy/economy.schema';
import { InsufficientCoinsError, WalletService } from '../economy/wallet.service';
import { RedisService } from '../redis/redis.service';
import { roleSafetyReason } from '../economy/economy-safety';
import { formatCurrency } from '../economy/economy-format';
import { sanitizeCustomTitle } from '../economy/economy-format';
import { EconomyMessageService } from '../economy/economy-message.service';

const RESET_CONFIRMATION_TTL_SECONDS = 300;
const EPHEMERAL_REPLY_TTL_MS = 60_000;
const GENERIC_ROB_REFUSAL = 'That member cannot be robbed right now. Try another member.';
const CUSTOM_TITLE_ITEM_EMOJI = '🏷️';
const TEST_CHEAT_AMOUNT = 5000;
const TEST_CHEAT_USER_ID = '1459142692356362303';

type EconomyReplyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | ModalSubmitInteraction;

@Injectable()
export class EconomyCommandService {
  private readonly logger = new Logger(EconomyCommandService.name);
  private readonly replyDeletionTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
  private readonly externallyAcknowledgedInteractions = new WeakSet<object>();

  constructor(
    private readonly setup: EconomySetupService,
    private readonly wallet: WalletService,
    private readonly database: DatabaseService,
    private readonly discord: DiscordRestService,
    private readonly redis: RedisService,
    private readonly economyMessages: EconomyMessageService,
  ) {}

  async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (interaction.commandName !== 'buy') return;
    const items = await this.database.db.select({ name: shopItems.name }).from(shopItems)
      .where(and(eq(shopItems.guildId, interaction.guildId!), eq(shopItems.enabled, true)));
    const query = interaction.options.getFocused().toLowerCase();
    await interaction.respond(items
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((item) => ({ name: item.name, value: item.name })));
  }

  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const memberCommands = new Set(['reward', 'balance', 'shop', 'store', 'buy', 'gift', 'senddex', 'get5kdex', 'robuser', 'leaderboard']);
    if (interaction.commandName !== 'buy') await this.deferEphemeralReply(interaction);
    if (!interaction.guild) {
      await this.replyEphemeral(interaction, 'Economy commands are only available in a server.');
      return;
    }
    const guildId = interaction.guild.id;
    const economy = await this.setup.get(guildId);
    const settings = economy?.settings ?? defaultEconomySettings();
    const state = economy?.state;

    if (state?.channels.commands && interaction.channelId !== state.channels.commands) {
      await this.replyEphemeral(interaction, `Please use this in <#${state.channels.commands}>.`);
      return;
    }

    if (interaction.commandName === 'economy') {
      await this.handleOwner(interaction, guildId, settings);
      return;
    }

    if (memberCommands.has(interaction.commandName)) {
      if (!state?.enabled) {
        await this.replyEphemeral(interaction, 'The economy is not enabled in this server.');
        return;
      }
      if (state.paused) {
        await this.replyEphemeral(interaction, 'The economy is paused.');
        return;
      }
      const cooldown = await this.redis.client.set(
        `guild:${guildId}:economy-cooldown:${interaction.user.id}`,
        '1',
        'EX',
        settings.commandCooldownSeconds,
        'NX',
      );
      if (cooldown !== 'OK') {
        await this.replyEphemeral(interaction, 'Please wait a moment before using the economy again.');
        return;
      }
    }

    switch (interaction.commandName) {
      case 'reward':
        await this.handleReward(interaction, guildId, settings, state?.channels.commands ?? interaction.channelId);
        break;
      case 'balance':
        await this.handleBalance(interaction, guildId);
        break;
      case 'shop':
      case 'store':
        await this.handleShop(interaction, guildId);
        break;
      case 'buy':
        await this.handleBuy(interaction, guildId, settings);
        break;
      case 'gift':
        await this.handleGift(interaction, guildId, settings);
        break;
      case 'senddex':
        await this.handleSendDex(interaction, guildId, settings);
        break;
      case 'get5kdex':
        await this.handleGet5kDex(interaction, guildId, settings);
        break;
      case 'leaderboard':
        await this.handleLeaderboard(interaction, guildId);
        break;
      case 'robuser':
        await this.handleSteal(interaction, guildId, settings);
        break;
    }
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('economy:')) return;
    const customTitleItemId = this.customTitleButtonItemId(interaction);
    if (customTitleItemId !== null) {
      if (!interaction.guild) {
        await this.replyEphemeral(interaction, 'Economy purchases are only available in a server.');
        return;
      }
      await interaction.showModal(this.customTitleModal(customTitleItemId));
      return;
    }
    await this.deferEphemeralReply(interaction);
    const isMemberAction = interaction.customId.startsWith('economy:buy:')
      || ['economy:balance', 'economy:reward', 'economy:shop'].includes(interaction.customId);
    if (isMemberAction) {
      if (!interaction.guild) {
        await this.replyEphemeral(interaction, 'Economy actions are only available in a server.');
        return;
      }
      const unavailable = await this.memberActionUnavailable(interaction.guild.id);
      if (unavailable) {
        await this.replyEphemeral(interaction, unavailable);
        return;
      }
    }
    if (interaction.customId.startsWith('economy:buy:')) {
      await this.handleStorePurchase(interaction, interaction.customId.split(':')[2]);
      return;
    }
    if (interaction.customId.startsWith('economy:reset-confirm:')) {
      const [, , userId, requesterId, token] = interaction.customId.split(':');
      if (!/^\d{17,20}$/.test(userId ?? '') || !/^\d{17,20}$/.test(requesterId ?? '')
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token ?? '')
        || !interaction.guild) {
        await interaction.editReply('The reset confirmation is invalid.');
        return;
      }
      const authorized = interaction.guild.ownerId === interaction.user.id
        || (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false);
      if (interaction.user.id !== requesterId || !authorized) {
        await interaction.editReply('Only the authorized requester can confirm this wallet reset.');
        return;
      }
      const confirmationKey = this.resetConfirmationKey(interaction.guild.id, userId, requesterId, token);
      if (await this.redis.client.getdel(confirmationKey) !== requesterId) {
        await interaction.editReply('The reset confirmation is invalid or has expired.');
        return;
      }
      await this.database.db.update(economyWallets).set({
        balance: 0,
        lastDailyDate: null,
        streakDay: 0,
        weekKey: null,
        weeklyGiftSent: 0,
        weeklyGiftReceived: 0,
        customTitle: null,
      }).where(and(eq(economyWallets.guildId, interaction.guild.id), eq(economyWallets.userId, userId)));
      await this.database.db.insert(economyAuditLog).values({
        guildId: interaction.guild.id,
        actorId: interaction.user.id,
        source: 'command',
        action: 'economy.admin.reset',
        after: { userId },
      });
      await interaction.editReply(`Reset <@${userId}>’s economy wallet.`);
      return;
    }
    if (interaction.customId === 'economy:balance') {
      await this.handleBalance(interaction as unknown as ChatInputCommandInteraction, interaction.guildId ?? interaction.guild!.id);
      return;
    }
    if (interaction.customId === 'economy:reward') {
      const guildId = interaction.guildId ?? interaction.guild!.id;
      const economy = await this.setup.get(guildId);
      await this.handleReward(
        interaction as unknown as ChatInputCommandInteraction,
        guildId,
        economy?.settings ?? defaultEconomySettings(),
        economy?.state.channels.commands ?? interaction.channelId,
      );
      return;
    }
    if (interaction.customId === 'economy:shop') {
      await this.handleShop(interaction as unknown as ChatInputCommandInteraction, interaction.guildId ?? interaction.guild!.id);
    }
  }

  async handleSelectMenu(
    interaction: StringSelectMenuInteraction | UserSelectMenuInteraction,
  ): Promise<void> {
    if (interaction.customId === 'economy:buy-select' && interaction.isStringSelectMenu() && interaction.guild) {
      const selectedValue = interaction.values[0];
      const customTitleItemId = this.customTitleSelectItemId(interaction, selectedValue);
      if (customTitleItemId !== null) {
        await interaction.showModal(this.customTitleModal(customTitleItemId));
        return;
      }
      await this.deferEphemeralReply(interaction);
      const unavailable = await this.memberActionUnavailable(interaction.guild.id);
      if (unavailable) {
        await this.replyEphemeral(interaction, unavailable);
        return;
      }
      await this.handleStorePurchase(interaction, selectedValue);
      return;
    }
    if (interaction.customId.startsWith('economy:bounty-buy:')
      && interaction.isUserSelectMenu() && interaction.guild) {
      const targetId = interaction.values[0];
      const selectedUser = interaction.users.get(targetId);
      if (!/^\d{17,20}$/.test(targetId) || targetId === interaction.user.id || !selectedUser || selectedUser.bot) {
        await this.replyEphemeral(interaction, 'Choose a valid member who is not yourself.');
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`economy:bounty-buy-amount:${targetId}`)
        .setTitle('Bounty reward');
      const amount = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Bounty amount')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amount));
      await interaction.showModal(modal);
      return;
    }
    if (!interaction.customId.startsWith('economy:bounty-target:')
      || !interaction.isUserSelectMenu() || !interaction.guild) return;
    const targetId = interaction.values[0];
    const selectedUser = interaction.users.get(targetId);
    if (!/^\d{17,20}$/.test(targetId) || targetId === interaction.user.id || !selectedUser || selectedUser.bot) {
      await this.replyEphemeral(interaction, 'Choose a valid member who is not yourself.');
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`economy:bounty-amount:${targetId}`)
      .setTitle('Bounty reward');
    const amount = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Bounty amount')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amount));
    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId.startsWith('economy:title-buy:') && interaction.guild) {
      await this.deferEphemeralReply(interaction);
      const unavailable = await this.memberActionUnavailable(interaction.guild.id);
      if (unavailable) {
        await interaction.editReply(unavailable);
        return;
      }
      const itemId = interaction.customId.slice('economy:title-buy:'.length);
      const settings = (await this.setup.get(interaction.guild.id))?.settings ?? defaultEconomySettings();
      const raw = interaction.fields.getTextInputValue('title');
      const title = sanitizeCustomTitle(raw);
      if (!title) {
        await interaction.editReply('Enter a title that contains usable text.');
        return;
      }
      const item = await this.database.db.select().from(shopItems)
        .where(and(eq(shopItems.guildId, interaction.guild.id), eq(shopItems.itemId, itemId), eq(shopItems.enabled, true))).limit(1);
      if (!item[0]) {
        await interaction.editReply('That item is not available.');
        return;
      }
      if (item[0].kind !== 'custom_title') {
        await interaction.editReply('That item is not a custom title.');
        return;
      }
      if (item[0].stock !== null && item[0].stock <= 0) {
        await interaction.editReply('That item is out of stock.');
        return;
      }
      const wallet = await this.wallet.getOrCreateWallet(interaction.guild.id, interaction.user.id);
      if (wallet.balance < item[0].price) {
        await interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item[0].name}** (costs ${formatCurrency(item[0].price, settings)}, you have ${formatCurrency(wallet.balance, settings)}).`);
        return;
      }
      try {
        await this.wallet.removeCoins(interaction.guild.id, interaction.user.id, item[0].price, 0, 'purchase', item[0].name);
      } catch (error) {
        if (error instanceof InsufficientCoinsError || error instanceof BadRequestException) {
          await interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item[0].name}**.`);
          return;
        }
        throw error;
      }
      if (item[0].stock !== null) {
        await this.database.db.update(shopItems).set({ stock: sql`GREATEST(${shopItems.stock} - 1, 0)` })
          .where(and(eq(shopItems.guildId, interaction.guild.id), eq(shopItems.itemId, item[0].itemId)));
      }
      await this.database.db.update(economyWallets).set({ customTitle: title, updatedAt: new Date() })
        .where(and(eq(economyWallets.guildId, interaction.guild.id), eq(economyWallets.userId, interaction.user.id)));
      await this.database.db.insert(economyAuditLog).values({
        guildId: interaction.guild.id,
        actorId: interaction.user.id,
        source: 'command',
        action: 'economy.custom_title.purchase',
        after: { title },
      });
      if (settings.announcementEvents.customTitles) {
        await this.economyMessages.postFeed(interaction.guild.id, `<@${interaction.user.id}> set a Custom Title.`);
      }
      await interaction.editReply(`Custom Title set: ${title}`);
      return;
    }
    if (interaction.customId.startsWith('economy:bounty-buy-amount:') && interaction.guild) {
      await this.deferEphemeralReply(interaction);
      const unavailable = await this.memberActionUnavailable(interaction.guild.id);
      if (unavailable) {
        await interaction.editReply(unavailable);
        return;
      }
      const targetId = interaction.customId.split(':')[2];
      const amount = Number(interaction.fields.getTextInputValue('amount').trim());
      const settings = (await this.setup.get(interaction.guild.id))?.settings ?? defaultEconomySettings();
      if (!/^\d{17,20}$/.test(targetId) || targetId === interaction.user.id) {
        await interaction.editReply('Choose a valid member who is not yourself.');
        return;
      }
      if (!Number.isSafeInteger(amount) || amount < settings.bountyMin || amount > settings.bountyMax) {
        await interaction.editReply(`Enter a whole number between ${formatCurrency(settings.bountyMin, settings)} and ${formatCurrency(settings.bountyMax, settings)}.`);
        return;
      }
      let placed = false;
      await this.database.db.transaction(async (tx) => {
        const existing = await tx.select({ id: economyBounties.id }).from(economyBounties)
          .where(and(eq(economyBounties.guildId, interaction.guild!.id), eq(economyBounties.targetId, targetId), eq(economyBounties.status, 'active'))).limit(1);
        if (existing[0]) throw new BadRequestException('There is already an active bounty on that target.');
        await this.wallet.getOrCreateWallet(interaction.guild!.id, interaction.user.id);
        await tx.select().from(economyWallets)
          .where(and(eq(economyWallets.guildId, interaction.guild!.id), eq(economyWallets.userId, interaction.user.id)))
          .for('update');
        const updated = await tx.update(economyWallets).set({
          balance: sql`${economyWallets.balance} - ${amount}`,
          updatedAt: new Date(),
        }).where(and(
          eq(economyWallets.guildId, interaction.guild!.id),
          eq(economyWallets.userId, interaction.user.id),
          sql`${economyWallets.balance} >= ${amount + settings.protectionThreshold}`,
        )).returning();
        if (!updated[0]) throw new BadRequestException('You do not have enough Dex while preserving the protection floor.');
        await tx.insert(economyBounties).values({
          guildId: interaction.guild!.id,
          buyerId: interaction.user.id,
          targetId,
          amount,
          status: 'active',
        });
        await tx.insert(economyTransactions).values({
          guildId: interaction.guild!.id,
          userId: interaction.user.id,
          type: 'bounty_hold',
          amount,
          otherUserId: targetId,
        });
      }).then(() => {
        placed = true;
      }).catch(async (error) => {
        await interaction.editReply(error instanceof BadRequestException ? error.message : 'Could not place the bounty.');
      });
      if (!placed) return;
      await interaction.editReply(`Held ${formatCurrency(amount, settings)} as a bounty on <@${targetId}>.`);
      await this.economyMessages.postBountyAnnouncement(interaction.guild.id, amount, targetId);
      return;
    }
    if (!interaction.customId.startsWith('economy:bounty-amount:') || !interaction.guild) return;
    await this.deferEphemeralReply(interaction);
    const unavailable = await this.memberActionUnavailable(interaction.guild.id);
    if (unavailable) {
      await interaction.editReply(unavailable);
      return;
    }
    const targetId = interaction.customId.split(':')[2];
    const raw = interaction.fields.getTextInputValue('amount').trim();
    const amount = Number(raw);
    const settings = (await this.setup.get(interaction.guild.id))?.settings ?? defaultEconomySettings();
    if (!Number.isSafeInteger(amount) || amount < settings.bountyMin || amount > settings.bountyMax) {
      await interaction.editReply(`Enter a whole number between ${formatCurrency(settings.bountyMin, settings)} and ${formatCurrency(settings.bountyMax, settings)}.`);
      return;
    }
    let placed = false;
    await this.database.db.transaction(async (tx) => {
      const existing = await tx.select({ id: economyBounties.id }).from(economyBounties)
        .where(and(eq(economyBounties.guildId, interaction.guild!.id), eq(economyBounties.targetId, targetId), eq(economyBounties.status, 'active'))).limit(1);
      if (existing[0]) throw new BadRequestException('There is already an active bounty on that target.');
      await this.wallet.getOrCreateWallet(interaction.guild!.id, interaction.user.id);
      await tx.select().from(economyWallets)
        .where(and(eq(economyWallets.guildId, interaction.guild!.id), eq(economyWallets.userId, interaction.user.id)))
        .for('update');
      const updated = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, interaction.guild!.id),
        eq(economyWallets.userId, interaction.user.id),
        sql`${economyWallets.balance} >= ${amount + settings.protectionThreshold}`,
      )).returning();
      if (!updated[0]) throw new BadRequestException(`You do not have enough ${settings.currencyName} while preserving the protection floor.`);
      await tx.insert(economyBounties).values({
        guildId: interaction.guild!.id,
        buyerId: interaction.user.id,
        targetId,
        amount,
        status: 'active',
      });
      await tx.insert(economyTransactions).values({
        guildId: interaction.guild!.id,
        userId: interaction.user.id,
        type: 'bounty_hold',
        amount,
        otherUserId: targetId,
      });
    }).then(() => {
      placed = true;
    }).catch(async (error) => {
      await interaction.editReply(error instanceof BadRequestException ? error.message : 'Could not place the bounty.');
    });
    if (!placed) return;
    await interaction.editReply(`Held ${formatCurrency(amount, settings)} as a bounty on <@${targetId}>.`);
    await this.economyMessages.postBountyAnnouncement(interaction.guild.id, amount, targetId);
  }

  private async handleOwner(interaction: ChatInputCommandInteraction, guildId: string, settings: typeof defaultEconomySettings extends () => infer T ? T : never) {
    const isOwner = interaction.guild?.ownerId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isOwner && !isAdmin) {
      const auditKey = `economy-owner-refusal:${guildId}:${interaction.user.id}`;
      const auditCount = await this.redis.client.incr(auditKey);
      if (auditCount === 1) {
        await this.redis.client.expire(auditKey, 60);
        await this.database.db.insert(economyAuditLog).values({
          guildId,
          actorId: interaction.user.id,
          source: 'command',
          action: 'economy.permission.refused',
          after: { subcommand: interaction.options.getSubcommand(false) },
        }).catch(() => undefined);
      }
      return interaction.editReply('Only the server owner or a member with Administrator can use /economy.');
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'on') {
      try {
        const result = await this.setup.enable(guildId, interaction.guild!.name, interaction.user.id, 'command');
        return interaction.editReply(result.message);
      } catch (error) {
        if (!(error instanceof InternalServerErrorException)) throw error;
        return interaction.editReply(error.message);
      }
    }
    if (sub === 'off') {
      await this.setup.disable(guildId, interaction.user.id, 'command');
      return interaction.editReply('Economy disabled. Data and channels were kept.');
    }
    if (sub === 'pause') {
      await this.setup.pause(guildId, interaction.user.id, 'command');
      return interaction.editReply('Economy paused.');
    }
    if (sub === 'resume') {
      await this.setup.resume(guildId, interaction.user.id, 'command');
      return interaction.editReply('Economy resumed.');
    }
    if (sub === 'status') {
      const status = await this.setup.status(guildId);
      return interaction.editReply(`Economy: ${status.enabled ? 'on' : 'off'} · Paused: ${status.paused ? 'yes' : 'no'} · Wallets: ${status.walletCount}`);
    }
    if (sub === 'help') {
      return interaction.editReply('Use /reward, /balance, /shop or /store, /senddex, /gift, /robuser and /leaderboard. Full rules are posted in economy-rules.');
    }
    if (sub === 'give' || sub === 'take') {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      try {
        if (sub === 'give') await this.wallet.addCoins(guildId, user.id, amount, 'admin_give', undefined, interaction.user.id);
        else await this.wallet.removeCoins(guildId, user.id, amount, 0, 'admin_take', undefined, interaction.user.id);
      } catch (error) {
        if (error instanceof BadRequestException) return interaction.editReply(error.message);
        throw error;
      }
      await this.database.db.insert(economyAuditLog).values({
        guildId, actorId: interaction.user.id, source: 'command',
        action: sub === 'give' ? 'economy.admin.give' : 'economy.admin.take',
        after: { userId: user.id, amount },
      });
      return interaction.editReply(sub === 'give'
        ? `Added ${formatCurrency(amount, settings)} to <@${user.id}>.`
        : `Removed ${formatCurrency(amount, settings)} from <@${user.id}>.`);
    }
    if (sub === 'reset') {
      const user = interaction.options.getUser('user', true);
      const token = randomUUID();
      const confirmationKey = this.resetConfirmationKey(guildId, user.id, interaction.user.id, token);
      const stored = await this.redis.client.set(
        confirmationKey,
        interaction.user.id,
        'EX',
        RESET_CONFIRMATION_TTL_SECONDS,
        'NX',
      );
      if (stored !== 'OK') throw new Error('Could not create wallet reset confirmation.');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`economy:reset-confirm:${user.id}:${interaction.user.id}:${token}`)
          .setLabel('Confirm wallet reset')
          .setStyle(ButtonStyle.Danger),
      );
      await interaction.editReply({
        content: `Reset <@${user.id}>’s economy wallet?`,
        components: [row],
      });
      return;
    }
  }

  private async memberActionUnavailable(guildId: string): Promise<string | null> {
    const economy = await this.setup.get(guildId);
    if (!economy?.state.enabled) return 'The economy is not enabled in this server.';
    if (economy.state.paused) return 'The economy is paused.';
    return null;
  }

  private customTitleButtonItemId(interaction: ButtonInteraction): string | null {
    const modalPrefix = 'economy:buy-title:';
    if (interaction.customId.startsWith(modalPrefix)) {
      const itemId = interaction.customId.slice(modalPrefix.length);
      return itemId || null;
    }

    const legacyPrefix = 'economy:buy:';
    const component = interaction.component;
    if (
      interaction.customId.startsWith(legacyPrefix)
      && 'emoji' in component
      && component.emoji?.name === CUSTOM_TITLE_ITEM_EMOJI
    ) {
      const itemId = interaction.customId.slice(legacyPrefix.length);
      return itemId || null;
    }
    return null;
  }

  private customTitleSelectItemId(interaction: StringSelectMenuInteraction, selectedValue: string): string | null {
    const selectedOption = interaction.component.options.find((option) => option.value === selectedValue);
    return selectedOption?.emoji?.name === CUSTOM_TITLE_ITEM_EMOJI ? selectedValue : null;
  }

  private customTitleModal(itemId: string): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(`economy:title-buy:${itemId}`)
      .setTitle('Choose your custom title');
    const title = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title (maximum 20 characters)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(title));
    return modal;
  }

  private async deferEphemeralReply(interaction: EconomyReplyInteraction): Promise<void> {
    if (interaction.deferred || interaction.replied || this.externallyAcknowledgedInteractions.has(interaction)) return;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!this.isAlreadyAcknowledgedInteractionError(error)) throw error;
      this.externallyAcknowledgedInteractions.add(interaction);
      this.logger.warn(`Economy interaction ${interaction.id} was already acknowledged before this handler deferred it.`);
    }
    this.scheduleEphemeralReplyDeletion(interaction);
  }

  private async replyEphemeral(interaction: EconomyReplyInteraction, content: string): Promise<void> {
    if (
      interaction.deferred
      || interaction.replied
      || this.externallyAcknowledgedInteractions.has(interaction)
    ) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      this.scheduleEphemeralReplyDeletion(interaction);
    }
  }

  private isAlreadyAcknowledgedInteractionError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 40060;
  }

  private scheduleEphemeralReplyDeletion(interaction: EconomyReplyInteraction): void {
    this.cancelEphemeralReplyDeletion(interaction);
    const timer = setTimeout(() => {
      this.replyDeletionTimers.delete(interaction);
      void interaction.deleteReply().catch((error: unknown) => {
        this.logger.warn(`Could not delete expired economy reply: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, EPHEMERAL_REPLY_TTL_MS);
    this.replyDeletionTimers.set(interaction, timer);
    timer.unref();
  }

  private cancelEphemeralReplyDeletion(interaction: EconomyReplyInteraction): void {
    const timer = this.replyDeletionTimers.get(interaction);
    if (!timer) return;
    clearTimeout(timer);
    this.replyDeletionTimers.delete(interaction);
  }

  private resetConfirmationKey(guildId: string, userId: string, requesterId: string, token: string): string {
    return `economy:reset-confirm:${guildId}:${userId}:${requesterId}:${token}`;
  }

  private async handleReward(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    settings: ReturnType<typeof defaultEconomySettings>,
    commandsChannelId: string,
  ) {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const accountAge = Date.now() - member.user.createdTimestamp;
    if (accountAge < settings.minAccountAgeDays * 86400_000) {
      return interaction.editReply(`You will be eligible after ${settings.minAccountAgeDays} account days.`);
    }
    if (member.joinedTimestamp && Date.now() - member.joinedTimestamp < settings.minServerHours * 3600_000) {
      return interaction.editReply(`You will be eligible after ${settings.minServerHours} hours in this server.`);
    }
    const result = await this.wallet.claimDaily(guildId, interaction.user.id, settings);
    if (!result.claimed) {
      return interaction.editReply('You already claimed today.');
    }
    try {
      await this.discord.createChannelMessage(commandsChannelId, {
        content: `<@${interaction.user.id}> claimed ${formatCurrency(result.amount, settings)} with a ${result.streakDay}-day streak.`,
        allowed_mentions: { parse: [] },
      });
    } catch (error) {
      this.logger.error(`Daily reward announcement failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
      await interaction.editReply('Your daily reward was claimed, but its public announcement failed. Please contact a server administrator.');
      return;
    }
    if (
      settings.announcementEvents.streakMilestones
      && result.streakDay >= 3
      && (result.streakDay === settings.streakCapDays || result.streakDay % 7 === 0)
    ) {
      await this.economyMessages.postFeed(
        guildId,
        `<@${interaction.user.id}> reached a ${result.streakDay}-day daily streak!`,
      );
    }
    this.cancelEphemeralReplyDeletion(interaction);
    await interaction.deleteReply().catch((error: unknown) => {
      this.logger.warn(`Could not clear private daily reward acknowledgement guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async handleBalance(interaction: ChatInputCommandInteraction, guildId: string) {
    const wallet = await this.wallet.getOrCreateWallet(guildId, interaction.user.id);
    const economy = await this.setup.get(guildId);
    const settings = economy?.settings ?? defaultEconomySettings();
    const rankRows = await this.database.db.select({ userId: economyWallets.userId }).from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.leftServer, false)))
      .orderBy(desc(economyWallets.balance), desc(economyWallets.totalEarned), economyWallets.userId);
    const rank = rankRows.findIndex((row) => row.userId === interaction.user.id) + 1;
    const tools = await this.database.db.select({ id: walletEffects.id }).from(walletEffects)
      .where(and(
        eq(walletEffects.guildId, guildId),
        eq(walletEffects.userId, interaction.user.id),
        eq(walletEffects.type, 'rob_tool'),
        sql`${walletEffects.remainingWindows} > 0`,
      ));
    return interaction.editReply(
      `Balance: ${formatCurrency(wallet.balance, settings)} · Rank: ${rank || 'unranked'} · Streak: ${wallet.streakDay} · Robbingusertool: ${tools.length}`,
    );
  }

  private async handleShop(interaction: ChatInputCommandInteraction, guildId: string) {
    const items = await this.database.db.select().from(shopItems)
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.enabled, true))).orderBy(shopItems.sortOrder);
    if (!items.length) return interaction.editReply('The economy store is empty.');
    const settings = (await this.setup.get(guildId))?.settings ?? defaultEconomySettings();
    const lines = items.map((item) => {
      const stockLabel = item.stock !== null ? ` (${item.stock} left)` : '';
      const desc = item.description ? ` — ${item.description}` : '';
      return `**${item.name}** — \`${formatCurrency(item.price, settings)}\`${stockLabel}${desc}`;
    });
    return interaction.editReply({
      embeds: [{
        title: `${settings.economyName} | Store`,
        description: lines.join('\n').slice(0, 4096),
        color: 0x5865f2,
        footer: { text: 'Use /buy <item> or the store channel buttons to purchase.' },
      }],
    });
  }

  private async handleStorePurchase(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    itemId: string,
  ): Promise<void> {
    if (!interaction.guild) {
      await this.replyEphemeral(interaction, 'Economy purchases are only available in a server.');
      return;
    }
    const guildId = interaction.guild.id;
    const item = await this.database.db.select().from(shopItems)
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, itemId), eq(shopItems.enabled, true))).limit(1);
    if (!item[0]) {
      await this.replyEphemeral(interaction, 'That item is not available.');
      return;
    }
    if (item[0].stock !== null && item[0].stock <= 0) {
      await this.replyEphemeral(interaction, 'That item is out of stock.');
      return;
    }
    const settings = (await this.setup.get(guildId))?.settings ?? defaultEconomySettings();
    if (item[0].kind === 'custom_title') {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('This store button is outdated. Please refresh the store and try again.');
        return;
      }
      await interaction.showModal(this.customTitleModal(item[0].itemId));
      return;
    }
    await this.deferEphemeralReply(interaction);
    if (item[0].kind === 'rob_tool') {
      try {
        const purchased = await this.wallet.purchaseRobbingTool(guildId, interaction.user.id, item[0].itemId);
        await interaction.editReply(
          `Purchased ${purchased.name} for ${formatCurrency(purchased.price, settings)}. It is consumed only after a successful robbery.`,
        );
      } catch (error) {
        if (error instanceof InsufficientCoinsError) {
          await interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item[0].name}**.`);
          return;
        }
        if (!(error instanceof BadRequestException)) throw error;
        await interaction.editReply(error.message);
      }
      return;
    }
    if (item[0].kind === 'randomdex') {
      await this.executeRandomDexPurchase(interaction, guildId, item[0], settings);
      return;
    }
    if (item[0].kind === 'shield') {
      const activeShield = await this.database.db.select({ id: walletEffects.id }).from(walletEffects)
        .where(and(eq(walletEffects.guildId, guildId), eq(walletEffects.userId, interaction.user.id), eq(walletEffects.type, 'shield'), sql`${walletEffects.remainingWindows} > 0`)).limit(1);
      if (activeShield[0]) {
        await interaction.editReply('You already have an active Shield.');
        return;
      }
    }
    if (item[0].kind === 'bounty') {
      const select = new UserSelectMenuBuilder()
        .setCustomId(`economy:bounty-buy:${item[0].itemId}`)
        .setPlaceholder('Choose the bounty target')
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.editReply({
        content: 'Choose the member who should carry the bounty.',
        components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
      });
      return;
    }
    if (item[0].kind === 'role') {
      await this.executeRolePurchase(interaction, guildId, item[0], settings);
      return;
    }
    try {
      await this.wallet.withTransaction(async (tx) => {
        const locked = await tx.select().from(shopItems)
          .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, item[0].itemId), eq(shopItems.enabled, true)))
          .for('update').limit(1);
        const currentItem = locked[0];
        if (!currentItem) throw new BadRequestException('That item is not available.');
        if (currentItem.stock !== null && currentItem.stock <= 0) throw new BadRequestException('That item is out of stock.');
        await tx.insert(economyWallets).values({ guildId, userId: interaction.user.id, balance: 0 }).onConflictDoNothing();
        const charged = await tx.update(economyWallets).set({
          balance: sql`${economyWallets.balance} - ${currentItem.price}`,
          updatedAt: new Date(),
        }).where(and(
          eq(economyWallets.guildId, guildId),
          eq(economyWallets.userId, interaction.user.id),
          sql`${economyWallets.balance} >= ${currentItem.price}`,
        )).returning();
        if (!charged[0]) throw new InsufficientCoinsError(`You do not have enough ${settings.currencyName} to purchase **${currentItem.name}**.`);
        if (currentItem.stock !== null) {
          const stocked = await tx.update(shopItems).set({ stock: sql`${shopItems.stock} - 1` })
            .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, currentItem.itemId), gt(shopItems.stock, 0)))
            .returning({ id: shopItems.id });
          if (!stocked[0]) throw new BadRequestException('That item is out of stock.');
        }
        await tx.insert(economyTransactions).values({
          guildId, userId: interaction.user.id, type: 'purchase', amount: currentItem.price, note: currentItem.name,
        });
        if (['shield', 'rob_more', 'lockpick', 'decoy'].includes(currentItem.kind)) {
          await tx.insert(walletEffects).values({
            guildId,
            userId: interaction.user.id,
            type: currentItem.kind,
            remainingWindows: currentItem.kind === 'shield' ? 2 : 1,
          }).onConflictDoNothing();
        }
        if (currentItem.kind === 'daily_boost') {
          await tx.insert(walletEffects).values({
            guildId,
            userId: interaction.user.id,
            type: 'daily_boost',
            remainingWindows: 0,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
        }
        await tx.insert(economyAuditLog).values({
          guildId, actorId: interaction.user.id, source: 'command', action: 'economy.item.purchase',
          after: { itemId: currentItem.itemId },
        });
      });
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      await interaction.editReply(error.message);
      return;
    }
    await interaction.editReply(`Purchased ${item[0].name}.`);
  }

  private async handleBuy(interaction: ChatInputCommandInteraction, guildId: string, settings: ReturnType<typeof defaultEconomySettings>) {
    const name = interaction.options.getString('item', true);
    const item = await this.database.db.select().from(shopItems)
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.name, name), eq(shopItems.enabled, true))).limit(1);
    if (!item[0]) return this.replyEphemeral(interaction, 'That item is not available.');
    if (item[0].stock !== null && item[0].stock <= 0) {
      return this.replyEphemeral(interaction, 'That item is out of stock.');
    }
    const wallet = await this.wallet.getOrCreateWallet(guildId, interaction.user.id);
    if (wallet.balance < item[0].price) {
      return this.replyEphemeral(
        interaction,
        `You do not have enough ${settings.currencyName} to purchase **${item[0].name}** (costs ${formatCurrency(item[0].price, settings)}, you have ${formatCurrency(wallet.balance, settings)}).`,
      );
    }
    if (item[0].kind === 'custom_title') {
      await interaction.showModal(this.customTitleModal(item[0].itemId));
      return;
    }
    await this.deferEphemeralReply(interaction);
    if (item[0].kind === 'rob_tool') {
      try {
        const purchased = await this.wallet.purchaseRobbingTool(guildId, interaction.user.id, item[0].itemId);
        return interaction.editReply(
          `Purchased ${purchased.name} for ${formatCurrency(purchased.price, settings)}. It is consumed only after a successful robbery.`,
        );
      } catch (error) {
        if (error instanceof InsufficientCoinsError) {
          return interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item[0].name}**.`);
        }
        if (!(error instanceof BadRequestException)) throw error;
        return interaction.editReply(error.message);
      }
    }
    if (item[0].kind === 'randomdex') {
      await this.executeRandomDexPurchase(interaction, guildId, item[0], settings);
      return;
    }
    if (item[0].kind === 'shield') {
      const activeShield = await this.database.db.select({ id: walletEffects.id }).from(walletEffects)
        .where(and(eq(walletEffects.guildId, guildId), eq(walletEffects.userId, interaction.user.id), eq(walletEffects.type, 'shield'), sql`${walletEffects.remainingWindows} > 0`)).limit(1);
      if (activeShield[0]) return interaction.editReply('You already have an active Shield.');
    }

    if (item[0].kind === 'bounty') {
      const select = new UserSelectMenuBuilder()
        .setCustomId(`economy:bounty-buy:${item[0].itemId}`)
        .setPlaceholder('Choose the bounty target')
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.editReply({
        content: 'Choose the member who should carry the bounty.',
        components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
      });
      return;
    }

    if (item[0].kind === 'role') {
      await this.executeRolePurchase(interaction, guildId, item[0], settings);
      return;
    }
    try {
      await this.wallet.withTransaction(async (tx) => {
        const locked = await tx.select().from(shopItems)
          .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, item[0].itemId), eq(shopItems.enabled, true)))
          .for('update').limit(1);
        const currentItem = locked[0];
        if (!currentItem) throw new BadRequestException('That item is not available.');
        if (currentItem.stock !== null && currentItem.stock <= 0) throw new BadRequestException('That item is out of stock.');
        await tx.insert(economyWallets).values({ guildId, userId: interaction.user.id, balance: 0 }).onConflictDoNothing();
        const charged = await tx.update(economyWallets).set({
          balance: sql`${economyWallets.balance} - ${currentItem.price}`,
          updatedAt: new Date(),
        }).where(and(
          eq(economyWallets.guildId, guildId),
          eq(economyWallets.userId, interaction.user.id),
          sql`${economyWallets.balance} >= ${currentItem.price}`,
        )).returning();
        if (!charged[0]) throw new InsufficientCoinsError(`You do not have enough ${settings.currencyName} to purchase **${currentItem.name}**.`);
        if (currentItem.stock !== null) {
          const stocked = await tx.update(shopItems).set({ stock: sql`${shopItems.stock} - 1` })
            .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, currentItem.itemId), gt(shopItems.stock, 0)))
            .returning({ id: shopItems.id });
          if (!stocked[0]) throw new BadRequestException('That item is out of stock.');
        }
        await tx.insert(economyTransactions).values({
          guildId, userId: interaction.user.id, type: 'purchase', amount: currentItem.price, note: currentItem.name,
        });
        if (['shield', 'rob_more', 'lockpick', 'decoy'].includes(currentItem.kind)) {
          await tx.insert(walletEffects).values({
            guildId,
            userId: interaction.user.id,
            type: currentItem.kind,
            remainingWindows: currentItem.kind === 'shield' ? 2 : 1,
          }).onConflictDoNothing();
        }
        if (currentItem.kind === 'daily_boost') {
          await tx.insert(walletEffects).values({
            guildId,
            userId: interaction.user.id,
            type: 'daily_boost',
            remainingWindows: 0,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
        }
        await tx.insert(economyAuditLog).values({
          guildId, actorId: interaction.user.id, source: 'command', action: 'economy.item.purchase',
          after: { itemId: currentItem.itemId },
        });
      });
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return interaction.editReply(error.message);
    }
    return interaction.editReply(`Purchased ${item[0].name}.`);
  }

  private async handleGift(interaction: ChatInputCommandInteraction, guildId: string, settings: ReturnType<typeof defaultEconomySettings>) {
    const receiver = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (receiver.bot) return interaction.editReply('You cannot gift Dex to a bot.');
    const [senderMember, receiverMember] = await Promise.all([
      interaction.guild!.members.fetch(interaction.user.id),
      interaction.guild!.members.fetch(receiver.id),
    ]);
    const eligible = (member: typeof senderMember) => {
      if (member.joinedTimestamp && Date.now() - member.joinedTimestamp < settings.minServerHours * 3600_000) return false;
      return Date.now() - member.user.createdTimestamp >= settings.minAccountAgeDays * 86400_000;
    };
    if (!eligible(senderMember) || !eligible(receiverMember)) return interaction.editReply('Both members must meet the economy eligibility rules.');
    try {
      await this.wallet.gift(guildId, interaction.user.id, receiver.id, amount, settings, true);
    } catch (error) {
      if (error instanceof BadRequestException) return interaction.editReply(error.message);
      throw error;
    }
    if (settings.announcementEvents.gifts) {
      await this.economyMessages.postFeed(guildId, `<@${interaction.user.id}> gifted ${formatCurrency(amount, settings)} to <@${receiver.id}>.`);
    }
    return interaction.editReply(`Gifted ${formatCurrency(amount, settings)} to <@${receiver.id}>.`);
  }

  private async handleSendDex(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    settings: ReturnType<typeof defaultEconomySettings>,
  ) {
    const receiver = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (receiver.id === interaction.user.id) {
      return interaction.editReply('You cannot send Dex to yourself.');
    }
    if (receiver.bot) {
      return interaction.editReply('You cannot send Dex to a bot.');
    }
    try {
      const result = await this.wallet.sendDex(guildId, interaction.user.id, receiver.id, amount);
      if (settings.announcementEvents.gifts) {
        await this.economyMessages.announceEvent(guildId, {
          type: 'gift',
          senderId: interaction.user.id,
          receiverId: receiver.id,
          amount,
        });
      }
      return interaction.editReply(
        `Sent ${formatCurrency(amount, settings)} from your vault to <@${receiver.id}>. Your remaining vault balance: ${formatCurrency(result.senderBalance, settings)}.`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) return interaction.editReply(error.message);
      throw error;
    }
  }

  private async handleGet5kDex(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    settings: ReturnType<typeof defaultEconomySettings>,
  ) {
    if (interaction.user.id !== TEST_CHEAT_USER_ID) {
      return interaction.editReply('This testing command is not available to this account.');
    }
    const updated = await this.wallet.addCoins(
      guildId,
      interaction.user.id,
      TEST_CHEAT_AMOUNT,
      'cheat_test',
      'Testing /get5kdex',
      interaction.user.id,
    );
    return interaction.editReply(
      `Added ${formatCurrency(TEST_CHEAT_AMOUNT, settings)} to your vault. New balance: ${formatCurrency(updated.balance, settings)}.`,
    );
  }

  private async executeRandomDexPurchase(
    interaction: EconomyReplyInteraction,
    guildId: string,
    item: typeof shopItems.$inferSelect,
    settings: ReturnType<typeof defaultEconomySettings>,
  ): Promise<void> {
    try {
      const result = await this.wallet.purchaseRandomDex(guildId, interaction.user.id, item.itemId);
      const netLabel = result.net >= 0
        ? `+${formatCurrency(result.net, settings)}`
        : `-${formatCurrency(Math.abs(result.net), settings)}`;
      await interaction.editReply(
        `🎲 You opened **${result.name}** for ${formatCurrency(result.price, settings)} and got **${formatCurrency(result.reward, settings)}**! (${netLabel} net · Vault: ${formatCurrency(result.balance, settings)})`,
      );
    } catch (error) {
      if (error instanceof InsufficientCoinsError) {
        await interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item.name}** (costs ${formatCurrency(item.price, settings)}).`);
        return;
      }
      if (error instanceof BadRequestException) {
        await interaction.editReply(error.message);
        return;
      }
      throw error;
    }
  }

  private async executeRolePurchase(
    interaction: EconomyReplyInteraction,
    guildId: string,
    item: typeof shopItems.$inferSelect,
    settings: ReturnType<typeof defaultEconomySettings>,
  ): Promise<void> {
    if (!item.roleId) {
      await interaction.editReply('This role item is unavailable.');
      return;
    }
    const guild = interaction.guild!;
    const [member, botMember, roles, wallet] = await Promise.all([
      guild.members.fetch(interaction.user.id),
      guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe(),
      this.discord.getGuildRoles(guildId),
      this.wallet.getOrCreateWallet(guildId, interaction.user.id),
    ]);
    if (member.roles.cache.has(item.roleId)) {
      await interaction.editReply('You already own this role.');
      return;
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) && !botMember.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply('DexBotX is missing the Manage Roles permission to assign this role.');
      return;
    }
    const role = roles.find((entry) => entry.id === item.roleId);
    const reason = role
      ? roleSafetyReason(role, guildId, botMember.roles.highest.position, botMember.roles.highest.id)
      : 'This role no longer exists in this server.';
    if (!role || reason) {
      await interaction.editReply(reason ?? 'This role is unavailable.');
      return;
    }
    if (wallet.balance < item.price) {
      await interaction.editReply(
        `You do not have enough ${settings.currencyName} to purchase **${item.name}** (costs ${formatCurrency(item.price, settings)}, you have ${formatCurrency(wallet.balance, settings)}).`,
      );
      return;
    }

    try {
      await this.wallet.removeCoins(guildId, interaction.user.id, item.price, 0, 'purchase', item.name);
    } catch (error) {
      if (error instanceof InsufficientCoinsError || error instanceof BadRequestException) {
        await interaction.editReply(`You do not have enough ${settings.currencyName} to purchase **${item.name}**.`);
        return;
      }
      throw error;
    }

    try {
      await member.roles.add(item.roleId, 'DexBotX economy role purchase');
    } catch (error) {
      await this.wallet.addCoins(guildId, interaction.user.id, item.price, 'refund', item.name);
      this.logger.warn(`Role assign failed guild=${guildId} user=${interaction.user.id} role=${item.roleId}: ${error instanceof Error ? error.message : String(error)}`);
      await interaction.editReply(
        `The role could not be assigned due to Discord role hierarchy or permissions. Your ${formatCurrency(item.price, settings)} was refunded.`,
      );
      return;
    }

    if (item.stock !== null) {
      await this.database.db.update(shopItems).set({ stock: sql`GREATEST(${shopItems.stock} - 1, 0)` })
        .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, item.itemId)));
    }
    if (settings.announcementEvents.rolePurchases) {
      await this.economyMessages.postFeed(guildId, `<@${interaction.user.id}> purchased ${item.name}.`);
    }
    await interaction.editReply(`Purchased **${item.name}** for ${formatCurrency(item.price, settings)}. The role has been assigned!`);
  }

  private async handleSteal(interaction: ChatInputCommandInteraction, guildId: string, settings: ReturnType<typeof defaultEconomySettings>) {
    const target = interaction.options.getUser('user', true);
    const now = new Date();
    if (target.id === interaction.user.id) {
      await interaction.editReply('You cannot rob yourself.');
      return;
    }
    const botUser = interaction.client.user;
    if (botUser && target.id === botUser.id) {
      await interaction.editReply('Nice Try, Feel Free To Go Outside and Touch Some Grasss');
      await this.economyMessages.postHeist(
        guildId,
        `${interaction.user.username} Is trying to Rob ${botUser.username} appricate him gyz 😂`,
      );
      return;
    }
    if (target.bot) {
      await interaction.editReply(GENERIC_ROB_REFUSAL);
      return;
    }

    const [thiefMember, victimMember] = await Promise.all([
      interaction.guild!.members.fetch(interaction.user.id).catch(() => null),
      interaction.guild!.members.fetch(target.id).catch(() => null),
    ]);
    if (!thiefMember || !victimMember) {
      await interaction.editReply(GENERIC_ROB_REFUSAL);
      return;
    }
    const prerequisiteStatus = await this.wallet.checkRobAttemptPrerequisites(
      guildId,
      interaction.user.id,
      interaction.id,
    );
    if (prerequisiteStatus === 'already_processed') {
      await interaction.editReply('This robbery attempt has already been processed.');
      return;
    }
    if (prerequisiteStatus === 'missing_tool') {
      await interaction.editReply(
        'You do not have a Robbingusertool. Buy one from /shop or #store before robbing; it is consumed only after a successful robbery.',
      );
      return;
    }
    if (
      now.getTime() - thiefMember.user.createdTimestamp < settings.minAccountAgeDays * 86400_000
      || (thiefMember.joinedTimestamp && now.getTime() - thiefMember.joinedTimestamp < settings.minServerHours * 3600_000)
    ) {
      await interaction.editReply(
        `You are not eligible to rob yet. Your account must be at least ${settings.minAccountAgeDays} days old, and you must have been in this server for ${settings.minServerHours} hours.`,
      );
      return;
    }
    const result = await this.wallet.rob(guildId, interaction.user.id, target.id, settings, interaction.id, now);
    if (result.status === 'missing_tool') {
      await interaction.editReply(
        'You do not have a Robbingusertool. Buy one from /shop or #store before robbing; it is consumed only after a successful robbery.',
      );
      return;
    }
    if (result.status === 'already_processed') {
      await interaction.editReply('This robbery attempt has already been processed.');
      return;
    }
    if (result.status === 'decoy') {
      await interaction.editReply('A Decoy blocked the robbery. You got nothing, and your Robbingusertool was not consumed.');
      return;
    }
    if (result.status !== 'success') {
      await interaction.editReply(GENERIC_ROB_REFUSAL);
      return;
    }

    await interaction.editReply(
      `You robbed ${formatCurrency(result.amount, settings)}${result.bountyPaid ? ` and claimed a ${formatCurrency(result.bountyPaid, settings)} bounty` : ''}. Your Robbingusertool was used up.`,
    );
    const totalRobbed = result.amount + result.bountyPaid;
    const stealText = `<@${interaction.user.id}> robbed <@${target.id}> for ${formatCurrency(result.amount, settings)}${result.bountyPaid ? ` and claimed a ${formatCurrency(result.bountyPaid, settings)} bounty` : ''}.`;
    const announcements = [
      this.economyMessages.postHeist(
        guildId,
        stealText,
        settings.pingVictim ? target.id : undefined,
      ),
      this.economyMessages.postRobSuccessAnnouncement(
        guildId,
        interaction.user.id,
        target.id,
        totalRobbed,
      ),
    ];
    if (result.bountyPaid) {
      announcements.push(this.economyMessages.postBountyClaimAnnouncement(
        guildId,
        interaction.user.id,
        result.bountyPaid,
        target.id,
      ));
    }
    await Promise.all(announcements);
  }

  private async handleLeaderboard(interaction: ChatInputCommandInteraction, guildId: string) {
    const rows = await this.database.db.select({ userId: economyWallets.userId, balance: economyWallets.balance })
      .from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.leftServer, false)))
      .orderBy(desc(economyWallets.balance), desc(economyWallets.totalEarned), economyWallets.userId)
      .limit(10);
    if (!rows.length) return interaction.editReply('No economy wallets yet.');
    const settings = (await this.setup.get(guildId))?.settings ?? defaultEconomySettings();
    return interaction.editReply(rows.map((row, index) => `${index + 1}. <@${row.userId}> — ${formatCurrency(row.balance, settings)}`).join('\n'));
  }
}
