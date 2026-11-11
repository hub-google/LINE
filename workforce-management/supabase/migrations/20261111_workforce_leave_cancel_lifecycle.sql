-- Workforce PRD HR-LVE-03 / HR-ORG-03 (2026-11-11)
-- Approved leave cancellation is a separate, reviewed transaction.
-- Employee deactivation/reactivation preserves all historical records.
-- No data backfill, no other LINE product is touched.

ALTER TABLE public.wm_requests DROP CONSTRAINT IF EXISTS wm_requests_status_check;
ALTER TABLE public.wm_requests ADD CONSTRAINT wm_requests_status_check
 CHECK (status IN ('pending','approved','rejected','withdrawn','cancelled'));

CREATE TABLE IF NOT EXISTS public.wm_leave_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id),
  request_id uuid NOT NULL REFERENCES public.wm_requests(id),
  member_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  CONSTRAINT wm_leave_cancel_member_tenant FOREIGN KEY (tenant_id,member_id)
    REFERENCES public.wm_members(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS wm_leave_cancel_tenant_status_idx
 ON public.wm_leave_cancellations(tenant_id,status,requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wm_leave_cancel_one_pending_idx
 ON public.wm_leave_cancellations(request_id) WHERE status='pending';
ALTER TABLE public.wm_leave_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wm_leave_cancellations FROM PUBLIC, anon, authenticated;
-- No client table policies: every operation goes through authenticated, scoped RPC.

CREATE OR REPLACE FUNCTION public.wm_request_leave_cancellation(
 p_request uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE r public.wm_requests%rowtype; v_id uuid; v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION '取消原因請填寫 3 至 500 字'; END IF;
 SELECT * INTO r FROM public.wm_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR r.kind<>'leave' OR r.status<>'approved'
 THEN RAISE EXCEPTION '只有已核准的請假可以提出取消'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wm_members m
    WHERE m.tenant_id=r.tenant_id AND m.id=r.member_id
    AND m.user_id=v_actor AND m.status='active'
 ) THEN RAISE EXCEPTION '只能取消自己的請假' USING ERRCODE='42501'; END IF;
 IF r.ends_at<=clock_timestamp()
 THEN RAISE EXCEPTION '已結束的假期須交由人資依歷史更正程序處理'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.wm_period_closures c WHERE c.tenant_id=r.tenant_id
   AND tstzrange(r.starts_at,r.ends_at,'[)') &&
       tstzrange(make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei'),
         make_timestamptz(c.year,c.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')
 ) THEN RAISE EXCEPTION '涉及已月結月份，不能直接取消，請向人資申請更正'; END IF;
 IF EXISTS (SELECT 1 FROM public.wm_leave_cancellations
    WHERE request_id=r.id AND status='pending')
 THEN RAISE EXCEPTION '已有待審核取消申請，請勿重複送出'; END IF;
 INSERT INTO public.wm_leave_cancellations(tenant_id,request_id,member_id,reason,requested_by)
 VALUES(r.tenant_id,r.id,r.member_id,btrim(p_reason),v_actor)
 RETURNING id INTO v_id;
 INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
 VALUES(r.tenant_id,r.id,v_actor,'leave_cancel_requested',left(p_reason,500));
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(r.tenant_id,v_actor,'leave_cancellation_submitted','request',r.id,
        jsonb_build_object('cancellation_id',v_id));
 RETURN jsonb_build_object('id',v_id,'request_id',r.id,'status','pending');
END $$;

CREATE OR REPLACE FUNCTION public.wm_decide_leave_cancellation(
 p_cancellation uuid,p_approve boolean,p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE c public.wm_leave_cancellations%rowtype;
 r public.wm_requests%rowtype;
 v_actor uuid:=auth.uid(); v_status text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION '請選擇核准或駁回'; END IF;
 SELECT * INTO c FROM public.wm_leave_cancellations
  WHERE id=p_cancellation FOR UPDATE;
 IF NOT FOUND OR c.status<>'pending'
 THEN RAISE EXCEPTION '取消申請不存在或已處理'; END IF;
 IF NOT wm_private.can_approve_member(c.tenant_id,c.member_id)
 THEN RAISE EXCEPTION '沒有審核此員工的權限，且不得自行核准' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.wm_requests
 WHERE id=c.request_id AND tenant_id=c.tenant_id
   AND member_id=c.member_id FOR UPDATE;
 IF NOT FOUND OR r.kind<>'leave' OR r.status<>'approved'
 THEN RAISE EXCEPTION '原請假狀態已變更，請重新整理'; END IF;
 IF p_approve AND EXISTS (
  SELECT 1 FROM public.wm_period_closures cl WHERE cl.tenant_id=r.tenant_id
   AND tstzrange(r.starts_at,r.ends_at,'[)') &&
       tstzrange(make_timestamptz(cl.year,cl.month,1,0,0,0,'Asia/Taipei'),
         make_timestamptz(cl.year,cl.month,1,0,0,0,'Asia/Taipei')+interval '1 month','[)')
 ) THEN RAISE EXCEPTION '原假期已月結，須使用追溯更正流程'; END IF;
 v_status:=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 UPDATE public.wm_leave_cancellations
  SET status=v_status,decided_by=v_actor,decided_at=clock_timestamp(),
      decision_note=left(coalesce(p_note,''),500)
  WHERE id=c.id;
 IF p_approve THEN
  UPDATE public.wm_requests
    SET status='cancelled',reviewer_id=v_actor,decided_at=clock_timestamp(),
      decision_note='原核准假期已經審核取消'
    WHERE id=r.id AND status='approved';
 END IF;
 INSERT INTO public.wm_request_actions(tenant_id,request_id,actor_id,action,note)
  VALUES(r.tenant_id,r.id,v_actor,
    CASE WHEN p_approve THEN 'leave_cancel_approved' ELSE 'leave_cancel_rejected' END,
    left(coalesce(p_note,''),500));
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(r.tenant_id,v_actor,'leave_cancellation_decided','request',r.id,
   jsonb_build_object('cancellation_id',c.id,'decision',v_status));
 INSERT INTO public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
 VALUES(r.tenant_id,r.member_id,'leave_cancel:'||c.id||':'||v_status,
  '請假取消申請結果',CASE WHEN p_approve THEN '主管已核准取消原請假，假期額度將依規則重新計算。'
                       ELSE '主管已駁回取消申請，原核准假期仍有效。' END)
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',c.id,'request_id',r.id,
  'status',v_status,'original_status',CASE WHEN p_approve THEN 'cancelled' ELSE 'approved' END);
END $$;

CREATE OR REPLACE FUNCTION public.wm_list_leave_cancellations(
 p_tenant uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_actor uuid:=auth.uid();v_result jsonb;
BEGIN
 IF v_actor IS NULL OR wm_private.my_role(p_tenant) IS NULL
 THEN RAISE EXCEPTION '無法查看此企業假勤取消紀錄' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.requested_at DESC),'[]'::jsonb)
 INTO v_result
 FROM (
  SELECT c.id,c.request_id,c.member_id,c.status,c.reason,
   c.requested_at,c.decided_at,c.decision_note,r.starts_at,r.ends_at,r.leave_kind
  FROM public.wm_leave_cancellations c
   JOIN public.wm_requests r ON r.id=c.request_id AND r.tenant_id=c.tenant_id
  WHERE c.tenant_id=p_tenant
   AND wm_private.member_visible(p_tenant,c.member_id)
  ORDER BY c.requested_at DESC LIMIT 100
 ) row;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.wm_set_employment_status(
 p_member uuid,p_status text,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE m public.wm_members%rowtype;
 v_actor uuid:=auth.uid();v_role text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION '狀態不正確'; END IF;
 IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500
 THEN RAISE EXCEPTION '請填寫至少 5 字的人員異動原因'; END IF;
 SELECT * INTO m FROM public.wm_members WHERE id=p_member FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '員工不存在'; END IF;
 v_role:=wm_private.my_role(m.tenant_id);
 IF v_role NOT IN ('owner','hr') OR m.role='owner'
  OR (v_role='hr' AND m.role='hr')
 THEN RAISE EXCEPTION '無權調整此員工的在職狀態' USING ERRCODE='42501'; END IF;
 IF m.status=p_status THEN
  RAISE EXCEPTION '員工已處於指定狀態，不需重複更新'; END IF;
 IF p_status='inactive' THEN
  IF EXISTS(SELECT 1 FROM public.wm_members
    WHERE tenant_id=m.tenant_id AND reports_to=m.id AND status='active')
  THEN RAISE EXCEPTION '此主管仍有在職直屬部屬，請先調整主管關係'; END IF;
  IF EXISTS(SELECT 1 FROM public.wm_shifts
    WHERE tenant_id=m.tenant_id AND member_id=m.id AND status='published'
      AND ends_at>clock_timestamp())
  THEN RAISE EXCEPTION '此員工尚有未完成的已發布班表，請先取消或改派'; END IF;
  IF EXISTS(SELECT 1 FROM public.wm_requests
    WHERE tenant_id=m.tenant_id AND member_id=m.id AND status='pending')
  THEN RAISE EXCEPTION '此員工尚有待審申請，請先審核或撤回'; END IF;
 END IF;
 UPDATE public.wm_members
 SET status=p_status,
   left_on=CASE WHEN p_status='inactive'
      THEN (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date
      ELSE NULL END
 WHERE id=m.id AND tenant_id=m.tenant_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(m.tenant_id,v_actor,
  CASE WHEN p_status='inactive' THEN 'employee_deactivated' ELSE 'employee_reactivated' END,
  'member',m.id,jsonb_build_object('old_status',m.status,
    'new_status',p_status,'old_left_on',m.left_on,'reason',btrim(p_reason)));
 RETURN jsonb_build_object('member_id',m.id,'status',p_status,'history_preserved',true);
END $$;

REVOKE ALL ON FUNCTION public.wm_request_leave_cancellation(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_decide_leave_cancellation(uuid,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_list_leave_cancellations(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_set_employment_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_request_leave_cancellation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_decide_leave_cancellation(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_list_leave_cancellations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_set_employment_status(uuid,text,text) TO authenticated;
