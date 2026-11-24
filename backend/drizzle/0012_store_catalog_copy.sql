UPDATE shop_items
SET description = CASE item_id
  WHEN 'rob_tool' THEN 'One successful robbery, capped at 200. Consumed only after success.'
  WHEN 'decoy' THEN 'Stops one robbery attempt without consuming the Robbingusertool.'
  WHEN 'shield' THEN 'Blocks two robbery attempts.'
  WHEN 'lockpick' THEN 'Bypass one Shield charge on a successful robbery, but not a Decoy.'
  WHEN 'bounty' THEN 'Set a reward paid to whoever successfully robs your target.'
  WHEN 'daily_boost' THEN '+25 on every daily reward for 7 days.'
END
WHERE is_default = true
  AND (
    (item_id = 'rob_tool' AND description = 'One tool for one successful robbery. Only consumed after a successful robbery.')
    OR (item_id = 'decoy' AND description = 'The first thief targeting you wastes a steal.')
    OR (item_id = 'shield' AND description = 'Cannot be robbed during the next 2 windows.')
    OR (item_id = 'lockpick' AND description = 'Steal through a Shield, but not a Decoy.')
    OR (item_id = 'bounty' AND description = 'Set a reward on a target before the next window.')
    OR (item_id = 'daily_boost' AND description = '+25 coins on every daily reward for 7 days.')
  );
