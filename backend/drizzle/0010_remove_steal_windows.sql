UPDATE economy_settings
SET config = config - 'maxStealsPerWindow' - 'stealWindowMinutes' - 'stealDay' - 'stealStart',
    updated_at = NOW()
WHERE config ?| ARRAY['maxStealsPerWindow', 'stealWindowMinutes', 'stealDay', 'stealStart'];

UPDATE steal_windows
SET status = 'closed'
WHERE status IN ('scheduled', 'open');
