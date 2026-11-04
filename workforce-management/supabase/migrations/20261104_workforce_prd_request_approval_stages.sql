
-- HR-LVE multi-stage approval: immutable policy version and distinct reviewer stages.
ALTER TABLE public.wm_requests ADD COLUMN IF NOT EXISTS leave_policy_id uuid REFERENCES public.wm_leave_policies(id);
CREATE TABLE IF NOT EXISTS public.wm_request_approval_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES public.wm_requests(id) ON DELETE CASCADE,
 step int NOT NULL CHECK(step BETWEEN 1 AND 3),
 reviewer_id uuid NOT NULL REFERENCES auth.users(id),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,step)
);
CREATE INDEX IF NOT EXISTS wm_request_approvals_tenant ON public.wm_request_approval_steps(tenant_id,request_id);
ALTER TABLE public.wm_request_approval_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_request_approval_steps FROM anon,authenticated;

CREATE OR REPLACE FUNCTION wm_private.leave_request_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.wm_leave_policies%rowtype;v_date date;v_limit date;
 v_balance jsonb;v_remaining numeric;v_needed numeric;v_until timestamptz;
BEGIN
 IF new.kind<>'leave' THEN RETURN new;END IF;
 v_date:=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date;
 SELECT * INTO p FROM public.wm_leave_policies
 WHERE tenant_id=new.tenant_id AND leave_kind=new.leave_kind AND effective_from<=v_date
 ORDER BY effective_from DESC LIMIT 1;
 IF NOT FOUND THEN RETURN new;END IF;
 new.leave_policy_id:=p.id; -- Preserve existing arrangements pending configuration.
 IF NOT p.is_active THEN RAISE EXCEPTION '這個假別目前已停用';END IF;
 PERFORM 1 FROM public.wm_members WHERE id=new.member_id AND tenant_id=new.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.wm_requests r WHERE r.tenant_id=new.tenant_id
   AND r.member_id=new.member_id AND r.kind='leave' AND r.status IN('pending','approved')
   AND tstzrange(r.starts_at,r.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
 THEN RAISE EXCEPTION '該時段已有待審或核准的請假，請避免重複申請';END IF;
 IF p.balance_required THEN
  WHILE (v_date::timestamp AT TIME ZONE 'Asia/Taipei')<new.ends_at LOOP
    v_balance:=wm_private.leave_balance_core(new.tenant_id,new.member_id,v_date);
    SELECT (v->>'remaining_hours')::numeric,
      (v->>'ends_before')::date INTO v_remaining,v_limit
      FROM jsonb_array_elements(v_balance) v WHERE v->>'kind'=new.leave_kind;
    IF v_limit IS NULL THEN RAISE EXCEPTION '沒有可用的假別額度';END IF;
    v_until:=v_limit::timestamp AT TIME ZONE 'Asia/Taipei';
    v_needed:=extract(epoch FROM least(v_until,new.ends_at) -
      greatest(v_date::timestamp AT TIME ZONE 'Asia/Taipei',new.starts_at))/3600;
    IF coalesce(v_remaining,0)+0.0001<v_needed THEN
      RAISE EXCEPTION '剩餘假期時數不足（已包含待審占用），請重新填寫';END IF;
    v_date:=v_limit;
  END LOOP;
 END IF;
 RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION wm_private.protect_used_leave_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.wm_requests r WHERE r.leave_policy_id=old.id)
 THEN RAISE EXCEPTION '此版假別規則已有申請紀錄，請改用新的生效日期建立新版本';END IF;
 RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS wm_leave_policy_locked ON public.wm_leave_policies;
CREATE TRIGGER wm_leave_policy_locked BEFORE UPDATE OR DELETE ON public.wm_leave_policies
 FOR EACH ROW EXECUTE FUNCTION wm_private.protect_used_leave_policy();

CREATE OR REPLACE FUNCTION wm_private.guard_final_leave_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_levels int;
BEGIN
 IF new.kind='leave' AND new.status='approved' AND old.status IS DISTINCT FROM new.status THEN
  SELECT approval_levels INTO v_levels FROM public.wm_leave_policies WHERE id=new.leave_policy_id
    AND tenant_id=new.tenant_id;
  IF v_levels IS NULL THEN
   SELECT approval_levels INTO v_levels FROM public.wm_leave_policies
   WHERE tenant_id=new.tenant_id AND leave_kind=new.leave_kind
     AND effective_from<=(new.starts_at AT TIME ZONE 'Asia/Taipei')::date
   ORDER BY effective_from DESC LIMIT 1;
  END IF;
  IF coalesce(v_levels,1)>1 AND
    (SELECT count(*) FROM public.wm_request_approval_steps
      WHERE request_id=new.id AND tenant_id=new.tenant_id)<v_levels
  THEN RAISE EXCEPTION '需完成全部主管簽核步驟才能核准請假';END IF;
 END IF;
 RETURN new;
