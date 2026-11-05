CREATE OR REPLACE FUNCTION public.wm_clock_qr(p_token text, p_kind text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_challenge public.wm_qr_challenges%rowtype;v_member public.wm_members%rowtype;
 v_row public.wm_punches%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入企業身分' USING errcode='28000';END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' OR
  p_kind NOT IN('IN','OUT','BREAK_START','BREAK_END') OR
  length(coalesce(p_key,'')) NOT BETWEEN 8 AND 120
 THEN RAISE EXCEPTION 'QR 打卡資料格式錯誤';END IF;
 SELECT * INTO v_challenge FROM public.wm_qr_challenges
  WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
   AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '這個 QR 已失效，請向門市重新取得';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_branch_qr_settings
  WHERE tenant_id=v_challenge.tenant_id AND branch_id=v_challenge.branch_id AND enabled)
 THEN RAISE EXCEPTION '此門市尚未啟用 QR 打卡';END IF;
 SELECT * INTO v_member FROM public.wm_members
  WHERE tenant_id=v_challenge.tenant_id AND user_id=auth.uid() AND status='active'
  ORDER BY created_at LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION '不是本企業的在職員工';END IF;
 IF v_member.branch_id IS DISTINCT FROM v_challenge.branch_id AND NOT EXISTS(
  SELECT 1 FROM public.wm_member_branches s WHERE s.tenant_id=v_challenge.tenant_id
   AND s.member_id=v_member.id AND s.branch_id=v_challenge.branch_id
   AND s.active_from<=(now() AT TIME ZONE 'Asia/Taipei')::date
   AND (s.active_until IS NULL OR s.active_until>=(now() AT TIME ZONE 'Asia/Taipei')::date))
 THEN RAISE EXCEPTION '你未獲授權在這個門市打卡';END IF;

 SELECT p.* INTO v_row FROM public.wm_qr_uses u
 JOIN public.wm_punches p ON p.id=u.punch_id
 WHERE u.challenge_id=v_challenge.id AND u.member_id=v_member.id AND u.kind=p_kind;
 IF FOUND THEN
  IF v_row.idempotency_key<>p_key THEN
   RAISE EXCEPTION '同一個 QR 不能重複完成相同打卡動作，請取得新版 QR';END IF;
  RETURN jsonb_build_object('punch_id',v_row.id,'kind',v_row.kind,
   'server_at',v_row.punched_at,'branch_id',v_challenge.branch_id,
   'idempotent',true);
 END IF;
 PERFORM set_config('wm.qr_verified_branch',v_challenge.branch_id::text,true);
 INSERT INTO public.wm_punches(tenant_id,member_id,kind,source,actor_id,idempotency_key)
 VALUES(v_challenge.tenant_id,v_member.id,p_kind,'qr',auth.uid(),p_key)
 ON CONFLICT(tenant_id,actor_id,idempotency_key) DO NOTHING
 RETURNING * INTO v_row;
 IF v_row.id IS NULL THEN
  SELECT * INTO v_row FROM public.wm_punches
   WHERE tenant_id=v_challenge.tenant_id AND actor_id=auth.uid() AND idempotency_key=p_key;
 END IF;
 IF v_row.kind<>p_kind OR v_row.member_id<>v_member.id THEN
  RAISE EXCEPTION '重複打卡識別碼的員工或類型不一致';END IF;
 INSERT INTO public.wm_qr_uses(challenge_id,tenant_id,member_id,punch_id,kind)
 VALUES(v_challenge.id,v_challenge.tenant_id,v_member.id,v_row.id,p_kind)
 ON CONFLICT(challenge_id,member_id,kind) DO NOTHING;
 RETURN jsonb_build_object('punch_id',v_row.id,'kind',v_row.kind,
  'server_at',v_row.punched_at,'branch_id',v_challenge.branch_id);
END $function$;
NOTIFY pgrst,'reload schema';