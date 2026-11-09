-- FoodRadar daily audit opt-in via the existing QueueMonster platform LINE OA.
-- Message handlers use the authenticated LINE webhook source, not user input.
CREATE TABLE IF NOT EXISTS public.foodradar_line_subscriptions (
  line_user_id text PRIMARY KEY CHECK (line_user_id ~ '^U[0-9a-fA-F]{32}$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.foodradar_line_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.foodradar_line_subscriptions FROM anon, authenticated;
COMMENT ON TABLE public.foodradar_line_subscriptions IS
  'Explicit LINE OA keyword opt-ins for FoodRadar daily public inventory audit reports. Never broadcast to all QueueMonster followers.';