END $fn$;
DROP TRIGGER IF EXISTS wm_leave_final_approval_guard ON public.wm_requests;
CREATE TRIGGER wm_leave_final_approval_guard BEFORE UPDATE OF status ON public.wm_requests
 FOR EACH ROW EXECUTE FUNCTION wm_private.guard_final_leave_approval();

CREATE OR REPLACE FUNCTION public.wm_review_request_step(p_request uuid,p_approved boolean,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.wm_requests%rowtype;v_levels int;v_count int;v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING errcode='28000';END IF;
 SELECT * INTO r FROM public.wm_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR NOT wm_private.can_manage(r.tenant_id) THEN
  RAISE EXCEPTION '沒有審核權限或申請已處理' USING errcode='42501';END IF;
 IF p_approved IS NULL OR length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION '審核資料格式錯誤';END IF;
 IF r.kind<>'leave' THEN
  IF r.kind='swap' THEN RAISE EXCEPTION '換班請使用雙方確認及主管專用審核';END IF;
  PERFORM public.wm_decide_request(p_request,CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,p_note);
  RETURN jsonb_build_object('id',p_request,'status',CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END);
 END IF;
 SELECT approval_levels INTO v_levels FROM public.wm_leave_policies WHERE id=r.leave_policy_id
   AND tenant_id=r.tenant_id;
 IF v_levels IS NULL THEN
  SELECT approval_levels INTO v_levels FROM public.wm_leave_policies
   WHERE tenant_id=r.tenant_id AND leave_kind=r.leave_kind
     AND effective_from<=(r.starts_at AT TIME ZONE 'Asia/Taipei')::date
   ORDER BY effective_from DESC LIMIT 1;
 END IF;
 v_levels:=coalesce(v_levels,1);
 IF NOT p_approved THEN
  PERFORM public.wm_decide_request(p_request,'rejected',p_note);
  RETURN jsonb_build_object('id',p_request,'status','rejected');
 END IF;
 IF v_levels=1 THEN
  PERFORM public.wm_decide_request(p_request,'approved',p_note);
  RETURN jsonb_build_object('id',p_request,'status','approved','steps',1);
 END IF;
 IF EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=r.tenant_id
   AND id=r.member_id AND user_id=v_actor)
 THEN RAISE EXCEPTION '申請人不能核准自己的多層請假';END IF;
 IF EXISTS(SELECT 1 FROM public.wm_request_approval_steps WHERE request_id=p_request
   AND reviewer_id=v_actor)
 THEN RAISE EXCEPTION '多層審核必須由不同主管執行';END IF;
 SELECT count(*) INTO v_count FROM public.wm_request_approval_steps
  WHERE request_id=p_request AND tenant_id=r.tenant_id;
 IF v_count>=v_levels THEN RAISE EXCEPTION '已完成所需簽核步驟';END IF;
 INSERT INTO public.wm_request_approval_steps(tenant_id,request_id,step,reviewer_id,note)
  VALUES(r.tenant_id,p_request,v_count+1,v_actor,coalesce(p_note,''));
 INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
  VALUES(r.tenant_id,p_request,v_actor,'approval_stage_'||(v_count+1),p_note);
 IF v_count+1=v_levels THEN
  PERFORM public.wm_decide_request(p_request,'approved',p_note);
 END IF;
 RETURN jsonb_build_object('id',p_request,'status',CASE WHEN v_count+1=v_levels THEN 'approved' ELSE 'pending' END,
   'completed_steps',v_count+1,'required_steps',v_levels);
END $fn$;

CREATE OR REPLACE FUNCTION public.wm_request_step_status(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) IS NULL THEN
  RAISE EXCEPTION '沒有查看本企業簽核權限' USING errcode='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'request_id',s.request_id,'step',s.step,'reviewer_id',s.reviewer_id,
    'reviewed_at',s.reviewed_at) ORDER BY s.reviewed_at)
    FROM public.wm_request_approval_steps s JOIN public.wm_requests r
      ON r.id=s.request_id AND r.tenant_id=s.tenant_id
    WHERE s.tenant_id=p_tenant AND wm_private.member_visible(r.tenant_id,r.member_id)
    ),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.wm_review_request_step(uuid,boolean,text) FROM public,anon;
REVOKE ALL ON FUNCTION public.wm_request_step_status(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.wm_review_request_step(uuid,boolean,text),
 public.wm_request_step_status(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
