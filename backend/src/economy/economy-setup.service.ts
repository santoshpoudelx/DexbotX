import { Injectable, Logger } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { economyAuditLog, economySettings, economyWallets, shopItems } from '../db/schema';
import { RedisService } from '../redis/redis.service';
import { DiscordRestService } from '../discord/discord-rest.service';
import { defaultEconomySettings, economySettingsSchema, type EconomySettings } from './economy.schema';
import { EconomyWindowService } from './economy-window.service';
import { formatCurrency } from './economy-format';
import { EconomyMessageService } from './economy-message.service';

const DEFAULT_STORE = [
  ['rob_tool', 'Robbingusertool', 'One successful robbery, capped at 200. Consumed only after success.', 400],
  ['decoy', 'Decoy', 'Stops one robbery attempt without consuming the Robbingusertool.', 90],
  ['shield', 'Shield', 'Blocks two robbery attempts.', 150],
  ['daily_boost', 'Daily Boost', '+25 on every daily reward for 7 days.', 150],
  ['lockpick', 'Lockpick', 'Bypass one Shield charge on a successful robbery, but not a Decoy.', 180],
  ['bounty', 'Bounty Poster', 'Set a reward paid to whoever successfully robs your target.', 50],
  ['custom_title', 'Custom Title', 'A short title shown next to your leaderboard name.', 250],
] as const;

const DEFAULT_ROLES = [
  ['bronze', 'Bronze Member', 'Bronze cosmetic role', 400, 0xcd7f32],
  ['silver', 'Silver Member', 'Silver cosmetic role', 1000, 0xc0c0c0],
  ['gold', 'Gold Member', 'Gold cosmetic role', 2000, 0xffd700],
  ['diamond', 'Diamond Member', 'Diamond cosmetic role', 4000, 0x7df9ff],
] as const;

function economyCategoryOverwrites(guildId: string, botId: string) {
  return [
    { id: guildId, type: 0, allow: String(PermissionFlagsBits.ViewChannel), deny: '0' },
    ...(botId ? [{
      id: botId,
      type: 1,
      allow: String(PermissionFlagsBits.ViewChannel),
      deny: '0',
    }] : []),
  ];
}

function economyChannelOverwrites(guildId: string, botId: string, commandsOnly: boolean) {
  const memberAllow = PermissionFlagsBits.ViewChannel
    | (commandsOnly ? PermissionFlagsBits.UseApplicationCommands : 0n);
  const memberDeny = PermissionFlagsBits.SendMessages
    | (commandsOnly ? 0n : PermissionFlagsBits.UseApplicationCommands);
  const botAllow = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.EmbedLinks
    | PermissionFlagsBits.ReadMessageHistory
    | PermissionFlagsBits.ManageMessages;

  return [
    { id: guildId, type: 0, allow: String(memberAllow), deny: String(memberDeny) },
    ...(botId ? [{ id: botId, type: 1, allow: String(botAllow), deny: '0' }] : []),
  ];
}

export interface EconomyStatus {
  enabled: boolean;
  paused: boolean;
  channels: Record<string, string | null>;
  missing: string[];
  walletCount: number;
}

@Injectable()
export class EconomySetupService {
  private readonly logger = new Logger(EconomySetupService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly discord: DiscordRestService,
    private readonly windows: EconomyWindowService,
    private readonly messages: EconomyMessageService,
  ) {}

  async get(guildId: string): Promise<{ settings: EconomySettings; state: EconomyStatus } | null> {
    const rows = await this.database.db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
    if (!rows[0]) return null;
    const parsed = economySettingsSchema.safeParse(rows[0].config);
    const settings = parsed.success ? parsed.data : defaultEconomySettings();
    const walletCount = await this.database.db.select({ guildId: economyWallets.guildId }).from(economyWallets);
    const count = walletCount.filter((row) => row.guildId === guildId).length;
    return { settings, state: await this.status(guildId, count, rows[0]) };
  }

