-- Track LINE follow/unfollow transitions safely when webhook redelivery is enabled.
ALTER TABLE public.so_line_links
  ADD COLUMN IF NOT EXISTS is_following boolean,
  ADD COLUMN IF NOT EXISTS friendship_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS so_line_links_line_sub_idx ON public.so_line_links(line_sub);

CREATE TABLE IF NOT EXISTS public.so_line_webhook_events (
  event_id text PRIMARY KEY CHECK (char_length(event_id) BETWEEN 10 AND 100),
  event_type text NOT NULL CHECK (event_type IN ('follow', 'unfollow')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.so_line_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.so_line_webhook_events FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.so_line_webhook_events IS 'Server-only LINE webhook event IDs for redelivery deduplication; no message contents or LINE user IDs stored.';