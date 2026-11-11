-- PRD HR-LVE-03/04/06/08: approved leave amendment with versioned history,
-- authentic distinct approver steps, and atomic replacement on the SAME wm_requests row.
-- Preserve original request identifier, approval, policy history, attendance and audit.
-- The original approved leave remains active until final authorized approval.
CREATE TABLE IF NOT EXISTS public.wm_leave_amendments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id),
 request_id uuid NOT NULL REFERENCES public.wm_requests(id),
 member_id uuid NOT NULL,
 original_starts_at timestamptz NOT NULL,
 original_ends_at timestamptz NOT NULL,
 proposed_starts_at timestamptz NOT NULL,
 proposed_ends_at timestamptz NOT NULL,
 reason text NOT NULL,
 required_steps int NOT NULL CHECK(required_steps BETWEEN 1 AND 3),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_by uuid REFERENCES auth.users(id),
 decided_at timestamptz,
 decision_note text,
 CONSTRAINT wm_leave_amendment_member_tenant FOREIGN KEY(tenant_id,member_id)
 REFERENCES public.wm_members(tenant_id,id),
 CONSTRAINT wm_leave_amendment_dates CHECK(
   original_ends_at>original_starts_at AND proposed_ends_at>proposed_starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS wm_leave_amendment_one_pending
 ON public.wm_leave_amendments(request_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS wm_leave_amendment_company
 ON public.wm_leave_amendments(tenant_id,status,requested_at DESC);
ALTER TABLE public.wm_leave_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_leave_amendments FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wm_leave_amendment_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id),
 amendment_id uuid NOT NULL REFERENCES public.wm_leave_amendments(id),
 step int NOT NULL CHECK(step BETWEEN 1 AND 3),
 reviewer_id uuid NOT NULL REFERENCES auth.users(id),
 note text NOT NULL DEFAULT '',
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(amendment_id,step),UNIQUE(amendment_id,reviewer_id)
);
CREATE INDEX IF NOT EXISTS wm_leave_amendment_steps_tenant
 ON public.wm_leave_amendment_steps(tenant_id,amendment_id);
ALTER TABLE public.wm_leave_amendment_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_leave_amendment_steps FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wm_request_leave_amendment(
 p_request uuid,p_start timestamptz,p_end timestamptz,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r public.wm_requests%rowtype;v_actor uuid:=auth.uid();v_id uuid;
 v_policy public.wm_leave_policies%rowtype;v_levels integer:=1;v_start_date date;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end>p_start+interval '31 days'
 THEN RAISE EXCEPTION '變更期間必須正確，且不得超過 31 天'; END IF;
 IF p_start<=clock_timestamp() THEN RAISE EXCEPTION '已開始的假期須由人資依歷史更正流程處理'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION '變更原因請填寫 3 至 500 字'; END IF;
 SELECT * INTO r FROM public.wm_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR r.kind<>'leave' OR r.status<>'approved'
 THEN RAISE EXCEPTION '只有已核准的請假可以申請變更'; END IF;
 IF r.starts_at<=clock_timestamp() THEN RAISE EXCEPTION '已開始的請假不能直接變更，請由人資追溯更正'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_members m WHERE m.id=r.member_id
  AND m.tenant_id=r.tenant_id AND m.user_id=v_actor AND m.status='active')
 THEN RAISE EXCEPTION '只能變更自己的請假' USING ERRCODE='42501'; END IF;
 IF p_start=r.starts_at AND p_end=r.ends_at THEN
  RAISE EXCEPTION '新舊請假期間相同，無須申請變更'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_leave_amendments a
  WHERE a.request_id=r.id AND a.status='pending')
 THEN RAISE EXCEPTION '已有待審核的日期變更，請勿重複送出'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_leave_cancellations c
  WHERE c.request_id=r.id AND c.status='pending')
 THEN RAISE EXCEPTION '此假單已有待審的取消申請，請先完成該申請'; END IF;
 -- Both original and proposed periods must be outside closed payroll months.
 IF EXISTS(SELECT 1 FROM public.wm_period_closures c WHERE c.tenant_id=r.tenant_id
  AND (
    tstzrange(r.starts_at,r.ends_at,'[)') &&
      tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
       make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')
    OR
    tstzrange(p_start,p_end,'[)') &&
      tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
       make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')
  )
 ) THEN RAISE EXCEPTION '涉及已月結期間，不可直接修改請假'; END IF;
 v_start_date:=(p_start AT TIME ZONE 'Asia/Taipei')::date;
 SELECT * INTO v_policy FROM public.wm_leave_policies
  WHERE tenant_id=r.tenant_id AND leave_kind=r.leave_kind AND effective_from<=v_start_date
  ORDER BY effective_from DESC LIMIT 1;
 IF FOUND THEN
  IF NOT v_policy.is_active THEN RAISE EXCEPTION '新請假期間的假別政策已停用';END IF;
  v_levels:=greatest(1,v_policy.approval_levels);
 ELSE
  SELECT greatest(1,approval_levels) INTO v_levels FROM public.wm_leave_policies
   WHERE id=r.leave_policy_id AND tenant_id=r.tenant_id;
  v_levels:=coalesce(v_levels,1);
 END IF;
 IF v_levels NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION '公司簽核規則超出支援層數';END IF;
 INSERT INTO public.wm_leave_amendments
 (tenant_id,request_id,member_id,original_starts_at,original_ends_at,
  proposed_starts_at,proposed_ends_at,reason,required_steps,requested_by)
 VALUES(r.tenant_id,r.id,r.member_id,r.starts_at,r.ends_at,
  p_start,p_end,btrim(p_reason),v_levels,v_actor)
 RETURNING id INTO v_id;
 INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
 VALUES(r.tenant_id,r.id,v_actor,'leave_amendment_requested',left(p_reason,500));
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(r.tenant_id,v_actor,'leave_amendment_submitted','request',r.id,
 jsonb_build_object('amendment_id',v_id,'original_starts_at',r.starts_at,'original_ends_at',r.ends_at,
   'proposed_starts_at',p_start,'proposed_ends_at',p_end,'required_steps',v_levels));
 RETURN jsonb_build_object('id',v_id,'request_id',r.id,'status','pending','required_steps',v_levels);