  async enable(guildId: string, guildName: string, actorId: string, source: 'dashboard' | 'command') {
    const lockKey = `guild:${guildId}:economy-setup-lock`;
    const lock = await this.redis.client.set(lockKey, '1', 'EX', 60, 'NX');
    if (lock !== 'OK') return { ok: false, message: 'Economy setup is already running.' };
    try {
      const before = await this.database.db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
      const settings = before[0] ? economySettingsSchema.parse(before[0].config) : defaultEconomySettings();

      await this.discord.getGuildAsBot(guildId);
      const roles = await this.discord.getGuildRoles(guildId);
      const botMember = await this.discord.getGuildMember(guildId, process.env.DISCORD_CLIENT_ID ?? '');
      let botPermissions = 0n;
      for (const role of roles) {
        if (role.id === guildId || botMember.roles.includes(role.id)) {
          botPermissions |= BigInt(role.permissions ?? '0');
        }
      }
      if ((botPermissions & (1n << 3n)) !== 0n) botPermissions = 0xffffffffffffffn;
      const requiredPermissions = [
        ['View Channels', 1n << 10n],
        ['Manage Channels', 1n << 4n],
        ['Manage Roles', 1n << 28n],
        ['Send Messages', 1n << 11n],
        ['Embed Links', 1n << 14n],
        ['Manage Messages', 1n << 13n],
        ['Read Message History', 1n << 16n],
      ] as const;
      const missingPermissions = requiredPermissions
        .filter(([, bit]) => (botPermissions & bit) !== bit)
        .map(([name]) => name);
      if (missingPermissions.length) {
        return {
          ok: false,
          message: `Missing bot permissions: ${missingPermissions.join(', ')}`,
          channels: {},
        };
      }
      const channels = await this.discord.getGuildChannels(guildId);
      const storedCategory = before[0]?.categoryId
        ? channels.find((channel) => channel.id === before[0]!.categoryId && channel.type === 4)
        : undefined;
      const existingCategory = storedCategory
        ?? channels.find((channel) => channel.type === 4 && channel.name === settings.economyName);
      let categoryId = existingCategory?.id ?? before[0]?.categoryId ?? null;
      const botId = process.env.DISCORD_CLIENT_ID ?? '';
      if (!categoryId) {
        const category = await this.discord.createGuildChannel(guildId, {
          name: settings.economyName,
          type: 4,
          permission_overwrites: economyCategoryOverwrites(guildId, botId),
        });
        categoryId = category.id;
      } else {
        await this.discord.editGuildChannel(categoryId, {
          permission_overwrites: economyCategoryOverwrites(guildId, botId),
        });
      }
      const now = new Date();
      await this.database.db.insert(economySettings).values({
        guildId,
        enabled: true,
        paused: false,
        categoryId,
        config: settings,
        defaultsSeeded: before[0]?.defaultsSeeded ?? false,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: economySettings.guildId,
        set: { enabled: true, categoryId, config: settings, updatedAt: now },
      });

      const channelDefs = [
        ['rulesChannelId', 'economy-rules', 0],
        ['commandsChannelId', 'economy-commands', 0],
        ['leaderboardChannelId', 'leaderboard', 0],
        ['storeChannelId', 'store', 0],
        ['heistLogChannelId', 'heist-log', 0],
        ['announcementsChannelId', 'economy-announcements', 0],
      ] as const;
      const saved: Record<string, string | null> = {};
      for (const [field, name, type] of channelDefs) {
        const savedId = before[0]?.[field];
        let channel = savedId
          ? channels.find((item) => item.id === savedId
            && item.type === type
            && item.parent_id === categoryId
            && item.name === name)
          : undefined;
        if (!channel) channel = channels.find((item) =>
          item.name === name
          && item.parent_id === categoryId
          && item.type === type,
        );
        const permissionOverwrites = economyChannelOverwrites(
          guildId,
          botId,
          field === 'commandsChannelId',
        );
        if (!channel) {
          channel = await this.discord.createGuildChannel(guildId, {
            name,
            type,
            parent_id: categoryId,
            permission_overwrites: permissionOverwrites,
          });
        } else {
          await this.discord.editGuildChannel(channel.id, {
            permission_overwrites: permissionOverwrites,
          });
        }
        saved[field] = channel.id;
        await this.saveChannelId(guildId, field, channel.id);
      }

      await this.database.db.insert(economySettings).values({
        guildId,
        enabled: true,
        paused: false,
        categoryId,
        rulesChannelId: saved.rulesChannelId,
        commandsChannelId: saved.commandsChannelId,
        leaderboardChannelId: saved.leaderboardChannelId,
        storeChannelId: saved.storeChannelId,
        heistLogChannelId: saved.heistLogChannelId,
        announcementsChannelId: saved.announcementsChannelId,
        config: settings,
        defaultsSeeded: before[0]?.defaultsSeeded ?? false,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: economySettings.guildId,
        set: {
          enabled: true,
          paused: false,
          categoryId,
          rulesChannelId: saved.rulesChannelId,
          commandsChannelId: saved.commandsChannelId,
          leaderboardChannelId: saved.leaderboardChannelId,
          storeChannelId: saved.storeChannelId,
          heistLogChannelId: saved.heistLogChannelId,
          announcementsChannelId: saved.announcementsChannelId,
          updatedAt: now,
        },
      });

      if (!before[0]?.defaultsSeeded) await this.seedDefaults(guildId);
      await this.seedRobbingUserTool(guildId);
      await this.database.db.update(shopItems).set({ enabled: false }).where(and(
        eq(shopItems.guildId, guildId),
        eq(shopItems.kind, 'rob_more'),
        eq(shopItems.isDefault, true),
        eq(shopItems.enabled, true),
      ));
      await this.database.db.update(economySettings).set({ defaultsSeeded: true, updatedAt: now })
        .where(eq(economySettings.guildId, guildId));

      await this.createOrRepairMessages(guildId, guildName, saved, before[0]);
      await this.messages.updateRules(guildId, guildName);
      await this.messages.updateStore(guildId);
      await this.messages.refreshLeaderboard(guildId);
      await this.messages.updateRobbingInfo(guildId);

      await this.database.db.insert(economyAuditLog).values({
        guildId, actorId, source, action: 'economy.enable', before: before[0] ? { enabled: before[0].enabled } : null,
        after: { enabled: true, guildName },
      });
      await this.windows.reconcile(guildId);
      return { ok: true, message: 'Economy enabled.', channels: saved };
    } catch (error) {
      this.logger.error(`Economy setup failed guild=${guildId}: ${(error as Error).message}`);
      return { ok: false, message: (error as Error).message };
    } finally {
      await this.redis.client.del(lockKey);
    }
  }

