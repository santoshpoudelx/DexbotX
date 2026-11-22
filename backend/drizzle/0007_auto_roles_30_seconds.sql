ALTER TABLE "guild_settings"
ALTER COLUMN "auto_roles"
SET DEFAULT '{"enabled":false,"roleIds":[],"delaySeconds":3,"skipBots":true,"waitForScreening":true,"announce":{"enabled":false,"channelId":null,"message":"Congratulations {user} You unlocked new {role} role.","embed":{"enabled":false,"title":"Role assigned {role}","description":"Enjoy your new permissions and privileges! ✨","color":"#7c6cff","footer":"Enjoy your new role! 💜"}}}'::jsonb;

ALTER TABLE "auto_role_events" DROP CONSTRAINT IF EXISTS "auto_role_events_outcome_check";
ALTER TABLE "auto_role_events"
ADD CONSTRAINT "auto_role_events_outcome_check"
CHECK ("outcome" IN ('assigned', 'skipped_left', 'skipped_has_role', 'skipped_unsafe', 'failed', 'enqueue_failed', 'skipped_pending'));

ALTER TABLE "auto_role_events"
ADD COLUMN IF NOT EXISTS "delay_seconds" integer;
