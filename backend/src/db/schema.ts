import { bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { MessageConfig } from '../shared/message-config';
import type { AutoRoleConfig } from '../shared/auto-roles';
import { defaultAutoRoleConfig } from '../shared/auto-roles';

/** Servers the bot is (or was) in. Written by the bot, read by the API. */
export const guilds = pgTable('guilds', {
  id: text('guild_id').primaryKey(),
  name: text('name').notNull(),
  iconHash: text('icon'),
  bannerHash: text('banner_hash'),
  ownerId: text('owner_id'),
  memberCount: integer('member_count').notNull().default(0),
  installed: boolean('bot_present').notNull().default(true),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp('left_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** One row per server. Welcome and goodbye configs are validated JSON documents. */
export const guildSettings = pgTable('guild_settings', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guilds.id),
  welcome: jsonb('welcome').$type<MessageConfig>().notNull(),
  goodbye: jsonb('goodbye').$type<MessageConfig>().notNull(),
  autoRoles: jsonb('auto_roles').$type<AutoRoleConfig>().notNull().default(defaultAutoRoleConfig()),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const guildChannels = pgTable(
  'guild_channels',
  {
    guildId: text('guild_id').notNull().references(() => guilds.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    type: integer('type').notNull(),
    parentId: text('parent_id'),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.id] }), index('guild_channels_guild_type_idx').on(t.guildId, t.type)],
).enableRLS();

export const guildRoles = pgTable(
  'guild_roles',
  {
    guildId: text('guild_id').notNull().references(() => guilds.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    color: integer('color').notNull().default(0),
    position: integer('position').notNull(),
    permissions: text('permissions').notNull().default('0'),
    managed: boolean('managed').notNull().default(false),
    tags: jsonb('tags').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.id] }), index('guild_roles_guild_position_idx').on(t.guildId, t.position)],
).enableRLS();

export const guildTemplates = pgTable(
  'guild_templates',
  {
    guildId: text('guild_id').notNull().references(() => guilds.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.id] }), index('guild_templates_guild_idx').on(t.guildId)],
).enableRLS();