END $$;

CREATE OR REPLACE FUNCTION public.wm_review_leave_amendment(
 p_amendment uuid,p_approved boolean,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE a public.wm_leave_amendments%rowtype;r public.wm_requests%rowtype;
 v_actor uuid:=auth.uid();v_steps integer;v_required integer;v_policy public.wm_leave_policies%rowtype;
 v_day date;v_until date;v_value jsonb;v_item jsonb;v_begin timestamptz;v_end timestamptz;
 v_year int;v_limit numeric;v_used numeric;v_legacy_grant numeric;
 v_policy_id uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_approved IS NULL OR length(coalesce(p_note,''))>500
 THEN RAISE EXCEPTION '審核資料格式錯誤'; END IF;
 SELECT * INTO a FROM public.wm_leave_amendments WHERE id=p_amendment FOR UPDATE;
 IF NOT FOUND OR a.status<>'pending' THEN RAISE EXCEPTION '這筆日期變更已處理或不存在'; END IF;
 IF NOT wm_private.can_approve_member(a.tenant_id,a.member_id)
 THEN RAISE EXCEPTION '不能審核自己的假單或非管理範圍員工' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.wm_requests
 WHERE id=a.request_id AND tenant_id=a.tenant_id AND member_id=a.member_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'leave' OR r.status<>'approved'
   OR r.starts_at<>a.original_starts_at OR r.ends_at<>a.original_ends_at
 THEN RAISE EXCEPTION '原假單已變更，不能套用過期的申請'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_leave_cancellations c
  WHERE c.request_id=r.id AND c.status='pending')
 THEN RAISE EXCEPTION '已有待審請假取消申請，請先處理'; END IF;
 IF a.proposed_starts_at<=clock_timestamp() OR r.starts_at<=clock_timestamp()
 THEN RAISE EXCEPTION '請假已開始，不可使用一般日期變更流程'; END IF;
 IF EXISTS(SELECT 1 FROM public.wm_period_closures c WHERE c.tenant_id=r.tenant_id
  AND (tstzrange(r.starts_at,r.ends_at,'[)') &&
    tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
     make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')
  OR tstzrange(a.proposed_starts_at,a.proposed_ends_at,'[)') &&
    tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
     make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')))
 THEN RAISE EXCEPTION '有月份已月結，無法直接變更';END IF;
 IF NOT p_approved THEN
   UPDATE public.wm_leave_amendments
     SET status='rejected',decided_by=v_actor,decided_at=clock_timestamp(),
        decision_note=left(coalesce(p_note,''),500) WHERE id=a.id;
 ELSE
   IF EXISTS(SELECT 1 FROM public.wm_leave_amendment_steps
    WHERE amendment_id=a.id AND reviewer_id=v_actor)
   THEN RAISE EXCEPTION '多層簽核須由不同主管核准'; END IF;
   SELECT * INTO v_policy FROM public.wm_leave_policies
    WHERE tenant_id=r.tenant_id AND leave_kind=r.leave_kind
      AND effective_from<=(a.proposed_starts_at AT TIME ZONE 'Asia/Taipei')::date
    ORDER BY effective_from DESC LIMIT 1;
   IF FOUND AND NOT v_policy.is_active THEN
      RAISE EXCEPTION '新期間適用的假別政策已停用'; END IF;
   v_required:=greatest(a.required_steps,coalesce(v_policy.approval_levels,1));
   IF v_required>3 THEN RAISE EXCEPTION '新的假別政策需要更多簽核層數，請由人資調整流程'; END IF;
   SELECT count(*) INTO v_steps FROM public.wm_leave_amendment_steps
    WHERE amendment_id=a.id AND tenant_id=a.tenant_id;
   INSERT INTO public.wm_leave_amendment_steps(tenant_id,amendment_id,step,reviewer_id,note)
     VALUES(a.tenant_id,a.id,v_steps+1,v_actor,left(coalesce(p_note,''),500));
   IF v_steps+1<v_required THEN
     INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
     VALUES(r.tenant_id,r.id,v_actor,'leave_amendment_stage_'||(v_steps+1),left(p_note,500));
     RETURN jsonb_build_object('id',a.id,'status','pending',
       'completed_steps',v_steps+1,'required_steps',v_required);
   END IF;
   -- Serialize with all concurrent requests/entitlement changes for this member.
   PERFORM 1 FROM public.wm_members WHERE id=r.member_id AND tenant_id=r.tenant_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM public.wm_requests other
     WHERE other.tenant_id=r.tenant_id AND other.member_id=r.member_id
       AND other.id<>r.id AND other.kind='leave'
       AND other.status IN('pending','approved')
       AND tstzrange(other.starts_at,other.ends_at,'[)') &&
          tstzrange(a.proposed_starts_at,a.proposed_ends_at,'[)'))
   THEN RAISE EXCEPTION '新期間與其他待審或已核准請假重疊'; END IF;
   IF v_policy.id IS NOT NULL AND v_policy.requires_document AND NOT EXISTS(
     SELECT 1 FROM public.wm_request_documents d
      JOIN storage.objects o ON o.bucket_id='wm-private-evidence' AND o.name=d.storage_path
      WHERE d.request_id=r.id AND d.tenant_id=r.tenant_id)
   THEN RAISE EXCEPTION '此假別必須先提供有效證明附件'; END IF;
   v_policy_id:=coalesce(v_policy.id,r.leave_policy_id);
   UPDATE public.wm_requests
   SET starts_at=a.proposed_starts_at,ends_at=a.proposed_ends_at,
       leave_policy_id=v_policy_id
   WHERE id=r.id;
   -- Validate recalculated period balances AFTER the atomic update; any
   -- failure aborts the entire transaction and restores the previous dates.
   v_day:=(a.proposed_starts_at AT TIME ZONE 'Asia/Taipei')::date;
   WHILE (v_day::timestamp AT TIME ZONE 'Asia/Taipei')<a.proposed_ends_at LOOP
     v_value:=wm_private.leave_balance_core(r.tenant_id,r.member_id,v_day);
     SELECT e INTO v_item FROM jsonb_array_elements(v_value) e
       WHERE e->>'kind'=r.leave_kind;
     IF v_item IS NOT NULL THEN
       IF coalesce((v_item->>'balance_required')::boolean,false) AND
         (v_item->>'granted_hours')::numeric+
         (v_item->>'carryover_hours')::numeric-
         (v_item->>'approved_hours')::numeric-
         (v_item->>'pending_hours')::numeric < -0.001
       THEN RAISE EXCEPTION '變更後的假期額度不足（包含待審時數）';END IF;
       v_until:=(v_item->>'ends_before')::date;
     ELSE
       -- Legacy tenants without leave policy: enforce configured grants.
       v_year:=extract(year FROM v_day)::int;
       v_until:=make_date(v_year+1,1,1);
       SELECT sum(hours) INTO v_legacy_grant FROM public.wm_leave_entitlements
         WHERE tenant_id=r.tenant_id AND member_id=r.member_id
          AND year=v_year AND leave_kind=r.leave_kind;
       IF v_legacy_grant IS NOT NULL THEN
         v_begin:=make_date(v_year,1,1)::timestamp AT TIME ZONE 'Asia/Taipei';
         v_end:=v_until::timestamp AT TIME ZONE 'Asia/Taipei';
         SELECT coalesce(sum(extract(epoch FROM least(q.ends_at,v_end)-greatest(q.starts_at,v_begin))/3600),0)
         INTO v_used FROM public.wm_requests q
         WHERE q.tenant_id=r.tenant_id AND q.member_id=r.member_id
           AND q.kind='leave' AND q.leave_kind=r.leave_kind
           AND q.status IN('pending','approved') AND q.starts_at<v_end AND q.ends_at>v_begin;
         IF v_used>v_legacy_grant+0.001 THEN RAISE EXCEPTION '假期額度不足'; END IF;
       END IF;
     END IF;
     IF v_until<=v_day THEN RAISE EXCEPTION '年度假別政策期間錯誤'; END IF;
     v_day:=v_until;
   END LOOP;
   UPDATE public.wm_leave_amendments
    SET status='approved',decided_by=v_actor,decided_at=clock_timestamp(),
        decision_note=left(coalesce(p_note,''),500)
    WHERE id=a.id;
 END IF;
 INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
 VALUES(r.tenant_id,r.id,v_actor,
  CASE WHEN p_approved THEN 'leave_amendment_approved' ELSE 'leave_amendment_rejected' END,
  left(coalesce(p_note,''),500));
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(r.tenant_id,v_actor,'leave_amendment_decided','request',r.id,
  jsonb_build_object('amendment_id',a.id,'decision',
  CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
  'before',jsonb_build_object('starts_at',a.original_starts_at,'ends_at',a.original_ends_at,'policy_id',r.leave_policy_id),
  'after',jsonb_build_object('starts_at',a.proposed_starts_at,'ends_at',a.proposed_ends_at,'policy_id',v_policy_id)));
 INSERT INTO public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
 VALUES(r.tenant_id,r.member_id,'leave_amend:'||a.id||':'||
    CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
   '請假日期變更審核結果',
   CASE WHEN p_approved THEN '主管已核准修改請假日期。'
    ELSE '主管已駁回請假日期變更，原核准日期維持不變。' END)
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',a.id,'request_id',r.id,
   'status',CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
   'completed_steps',CASE WHEN p_approved THEN v_required ELSE 0 END,
   'required_steps',a.required_steps);