  async disable(guildId: string, actorId: string, source: 'dashboard' | 'command') {
    await this.database.db.update(economySettings).set({ enabled: false, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
    await this.database.db.insert(economyAuditLog).values({ guildId, actorId, source, action: 'economy.disable', after: { enabled: false } });
    await this.windows.cancelScheduledJobs(guildId);
  }

  async pause(guildId: string, actorId: string, source: 'dashboard' | 'command') {
    await this.database.db.update(economySettings).set({ paused: true, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
    await this.database.db.insert(economyAuditLog).values({ guildId, actorId, source, action: 'economy.pause', after: { paused: true } });
    await this.windows.cancelScheduledJobs(guildId);
  }

  async resume(guildId: string, actorId: string, source: 'dashboard' | 'command') {
    await this.database.db.update(economySettings).set({ paused: false, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
    await this.database.db.insert(economyAuditLog).values({ guildId, actorId, source, action: 'economy.resume', after: { paused: false } });
    await this.windows.reconcile(guildId);
  }

  async updateSettings(guildId: string, settings: EconomySettings, actorId: string) {
    const parsed = economySettingsSchema.parse(settings);
    const existing = await this.database.db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1);
    await this.database.db.update(economySettings).set({ config: parsed, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
    await this.database.db.insert(economyAuditLog).values({ guildId, actorId, source: 'dashboard', action: 'economy.settings.update', after: parsed as unknown as Record<string, unknown> });
    if (existing[0]?.categoryId) {
      await this.discord.editGuildChannel(existing[0].categoryId, { name: parsed.economyName });
    }
    await this.messages.updateRules(guildId, existing[0]?.guildId ? (await this.discord.getGuildAsBot(guildId)).name : 'Server');
    await this.messages.updateStore(guildId);
    await this.messages.refreshLeaderboard(guildId);
    await this.messages.updateRobbingInfo(guildId);
  }

  async status(guildId: string, walletCount = 0, row?: typeof economySettings.$inferSelect): Promise<EconomyStatus> {
    const current = row ?? (await this.database.db.select().from(economySettings).where(eq(economySettings.guildId, guildId)).limit(1))[0];
    const channels = current ? {
      category: current.categoryId,
      rules: current.rulesChannelId,
      commands: current.commandsChannelId,
      leaderboard: current.leaderboardChannelId,
      store: current.storeChannelId,
      heistLog: current.heistLogChannelId,
      announcements: current.announcementsChannelId,
    } : { category: null, rules: null, commands: null, leaderboard: null, store: null, heistLog: null, announcements: null };
    const missing = Object.entries(channels).filter(([, id]) => !id).map(([name]) => name);
    return {
      enabled: current?.enabled ?? false,
      paused: current?.paused ?? false,
      channels,
      missing,
      walletCount,
    };
  }

  private async saveChannelId(
    guildId: string,
    field: 'rulesChannelId' | 'commandsChannelId' | 'leaderboardChannelId' | 'storeChannelId' | 'heistLogChannelId' | 'announcementsChannelId',
    channelId: string,
  ): Promise<void> {
    switch (field) {
      case 'rulesChannelId':
        await this.database.db.update(economySettings).set({ rulesChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
      case 'commandsChannelId':
        await this.database.db.update(economySettings).set({ commandsChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
      case 'leaderboardChannelId':
        await this.database.db.update(economySettings).set({ leaderboardChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
      case 'storeChannelId':
        await this.database.db.update(economySettings).set({ storeChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
      case 'heistLogChannelId':
        await this.database.db.update(economySettings).set({ heistLogChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
      case 'announcementsChannelId':
        await this.database.db.update(economySettings).set({ announcementsChannelId: channelId, updatedAt: new Date() }).where(eq(economySettings.guildId, guildId));
        break;
    }
  }

  private async createOrRepairMessages(
    guildId: string,
    guildName: string,
    saved: Record<string, string | null>,
    before: typeof economySettings.$inferSelect | undefined,
  ) {
    const settings = before
      ? economySettingsSchema.safeParse(before.config).success
        ? economySettingsSchema.parse(before.config)
        : defaultEconomySettings()
      : defaultEconomySettings();
    let panelNeedsRepair = !before?.panelMessageId;
    if (before?.panelMessageId && saved.commandsChannelId) {
      try {
        await this.discord.getChannelMessage(saved.commandsChannelId, before.panelMessageId);
      } catch {
        panelNeedsRepair = true;
      }
    }
    if (panelNeedsRepair && saved.commandsChannelId) {
      const panel = await this.discord.createChannelMessage(saved.commandsChannelId, {
        content: settings.economyName,
        embeds: [{ title: `${settings.economyName} panel`, description: 'Choose an economy action. Replies are private.', color: 0x5865f2 }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 1, custom_id: 'economy:balance', label: 'My Balance' },
            { type: 2, style: 1, custom_id: 'economy:reward', label: 'Claim Daily' },
            { type: 2, style: 1, custom_id: 'economy:shop', label: 'Shop' },
          ],
        }],
      });
      await this.discord.pinChannelMessage(saved.commandsChannelId, panel.id);
      await this.database.db.update(economySettings).set({ panelMessageId: panel.id }).where(eq(economySettings.guildId, guildId));
    }

    if (!before?.storeMessageId && saved.storeChannelId) {
      const items = await this.database.db.select().from(shopItems)
        .where(eq(shopItems.guildId, guildId)).orderBy(shopItems.sortOrder);
      const enabled = items.filter((item) => item.enabled);
      const store = await this.discord.createChannelMessage(saved.storeChannelId, {
        embeds: [{
          title: `${settings.economyName} store`,
          description: enabled.length
            ? enabled.map((item) => `**${item.name}** — ${formatCurrency(item.price, settings)}`).join('\n').slice(0, 4096)
            : 'No store items are enabled.',
          color: 0x5865f2,
        }],
      });
      await this.database.db.update(economySettings).set({ storeMessageId: store.id }).where(eq(economySettings.guildId, guildId));
    }

    if (!before?.leaderboardMessageId && saved.leaderboardChannelId) {
      const leaderboard = await this.discord.createChannelMessage(saved.leaderboardChannelId, {
        embeds: [{ title: `${settings.economyName}: Richest members`, description: 'The leaderboard is being prepared.', color: 0x5865f2 }],
      });
      await this.database.db.update(economySettings).set({ leaderboardMessageId: leaderboard.id }).where(eq(economySettings.guildId, guildId));
    }

    if (!before?.countdownMessageId && saved.announcementsChannelId) {
      const countdown = await this.discord.createChannelMessage(saved.announcementsChannelId, {
        content: `Rob any time with /robuser. Buy a Robbingusertool from /shop for 400 ${settings.currencyName}; it is consumed only after a successful robbery.`,
      });
      await this.discord.pinChannelMessage(saved.announcementsChannelId, countdown.id);
      await this.database.db.update(economySettings).set({ countdownMessageId: countdown.id }).where(eq(economySettings.guildId, guildId));
    }

    if (!before?.rulesMessageIds?.length && saved.rulesChannelId) {
      const ids: string[] = [];
      const embeds = [
        { title: 'Start here', description: `Welcome to ${settings.economyName} for ${guildName}. Earn ${settings.currencyName}, spend in the store and rob members any time with a Robbingusertool. Go to <#${saved.commandsChannelId ?? ''}> and use /reward.`, color: 0x5865f2 },
        { title: 'All commands', description: '/reward, /balance, /shop, /store, /buy, /robuser, /gift and /leaderboard. Economy commands only work in economy-commands.', color: 0x5865f2 },
        { title: 'Daily rewards and streaks', description: `Use /reward once per local day. Day 1 gives ${formatCurrency(settings.dailyAmount, settings)}. The streak can grow by ${formatCurrency(settings.streakStep, settings)} per day, up to ${settings.streakCapDays} days.`, color: 0x5865f2 },
        { title: 'Robbing', description: `Use /robuser any time. A Robbingusertool costs 400 ${settings.currencyName}, allows one successful robbery of up to ${formatCurrency(200, settings)}, and is consumed after success. No member can be robbed below ${formatCurrency(Math.max(50, settings.protectionThreshold), settings)}.`, color: 0x5865f2 },
        { title: 'The store', description: 'Open the store channel or use /shop or /store. Steal-related items take effect as soon as they are bought.', color: 0x5865f2 },
        { title: 'Gifts and fair play', description: `Send up to ${formatCurrency(settings.weeklyGiftSendLimit, settings)} each week and receive up to ${formatCurrency(settings.weeklyGiftReceiveLimit, settings)}. Staff changes are logged.`, color: 0x5865f2 },
      ];
      for (const embed of embeds) {
        const message = await this.discord.createChannelMessage(saved.rulesChannelId, { embeds: [embed] });
        ids.push(message.id);
      }
      await this.database.db.update(economySettings).set({ rulesMessageIds: ids, rulesHash: '' })
        .where(eq(economySettings.guildId, guildId));
    }
  }

  private async seedDefaults(guildId: string) {
    for (const [index, item] of DEFAULT_STORE.entries()) {
      const [itemId, name, description, price] = item;
      await this.database.db.insert(shopItems).values({
        guildId, itemId, kind: itemId, name, description, price, enabled: true, isDefault: true, sortOrder: index,
      }).onConflictDoNothing();
    }
    for (const [index, role] of DEFAULT_ROLES.entries()) {
      const [itemId, name, description, price, color] = role;
      try {
        const created = await this.discord.createRole(guildId, name, '0', color);
        await this.database.db.insert(shopItems).values({
          guildId, itemId, kind: 'role', name, description, price, roleId: created.id,
          enabled: true, isDefault: true, sortOrder: DEFAULT_STORE.length + index,
        }).onConflictDoNothing();
      } catch (error) {
        this.logger.warn(`Could not create default economy role ${name}: ${(error as Error).message}`);
      }
    }
  }

  private async seedRobbingUserTool(guildId: string) {
    const item = DEFAULT_STORE.find(([itemId]) => itemId === 'rob_tool');
    if (!item) throw new Error('Default Robbingusertool is missing.');
    const index = DEFAULT_STORE.indexOf(item);
    const [itemId, name, description, price] = item;
    await this.database.db.insert(shopItems).values({
      guildId,
      itemId,
      kind: itemId,
      name,
      description,
      price,
      enabled: true,
      isDefault: true,
      sortOrder: index,
    }).onConflictDoNothing();
  }
}