/** Who changed what, for support and abuse investigation. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    action: text('action').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_guild_created_idx').on(t.guildId, t.createdAt),
    index('audit_logs_user_created_idx').on(t.userId, t.createdAt),
  ],
).enableRLS();

export const adminAudit = pgTable(
  'admin_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminId: text('admin_id').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_audit_created_idx').on(t.createdAt)],
).enableRLS();

export const modActions = pgTable(
  'mod_actions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    targetId: text('target_id').notNull(),
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mod_actions_guild_created_idx').on(t.guildId, t.createdAt),
    index('mod_actions_target_created_idx').on(t.targetId, t.createdAt),
  ],
).enableRLS();

export const autoRoleEvents = pgTable(
  'auto_role_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    outcome: text('outcome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auto_role_events_guild_created_idx').on(t.guildId, t.createdAt),
    check('auto_role_events_outcome_check', sql`${t.outcome} in ('assigned', 'skipped_left', 'skipped_has_role', 'skipped_unsafe', 'failed')`),
  ],
).enableRLS();

export type GuildRow = typeof guilds.$inferSelect;

export const economySettings = pgTable(
  'economy_settings',
  {
    guildId: text('guild_id').primaryKey().references(() => guilds.id),
    enabled: boolean('enabled').notNull().default(false),
    paused: boolean('paused').notNull().default(false),
    categoryId: text('category_id'),
    rulesChannelId: text('rules_channel_id'),
    commandsChannelId: text('commands_channel_id'),
    leaderboardChannelId: text('leaderboard_channel_id'),
    storeChannelId: text('store_channel_id'),
    heistLogChannelId: text('heist_log_channel_id'),
    announcementsChannelId: text('announcements_channel_id'),
    panelMessageId: text('panel_message_id'),
    storeMessageId: text('store_message_id'),
    leaderboardMessageId: text('leaderboard_message_id'),
    countdownMessageId: text('countdown_message_id'),
    rulesMessageIds: jsonb('rules_message_ids').$type<string[]>().notNull().default([]),
    rulesHash: text('rules_hash'),
    defaultsSeeded: boolean('defaults_seeded').notNull().default(false),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    heistAnnounceChannelId: text('heist_announce_channel_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('economy_settings_guild_idx').on(t.guildId)],
).enableRLS();

export const economyWallets = pgTable(
  'wallets',
  {
    guildId: text('guild_id').notNull().references(() => guilds.id),
    userId: text('user_id').notNull(),
    balance: integer('balance').notNull().default(0),
    lastDailyDate: text('last_daily_date'),
    streakDay: integer('streak_day').notNull().default(0),
    weekKey: text('week_key'),
    weeklyGiftSent: integer('weekly_gift_sent').notNull().default(0),
    weeklyGiftReceived: integer('weekly_gift_received').notNull().default(0),
    customTitle: text('custom_title'),
    totalEarned: integer('total_earned').notNull().default(0),
    totalStolen: integer('total_stolen').notNull().default(0),
    totalLost: integer('total_lost').notNull().default(0),
    leftServer: boolean('left_server').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    uniqueIndex('wallets_guild_user_idx').on(t.guildId, t.userId),
    index('wallets_guild_balance_idx').on(t.guildId, t.balance),
    check('wallets_balance_nonnegative', sql`${t.balance} >= 0`),
  ],
).enableRLS();

export const walletEffects = pgTable(
  'wallet_effects',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    remainingWindows: integer('remaining_windows').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('wallet_effects_member_idx').on(t.guildId, t.userId, t.type)],
).enableRLS();

export const shopItems = pgTable(
  'shop_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    itemId: text('item_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    price: integer('price').notNull(),
    roleId: text('role_id'),
    stock: integer('stock'),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('shop_items_guild_item_idx').on(t.guildId, t.itemId), index('shop_items_guild_sort_idx').on(t.guildId, t.sortOrder)],
).enableRLS();

export const dailyClaims = pgTable(
  'daily_claims',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    localDate: text('local_date').notNull(),
    amount: integer('amount').notNull(),
    streakDay: integer('streak_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId, t.localDate] }), uniqueIndex('daily_claims_member_date_idx').on(t.guildId, t.userId, t.localDate)],
).enableRLS();

export const stealWindows = pgTable(
  'steal_windows',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    windowId: text('window_id').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('scheduled'),
    lateOpen: boolean('late_open').notNull().default(false),
    rules: jsonb('rules').$type<Record<string, unknown>>().notNull(),
    totalStolen: integer('total_stolen').notNull().default(0),
    summaryPosted: boolean('summary_posted').notNull().default(false),
  },
  (t) => [uniqueIndex('steal_windows_guild_window_idx').on(t.guildId, t.windowId), index('steal_windows_guild_status_idx').on(t.guildId, t.status)],
).enableRLS();

export const stealLog = pgTable(
  'steal_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    windowId: text('window_id').notNull(),
    thiefId: text('thief_id').notNull(),
    victimId: text('victim_id').notNull(),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull().default(0),
    bountyPaid: integer('bounty_paid').notNull().default(0),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('steal_log_window_thief_idx').on(t.windowId, t.thiefId),
    uniqueIndex('steal_log_window_victim_steal_idx').on(t.windowId, t.victimId).where(sql`${t.kind} = 'steal'`),
  ],
).enableRLS();

export const economyBounties = pgTable(
  'bounties',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    windowId: text('window_id'),
    buyerId: text('buyer_id').notNull(),
    targetId: text('target_id').notNull(),
    amount: integer('amount').notNull(),
    status: text('status').notNull().default('active'),
    claimedBy: text('claimed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bounties_guild_target_idx').on(t.guildId, t.targetId)],
).enableRLS();

export const economyTransactions = pgTable(
  'economy_transactions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    otherUserId: text('other_user_id'),
    actorId: text('actor_id'),
    note: text('note'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('economy_transactions_member_idx').on(t.guildId, t.userId, t.timestamp)],
).enableRLS();

export const economyAuditLog = pgTable(
  'economy_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    guildId: text('guild_id').notNull(),
    actorId: text('actor_id').notNull(),
    source: text('source').notNull(),
    action: text('action').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('economy_audit_guild_idx').on(t.guildId, t.timestamp)],
).enableRLS();
