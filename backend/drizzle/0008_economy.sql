CREATE TABLE IF NOT EXISTS "economy_settings" (
  "guild_id" text PRIMARY KEY REFERENCES "guilds"("guild_id"),
  "enabled" boolean NOT NULL DEFAULT false,
  "paused" boolean NOT NULL DEFAULT false,
  "category_id" text,
  "rules_channel_id" text,
  "commands_channel_id" text,
  "leaderboard_channel_id" text,
  "store_channel_id" text,
  "heist_log_channel_id" text,
  "announcements_channel_id" text,
  "panel_message_id" text,
  "store_message_id" text,
  "leaderboard_message_id" text,
  "countdown_message_id" text,
  "rules_message_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rules_hash" text,
  "defaults_seeded" boolean NOT NULL DEFAULT false,
  "config" jsonb NOT NULL,
  "heist_announce_channel_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "wallets" (
  "guild_id" text NOT NULL REFERENCES "guilds"("guild_id"),
  "user_id" text NOT NULL,
  "balance" integer NOT NULL DEFAULT 0,
  "last_daily_date" text,
  "streak_day" integer NOT NULL DEFAULT 0,
  "week_key" text,
  "weekly_gift_sent" integer NOT NULL DEFAULT 0,
  "weekly_gift_received" integer NOT NULL DEFAULT 0,
  "custom_title" text,
  "total_earned" integer NOT NULL DEFAULT 0,
  "total_stolen" integer NOT NULL DEFAULT 0,
  "total_lost" integer NOT NULL DEFAULT 0,
  "left_server" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("guild_id", "user_id"),
  CONSTRAINT "wallets_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_guild_user_idx" ON "wallets" ("guild_id", "user_id");
CREATE INDEX IF NOT EXISTS "wallets_guild_balance_idx" ON "wallets" ("guild_id", "balance" DESC);

CREATE TABLE IF NOT EXISTS "wallet_effects" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "remaining_windows" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "wallet_effects_member_idx" ON "wallet_effects" ("guild_id", "user_id", "type");

CREATE TABLE IF NOT EXISTS "shop_items" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "item_id" text NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "price" integer NOT NULL,
  "role_id" text,
  "stock" integer,
  "enabled" boolean NOT NULL DEFAULT true,
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_items_guild_item_idx" ON "shop_items" ("guild_id", "item_id");
CREATE INDEX IF NOT EXISTS "shop_items_guild_sort_idx" ON "shop_items" ("guild_id", "sort_order");

CREATE TABLE IF NOT EXISTS "daily_claims" (
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "local_date" text NOT NULL,
  "amount" integer NOT NULL,
  "streak_day" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("guild_id", "user_id", "local_date")
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_claims_member_date_idx" ON "daily_claims" ("guild_id", "user_id", "local_date");

CREATE TABLE IF NOT EXISTS "steal_windows" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "window_id" text NOT NULL,
  "opens_at" timestamptz NOT NULL,
  "closes_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'scheduled',
  "late_open" boolean NOT NULL DEFAULT false,
  "rules" jsonb NOT NULL,
  "total_stolen" integer NOT NULL DEFAULT 0,
  "summary_posted" boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS "steal_windows_guild_window_idx" ON "steal_windows" ("guild_id", "window_id");
CREATE INDEX IF NOT EXISTS "steal_windows_guild_status_idx" ON "steal_windows" ("guild_id", "status");

CREATE TABLE IF NOT EXISTS "steal_log" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "window_id" text NOT NULL,
  "thief_id" text NOT NULL,
  "victim_id" text NOT NULL,
  "kind" text NOT NULL,
  "amount" integer NOT NULL DEFAULT 0,
  "bounty_paid" integer NOT NULL DEFAULT 0,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "steal_log_window_thief_idx" ON "steal_log" ("window_id", "thief_id");
CREATE UNIQUE INDEX IF NOT EXISTS "steal_log_window_victim_steal_idx" ON "steal_log" ("window_id", "victim_id") WHERE "kind" = 'steal';

CREATE TABLE IF NOT EXISTS "bounties" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "window_id" text,
  "buyer_id" text NOT NULL,
  "target_id" text NOT NULL,
  "amount" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "claimed_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bounties_guild_target_idx" ON "bounties" ("guild_id", "target_id");

CREATE TABLE IF NOT EXISTS "economy_transactions" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "amount" integer NOT NULL,
  "other_user_id" text,
  "actor_id" text,
  "note" text,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "economy_transactions_member_idx" ON "economy_transactions" ("guild_id", "user_id", "timestamp");

CREATE TABLE IF NOT EXISTS "economy_audit_log" (
  "id" bigserial PRIMARY KEY,
  "guild_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "source" text NOT NULL,
  "action" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "economy_audit_guild_idx" ON "economy_audit_log" ("guild_id", "timestamp");

ALTER TABLE "economy_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_effects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shop_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "steal_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "steal_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bounties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "economy_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "economy_audit_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backend_access_policy" ON "economy_settings" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "wallets" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "wallet_effects" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "shop_items" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "daily_claims" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "steal_windows" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "steal_log" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "bounties" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "economy_transactions" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY "backend_access_policy" ON "economy_audit_log" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
