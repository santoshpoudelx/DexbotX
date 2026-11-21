ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "auto_roles" jsonb DEFAULT '{"enabled":false,"roleIds":[],"delayMode":"smart","minDelaySeconds":0,"fixedDelaySeconds":0,"skipBots":true,"waitForScreening":true,"announce":{"enabled":false,"channelId":null,"message":"Congratulations {user}, you got the {role} role."}}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "guild_roles" ADD COLUMN IF NOT EXISTS "permissions" text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "guild_roles" ADD COLUMN IF NOT EXISTS "managed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "guild_roles" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auto_role_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_role_events_outcome_check" CHECK ("outcome" IN ('assigned', 'skipped_left', 'skipped_has_role', 'skipped_unsafe', 'failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_role_events_guild_created_idx" ON "auto_role_events" USING btree ("guild_id","created_at");
--> statement-breakpoint
ALTER TABLE "auto_role_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'auto_role_events'
			AND policyname = 'backend_access_policy'
	) THEN
		CREATE POLICY "backend_access_policy" ON "auto_role_events"
			FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
	END IF;
END
$$;
