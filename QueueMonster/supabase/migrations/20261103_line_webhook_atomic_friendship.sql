-- Apply signed LINE friendship webhook exactly once in ONE PostgreSQL transaction.
-- Only the Edge Function's service_role may call this RPC.
CREATE OR REPLACE FUNCTION public.so_apply_line_webhook_friend_event(
  p_event_id text,
  p_event_type text,
  p_line_sub text,
  p_occurred_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_id IS NULL OR char_length(p_event_id) NOT BETWEEN 10 AND 100
     OR p_event_type NOT IN ('follow', 'unfollow')
     OR p_line_sub !~ '^U[0-9a-fA-F]{32}$'
     OR p_occurred_at IS NULL
  THEN
    RAISE EXCEPTION 'INVALID_LINE_FRIEND_EVENT';
  END IF;
  INSERT INTO public.so_line_webhook_events (event_id, event_type, occurred_at)
  VALUES (p_event_id, p_event_type, p_occurred_at)
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'DUPLICATE';
  END IF;
  UPDATE public.so_line_links
     SET is_following = (p_event_type = 'follow'),
         friendship_updated_at = p_occurred_at
   WHERE line_sub = p_line_sub
     AND (friendship_updated_at IS NULL OR friendship_updated_at < p_occurred_at);
  RETURN 'PROCESSED';
END;
$function$;
REVOKE ALL ON FUNCTION public.so_apply_line_webhook_friend_event(text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.so_apply_line_webhook_friend_event(text,text,text,timestamptz) TO service_role;
COMMENT ON FUNCTION public.so_apply_line_webhook_friend_event(text,text,text,timestamptz) IS 'Atomic event ID dedupe and timestamp-ordered friendship update. Service-role only; no credentials or message payload persisted.';