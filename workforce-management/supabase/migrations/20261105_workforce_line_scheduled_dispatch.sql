
-- HR-LINE-04: internal scheduled queue dispatch; no channel access tokens in SQL.
CREATE TABLE IF NOT EXISTS wm_private.wm_line_cron_auth (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 secret text NOT NULL DEFAULT encode(gen_random_bytes(32),'hex') CHECK(length(secret)=64)
);
INSERT INTO wm_private.wm_line_cron_auth(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
REVOKE ALL ON wm_private.wm_line_cron_auth FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wm_line_cron_valid(p_secret text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION '需要服務身分' USING errcode='42501';END IF;
 IF p_secret IS NULL OR length(p_secret)<>64 THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM wm_private.wm_line_cron_auth WHERE id=1
  AND secret=p_secret);
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_line_pending_tenants(p_limit int DEFAULT 5)
RETURNS TABLE(tenant_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION '需要服務身分' USING errcode='42501';END IF;
 IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '查詢上限 1～20';END IF;
 RETURN QUERY
 SELECT d.tenant_id FROM public.wm_line_deliveries d
 JOIN public.wm_line_links l ON l.tenant_id=d.tenant_id AND l.member_id=d.member_id
  AND l.revoked_at IS NULL
 WHERE d.status IN('pending','failed') AND d.attempts<3
  AND d.next_attempt_at<=clock_timestamp()
 GROUP BY d.tenant_id ORDER BY min(d.created_at)
 LIMIT p_limit;
END $fn$;
REVOKE ALL ON FUNCTION public.wm_line_cron_valid(text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_line_pending_tenants(int) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_line_cron_valid(text),
 public.wm_line_pending_tenants(int) TO service_role;

-- Supabase pg_net sends through network worker with timeout, not through SQL HTTP.
SELECT cron.schedule('wm-workforce-line-outbox','*/5 * * * *',
 $job$
 SELECT net.http_post(
   url:='https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/wm-line',
   body:='{"action":"cron"}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json',
    'x-wm-cron-secret',(SELECT secret FROM wm_private.wm_line_cron_auth WHERE id=1)),
   timeout_milliseconds:=8000
 );
 $job$);
NOTIFY pgrst,'reload schema';
