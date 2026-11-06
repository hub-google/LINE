-- Exactly-once claim for LINE notification attempts; server-side only.
CREATE TABLE IF NOT EXISTS public.so_line_push_log (
  tenant_id uuid NOT NULL REFERENCES public.so_tenants(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN ('CALLED','RESERVED','TICKET_CREATED')),
  reference_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_kind, reference_id)
);
ALTER TABLE public.so_line_push_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.so_line_push_log FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.so_line_push_log IS 'Server-only LINE Messaging API notification idempotency claims; no access tokens or customer messages stored.';