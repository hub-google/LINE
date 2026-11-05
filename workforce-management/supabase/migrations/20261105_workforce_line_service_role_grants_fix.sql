-- PostgREST uses modern JWT claim maps; authorization is via exact PostgreSQL EXECUTE grants.
CREATE OR REPLACE FUNCTION public.wm_line_claim(p_tenant uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, notification_id uuid, member_id uuid, line_sub text, login_channel_id text, mode text, title text, body text, attempts integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- EXECUTE is granted exclusively to service_role; privileged callers cannot be anonymous.
 IF p_limit NOT BETWEEN 1 AND 20 OR p_tenant IS NULL THEN
  RAISE EXCEPTION '參數不正確';END IF;
 RETURN QUERY
 WITH picked AS(
  SELECT d.id AS delivery_id,l.line_sub,l.login_channel_id,n.title,n.body
  FROM public.wm_line_deliveries d
  JOIN public.wm_notifications n ON n.id=d.notification_id AND n.tenant_id=d.tenant_id
  JOIN public.wm_line_links l ON l.tenant_id=d.tenant_id AND l.member_id=d.member_id
   AND l.revoked_at IS NULL AND l.mode=d.mode
  WHERE d.tenant_id=p_tenant AND d.status IN ('pending','failed')
   AND d.attempts<3 AND d.next_attempt_at<=clock_timestamp()
   AND n.created_at>clock_timestamp()-interval '14 days'
  ORDER BY d.next_attempt_at,d.created_at
  LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
 )
 UPDATE public.wm_line_deliveries d SET status='sending',attempts=d.attempts+1,last_attempt_at=clock_timestamp()
 FROM picked p WHERE d.id=p.delivery_id
 RETURNING d.id,d.notification_id,d.member_id,p.line_sub,p.login_channel_id,d.mode,p.title,p.body,d.attempts;
END $function$;

CREATE OR REPLACE FUNCTION public.wm_line_ack(p_id uuid, p_ok boolean, p_code text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count int;
BEGIN
 -- EXECUTE is granted exclusively to service_role; privileged callers cannot be anonymous.
 IF p_id IS NULL OR p_ok IS NULL THEN RAISE EXCEPTION '缺少發送結果';END IF;
 UPDATE public.wm_line_deliveries SET
  status=CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
  next_attempt_at=CASE WHEN p_ok THEN clock_timestamp()+interval '100 years'
   ELSE clock_timestamp()+make_interval(mins:=CASE WHEN attempts<=1 THEN 1 WHEN attempts=2 THEN 5 ELSE 20 END) END,
  sent_at=CASE WHEN p_ok THEN clock_timestamp() ELSE NULL END,
  last_error_code=left(coalesce(p_code,''),80)
 WHERE id=p_id AND status='sending';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('updated',v_count,'sent',p_ok);
END $function$;

CREATE OR REPLACE FUNCTION public.wm_line_cron_valid(p_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- EXECUTE is granted exclusively to service_role; privileged callers cannot be anonymous.
 IF p_secret IS NULL OR length(p_secret)<>64 THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM wm_private.wm_line_cron_auth WHERE id=1
  AND secret=p_secret);
END $function$;

CREATE OR REPLACE FUNCTION public.wm_line_pending_tenants(p_limit integer DEFAULT 5)
 RETURNS TABLE(tenant_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- EXECUTE is granted exclusively to service_role; privileged callers cannot be anonymous.
 IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION '查詢上限 1～20';END IF;
 RETURN QUERY
 SELECT d.tenant_id FROM public.wm_line_deliveries d
 JOIN public.wm_line_links l ON l.tenant_id=d.tenant_id AND l.member_id=d.member_id
  AND l.revoked_at IS NULL
 WHERE d.status IN('pending','failed') AND d.attempts<3
  AND d.next_attempt_at<=clock_timestamp()
 GROUP BY d.tenant_id ORDER BY min(d.created_at)
 LIMIT p_limit;
END $function$;
REVOKE ALL ON FUNCTION public.wm_line_claim(uuid,int),public.wm_line_ack(uuid,boolean,text),public.wm_line_cron_valid(text),public.wm_line_pending_tenants(int) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_line_claim(uuid,int),public.wm_line_ack(uuid,boolean,text),public.wm_line_cron_valid(text),public.wm_line_pending_tenants(int) TO service_role;
NOTIFY pgrst,'reload schema';