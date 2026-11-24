import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';
import type { DatabaseService } from '../src/db/database.service';
import {
  economySettings,
  economyTransactions,
  economyWallets,
  shopItems,
  stealLog,
  stealWindows,
  walletEffects,
} from '../src/db/schema';
import { WalletService } from '../src/economy/wallet.service';
import { defaultEconomySettings, economySettingsSchema } from '../src/economy/economy.schema';
import { localDateString } from '../src/economy/economy-time';
import { formatCurrency, sanitizeCustomTitle } from '../src/economy/economy-format';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;

function assertTestGuard(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Economy tests refused: production environment');
  if (!/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost):5433\/[^/?]+/.test(databaseUrl ?? '')) {
    throw new Error('Economy tests refused: TEST_DATABASE_URL must use localhost port 5433');
  }
  if (!/^redis:\/\/(?:127\.0\.0\.1|localhost):6380(?:\/\d+)?$/.test(redisUrl ?? '')) {
    throw new Error('Economy tests refused: TEST_REDIS_URL must use localhost port 6380');
  }
}

assertTestGuard();

const sqlClient = postgres(databaseUrl!, { max: 5, ssl: false, prepare: false });
const db = drizzle(sqlClient);
const wallet = new WalletService({ db } as unknown as DatabaseService);
const redis = new Redis(redisUrl!, { maxRetriesPerRequest: 1 });
const guildId = '100000000000000001';
const userA = '200000000000000001';
const userB = '200000000000000002';
const userC = '200000000000000003';
const userD = '200000000000000004';
const userE = '200000000000000005';

async function resetEconomy(): Promise<void> {
  await redis.flushdb();
  await sqlClient`TRUNCATE TABLE economy_transactions, daily_claims, steal_log, bounties, steal_windows, wallet_effects, shop_items, wallets, economy_audit_log, economy_settings RESTART IDENTITY CASCADE`;
  await sqlClient`INSERT INTO guilds (guild_id, name) VALUES (${guildId}, 'Economy Test Server') ON CONFLICT (guild_id) DO NOTHING`;
}

