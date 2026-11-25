UPDATE "shop_items"
SET "price" = CASE "item_id"
  WHEN 'decoy' THEN 90
  WHEN 'rob_more' THEN 120
  WHEN 'shield' THEN 150
  WHEN 'daily_boost' THEN 150
  WHEN 'lockpick' THEN 180
  WHEN 'custom_title' THEN 250
  WHEN 'bronze' THEN 400
  WHEN 'silver' THEN 1000
  WHEN 'gold' THEN 2000
  WHEN 'diamond' THEN 4000
  ELSE "price"
END
WHERE "is_default" = true
  AND (
    ("item_id" = 'decoy' AND "price" = 90)
    OR ("item_id" = 'rob_more' AND "price" = 120)
    OR ("item_id" = 'shield' AND "price" = 150)
    OR ("item_id" = 'daily_boost' AND "price" = 150)
    OR ("item_id" = 'lockpick' AND "price" = 180)
    OR ("item_id" = 'custom_title' AND "price" = 250)
    OR ("item_id" = 'bronze' AND "price" = 500)
    OR ("item_id" = 'silver' AND "price" = 1200)
    OR ("item_id" = 'gold' AND "price" = 2500)
    OR ("item_id" = 'diamond' AND "price" = 5000)
  );

UPDATE "economy_settings"
SET "config" = COALESCE("config", '{}'::jsonb)
  || '{"currencyName":"Dex","economyName":"Dex Economy"}'::jsonb
WHERE NOT ("config" ? 'currencyName')
   OR NOT ("config" ? 'economyName');
