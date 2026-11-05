
-- Internal service-only claiming and delivery confirmation for Workforce LINE.
-- This function is not callable by anonymous or authenticated end users.
CREATE OR REPLACE FUNCTION public.wm_line_claim(p_tenant uuid,p_limit int DEFAULT 10)
RETURNS TABLE(id uuid,notification_id uuid,member_id uuid,line_sub text,login_channel_id text,
mode text,title text,body text,attempts int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION '僅可信後端可取出發送佇列' USING errcode='42501';
 END IF;
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
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_line_ack(p_id uuid,p_ok boolean,p_code text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_count int;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION '只有可信後端可回填發送結果' USING errcode='42501';END IF;
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
END $fn$;
REVOKE ALL ON FUNCTION public.wm_line_claim(uuid,int) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_line_ack(uuid,boolean,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_line_claim(uuid,int),public.wm_line_ack(uuid,boolean,text) TO service_role;
NOTIFY pgrst,'reload schema';
