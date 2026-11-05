
-- Fictional demo scheduling limits; cannot affect production tenant rules.
CREATE OR REPLACE FUNCTION public.wm_demo_schedule_api(p_action text DEFAULT 'snapshot',p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t constant uuid:='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
v_date date;v_rest int;v_shift int;v_week int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.wm_tenants WHERE id=t AND is_demo)
 THEN RAISE EXCEPTION 'Demo 未啟用';END IF;
 IF p_action='snapshot' THEN
  RETURN coalesce((SELECT to_jsonb(s) FROM public.wm_schedule_rules s
   WHERE s.tenant_id=t AND s.effective_from<=(now() AT TIME ZONE 'Asia/Taipei')::date
   ORDER BY s.effective_from DESC LIMIT 1),'{}'::jsonb);
 ELSIF p_action='save' THEN
  v_date:=(p_data->>'effective_from')::date;
  v_rest:=(p_data->>'min_rest_minutes')::int;
  v_shift:=(p_data->>'max_shift_minutes')::int;
  v_week:=(p_data->>'max_week_minutes')::int;
  IF v_date IS NULL OR v_date<current_date-interval '5 years' OR v_date>current_date+interval '5 years'
   OR v_rest NOT BETWEEN 0 AND 660
   OR v_shift NOT IN (0,480,540,600,660,720,780,840)
   OR v_week NOT IN (0,2400,2880,3360)
  THEN RAISE EXCEPTION 'Demo 只提供安全的班次限制測試範圍';END IF;
  IF (SELECT count(*) FROM public.wm_schedule_rules WHERE tenant_id=t)>=10
    AND NOT EXISTS(SELECT 1 FROM public.wm_schedule_rules
    WHERE tenant_id=t AND effective_from=v_date)
  THEN RAISE EXCEPTION 'Demo 最多十個排班規則版本';END IF;
  INSERT INTO public.wm_schedule_rules(tenant_id,effective_from,min_rest_minutes,max_shift_minutes,max_week_minutes)
  VALUES(t,v_date,v_rest,v_shift,v_week)
  ON CONFLICT(tenant_id,effective_from) DO UPDATE
  SET min_rest_minutes=excluded.min_rest_minutes,
   max_shift_minutes=excluded.max_shift_minutes,max_week_minutes=excluded.max_week_minutes,
   updated_at=clock_timestamp();
  RETURN jsonb_build_object('saved',true);
 END IF;
 RAISE EXCEPTION '操作不支援';
END $fn$;
REVOKE ALL ON FUNCTION public.wm_demo_schedule_api(text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.wm_demo_schedule_api(text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
