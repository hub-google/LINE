
-- HR-ATT-05/08: server-derived attendance anomalies and accountable resolution queue.
-- Alerts are observations, never edits to raw punch timestamps or payroll decisions.
CREATE TABLE IF NOT EXISTS public.wm_attendance_rules(
 tenant_id uuid PRIMARY KEY REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 grace_minutes int NOT NULL DEFAULT 5 CHECK(grace_minutes BETWEEN 0 AND 120),
 anomaly_sla_hours int NOT NULL DEFAULT 48 CHECK(anomaly_sla_hours BETWEEN 1 AND 720),
 quiet_from time NOT NULL DEFAULT '22:00',
 quiet_until time NOT NULL DEFAULT '08:00',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wm_attendance_anomalies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.wm_tenants(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 shift_id uuid NOT NULL REFERENCES public.wm_shifts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('missing_in','missing_out','late','early')),
 expected_at timestamptz NOT NULL,
 observed_at timestamptz,
 deviation_minutes integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 due_at timestamptz NOT NULL,
 resolved_at timestamptz,
 resolved_by uuid REFERENCES auth.users(id),
 resolution_note text NOT NULL DEFAULT '',
 FOREIGN KEY(tenant_id,member_id) REFERENCES public.wm_members(tenant_id,id),
 UNIQUE(tenant_id,shift_id,kind)
);
CREATE INDEX IF NOT EXISTS wm_attendance_anomalies_open ON public.wm_attendance_anomalies(tenant_id,status,due_at);
ALTER TABLE public.wm_attendance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wm_attendance_anomalies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_attendance_rules,public.wm_attendance_anomalies FROM anon,authenticated;
GRANT SELECT ON public.wm_attendance_rules,public.wm_attendance_anomalies TO authenticated;
CREATE POLICY wm_attendance_rules_read ON public.wm_attendance_rules FOR SELECT TO authenticated
 USING(wm_private.my_role(tenant_id) IS NOT NULL);
CREATE POLICY wm_attendance_anomalies_read ON public.wm_attendance_anomalies FOR SELECT TO authenticated
 USING(wm_private.member_visible(tenant_id,member_id));

CREATE OR REPLACE FUNCTION public.wm_save_attendance_rule(p_tenant uuid,p_grace int,p_sla int,p_quiet_from time,p_quiet_until time)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR wm_private.my_role(p_tenant) NOT IN('owner','hr') THEN
  RAISE EXCEPTION '只有企業擁有者或人資可設定出勤異常規則' USING errcode='42501';END IF;
 IF p_grace NOT BETWEEN 0 AND 120 OR p_sla NOT BETWEEN 1 AND 720
 OR p_quiet_from IS NULL OR p_quiet_until IS NULL THEN RAISE EXCEPTION '出勤規則格式不正確';END IF;
 INSERT INTO public.wm_attendance_rules(tenant_id,grace_minutes,anomaly_sla_hours,quiet_from,quiet_until)
 VALUES(p_tenant,p_grace,p_sla,p_quiet_from,p_quiet_until)
 ON CONFLICT(tenant_id) DO UPDATE SET grace_minutes=excluded.grace_minutes,
  anomaly_sla_hours=excluded.anomaly_sla_hours,quiet_from=excluded.quiet_from,
  quiet_until=excluded.quiet_until,updated_at=clock_timestamp();
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,details)
 VALUES(p_tenant,auth.uid(),'attendance_rule_saved','tenant',
 jsonb_build_object('grace_minutes',p_grace,'sla_hours',p_sla));
 RETURN jsonb_build_object('saved',true);
END $fn$;