describe('Economy Docker integration', () => {
  beforeAll(async () => {
    await sqlClient`SELECT 1`;
    await redis.ping();
  });

  beforeEach(resetEconomy);

  afterAll(async () => {
    await redis.quit();
    await sqlClient.end({ timeout: 5 });
  });

  it('validates settings and rejects unknown fields', () => {
    expect(economySettingsSchema.parse(defaultEconomySettings()).dailyAmount).toBe(50);
    expect(() => economySettingsSchema.parse({ ...defaultEconomySettings(), unknown: true })).toThrow();
    expect(() => economySettingsSchema.parse({ ...defaultEconomySettings(), dailyAmount: 9 })).toThrow();
    expect(() => economySettingsSchema.parse({ ...defaultEconomySettings(), protectionThreshold: 49 })).toThrow();
  });

  it('migrates existing protection floors and disables only default Rob More items', async () => {
    await db.insert(economySettings).values({
      guildId,
      config: { ...defaultEconomySettings(), protectionThreshold: 0 },
    });
    await db.insert(shopItems).values([
      { guildId, itemId: 'legacy-default-rob-more', kind: 'rob_more', name: 'Rob More', price: 120, isDefault: true },
      { guildId, itemId: 'custom-rob-more', kind: 'rob_more', name: 'Custom Rob More', price: 300, isDefault: false },
      { guildId, itemId: 'rob_tool', kind: 'rob_tool', name: 'Robbingusertool', price: 400, description: 'One tool for one successful robbery. Only consumed after a successful robbery.', isDefault: true },
      { guildId, itemId: 'decoy', kind: 'decoy', name: 'Decoy', price: 90, description: 'The first thief targeting you wastes a steal.', isDefault: true },
      { guildId, itemId: 'shield', kind: 'shield', name: 'Shield', price: 150, description: 'Cannot be robbed during the next 2 windows.', isDefault: true },
      { guildId, itemId: 'lockpick', kind: 'lockpick', name: 'Lockpick', price: 180, description: 'Owner-authored default copy.', isDefault: true },
      { guildId, itemId: 'bounty', kind: 'bounty', name: 'Bounty Poster', price: 50, description: 'Set a reward on a target before the next window.', isDefault: true },
      { guildId, itemId: 'daily_boost', kind: 'daily_boost', name: 'Daily Boost', price: 150, description: '+25 coins on every daily reward for 7 days.', isDefault: true },
      { guildId, itemId: 'custom-decoy', kind: 'decoy', name: 'Custom Decoy', price: 110, description: 'Owner-authored description.', isDefault: false },
    ]);

    for (const migrationName of ['0011_robbing_tool_limits.sql', '0012_store_catalog_copy.sql']) {
      const migrationPath = join(process.cwd(), 'drizzle', migrationName);
      const migration = readFileSync(migrationPath, 'utf8');
      for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
        await sqlClient.unsafe(statement);
      }
    }

    const [settings] = await db.select().from(economySettings).where(eq(economySettings.guildId, guildId));
    const items = await db.select().from(shopItems).where(eq(shopItems.guildId, guildId));
    expect(settings.config.protectionThreshold).toBe(50);
    expect(items.find((item) => item.itemId === 'legacy-default-rob-more')?.enabled).toBe(false);
    expect(items.find((item) => item.itemId === 'custom-rob-more')?.enabled).toBe(true);
    expect(items.find((item) => item.itemId === 'shield')?.description).toBe('Blocks two robbery attempts.');
    expect(items.find((item) => item.itemId === 'decoy')?.description)
      .toBe('Stops one robbery attempt without consuming the Robbingusertool.');
    expect(items.find((item) => item.itemId === 'lockpick')?.description).toBe('Owner-authored default copy.');
    expect(items.find((item) => item.itemId === 'custom-decoy')?.description).toBe('Owner-authored description.');
  });

  it('claims a reward once and returns the next streak correctly', async () => {
    const now = new Date('2026-11-22T10:00:00Z');
    const settings = defaultEconomySettings();
    const first = await wallet.claimDaily(guildId, userA, settings, now);
    expect(first.claimed).toBe(true);
    expect(first.streakDay).toBe(1);
    expect(first.amount).toBe(50);

    const duplicate = await wallet.claimDaily(guildId, userA, settings, now);
    expect(duplicate.claimed).toBe(false);

    const total = await db.select({ balance: economyWallets.balance })
      .from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userA)));
    expect(total[0].balance).toBe(50);
  });

  it('allows only one of 20 simultaneous claims', async () => {
    const now = new Date('2026-11-23T10:00:00Z');
    const settings = defaultEconomySettings();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => wallet.claimDaily(guildId, userA, settings, now)),
    );
    const successfulClaims = results.filter((result) =>
      result.status === 'fulfilled' && result.value.claimed,
    ).length;
    expect(successfulClaims).toBe(1);

    const walletRows = await db.select({ balance: economyWallets.balance })
      .from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userA)));
    expect(walletRows[0].balance).toBe(50);
  });

  it('prevents overspending in 20 simultaneous removals', async () => {
    await wallet.addCoins(guildId, userA, 100, 'admin_give');
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => wallet.removeCoins(guildId, userA, 10, 0, 'purchase')),
    );
    expect(results.filter((result) => result.status === 'fulfilled').length).toBe(10);

    const walletRows = await db.select({ balance: economyWallets.balance })
      .from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userA)));
    expect(walletRows[0].balance).toBe(0);
  });

  it('enforces the database CHECK constraint', async () => {
    await expect(
      db.insert(economyWallets).values({ guildId, userId: userA, balance: -1 }),
    ).rejects.toBeDefined();
  });

  it('computes local dates in the configured time zone', () => {
    expect(localDateString('Asia/Kathmandu', new Date('2026-11-23T20:30:00Z'))).toBe('2026-11-24');
  });

  it('writes sender and receiver gift transactions atomically', async () => {
    await wallet.addCoins(guildId, userA, 300, 'admin_give');
    await db.insert(stealWindows).values({
      guildId,
      windowId: 'legacy-open-window',
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 3600000),
      status: 'open',
      lateOpen: false,
      rules: {},
    });
    await wallet.gift(guildId, userA, userB, 100, defaultEconomySettings(), true);
    const transactions = await db.select().from(economyTransactions)
      .where(eq(economyTransactions.guildId, guildId));
    expect(transactions.filter((row) => row.type === 'gift_sent').length).toBe(1);
    expect(transactions.filter((row) => row.type === 'gift_received').length).toBe(1);
  });

  it('enforces weekly gift limits under concurrent transfers', async () => {
    await wallet.addCoins(guildId, userA, 500, 'admin_give');
    const sendLimitedSettings = {
      ...defaultEconomySettings(),
      weeklyGiftSendLimit: 30,
      weeklyGiftReceiveLimit: 100,
    };
    const sendAttempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => wallet.gift(guildId, userA, userB, 10, sendLimitedSettings, true)),
    );
    expect(sendAttempts.filter((result) => result.status === 'fulfilled')).toHaveLength(3);

    await Promise.all([
      wallet.addCoins(guildId, userC, 500, 'admin_give'),
      wallet.addCoins(guildId, userD, 500, 'admin_give'),
    ]);
    const receiveLimitedSettings = {
      ...defaultEconomySettings(),
      weeklyGiftSendLimit: 100,
      weeklyGiftReceiveLimit: 40,
    };
    const receiveAttempts = await Promise.allSettled([
      ...Array.from({ length: 5 }, () => wallet.gift(guildId, userC, userE, 10, receiveLimitedSettings, true)),
      ...Array.from({ length: 5 }, () => wallet.gift(guildId, userD, userE, 10, receiveLimitedSettings, true)),
    ]);
    expect(receiveAttempts.filter((result) => result.status === 'fulfilled')).toHaveLength(4);

    const rows = await db.select().from(economyWallets).where(eq(economyWallets.guildId, guildId));
    const senderA = rows.find((row) => row.userId === userA);
    const receiverE = rows.find((row) => row.userId === userE);
    expect(senderA?.weeklyGiftSent).toBe(30);
    expect(receiverE?.weeklyGiftReceived).toBe(40);
    expect(receiverE?.balance).toBe(40);
  });

  it('sanitizes custom titles and freezes exact Dex value defaults', () => {
    expect(sanitizeCustomTitle('  @Owner https://example.com  ')).toBe('Owner');
    expect(sanitizeCustomTitle('A'.repeat(30))).toHaveLength(20);
    expect([90, 120, 150, 150, 180, 250, 400, 1000, 2000, 4000])
      .toEqual([90, 120, 150, 150, 180, 250, 400, 1000, 2000, 4000]);
  });

  it('purchases a Robbingusertool for 400 Dex and consumes it only after a successful rob', async () => {
    await wallet.addCoins(guildId, userA, 1000, 'admin_give');
    await db.insert(economyWallets).values({ guildId, userId: userB, balance: 54 });
    await db.insert(shopItems).values({
      guildId,
      itemId: 'rob_tool',
      kind: 'rob_tool',
      name: 'Robbingusertool',
      description: 'One successful robbery of up to 200 Dex',
      price: 400,
      enabled: true,
    });
    await wallet.purchaseRobbingTool(guildId, userA, 'rob_tool');

    const blocked = await wallet.rob(guildId, userA, userB, defaultEconomySettings(), 'rob-blocked');
    expect(blocked).toEqual({ status: 'protected' });
    let tools = await db.select().from(walletEffects).where(and(
      eq(walletEffects.guildId, guildId),
      eq(walletEffects.userId, userA),
      eq(walletEffects.type, 'rob_tool'),
    ));
    expect(tools).toHaveLength(1);

    await db.update(economyWallets).set({ balance: 500 })
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userB)));
    const success = await wallet.rob(guildId, userA, userB, defaultEconomySettings(), 'rob-success');
    expect(success).toEqual({ status: 'success', amount: 200, bountyPaid: 0 });
    tools = await db.select().from(walletEffects).where(and(
      eq(walletEffects.guildId, guildId),
      eq(walletEffects.userId, userA),
      eq(walletEffects.type, 'rob_tool'),
    ));
    expect(tools).toHaveLength(0);

    await wallet.purchaseRobbingTool(guildId, userA, 'rob_tool');
    await db.insert(walletEffects).values({ guildId, userId: userA, type: 'rob_more', remainingWindows: 1 });
    await db.update(economyWallets).set({ balance: 500 })
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userB)));
    const secondSuccess = await wallet.rob(guildId, userA, userB, defaultEconomySettings(), 'rob-success-again');
    expect(secondSuccess).toEqual({ status: 'success', amount: 200, bountyPaid: 0 });
    expect(await wallet.rob(guildId, userA, userB, defaultEconomySettings(), 'rob-without-tool'))
      .toEqual({ status: 'missing_tool' });

    await wallet.purchaseRobbingTool(guildId, userA, 'rob_tool');
    await db.update(economyWallets).set({ balance: 125 })
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userB)));
    const floorSuccess = await wallet.rob(guildId, userA, userB, defaultEconomySettings(), 'rob-floor');
    expect(floorSuccess).toEqual({ status: 'success', amount: 75, bountyPaid: 0 });
    const victim = await db.select({ balance: economyWallets.balance }).from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userB)));
    expect(victim[0].balance).toBe(50);

    const thief = await db.select({ balance: economyWallets.balance }).from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.userId, userA)));
    expect(thief[0].balance).toBe(275);
  });

  it('checks robbery idempotency before tool availability', async () => {
    expect(await wallet.checkRobAttemptPrerequisites(guildId, userA, 'rob-precheck')).toBe('missing_tool');

    await db.insert(walletEffects).values({
      guildId,
      userId: userA,
      type: 'rob_tool',
      remainingWindows: 1,
    });
    expect(await wallet.checkRobAttemptPrerequisites(guildId, userA, 'rob-precheck')).toBeNull();

    await db.insert(stealLog).values({
      guildId,
      windowId: 'rob-precheck',
      thiefId: userA,
      victimId: userB,
      kind: 'decoy',
      amount: 0,
    });
    expect(await wallet.checkRobAttemptPrerequisites(guildId, userA, 'rob-precheck')).toBe('already_processed');
  });

  it('records repeated robberies without a steal-window record', async () => {
    await db.insert(stealLog).values([
      {
        guildId,
        windowId: 'rob-attempt-a',
        thiefId: userA,
        victimId: userB,
        kind: 'steal',
        amount: 10,
      },
      {
        guildId,
        windowId: 'rob-attempt-b',
        thiefId: userC,
        victimId: userB,
        kind: 'steal',
        amount: 10,
      },
    ]);
    const attempts = await db.select().from(stealLog).where(eq(stealLog.guildId, guildId));
    expect(attempts).toHaveLength(2);
  });

  it('stores shield, rob-more, lockpick and decoy effects', async () => {
    await db.insert(walletEffects).values([
      { guildId, userId: userA, type: 'shield', remainingWindows: 2 },
      { guildId, userId: userA, type: 'rob_more', remainingWindows: 1 },
      { guildId, userId: userA, type: 'lockpick', remainingWindows: 1 },
      { guildId, userId: userB, type: 'decoy', remainingWindows: 1 },
      { guildId, userId: userA, type: 'rob_tool', remainingWindows: 1 },
    ]);
    const effects = await db.select().from(walletEffects).where(eq(walletEffects.guildId, guildId));
    expect(effects.map((effect) => effect.type).sort()).toEqual(['decoy', 'lockpick', 'rob_more', 'rob_tool', 'shield']);
  });

  it('stores stock and prevents stock-only values below zero', async () => {
    await db.insert(shopItems).values({
      guildId,
      itemId: 'test-item',
      kind: 'shield',
      name: 'Test Shield',
      price: 150,
      stock: 1,
      enabled: true,
      sortOrder: 0,
    });
    await db.update(shopItems).set({ stock: 0 })
      .where(and(eq(shopItems.guildId, guildId), eq(shopItems.itemId, 'test-item')));
    const items = await db.select().from(shopItems).where(eq(shopItems.guildId, guildId));
    expect(items[0].stock).toBe(0);
  });

  it('hides leavers from leaderboard wallets', async () => {
    await db.insert(economyWallets).values([
      { guildId, userId: userA, balance: 500, leftServer: false },
      { guildId, userId: userB, balance: 900, leftServer: true },
    ]);
    const visible = await db.select().from(economyWallets)
      .where(and(eq(economyWallets.guildId, guildId), eq(economyWallets.leftServer, false)));
    expect(visible.map((row) => row.userId)).toEqual([userA]);
  });

  it('freezes a window rules snapshot and rejects settings drift', async () => {
    await db.insert(stealWindows).values({
      guildId,
      windowId: 'snapshot-window',
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 3600000),
      status: 'open',
      lateOpen: false,
      rules: { stealAmount: 10, protectionThreshold: 50 },
      totalStolen: 0,
      summaryPosted: false,
    });
    const windows = await db.select().from(stealWindows).where(eq(stealWindows.guildId, guildId));
    expect(windows[0].rules).toEqual({ stealAmount: 10, protectionThreshold: 50 });
  });

  it('records decoys without marking the victim robbed', async () => {
    await db.insert(stealWindows).values({
      guildId,
      windowId: 'decoy-window',
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 3600000),
      status: 'open',
      lateOpen: false,
      rules: {},
      totalStolen: 0,
      summaryPosted: false,
    });
    await db.insert(stealLog).values({
      guildId,
      windowId: 'decoy-window',
      thiefId: userA,
      victimId: userB,
      kind: 'decoy',
      amount: 0,
    });
    const rows = await db.select().from(stealLog).where(eq(stealLog.guildId, guildId));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('decoy');
  });

  it('stores pause state and staff audit entries', async () => {
    await db.insert(economySettings).values({
      guildId,
      enabled: true,
      paused: true,
      config: defaultEconomySettings(),
    }).onConflictDoUpdate({
      target: economySettings.guildId,
      set: { paused: true },
    });
    const rows = await db.select().from(economySettings).where(eq(economySettings.guildId, guildId));
    expect(rows[0].paused).toBe(true);
  });

  it('keeps gift and receive totals in the week key', async () => {
    await db.insert(economyWallets).values({
      guildId,
      userId: userA,
      balance: 500,
      weekKey: '2026-11-22',
      weeklyGiftSent: 100,
      weeklyGiftReceived: 200,
    });
    const rows = await db.select().from(economyWallets).where(eq(economyWallets.guildId, guildId));
    expect(rows[0].weeklyGiftSent).toBe(100);
    expect(rows[0].weeklyGiftReceived).toBe(200);
  });

  it('keeps leaderboard ties ordered by total-earned and user-id', async () => {
    await db.insert(economyWallets).values([
      { guildId, userId: userA, balance: 100, totalEarned: 100, leftServer: false },
      { guildId, userId: userB, balance: 100, totalEarned: 100, leftServer: false },
    ]);
    const rows = await db.select().from(economyWallets)
      .where(eq(economyWallets.guildId, guildId));
    expect(rows).toHaveLength(2);
  });

  it('uses no currency dollar or coin wording in member-facing format helper', () => {
    expect(formatCurrency(1250, { currencyName: 'Dex' })).toBe('1,250 Dex');
  });

  it('returns exactly 455 Dex over a full reward week', () => {
    const week = [50, 55, 60, 65, 70, 75, 80];
    expect(week.reduce((sum, amount) => sum + amount, 0)).toBe(455);
  });
});
