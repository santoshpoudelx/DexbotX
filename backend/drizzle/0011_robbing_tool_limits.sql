UPDATE shop_items
SET enabled = false
WHERE kind = 'rob_more'
  AND is_default = true
  AND enabled = true;

UPDATE economy_settings
SET config = jsonb_set(config, '{protectionThreshold}', to_jsonb(50), true),
    updated_at = NOW()
WHERE (config ->> 'protectionThreshold') ~ '^-?[0-9]+$'
  AND (config ->> 'protectionThreshold')::integer < 50;
