import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { economySettings, economyWallets, shopItems } from '../db/schema';
import { DiscordApiError, DiscordRestService } from '../discord/discord-rest.service';
import { RedisService } from '../redis/redis.service';
import { defaultEconomySettings, economySettingsSchema } from './economy.schema';
import { formatCurrency } from './economy-format';

const STORE_CATEGORIES = [
  { name: 'Robbing', kinds: ['rob_tool', 'bounty'] },
  { name: 'Protection', kinds: ['shield', 'decoy', 'lockpick'] },
  { name: 'Daily & style', kinds: ['daily_boost', 'custom_title'] },
  { name: 'Server roles', kinds: ['role'] },
] as const;

const STORE_ITEM_EMOJI: Record<string, string> = {
  rob_tool: '🧰',
  bounty: '🎯',
  shield: '🛡️',
  decoy: '🎭',
  lockpick: '🗝️',
  daily_boost: '✨',
  custom_title: '🏷️',
  role: '🏅',
};

function isOldMessageEditLimit(error: unknown): error is DiscordApiError {
  return error instanceof DiscordApiError
    && error.status === 429
    && error.message.toLowerCase().includes('maximum number of edits to messages older than 1 hour reached');
}

@Injectable()
export class EconomyMessageService {
  private readonly logger = new Logger(EconomyMessageService.name);
  private readonly feedQueues = new Map<string, Promise<void>>();
  private readonly feedQueueLengths = new Map<string, number>();
  private readonly syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly syncInflight = new Map<string, Promise<void>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly discord: DiscordRestService,
    private readonly redis: RedisService,
  ) {}

  private async settings(guildId: string) {
    const rows = await this.database.db.select().from(economySettings)
      .where(eq(economySettings.guildId, guildId)).limit(1);
    const row = rows[0];
    const parsed = row ? economySettingsSchema.safeParse(row.config) : undefined;
    return { row, settings: parsed?.success ? parsed.data : defaultEconomySettings() };
  }

  private async editOrReplaceMessage(
    channelId: string,
    messageId: string,
    payload: Record<string, unknown>,
  ): Promise<{ messageId: string; supersededMessageId?: string }> {
    try {
      await this.discord.editChannelMessage(channelId, messageId, payload);
      return { messageId };
    } catch (error) {
      const missing = error instanceof DiscordApiError && error.status === 404;
      if (!missing && !isOldMessageEditLimit(error)) throw error;

      if (!missing) {
        this.logger.warn(`Discord edit limit reached for economy message ${messageId} in channel ${channelId}; creating a replacement.`);
      }
      const replacement = await this.discord.createChannelMessage(channelId, payload);
      return {
        messageId: replacement.id,
        ...(missing ? {} : { supersededMessageId: messageId }),
      };
    }
  }

  private async deleteSupersededMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discord.deleteChannelMessage(channelId, messageId);
    } catch (error) {
      this.logger.warn(`Could not delete superseded economy message ${messageId} in channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  scheduleStoreAndRulesSync(guildId: string, guildName: string): void {
    const existingTimer = this.syncTimers.get(guildId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.syncTimers.delete(guildId);
      const prev = this.syncInflight.get(guildId) ?? Promise.resolve();
      const next = prev
        .catch(() => undefined)
        .then(async () => {
          await this.updateStore(guildId);
          await this.updateRules(guildId, guildName);
        })
        .catch((error: unknown) => {
          this.logger.warn(`Debounced store/rules sync failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          if (this.syncInflight.get(guildId) === next) this.syncInflight.delete(guildId);
        });
      this.syncInflight.set(guildId, next);
    }, 300);
    timer.unref();
    this.syncTimers.set(guildId, timer);
  }

  async postFeed(guildId: string, text: string) {
    const { row } = await this.settings(guildId);
    if (!row?.enabled || row.paused) return;
    const channelId = row.announcementsChannelId;
    if (!channelId) return;
    await this.enqueueDiscordPost(channelId, { content: text.slice(0, 2000) }).catch((error: unknown) => {
      this.logger.warn(`Economy feed post failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async postBountyAnnouncement(guildId: string, amount: number, targetUserId: string) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.enabled || row.paused) return;
    const channelId = row.announcementsChannelId;
    if (!channelId) return;
    await this.enqueueDiscordPost(channelId, {
      content: `${formatCurrency(amount, settings)} bounty has been set on <@${targetUserId}>.`,
      allowed_mentions: { parse: [] },
    }).catch((error: unknown) => {
      this.logger.warn(`Bounty announcement failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async postBountyClaimAnnouncement(
    guildId: string,
    robberUserId: string,
    amount: number,
    targetUserId: string,
  ) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.enabled || row.paused) return;
    const channelId = row.announcementsChannelId;
    if (!channelId) return;
    await this.enqueueDiscordPost(channelId, {
      content: `<@${robberUserId}> claimed ${formatCurrency(amount, settings)} by robbing <@${targetUserId}>.`,
      allowed_mentions: { parse: [] },
    }).catch((error: unknown) => {
      this.logger.warn(`Bounty claim announcement failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async postHeist(guildId: string, text: string, victimUserId?: string) {
    const { row } = await this.settings(guildId);
    if (!row?.enabled) return;
    const channelId = row.heistAnnounceChannelId ?? row.heistLogChannelId;
    if (!channelId) return;
    await this.enqueueDiscordPost(channelId, victimUserId
      ? { content: text.slice(0, 2000), allowed_mentions: { parse: [], users: [victimUserId] } }
      : { content: text.slice(0, 2000) }).catch((error: unknown) => {
      this.logger.warn(`Heist announcement failed guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private enqueueDiscordPost(channelId: string, payload: Record<string, unknown>) {
    const queueLength = (this.feedQueueLengths.get(channelId) ?? 0) + 1;
    if (queueLength > 100) {
      this.feedQueueLengths.set(channelId, 100);
      this.logger.warn(`Economy Discord queue reached hard limit guildChannel=${channelId}; combining newer posts`);
      return this.feedQueues.get(channelId) ?? Promise.resolve();
    }
    this.feedQueueLengths.set(channelId, queueLength);
    const previous = this.feedQueues.get(channelId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        let attempts = 0;
        while (attempts < 5) {
          try {
            await this.discord.createChannelMessage(channelId, payload);
            return;
          } catch (error) {
            attempts++;
            if (error instanceof DiscordApiError && error.status === 429) {
              await new Promise((resolve) => setTimeout(resolve, Math.ceil((error.retryAfter ?? 1) * 1000)));
              continue;
            }
            if (error instanceof DiscordApiError && [500, 502, 503, 504].includes(error.status)) {
              await new Promise((resolve) => setTimeout(resolve, attempts * 500));
              continue;
            }
            throw error;
          }
        }
        throw new Error(`Economy Discord post exhausted retries channel=${channelId}`);
      });
    this.feedQueues.set(channelId, next);
    void next.finally(() => {
      this.feedQueueLengths.set(channelId, Math.max(0, (this.feedQueueLengths.get(channelId) ?? 1) - 1));
      if (this.feedQueues.get(channelId) === next) this.feedQueues.delete(channelId);
    });
    return next;
  }

  async updateRules(guildId: string, guildName: string) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.rulesChannelId) return;
    const items = await this.database.db.select().from(shopItems)
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.enabled, true))).orderBy(shopItems.sortOrder);
    const embeds = [
      { title: 'Start here', description: `Welcome to ${settings.economyName} for ${guildName}. Earn ${settings.currencyName}, spend in the store and rob members any time with a Robbingusertool. Go to <#${row.commandsChannelId ?? ''}> and use /reward.`, color: 0x5865f2 },
      { title: 'All commands', description: '/reward, /balance, /shop, /store, /buy, /robuser, /gift and /leaderboard. Economy commands only work in economy-commands.', color: 0x5865f2 },
      { title: 'Daily rewards and streaks', description: `Use /reward once per local day. Day 1 gives ${formatCurrency(settings.dailyAmount, settings)}. The streak can grow by ${formatCurrency(settings.streakStep, settings)} per day, up to ${settings.streakCapDays} days.`, color: 0x5865f2 },
      { title: 'Robbing', description: `Use /robuser any time. A Robbingusertool costs 400 ${settings.currencyName}, allows one successful robbery of up to ${formatCurrency(200, settings)}, and is consumed after success. No member can be robbed below ${formatCurrency(Math.max(50, settings.protectionThreshold), settings)}.`, color: 0x5865f2 },
      { title: 'The store', description: items.length
        ? items.map((item) => `**${item.name}:** ${formatCurrency(item.price, settings)} — ${item.description || item.kind}`).join('\n').slice(0, 4096)
        : 'No store items are enabled.', color: 0x5865f2 },
      { title: 'Gifts and fair play', description: `Send up to ${formatCurrency(settings.weeklyGiftSendLimit, settings)} each week and receive up to ${formatCurrency(settings.weeklyGiftReceiveLimit, settings)}. Staff changes are logged.`, color: 0x5865f2 },
    ];
    const hash = createHash('sha256').update(JSON.stringify(embeds)).digest('hex');
    const changed = row.rulesHash !== hash;

    const ids = [...(row.rulesMessageIds ?? [])];
    const supersededMessages: string[] = [];
    if (!changed && ids.length === embeds.length && ids.every((id) => typeof id === 'string' && id.length > 0)) {
      return;
    }
    for (let index = 0; index < embeds.length; index++) {
      const payload = { embeds: [embeds[index]] };
      if (ids[index]) {
        const result = await this.editOrReplaceMessage(row.rulesChannelId, ids[index], payload);
        ids[index] = result.messageId;
        if (result.supersededMessageId) {
          supersededMessages.push(result.supersededMessageId);
        }
        continue;
      }
      const created = await this.discord.createChannelMessage(row.rulesChannelId, payload);
      ids[index] = created.id;
    }
    await this.database.db.update(economySettings).set({ rulesMessageIds: ids, rulesHash: hash })
      .where(eq(economySettings.guildId, guildId));
    for (const messageId of supersededMessages) {
      await this.deleteSupersededMessage(row.rulesChannelId, messageId);
    }
  }

  async updateStore(guildId: string) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.storeChannelId) return;
    const items = await this.database.db.select().from(shopItems)
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.enabled, true))).orderBy(shopItems.sortOrder);
    const categorized: { name: string; kinds: readonly string[]; items: typeof items }[] = STORE_CATEGORIES.map((category) => ({
      ...category,
      items: items.filter((item) => (category.kinds as readonly string[]).includes(item.kind)),
    }));
    const categorizedIds = new Set(categorized.flatMap((category) => category.items.map((item) => item.itemId)));
    const uncategorized = items.filter((item) => !categorizedIds.has(item.itemId));
    if (uncategorized.length) categorized.push({
      name: 'More items',
      kinds: [],
      items: uncategorized,
    });

    const buttonRows = categorized.flatMap((category) => {
      const rows: Record<string, unknown>[] = [];
      for (let index = 0; index < category.items.length; index += 5) {
        rows.push({
          type: 1,
          components: category.items.slice(index, index + 5).map((item) => ({
            type: 2,
            style: item.kind === 'rob_tool' ? 1 : item.kind === 'role' ? 3 : 2,
            label: item.name.slice(0, 80),
            emoji: { name: STORE_ITEM_EMOJI[item.kind] ?? '📦' },
            custom_id: `economy:buy:${item.itemId}`,
            disabled: item.stock !== null && item.stock <= 0,
          })),
        });
      }
      return rows;
    });
    const components: Record<string, unknown>[] = [];
    if (items.length <= 20 && buttonRows.length <= 5) {
      components.push(...buttonRows);
    } else {
      components.push({
        type: 1,
        components: [{
          type: 3,
          custom_id: 'economy:buy-select',
          placeholder: 'Choose an item to purchase',
          options: items.slice(0, 25).map((item) => ({
            label: item.name.slice(0, 100),
            value: item.itemId,
            description: `${formatCurrency(item.price, settings)} - ${item.description}`.slice(0, 100),
            emoji: { name: STORE_ITEM_EMOJI[item.kind] ?? '📦' },
          })),
        }],
      });
    }
    const fields: { name: string; value: string; inline: boolean }[] = STORE_CATEGORIES.map((category) => {
      const categoryItems = items.filter((item) => (category.kinds as readonly string[]).includes(item.kind));
      if (!categoryItems.length) return null;
      const value = categoryItems.map((item) => {
        const detail = item.description.length > 90 ? `${item.description.slice(0, 87)}...` : item.description;
        const stockText = item.stock === null ? '' : item.stock <= 0 ? ' · *Out of stock*' : ` · *${item.stock} left*`;
        return `${STORE_ITEM_EMOJI[item.kind] ?? '📦'} **${item.name.slice(0, 80)}** — \`${formatCurrency(item.price, settings)}\`${stockText}${detail ? `\n${detail}` : ''}`;
      }).join('\n\n');
      return { name: category.name, value: value.slice(0, 1024), inline: false };
    }).filter((field) => field !== null);
    if (uncategorized.length) {
      fields.push({
        name: 'More items',
        value: uncategorized.map((item) =>
          `📦 **${item.name.slice(0, 80)}** — \`${formatCurrency(item.price, settings)}\`${item.description ? `\n${item.description.slice(0, 90)}` : ''}`,
        ).join('\n\n').slice(0, 1024),
        inline: false,
      });
    }
    const payload = {
      embeds: [{
        title: `${settings.economyName} | Store`,
        description: items.length
          ? 'Choose an item button below to purchase it. Items that need a target or other details will prompt you.'
          : 'No store items are available right now.',
        color: 0x5865f2,
        fields,
        footer: { text: `Prices are shown in ${settings.currencyName}. Robbingusertool is consumed only after a successful robbery.` },
      }],
      components,
    };
    if (row.storeMessageId) {
      const result = await this.editOrReplaceMessage(row.storeChannelId, row.storeMessageId, payload);
      if (result.messageId === row.storeMessageId) return;
      await this.database.db.update(economySettings).set({ storeMessageId: result.messageId })
        .where(eq(economySettings.guildId, guildId));
      if (result.supersededMessageId) {
        await this.deleteSupersededMessage(row.storeChannelId, result.supersededMessageId);
      }
      return;
    }
    const created = await this.discord.createChannelMessage(row.storeChannelId, payload);
    await this.database.db.update(economySettings).set({ storeMessageId: created.id })
      .where(eq(economySettings.guildId, guildId));
  }

  async refreshLeaderboard(guildId: string) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.leaderboardChannelId) return;
    const rows = await this.database.db.select({ userId: economyWallets.userId, balance: economyWallets.balance, totalEarned: economyWallets.totalEarned })
      .from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.leftServer, false)))
      .orderBy(desc(economyWallets.balance), desc(economyWallets.totalEarned), economyWallets.userId)
      .limit(10);
    const description = rows.length
      ? rows.map((row, index) => `${index + 1}. <@${row.userId}> — ${formatCurrency(row.balance, settings)}`).join('\n').slice(0, 4096)
      : 'No economy wallets yet.';
    const payload = { embeds: [{ title: `${settings.economyName}: Richest members`, description, color: 0x5865f2 }] };
    const cacheKey = `guild:${guildId}:economy-leaderboard-hash`;
    const hash = createHash('sha256').update(description).digest('hex');
    if (await this.redis.client.get(cacheKey) === hash) return;
    await this.redis.client.set(cacheKey, hash, 'EX', 3600);
    if (row.leaderboardMessageId) {
      try {
        await this.discord.editChannelMessage(row.leaderboardChannelId, row.leaderboardMessageId, payload);
        return;
      } catch (error) {
        if (error instanceof DiscordApiError && error.status !== 404) throw error;
      }
    }
    const created = await this.discord.createChannelMessage(row.leaderboardChannelId, payload);
    await this.database.db.update(economySettings).set({ leaderboardMessageId: created.id })
      .where(eq(economySettings.guildId, guildId));
  }

  async updateRobbingInfo(guildId: string) {
    const { row, settings } = await this.settings(guildId);
    if (!row?.announcementsChannelId) return;
    const content = `Rob any time with /robuser. A Robbingusertool from /shop costs 400 ${settings.currencyName}, allows one successful robbery of up to ${formatCurrency(200, settings)}, and is consumed only after a successful robbery.`;
    if (row.countdownMessageId) {
      try {
        await this.discord.editChannelMessage(row.announcementsChannelId, row.countdownMessageId, { content });
        return;
      } catch (error) {
        if (error instanceof DiscordApiError && error.status !== 404) throw error;
      }
    }
    const created = await this.discord.createChannelMessage(row.announcementsChannelId, { content });
    await this.discord.pinChannelMessage(row.announcementsChannelId, created.id);
    await this.database.db.update(economySettings).set({ countdownMessageId: created.id })
      .where(eq(economySettings.guildId, guildId));
  }

  async repairAll(guildId: string) {
    let guildName = 'Server';
    try {
      guildName = (await this.discord.getGuildAsBot(guildId)).name;
    } catch {
      /* use a safe fallback name */
    }
    await Promise.all([
      this.updateRules(guildId, guildName),
      this.updateStore(guildId),
      this.refreshLeaderboard(guildId),
      this.updateRobbingInfo(guildId),
    ]);
  }
}
