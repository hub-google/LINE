
-- HR-ATT-04: 90-second dynamic QR workplace proof with hashed nonces and per-employee identity.
CREATE TABLE IF NOT EXISTS public.wm_branch_qr_settings(
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 allow_gps_replacement boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,branch_id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.wm_branches(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.wm_qr_challenges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
 expires_at timestamptz NOT NULL,
 issued_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES public.wm_branches(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS wm_qr_sessions_active ON public.wm_qr_challenges(tenant_id,expires_at);
CREATE TABLE IF NOT EXISTS public.wm_qr_uses(
 challenge_id uuid NOT NULL REFERENCES public.wm_qr_challenges(id),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id),
 member_id uuid NOT NULL,
 punch_id uuid NOT NULL REFERENCES public.wm_punches(id),
 kind text NOT NULL CHECK(kind IN('IN','OUT','BREAK_START','BREAK_END')),
 scanned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(challenge_id,member_id,kind),
 FOREIGN KEY(tenant_id,member_id) REFERENCES public.wm_members(tenant_id,id)
);
ALTER TABLE public.wm_branch_qr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wm_qr_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wm_qr_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_branch_qr_settings,public.wm_qr_challenges,public.wm_qr_uses FROM anon,authenticated;
GRANT SELECT ON public.wm_branch_qr_settings TO authenticated;
CREATE POLICY wm_qr_settings_read ON public.wm_branch_qr_settings FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IS NOT NULL);

CREATE OR REPLACE FUNCTION public.wm_save_qr_setting(p_tenant uuid,p_branch uuid,p_enabled boolean,p_gps_replace boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '只有企業負責人及人資可設定 QR 打卡權限' USING errcode='42501';END IF;
 IF p_enabled IS NULL OR p_gps_replace IS NULL OR
 NOT EXISTS(SELECT 1 FROM public.wm_branches WHERE tenant_id=p_tenant AND id=p_branch)
 THEN RAISE EXCEPTION 'QR 門市設定不正確';END IF;
 INSERT INTO public.wm_branch_qr_settings(tenant_id,branch_id,enabled,allow_gps_replacement)
 VALUES(p_tenant,p_branch,p_enabled,p_gps_replace)
 ON CONFLICT(tenant_id,branch_id) DO UPDATE
  SET enabled=excluded.enabled,allow_gps_replacement=excluded.allow_gps_replacement,
  updated_at=clock_timestamp();
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,details)
 VALUES(p_tenant,auth.uid(),'qr_branch_setting_saved','branch',
 jsonb_build_object('branch_id',p_branch,'enabled',p_enabled,
 'replaces_gps',p_gps_replace));
 RETURN jsonb_build_object('enabled',p_enabled);
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_issue_qr(p_tenant uuid,p_branch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_token text;v_exp timestamptz;v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT wm_private.can_manage(p_tenant) THEN
  RAISE EXCEPTION '沒有門市 QR 產生權限' USING errcode='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_branch_qr_settings
  WHERE tenant_id=p_tenant AND branch_id=p_branch AND enabled)
 THEN RAISE EXCEPTION '請先由負責人啟用此門市 QR 打卡';END IF;
 v_token:=encode(extensions.gen_random_bytes(24),'hex');
 v_exp:=clock_timestamp()+interval '90 seconds';
 INSERT INTO public.wm_qr_challenges(tenant_id,branch_id,token_hash,expires_at,issued_by)
 VALUES(p_tenant,p_branch,encode(extensions.digest(v_token,'sha256'),'hex'),v_exp,auth.uid())
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('challenge_id',v_id,'token',v_token,
  'expires_at',v_exp,'valid_seconds',90);
END $fn$;

CREATE OR REPLACE FUNCTION wm_private.validate_punch_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old public.wm_punches%rowtype;v_branch public.wm_branches%rowtype;
 v_distance double precision;v_qr_valid boolean:=false;v_qr_branch text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.member_id::text,811));
 select * into v_old from public.wm_punches
 where tenant_id=new.tenant_id and idempotency_key=new.idempotency_key limit 1;
 if found then
  if v_old.member_id<>new.member_id or v_old.kind<>new.kind then
   raise exception '相同打卡請求識別不可更換員工或打卡類型';
  end if;
  return new;
 end if;
 select b.* into v_branch from public.wm_members m join public.wm_branches b
 on b.tenant_id=m.tenant_id and b.id=m.branch_id where m.id=new.member_id and m.tenant_id=new.tenant_id;
 if not found then raise exception '員工沒有有效的打卡據點';end if;
 if (new.latitude is null) <> (new.longitude is null) or
    (new.latitude is not null and (new.latitude not between -90 and 90 or new.longitude not between -180 and 180))
 then raise exception '定位座標格式不正確';end if;
 if new.accuracy_m is not null and (new.accuracy_m<0 or new.accuracy_m>1000) then
  raise exception '定位精度不足，請改用補卡流程';end if;

 v_qr_branch:=current_setting('wm.qr_verified_branch',true);
 IF new.source='qr' AND v_qr_branch IS NOT NULL AND v_qr_branch<>'' THEN
  SELECT coalesce(s.allow_gps_replacement,false) INTO v_qr_valid
   FROM public.wm_branch_qr_settings s WHERE s.tenant_id=new.tenant_id
   AND s.branch_id=v_qr_branch::uuid AND s.enabled=true;
  v_qr_valid:=coalesce(v_qr_valid,false);
 END IF;
 if v_branch.gps_required AND NOT v_qr_valid then
  if new.latitude is null or new.longitude is null or v_branch.latitude is null or v_branch.longitude is null
   then raise exception '此店須允許定位後打卡；無法定位請提交補卡';end if;
  v_distance:=6371000*2*asin(sqrt(least(1,
   power(sin(radians(new.latitude-v_branch.latitude)/2),2)+
   cos(radians(v_branch.latitude))*cos(radians(new.latitude))*
   power(sin(radians(new.longitude-v_branch.longitude)/2),2))));
  if v_distance>v_branch.radius_m+least(coalesce(new.accuracy_m,0),100) then
   raise exception '不在可打卡區域內，請向主管申請補卡';end if;
 end if;
 if exists(select 1 from public.wm_punches p where p.tenant_id=new.tenant_id
    and p.member_id=new.member_id and p.kind=new.kind
    and p.punched_at>clock_timestamp()-interval '30 seconds')
 then raise exception '這個打卡動作剛剛已完成，請勿重複點擊';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.wm_clock_qr(p_token text,p_kind text,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
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
   AND expires_at>clock_timestamp();
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
END $fn$;
REVOKE ALL ON FUNCTION public.wm_save_qr_setting(uuid,uuid,boolean,boolean),
 public.wm_issue_qr(uuid,uuid),public.wm_clock_qr(text,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_save_qr_setting(uuid,uuid,boolean,boolean),
 public.wm_issue_qr(uuid,uuid),public.wm_clock_qr(text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
