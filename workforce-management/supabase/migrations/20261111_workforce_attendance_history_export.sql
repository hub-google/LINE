-- PRD HR-ATT-10 / HR-RPT-05: audited, scoped multi-year attendance
-- record export authorization; original punches and correction logs stay intact.
-- Returns a database snapshot cutoff and expected counts so the browser
-- can verify every paginated RLS-authorized CSV row before claiming success.
CREATE INDEX IF NOT EXISTS wm_request_history_member_period
 ON public.wm_requests(tenant_id,member_id,starts_at,ends_at,created_at);
CREATE INDEX IF NOT EXISTS wm_adjustment_history_member_period
 ON public.wm_attendance_adjustments(tenant_id,member_id,corrected_start,created_at);
CREATE INDEX IF NOT EXISTS wm_request_action_history
 ON public.wm_request_actions(tenant_id,request_id,at);

CREATE OR REPLACE FUNCTION public.wm_prepare_attendance_export(
 p_tenant uuid,p_member uuid,p_from date,p_to date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_actor uuid:=auth.uid();
 v_from timestamptz;v_to timestamptz;v_asof timestamptz;
 v_punch bigint;v_corrections bigint;v_actions bigint;v_adjustments bigint;
 v_id uuid:=gen_random_uuid();
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION '請先登入' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from
 OR p_to>(p_from+interval '5 years')::date
 THEN RAISE EXCEPTION '請選擇有效的出勤紀錄範圍，單次最多五年'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wm_members m
  WHERE m.id=p_member AND m.tenant_id=p_tenant)
 OR NOT wm_private.member_visible(p_tenant,p_member)
 THEN RAISE EXCEPTION '沒有查詢此員工出勤資料的權限' USING ERRCODE='42501'; END IF;
 v_from:=p_from::timestamp AT TIME ZONE 'Asia/Taipei';
 v_to:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Taipei';
 v_asof:=clock_timestamp();
 SELECT count(*) INTO v_punch FROM public.wm_punches
  WHERE tenant_id=p_tenant AND member_id=p_member
   AND punched_at>=v_from AND punched_at<v_to AND punched_at<v_asof;
 SELECT count(*) INTO v_corrections FROM public.wm_requests
  WHERE tenant_id=p_tenant AND member_id=p_member AND kind='correction'
   AND starts_at<v_to AND ends_at>v_from AND created_at<v_asof;
 SELECT count(*) INTO v_actions FROM public.wm_request_actions h
  JOIN public.wm_requests r ON r.id=h.request_id AND r.tenant_id=h.tenant_id
  WHERE r.tenant_id=p_tenant AND r.member_id=p_member AND r.kind='correction'
   AND r.starts_at<v_to AND r.ends_at>v_from
   AND r.created_at<v_asof AND h.at<v_asof;
 SELECT count(*) INTO v_adjustments FROM public.wm_attendance_adjustments
  WHERE tenant_id=p_tenant AND member_id=p_member
    AND corrected_start<v_to AND corrected_end>v_from
    AND created_at<v_asof;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(p_tenant,v_actor,'attendance_history_export_requested','member',p_member,
  jsonb_build_object('export_id',v_id,'from',p_from,'to',p_to,
    'as_of',v_asof,'raw_punch_count',v_punch,
    'correction_count',v_corrections,'action_count',v_actions,
    'adjustment_count',v_adjustments));
 RETURN jsonb_build_object('export_id',v_id,'tenant_id',p_tenant,'member_id',p_member,
  'from',p_from,'to',p_to,'as_of',v_asof,
  'punch_count',v_punch,'correction_count',v_corrections,
  'action_count',v_actions,'adjustment_count',v_adjustments);
END $$;
REVOKE ALL ON FUNCTION public.wm_prepare_attendance_export(uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_prepare_attendance_export(uuid,uuid,date,date) TO authenticated;