END $$;

CREATE OR REPLACE FUNCTION public.wm_list_leave_amendments(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) IS NULL
 THEN RAISE EXCEPTION '沒有查看此企業資料的權限' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((
 SELECT jsonb_agg(to_jsonb(a) ||
  jsonb_build_object('completed_steps',(
   SELECT count(*) FROM public.wm_leave_amendment_steps s WHERE s.amendment_id=a.id)
  ) ORDER BY a.requested_at DESC)
 FROM (
   SELECT am.id,am.request_id,am.member_id,am.original_starts_at,am.original_ends_at,
    am.proposed_starts_at,am.proposed_ends_at,am.reason,am.status,am.requested_at,
    am.decided_at,am.decision_note,am.required_steps
   FROM public.wm_leave_amendments am
   WHERE am.tenant_id=p_tenant AND wm_private.member_visible(p_tenant,am.member_id)
   ORDER BY am.requested_at DESC LIMIT 200
 ) a),'[]'::jsonb);
END $$;

-- Compatibility with cancellation: no concurrent amendment and cancellation
-- on the same approved leave (final approval locks the original request).
CREATE OR REPLACE FUNCTION wm_private.guard_leave_amendment_vs_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.wm_leave_amendments a
   WHERE a.request_id=NEW.request_id AND a.status='pending')
 THEN RAISE EXCEPTION '已有待審的請假日期變更，須先完成後才能取消';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wm_leave_cancel_amendment_conflict ON public.wm_leave_cancellations;
CREATE TRIGGER wm_leave_cancel_amendment_conflict
 BEFORE INSERT ON public.wm_leave_cancellations
 FOR EACH ROW EXECUTE FUNCTION wm_private.guard_leave_amendment_vs_cancellation();

REVOKE ALL ON FUNCTION public.wm_request_leave_amendment(uuid,timestamptz,timestamptz,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_review_leave_amendment(uuid,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_list_leave_amendments(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION wm_private.guard_leave_amendment_vs_cancellation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_request_leave_amendment(uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_review_leave_amendment(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_list_leave_amendments(uuid) TO authenticated;
