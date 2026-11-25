import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { DatabaseService, type Db } from '../db/database.service';
import {
  dailyClaims,
  economyBounties,
  economyTransactions,
  economyWallets,
  shopItems,
  stealLog,
  walletEffects,
} from '../db/schema';
import { ECONOMY_DEFAULTS, ROBBING_TOOL_MAX_AMOUNT } from './economy.constants';
import type { EconomySettings } from './economy.schema';
import { currentWeekKey, localDateString } from './economy-time';
import { DateTime } from 'luxon';

export class InsufficientCoinsError extends BadRequestException {
  constructor(message = 'You do not have enough Dex.') {
    super(message);
  }
}

@Injectable()
export class WalletService {
  constructor(private readonly database: DatabaseService) {}

  async withTransaction<T>(callback: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    return this.database.db.transaction(callback);
  }

  async getOrCreateWallet(guildId: string, userId: string) {
    const existing = await this.database.db.select().from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId))).limit(1);
    if (existing[0]) return existing[0];
    await this.database.db.insert(economyWallets).values({ guildId, userId, balance: 0 }).onConflictDoNothing();
    const created = await this.database.db.select().from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId))).limit(1);
    return created[0];
  }

  async addCoins(guildId: string, userId: string, amount: number, type = 'refund', note?: string, actorId?: string) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('Coin amount must be a positive integer.');
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, userId);
      await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        updatedAt: new Date(),
      }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId)));
      await tx.insert(economyTransactions).values({ guildId, userId, type, amount, note, actorId });
      return this.getWallet(tx, guildId, userId);
    });
  }

  async removeCoins(guildId: string, userId: string, amount: number, floor = 0, type = 'purchase', note?: string, actorId?: string) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('Coin amount must be a positive integer.');
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, userId);
      const updated = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, userId),
        sql`${economyWallets.balance} >= ${amount + floor}`,
      )).returning();
      if (!updated[0]) throw new InsufficientCoinsError();
      await tx.insert(economyTransactions).values({ guildId, userId, type, amount, note, actorId });
      return updated[0];
    });
  }

  async purchaseRobbingTool(guildId: string, userId: string, itemId: string) {
    return this.database.db.transaction(async (tx) => {
      const items = await tx.select().from(shopItems)
        .where(and(
          eq(shopItems.guildId, guildId),
          eq(shopItems.itemId, itemId),
          eq(shopItems.kind, 'rob_tool'),
          eq(shopItems.enabled, true),
        )).for('update').limit(1);
      const item = items[0];
      if (!item) throw new BadRequestException('That item is not available.');
      if (item.stock !== null && item.stock <= 0) throw new BadRequestException('That item is out of stock.');

      await this.ensureWallet(tx, guildId, userId);
      const charged = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${item.price}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, userId),
        sql`${economyWallets.balance} >= ${item.price}`,
      )).returning();
      if (!charged[0]) throw new InsufficientCoinsError();

      if (item.stock !== null) {
        const stocked = await tx.update(shopItems).set({
          stock: sql`${shopItems.stock} - 1`,
        }).where(and(
          eq(shopItems.guildId, guildId),
          eq(shopItems.itemId, itemId),
          gt(shopItems.stock, 0),
        )).returning({ id: shopItems.id });
        if (!stocked[0]) throw new BadRequestException('That item is out of stock.');
      }

      await tx.insert(economyTransactions).values({
        guildId,
        userId,
        type: 'purchase',
        amount: item.price,
        note: item.name,
      });
      await tx.insert(walletEffects).values({
        guildId,
        userId,
        type: 'rob_tool',
        remainingWindows: 1,
      });
      return { name: item.name, price: item.price };
    });
  }

  async purchaseRandomDex(guildId: string, userId: string, itemId: string) {
    return this.database.db.transaction(async (tx) => {
      const items = await tx.select().from(shopItems)
        .where(and(
          eq(shopItems.guildId, guildId),
          eq(shopItems.itemId, itemId),
          eq(shopItems.kind, 'randomdex'),
          eq(shopItems.enabled, true),
        )).for('update').limit(1);
      const item = items[0];
      if (!item) throw new BadRequestException('That item is not available.');
      if (item.stock !== null && item.stock <= 0) throw new BadRequestException('That item is out of stock.');

      await this.ensureWallet(tx, guildId, userId);
      const charged = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${item.price}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, userId),
        sql`${economyWallets.balance} >= ${item.price}`,
      )).returning();
      if (!charged[0]) {
        throw new InsufficientCoinsError(`You do not have enough Dex to purchase ${item.name}.`);
      }

      if (item.stock !== null) {
        const stocked = await tx.update(shopItems).set({
          stock: sql`${shopItems.stock} - 1`,
        }).where(and(
          eq(shopItems.guildId, guildId),
          eq(shopItems.itemId, itemId),
          gt(shopItems.stock, 0),
        )).returning({ id: shopItems.id });
        if (!stocked[0]) throw new BadRequestException('That item is out of stock.');
      }

      const reward = randomInt(1, 101);
      const credited = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${reward}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${reward}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, userId),
      )).returning();

      await tx.insert(economyTransactions).values([
        { guildId, userId, type: 'purchase', amount: item.price, note: item.name },
        { guildId, userId, type: 'randomdex_reward', amount: reward, note: `${item.name} payout` },
      ]);

      return {
        name: item.name,
        price: item.price,
        reward,
        net: reward - item.price,
        balance: credited[0]?.balance ?? (charged[0].balance + reward),
      };
    });
  }

  async sendDex(guildId: string, senderId: string, receiverId: string, amount: number, now = new Date()) {
    if (senderId === receiverId) throw new BadRequestException('You cannot send Dex to yourself.');
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive whole number.');
    }
    const orderedIds = [senderId, receiverId].sort();
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, senderId);
      await this.ensureWallet(tx, guildId, receiverId);
      await tx.select({ userId: economyWallets.userId }).from(economyWallets)
        .where(and(eq(economyWallets.guildId, guildId), inArray(economyWallets.userId, orderedIds)))
        .orderBy(economyWallets.userId)
        .for('update');

      const senderUpdate = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        updatedAt: now,
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, senderId),
        sql`${economyWallets.balance} >= ${amount}`,
      )).returning();
      if (!senderUpdate[0]) {
        const sender = await this.getWallet(tx, guildId, senderId);
        throw new InsufficientCoinsError(
          `You do not have enough Dex in your vault. Your current balance is ${sender?.balance ?? 0} Dex.`,
        );
      }

      const receiverUpdate = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        updatedAt: now,
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, receiverId),
      )).returning();

      await tx.insert(economyTransactions).values([
        { guildId, userId: senderId, type: 'transfer_sent', amount, otherUserId: receiverId },
        { guildId, userId: receiverId, type: 'transfer_received', amount, otherUserId: senderId },
      ]);

      return {
        senderBalance: senderUpdate[0].balance,
        receiverBalance: receiverUpdate[0]?.balance ?? amount,
      };
    });
  }

  async checkRobAttemptPrerequisites(
    guildId: string,
    thiefId: string,
    attemptId: string,
  ): Promise<'already_processed' | 'missing_tool' | null> {
    const priorAttempt = await this.database.db.select({ id: stealLog.id }).from(stealLog)
      .where(and(
        eq(stealLog.guildId, guildId),
        eq(stealLog.windowId, attemptId),
        eq(stealLog.thiefId, thiefId),
      )).limit(1);
    if (priorAttempt[0]) return 'already_processed';

    const robTool = await this.database.db.select({ id: walletEffects.id }).from(walletEffects)
      .where(and(
        eq(walletEffects.guildId, guildId),
        eq(walletEffects.userId, thiefId),
        eq(walletEffects.type, 'rob_tool'),
        gt(walletEffects.remainingWindows, 0),
      )).limit(1);
    return robTool[0] ? null : 'missing_tool';
  }

  async rob(
    guildId: string,
    thiefId: string,
    victimId: string,
    settings: EconomySettings,
    attemptId: string,
    now = new Date(),
  ): Promise<
    | { status: 'already_processed' | 'missing_tool' | 'protected' | 'blocked_by_shield' | 'decoy' }
    | { status: 'success'; amount: number; bountyPaid: number }
  > {
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, thiefId);
      await this.ensureWallet(tx, guildId, victimId);
      await tx.select({ userId: economyWallets.userId }).from(economyWallets)
        .where(and(
          eq(economyWallets.guildId, guildId),
          inArray(economyWallets.userId, [thiefId, victimId].sort()),
        ))
        .orderBy(economyWallets.userId)
        .for('update');

      const priorAttempt = await tx.select({ id: stealLog.id }).from(stealLog)
        .where(and(
          eq(stealLog.guildId, guildId),
          eq(stealLog.windowId, attemptId),
          eq(stealLog.thiefId, thiefId),
        )).limit(1);
      if (priorAttempt[0]) return { status: 'already_processed' };

      const thiefEffects = await tx.select().from(walletEffects)
        .where(and(
          eq(walletEffects.guildId, guildId),
          eq(walletEffects.userId, thiefId),
          gt(walletEffects.remainingWindows, 0),
        ))
        .orderBy(walletEffects.id)
        .for('update');
      const robTool = thiefEffects.find((effect) => effect.type === 'rob_tool');
      if (!robTool) return { status: 'missing_tool' };

      const victimRows = await tx.select().from(economyWallets)
        .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, victimId))).limit(1);
      const victim = victimRows[0];
      const protectionFloor = Math.max(50, settings.protectionThreshold);
      if (!victim || victim.leftServer || victim.balance < protectionFloor + settings.minSteal) {
        return { status: 'protected' };
      }

      const victimEffects = await tx.select().from(walletEffects)
        .where(and(
          eq(walletEffects.guildId, guildId),
          eq(walletEffects.userId, victimId),
          gt(walletEffects.remainingWindows, 0),
        ))
        .orderBy(walletEffects.id)
        .for('update');
      const shield = victimEffects.find((effect) => effect.type === 'shield');
      const lockpick = thiefEffects.find((effect) => effect.type === 'lockpick');
      if (shield && !lockpick) {
        if (shield.remainingWindows <= 1) {
          await tx.delete(walletEffects).where(eq(walletEffects.id, shield.id));
        } else {
          await tx.update(walletEffects)
            .set({ remainingWindows: sql`${walletEffects.remainingWindows} - 1` })
            .where(eq(walletEffects.id, shield.id));
        }
        return { status: 'blocked_by_shield' };
      }

      const decoy = victimEffects.find((effect) => effect.type === 'decoy');
      if (decoy) {
        await tx.delete(walletEffects).where(eq(walletEffects.id, decoy.id));
        await tx.insert(stealLog).values({
          guildId,
          windowId: attemptId,
          thiefId,
          victimId,
          kind: 'decoy',
          amount: 0,
        });
        return { status: 'decoy' };
      }

      const robMore = thiefEffects.find((effect) => effect.type === 'rob_more');
      const amount = Math.min(
        robMore ? settings.stealAmount * 2 : settings.stealAmount,
        ROBBING_TOOL_MAX_AMOUNT,
        victim.balance - protectionFloor,
      );
      if (amount < settings.minSteal) return { status: 'protected' };

      const taken = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        totalLost: sql`${economyWallets.totalLost} + ${amount}`,
        updatedAt: now,
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, victimId),
        sql`${economyWallets.balance} >= ${amount + protectionFloor}`,
      )).returning();
      if (!taken[0]) return { status: 'protected' };

      await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        totalStolen: sql`${economyWallets.totalStolen} + ${amount}`,
        updatedAt: now,
      }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, thiefId)));

      let bountyPaid = 0;
      const bountyRows = await tx.select().from(economyBounties)
        .where(and(
          eq(economyBounties.guildId, guildId),
          eq(economyBounties.targetId, victimId),
          eq(economyBounties.status, 'active'),
        )).limit(1).for('update');
      const bounty = bountyRows[0];
      if (bounty && bounty.buyerId !== thiefId) {
        bountyPaid = bounty.amount;
        await tx.update(economyBounties).set({ status: 'claimed', claimedBy: thiefId })
          .where(eq(economyBounties.id, bounty.id));
        await tx.update(economyWallets).set({
          balance: sql`${economyWallets.balance} + ${bountyPaid}`,
          updatedAt: now,
        }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, thiefId)));
      }

      await tx.delete(walletEffects).where(eq(walletEffects.id, robTool.id));
      if (robMore) await tx.delete(walletEffects).where(eq(walletEffects.id, robMore.id));
      if (shield) {
        if (shield.remainingWindows <= 1) {
          await tx.delete(walletEffects).where(eq(walletEffects.id, shield.id));
        } else {
          await tx.update(walletEffects)
            .set({ remainingWindows: sql`${walletEffects.remainingWindows} - 1` })
            .where(eq(walletEffects.id, shield.id));
        }
      }
      if (shield && lockpick) await tx.delete(walletEffects).where(eq(walletEffects.id, lockpick.id));

      await tx.insert(stealLog).values({
        guildId,
        windowId: attemptId,
        thiefId,
        victimId,
        kind: 'steal',
        amount,
        bountyPaid,
      });
      await tx.insert(economyTransactions).values([
        { guildId, userId: thiefId, type: 'steal', amount, otherUserId: victimId },
        { guildId, userId: victimId, type: 'lost', amount, otherUserId: thiefId },
      ]);
      if (bountyPaid) {
        await tx.insert(economyTransactions).values({
          guildId,
          userId: thiefId,
          type: 'bounty_paid',
          amount: bountyPaid,
          otherUserId: victimId,
        });
      }
      return { status: 'success', amount, bountyPaid };
    });
  }

  async transfer(guildId: string, fromUserId: string, toUserId: string, amount: number, floor = 0, type = 'gift') {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('Coin amount must be a positive integer.');
    const ids = [fromUserId, toUserId].sort();
    return this.database.db.transaction(async (tx) => {
      await tx.select().from(economyWallets).where(
        and(eq(economyWallets.guildId, guildId), sql`${economyWallets.userId} in (${ids[0]}, ${ids[1]})`),
      ).for('update');
      await this.ensureWallet(tx, guildId, fromUserId);
      await this.ensureWallet(tx, guildId, toUserId);
      const sender = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        updatedAt: new Date(),
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, fromUserId),
        sql`${economyWallets.balance} >= ${amount + floor}`,
      )).returning();
      if (!sender[0]) throw new InsufficientCoinsError('The sender must keep the protection floor.');
      await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        updatedAt: new Date(),
      }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, toUserId)));
      await tx.insert(economyTransactions).values([
        { guildId, userId: fromUserId, type: `${type}_sent`, amount, otherUserId: toUserId },
        { guildId, userId: toUserId, type: `${type}_received`, amount, otherUserId: fromUserId },
      ]);
      return sender[0];
    });
  }

  async claimDaily(guildId: string, userId: string, settings: EconomySettings, now = new Date()) {
    const timezone = settings.timezone || ECONOMY_DEFAULTS.timezone;
    const localDate = localDateString(timezone, now);
    const weekKey = currentWeekKey(timezone, now);
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, userId);
      await tx.select().from(economyWallets)
        .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId)))
        .for('update');
      const wallet = await this.getWallet(tx, guildId, userId);
      if (wallet.lastDailyDate === localDate) {
        return { claimed: false, streakDay: wallet.streakDay, amount: 0, nextClaim: localDate };
      }
      const yesterday = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone).minus({ days: 1 }).toISODate()!;
      const newWeek = wallet.weekKey !== weekKey;
      const nextStreak = newWeek ? 1 : wallet.lastDailyDate === yesterday ? Math.min(wallet.streakDay + 1, settings.streakCapDays) : 1;
      const base = settings.dailyAmount + (Math.min(nextStreak, settings.streakCapDays) - 1) * settings.streakStep;
      const boost = await tx.select({ remainingWindows: walletEffects.remainingWindows })
        .from(walletEffects).where(and(
          eq(walletEffects.guildId, guildId),
          eq(walletEffects.userId, userId),
          eq(walletEffects.type, 'daily_boost'),
          or(isNull(walletEffects.expiresAt), gt(walletEffects.expiresAt, now)),
        ));
      const amount = base + (boost.length ? settings.dailyBoostBonus : 0);
      await tx.insert(dailyClaims).values({
        guildId, userId, localDate, amount, streakDay: nextStreak,
      });
      await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        lastDailyDate: localDate,
        streakDay: nextStreak,
        weekKey,
        updatedAt: now,
      }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId)));
      await tx.insert(economyTransactions).values({ guildId, userId, type: 'daily', amount, note: `Streak day ${nextStreak}` });
      return { claimed: true, streakDay: nextStreak, amount, nextClaim: localDate };
    }).catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException('You already claimed today.');
      }
      throw error;
    });
  }

  async gift(guildId: string, senderId: string, receiverId: string, amount: number, settings: EconomySettings, eligible: boolean, now = new Date()) {
    if (senderId === receiverId) throw new BadRequestException('You cannot gift Dex to yourself.');
    if (!eligible) throw new BadRequestException('Both members must meet the economy eligibility rules.');
    const weekKey = currentWeekKey(settings.timezone, now);
    return this.database.db.transaction(async (tx) => {
      await this.ensureWallet(tx, guildId, senderId);
      await this.ensureWallet(tx, guildId, receiverId);
      await tx.select().from(economyWallets)
        .where(and(eq(economyWallets.guildId, guildId), inArray(economyWallets.userId, [senderId, receiverId].sort())))
        .orderBy(economyWallets.userId)
        .for('update');
      const sender = await this.getWallet(tx, guildId, senderId);
      const receiver = await this.getWallet(tx, guildId, receiverId);
      if (sender.weekKey !== weekKey) {
        await tx.update(economyWallets).set({ weekKey, weeklyGiftSent: 0, weeklyGiftReceived: 0 })
          .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, senderId)));
      }
      if (receiver.weekKey !== weekKey) {
        await tx.update(economyWallets).set({ weekKey, weeklyGiftSent: 0, weeklyGiftReceived: 0 })
          .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, receiverId)));
      }
      const senderSent = sender.weekKey === weekKey ? sender.weeklyGiftSent : 0;
      const receiverReceived = receiver.weekKey === weekKey ? receiver.weeklyGiftReceived : 0;
      if (senderSent + amount > settings.weeklyGiftSendLimit) throw new BadRequestException('You reached the weekly gift send limit.');
      if (receiverReceived + amount > settings.weeklyGiftReceiveLimit) throw new BadRequestException('This member reached the weekly gift receive limit.');
      const senderUpdate = await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} - ${amount}`,
        weeklyGiftSent: sql`${economyWallets.weeklyGiftSent} + ${amount}`,
        weekKey,
        updatedAt: now,
      }).where(and(
        eq(economyWallets.guildId, guildId),
        eq(economyWallets.userId, senderId),
        sql`${economyWallets.balance} >= ${amount + settings.protectionThreshold}`,
      )).returning();
      if (!senderUpdate[0]) throw new InsufficientCoinsError('The sender must keep the protection floor.');
      await tx.update(economyWallets).set({
        balance: sql`${economyWallets.balance} + ${amount}`,
        totalEarned: sql`${economyWallets.totalEarned} + ${amount}`,
        weeklyGiftReceived: sql`${economyWallets.weeklyGiftReceived} + ${amount}`,
        weekKey,
        updatedAt: now,
      }).where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, receiverId)));
      await tx.insert(economyTransactions).values([
        { guildId, userId: senderId, type: 'gift_sent', amount, otherUserId: receiverId },
        { guildId, userId: receiverId, type: 'gift_received', amount, otherUserId: senderId },
      ]);
      return senderUpdate[0];
    });
  }

  private async ensureWallet(tx: Parameters<Parameters<Db['transaction']>[0]>[0], guildId: string, userId: string) {
    await tx.insert(economyWallets).values({ guildId, userId, balance: 0 }).onConflictDoNothing();
  }

  private async getWallet(tx: Parameters<Parameters<Db['transaction']>[0]>[0], guildId: string, userId: string) {
    const rows = await tx.select().from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userId))).limit(1);
    return rows[0];
  }
}
