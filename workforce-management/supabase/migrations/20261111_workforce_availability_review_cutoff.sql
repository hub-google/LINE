-- HR-SCH-03 (2026-11-11): own availability -> supervisor review, with configurable
-- tenant submission cutoff. Pre-existing preferences remain approved.
ALTER TABLE public.wm_availability
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.wm_availability
 ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.wm_availability
 ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
 ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.wm_availability
 DROP CONSTRAINT IF EXISTS wm_availability_status_check;
ALTER TABLE public.wm_availability
 ADD CONSTRAINT wm_availability_status_check
 CHECK (status IN ('pending','approved','rejected','withdrawn'));

CREATE TABLE IF NOT EXISTS public.wm_availability_policies(
 tenant_id uuid PRIMARY KEY REFERENCES public.wm_tenants(id),
 cutoff_hours integer NOT NULL DEFAULT 0 CHECK (cutoff_hours BETWEEN 0 AND 336),
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.wm_availability_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_availability_policies FROM PUBLIC,anon,authenticated;
-- The existing wm_availability SELECT/INSERT policies still apply. All decisions
-- use scoped RPCs rather than allowing clients to update or delete history.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.wm_availability FROM authenticated;

CREATE OR REPLACE FUNCTION wm_private.guard_availability_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_demo boolean;v_cutoff integer;
BEGIN
 IF NEW.ends_at<=NEW.starts_at OR NEW.ends_at>NEW.starts_at+interval '31 days'
 THEN RAISE EXCEPTION '可排班時段必須有正確的開始與結束日期'; END IF;
 SELECT t.is_demo INTO v_demo FROM public.wm_tenants t WHERE t.id=NEW.tenant_id;
 IF NOT FOUND THEN RAISE EXCEPTION '企業不存在'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_members m
  WHERE m.id=NEW.member_id AND m.tenant_id=NEW.tenant_id AND m.status='active')
 THEN RAISE EXCEPTION '員工不在職或不屬於目前企業'; END IF;
 NEW.reviewed_at:=NULL;NEW.reviewed_by:=NULL;NEW.review_note:=NULL;
 IF v_demo THEN
   NEW.status:='approved';
 ELSE
   IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.wm_members m
      WHERE m.id=NEW.member_id AND m.tenant_id=NEW.tenant_id
       AND m.status='active' AND m.user_id=auth.uid())
   THEN RAISE EXCEPTION '只能提交自己的可排班時段' USING ERRCODE='42501'; END IF;
   SELECT coalesce(p.cutoff_hours,0) INTO v_cutoff
     FROM public.wm_availability_policies p WHERE p.tenant_id=NEW.tenant_id;
   IF NEW.starts_at<=clock_timestamp()+make_interval(hours:=coalesce(v_cutoff,0))
   THEN RAISE EXCEPTION '已超過公司設定的排班時段提交截止時間'; END IF;
   NEW.status:='pending';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wm_availability_submit_guard ON public.wm_availability;
CREATE TRIGGER wm_availability_submit_guard
 BEFORE INSERT ON public.wm_availability FOR EACH ROW
 EXECUTE FUNCTION wm_private.guard_availability_submission();

CREATE OR REPLACE FUNCTION public.wm_review_availability(
 p_availability uuid,p_approved boolean,p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v public.wm_availability%rowtype;v_status text;v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_approved IS NULL THEN RAISE EXCEPTION '請選擇核准或駁回'; END IF;
 SELECT * INTO v FROM public.wm_availability WHERE id=p_availability FOR UPDATE;
 IF NOT FOUND OR v.status<>'pending' THEN RAISE EXCEPTION '可排班時段不存在或已處理'; END IF;
 IF NOT wm_private.can_approve_member(v.tenant_id,v.member_id)
 THEN RAISE EXCEPTION '只能審核授權團隊成員，且不得自行核准' USING ERRCODE='42501'; END IF;
 v_status:=CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END;
 UPDATE public.wm_availability SET status=v_status,
  reviewed_at=clock_timestamp(),reviewed_by=v_actor,
  review_note=left(coalesce(p_note,''),500) WHERE id=v.id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(v.tenant_id,v_actor,'availability_reviewed','availability',v.id,
  jsonb_build_object('status',v_status,'note',left(coalesce(p_note,''),500)));
 INSERT INTO public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
 VALUES(v.tenant_id,v.member_id,'availability:'||v.id||':'||v_status,
  '排班時段審核結果',CASE WHEN p_approved THEN '你提交的可排班時段已核准。'
  ELSE '你提交的可排班時段已被駁回，請查看審核意見。' END)
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',v.id,'status',v_status);
END $$;

CREATE OR REPLACE FUNCTION public.wm_withdraw_availability(
 p_availability uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v public.wm_availability%rowtype;v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.wm_availability WHERE id=p_availability FOR UPDATE;
 IF NOT FOUND OR v.status<>'pending' THEN RAISE EXCEPTION '只能撤回待審的時段申請'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_members m
   WHERE m.id=v.member_id AND m.tenant_id=v.tenant_id AND m.user_id=v_actor AND m.status='active')
 THEN RAISE EXCEPTION '只能撤回自己的時段' USING ERRCODE='42501'; END IF;
 UPDATE public.wm_availability SET status='withdrawn',reviewed_at=clock_timestamp(),
  reviewed_by=v_actor,review_note='員工自行撤回' WHERE id=v.id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(v.tenant_id,v_actor,'availability_withdrawn','availability',v.id,'{}'::jsonb);
 RETURN jsonb_build_object('id',v.id,'status','withdrawn');
END $$;

CREATE OR REPLACE FUNCTION public.wm_get_availability_policy(
 p_tenant uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_cutoff integer;
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) IS NULL
 THEN RAISE EXCEPTION '沒有此企業存取權' USING ERRCODE='42501'; END IF;
 SELECT cutoff_hours INTO v_cutoff FROM public.wm_availability_policies WHERE tenant_id=p_tenant;
 RETURN jsonb_build_object('cutoff_hours',coalesce(v_cutoff,0));
END $$;

CREATE OR REPLACE FUNCTION public.wm_set_availability_policy(
 p_tenant uuid,p_cutoff_hours integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN ('owner','hr')
 THEN RAISE EXCEPTION '只有企業管理者可修改提交截止時間' USING ERRCODE='42501'; END IF;
 IF p_cutoff_hours IS NULL OR p_cutoff_hours NOT BETWEEN 0 AND 336
 THEN RAISE EXCEPTION '截止時間必須在 0 至 336 小時之間'; END IF;
 INSERT INTO public.wm_availability_policies(tenant_id,cutoff_hours,updated_by,updated_at)
 VALUES(p_tenant,p_cutoff_hours,auth.uid(),clock_timestamp())
 ON CONFLICT(tenant_id) DO UPDATE SET cutoff_hours=excluded.cutoff_hours,
 updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,auth.uid(),'availability_cutoff_changed','tenant',p_tenant,
  jsonb_build_object('cutoff_hours',p_cutoff_hours));
 RETURN jsonb_build_object('cutoff_hours',p_cutoff_hours,'saved',true);
END $$;

REVOKE ALL ON FUNCTION wm_private.guard_availability_submission() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_review_availability(uuid,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_withdraw_availability(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_get_availability_policy(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_set_availability_policy(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_review_availability(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_withdraw_availability(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_get_availability_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_set_availability_policy(uuid,integer) TO authenticated;