CREATE OR REPLACE FUNCTION wm_private.record_attendance_anomaly(
 p_tenant uuid,p_member uuid,p_shift uuid,p_kind text,p_expected timestamptz,
 p_observed timestamptz,p_delta int,p_sla int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
 INSERT INTO public.wm_attendance_anomalies(tenant_id,member_id,shift_id,kind,
 expected_at,observed_at,deviation_minutes,due_at)
 VALUES(p_tenant,p_member,p_shift,p_kind,p_expected,p_observed,p_delta,
 clock_timestamp()+make_interval(hours:=p_sla))
 ON CONFLICT(tenant_id,shift_id,kind) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN RETURN false;END IF;
 INSERT INTO public.wm_notifications(tenant_id,recipient_member_id,event_key,title,body)
 VALUES(p_tenant,p_member,'attendance_anomaly:'||v_id,'出勤異常待確認',
 '系統偵測到班別打卡時間與排班不一致，請查看異常紀錄，必要時申請補卡。')
 ON CONFLICT DO NOTHING;
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION wm_private.scan_attendance_core(p_tenant uuid,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_shift public.wm_shifts%rowtype;v_in timestamptz;v_out timestamptz;
 v_grace int;v_sla int;v_cases int:=0;v_checked int:=0;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to>p_from+30 THEN
  RAISE EXCEPTION '一次最多檢查連續 31 天';END IF;
 SELECT coalesce(grace_minutes,5),coalesce(anomaly_sla_hours,48)
 INTO v_grace,v_sla FROM public.wm_attendance_rules WHERE tenant_id=p_tenant;
 v_grace:=coalesce(v_grace,5);v_sla:=coalesce(v_sla,48);
 FOR v_shift IN SELECT * FROM public.wm_shifts
  WHERE tenant_id=p_tenant AND status='published' AND ends_at<clock_timestamp()
   AND (starts_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN p_from AND p_to
   ORDER BY starts_at LIMIT 2000
 LOOP
  -- Approved full-shift leave is an absence of work, not an unexcused missed punch.
  IF EXISTS(SELECT 1 FROM public.wm_requests r
    WHERE r.tenant_id=p_tenant AND r.member_id=v_shift.member_id
    AND r.kind='leave' AND r.status='approved'
    AND r.starts_at<=v_shift.starts_at AND r.ends_at>=v_shift.ends_at)
  THEN CONTINUE;END IF;
  v_checked:=v_checked+1;
  SELECT min(p.punched_at) INTO v_in FROM public.wm_punches p
   WHERE p.tenant_id=p_tenant AND p.member_id=v_shift.member_id AND p.kind='IN'
    AND p.punched_at BETWEEN v_shift.starts_at-interval '4 hours' AND v_shift.ends_at;
  SELECT max(p.punched_at) INTO v_out FROM public.wm_punches p
   WHERE p.tenant_id=p_tenant AND p.member_id=v_shift.member_id AND p.kind='OUT'
    AND p.punched_at BETWEEN v_shift.starts_at AND v_shift.ends_at+interval '6 hours';
  IF v_in IS NULL THEN
    IF wm_private.record_attendance_anomaly(p_tenant,v_shift.member_id,v_shift.id,'missing_in',
      v_shift.starts_at,NULL,0,v_sla) THEN v_cases:=v_cases+1;END IF;
  ELSIF v_in>v_shift.starts_at+make_interval(mins:=v_grace) THEN
    IF wm_private.record_attendance_anomaly(p_tenant,v_shift.member_id,v_shift.id,'late',
      v_shift.starts_at,v_in,floor(extract(epoch FROM v_in-v_shift.starts_at)/60)::int,v_sla)
    THEN v_cases:=v_cases+1;END IF;
  END IF;
  IF v_out IS NULL THEN
    IF wm_private.record_attendance_anomaly(p_tenant,v_shift.member_id,v_shift.id,'missing_out',
     v_shift.ends_at,NULL,0,v_sla) THEN v_cases:=v_cases+1;END IF;
  ELSIF v_out<v_shift.ends_at-make_interval(mins:=v_grace) THEN
    IF wm_private.record_attendance_anomaly(p_tenant,v_shift.member_id,v_shift.id,'early',
     v_shift.ends_at,v_out,floor(extract(epoch FROM v_shift.ends_at-v_out)/60)::int,v_sla)
    THEN v_cases:=v_cases+1;END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('checked_shifts',v_checked,'created_anomalies',v_cases,
 'from',p_from,'through',p_to);
END $fn$;
REVOKE ALL ON FUNCTION wm_private.scan_attendance_core(uuid,date,date) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION wm_private.record_attendance_anomaly(uuid,uuid,uuid,text,timestamptz,timestamptz,int,int) FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wm_scan_attendance(p_tenant uuid,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT wm_private.can_manage(p_tenant) THEN
   RAISE EXCEPTION '沒有出勤異常檢查權限' USING errcode='42501';END IF;
 RETURN wm_private.scan_attendance_core(p_tenant,p_from,p_to);
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_resolve_attendance_anomaly(p_id uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_case public.wm_attendance_anomalies%rowtype;
BEGIN
 SELECT * INTO v_case FROM public.wm_attendance_anomalies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT wm_private.can_manage(v_case.tenant_id)
 THEN RAISE EXCEPTION '沒有異常結案權限' USING errcode='42501';END IF;
 IF v_case.status<>'open' THEN RAISE EXCEPTION '此異常已處理';END IF;
 IF length(trim(coalesce(p_note,''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION '請填寫具體的結案原因（3～500 字）';END IF;
 UPDATE public.wm_attendance_anomalies SET status='resolved',resolved_at=clock_timestamp(),
 resolved_by=auth.uid(),resolution_note=trim(p_note) WHERE id=p_id;
 INSERT INTO public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 VALUES(v_case.tenant_id,auth.uid(),'attendance_anomaly_resolved','anomaly',p_id,
 jsonb_build_object('note',trim(p_note)));
 RETURN jsonb_build_object('id',p_id,'status','resolved');
END $fn$;
CREATE OR REPLACE FUNCTION public.wm_demo_attendance_api(p_action text DEFAULT 'snapshot',p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t constant uuid:='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
 v_id uuid;v_result jsonb;v_case public.wm_attendance_anomalies%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.wm_tenants WHERE id=t AND is_demo)
 THEN RAISE EXCEPTION 'Demo 未啟用';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION '無效資料';END IF;
 IF p_action='snapshot' THEN
  RETURN jsonb_build_object(
   'attendanceRules',(SELECT coalesce(to_jsonb(r),'{}'::jsonb)
      FROM public.wm_attendance_rules r WHERE r.tenant_id=t),
   'attendanceCases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.wm_attendance_anomalies WHERE tenant_id=t ORDER BY created_at DESC LIMIT 200) x));
 ELSIF p_action='scan' THEN
  RETURN wm_private.scan_attendance_core(t,(p_data->>'from')::date,(p_data->>'through')::date);
 ELSIF p_action='resolve' THEN
  v_id:=(p_data->>'id')::uuid;
  SELECT * INTO v_case FROM public.wm_attendance_anomalies WHERE id=v_id AND tenant_id=t FOR UPDATE;
  IF NOT FOUND OR v_case.status<>'open' THEN RAISE EXCEPTION '異常不存在或已處理';END IF;
  IF length(trim(coalesce(p_data->>'note',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION '請說明結案原因';END IF;
  UPDATE public.wm_attendance_anomalies SET status='resolved',resolved_at=clock_timestamp(),
   resolution_note=left(trim(p_data->>'note'),500) WHERE id=v_id;
  RETURN jsonb_build_object('id',v_id,'status','resolved');
 ELSE RAISE EXCEPTION '不支援此操作';END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.wm_save_attendance_rule(uuid,int,int,time,time) FROM public,anon;
REVOKE ALL ON FUNCTION public.wm_scan_attendance(uuid,date,date) FROM public,anon;
REVOKE ALL ON FUNCTION public.wm_resolve_attendance_anomaly(uuid,text) FROM public,anon;
REVOKE ALL ON FUNCTION public.wm_demo_attendance_api(text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.wm_save_attendance_rule(uuid,int,int,time,time),
 public.wm_scan_attendance(uuid,date,date),public.wm_resolve_attendance_anomaly(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_demo_attendance_api(text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
