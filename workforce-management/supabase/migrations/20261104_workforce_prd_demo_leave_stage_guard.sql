CREATE OR REPLACE FUNCTION public.wm_demo_leave_api(p_action text DEFAULT 'snapshot'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t constant uuid:='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
 v_id uuid;v_kind text;v_label text;v_member uuid;v_year int;v_hours numeric;
 v_basis text;v_levels int;v_carry numeric;v_date date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.wm_tenants WHERE id=t AND is_demo) THEN
  RAISE EXCEPTION 'Demo 未啟用';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN
  RAISE EXCEPTION '資料格式錯誤';END IF;
 IF p_action='snapshot' THEN
  RETURN jsonb_build_object(
   'leavePolicies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.leave_kind,p.effective_from DESC),'[]'::jsonb)
      FROM public.wm_leave_policies p WHERE p.tenant_id=t),
   'leaveBalances',(SELECT coalesce(jsonb_object_agg(m.id,wm_private.leave_balance_core(t,m.id,
     (now() AT TIME ZONE 'Asia/Taipei')::date)),'{}'::jsonb)
     FROM public.wm_members m WHERE m.tenant_id=t)
  );
 ELSIF p_action='policy' THEN
  v_kind:=coalesce(p_data->>'leave_kind','');
  v_label:=trim(coalesce(p_data->>'label',''));
  v_basis:=coalesce(p_data->>'yearly_basis','calendar');
  v_levels:=coalesce((p_data->>'approval_levels')::int,1);
  v_carry:=coalesce((p_data->>'carryover_hours')::numeric,0);
  v_date:=(p_data->>'effective_from')::date;
  IF v_kind !~ '^[a-z_]{2,40}$' THEN RAISE EXCEPTION '假別代碼錯誤';END IF;
  IF length(v_label)<1 OR length(v_label)>80 OR v_date IS NULL
    OR v_basis NOT IN('calendar','anniversary') OR v_levels<>1
    OR v_carry NOT BETWEEN 0 AND 4000 THEN RAISE EXCEPTION '假別規則資料錯誤';END IF;
  IF (SELECT count(*) FROM public.wm_leave_policies WHERE tenant_id=t)>=100
    AND NOT EXISTS(SELECT 1 FROM public.wm_leave_policies
      WHERE tenant_id=t AND leave_kind=v_kind AND effective_from=v_date)
  THEN RAISE EXCEPTION 'Demo 假別規則數量已達上限';END IF;
  INSERT INTO public.wm_leave_policies(tenant_id,leave_kind,label,effective_from,yearly_basis,
    balance_required,carryover_hours,approval_levels,requires_document,is_active)
  VALUES(t,v_kind,v_label,v_date,v_basis,
    coalesce((p_data->>'balance_required')::boolean,false),v_carry,v_levels,
    coalesce((p_data->>'requires_document')::boolean,false),
    coalesce((p_data->>'is_active')::boolean,true))
  ON CONFLICT(tenant_id,leave_kind,effective_from) DO UPDATE SET
    label=excluded.label,yearly_basis=excluded.yearly_basis,
    balance_required=excluded.balance_required,carryover_hours=excluded.carryover_hours,
    approval_levels=excluded.approval_levels,requires_document=excluded.requires_document,
    is_active=excluded.is_active,updated_at=clock_timestamp()
  RETURNING id INTO v_id;
 ELSIF p_action='grant' THEN
  v_member:=(p_data->>'member_id')::uuid;
  v_year:=(p_data->>'year')::int;
  v_kind:=coalesce(p_data->>'leave_kind','');
  v_hours:=(p_data->>'hours')::numeric;
  IF v_year NOT BETWEEN 2000 AND 2150 OR v_hours IS NULL
    OR v_hours NOT BETWEEN 0 AND 4000 OR v_kind !~ '^[a-z_]{2,40}$'
    OR NOT EXISTS(SELECT 1 FROM public.wm_members WHERE tenant_id=t AND id=v_member)
  THEN RAISE EXCEPTION 'Demo 核定額度或員工格式錯誤';END IF;
  INSERT INTO public.wm_leave_entitlements(tenant_id,member_id,year,leave_kind,hours)
  VALUES(t,v_member,v_year,v_kind,v_hours)
  ON CONFLICT(tenant_id,member_id,year,leave_kind) DO UPDATE SET hours=excluded.hours
  RETURNING id INTO v_id;
 ELSE RAISE EXCEPTION '不支援此操作';END IF;
 RETURN jsonb_build_object('id',v_id,'saved',true);
END $function$
