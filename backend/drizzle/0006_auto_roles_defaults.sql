ALTER TABLE "guild_settings"
ALTER COLUMN "auto_roles"
SET DEFAULT '{"enabled":false,"roleIds":[],"delayMode":"smart","minDelaySeconds":0,"fixedDelaySeconds":0,"skipBots":true,"waitForScreening":true,"announce":{"enabled":false,"channelId":null,"message":"Congratulations {user} You unlocked new {role} role.","embed":{"enabled":false,"title":"Role assigned {role}","description":"Enjoy your new permissions and privileges! ✨","color":"#7c6cff","footer":"Enjoy your new role! 💜"}}}'::jsonb;
