-- Queue Monster: 0-50 session editor for weekdays and special-date overrides.
-- The database stores 1-50 windows for open days; "off"/CLOSED stores zero sessions.
-- Preserve currently deployed authorization, resource checks, audit and schedule guards.
DO $migration$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('private.so_schedule_windows_valid(jsonb)'::regprocedure) INTO v_def;
  IF position('jsonb_array_length(p_windows)>20' IN v_def) > 0 THEN
    EXECUTE replace(v_def,'jsonb_array_length(p_windows)>20','jsonb_array_length(p_windows)>50');
  ELSIF position('jsonb_array_length(p_windows)>50' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected schedule windows validator; manual review required';
  END IF;

  SELECT pg_get_functiondef('public.so_schedule_manage(text,text,jsonb)'::regprocedure) INTO v_def;
  IF position('not between 1 and 15' IN v_def) > 0 THEN
    EXECUTE replace(v_def,'not between 1 and 15','not between 1 and 100');
  ELSIF position('not between 1 and 100' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected weekly template limit; manual review required';
  END IF;
END
$migration$;

-- Verified against the live DB: 20 and 50 windows valid, 0 and 51 invalid.
-- Zero-session days are represented by the existing 'off' weekday key or CLOSED exception.
