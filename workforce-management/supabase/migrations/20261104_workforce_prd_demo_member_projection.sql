CREATE OR REPLACE FUNCTION public.wm_demo_api(p_action text DEFAULT 'snapshot'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t constant uuid := '98d3505c-cbe6-46ed-a95a-13672e6d98f4';
 v jsonb;v_id uuid;v_branch uuid;v_member uuid;v_name text;
 v_year int;v_month int;v_first timestamptz;
begin
 if not exists(select 1 from public.wm_tenants where id=t and is_demo) then
  raise exception 'Demo tenant unavailable';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid demo parameters';end if;
 if p_action='snapshot' then
  v:=public.wm_demo_api_base('snapshot','{}'::jsonb);
  -- Limited fictitious member projection. Never expose real auth identities to anon.
  v:=jsonb_set(v,'{members}',
   (select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'tenant_id',m.tenant_id,'branch_id',m.branch_id,
    'display_name',m.display_name,'employee_code',m.employee_code,
    'role',m.role,'status',m.status,'employment_type',m.employment_type,
    'department_id',m.department_id,'hourly_rate',m.hourly_rate,
    'hired_on',m.hired_on,'left_on',m.left_on,'skills',to_jsonb(m.skills)
    ) order by m.employee_code),'[]'::jsonb)
    from public.wm_members m where m.tenant_id=t));
  return v||jsonb_build_object(
   'departments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'tenant_id',tenant_id,'branch_id',branch_id,'name',name) order by name),'[]'::jsonb) from public.wm_departments where tenant_id=t),
   'templates',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'starts_local',starts_local,'ends_local',ends_local,'break_minutes',break_minutes) order by name),'[]'::jsonb) from public.wm_shift_templates where tenant_id=t),
   'requirements',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'branch_id',branch_id,'weekday',weekday,'starts_local',starts_local,'ends_local',ends_local,'needed',needed)),'[]'::jsonb) from public.wm_staffing_requirements where tenant_id=t),
   'notifications',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient_member_id',recipient_member_id,'title',title,'body',body,'created_at',created_at,'read_at',read_at) order by created_at desc),'[]'::jsonb) from (select * from public.wm_notifications where tenant_id=t order by created_at desc limit 200) n),
   'closures',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'year',year,'month',month,'closed_at',closed_at,'snapshot',snapshot) order by year desc,month desc),'[]'::jsonb) from public.wm_period_closures where tenant_id=t),
   'adjustments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'closure_id',closure_id,'member_id',member_id,'minutes_delta',minutes_delta,'reason',reason,'created_at',created_at)),'[]'::jsonb) from public.wm_period_adjustments where tenant_id=t),
   'corrections',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'member_id',member_id,'request_id',request_id,'corrected_start',corrected_start,'corrected_end',corrected_end)),'[]'::jsonb) from public.wm_attendance_adjustments where tenant_id=t)
  );
 elsif p_action in ('employee','shift','shift_status','clock','request','decide','availability','branch') then
  return public.wm_demo_api_base(p_action,p_data);
 elsif p_action='department' then
  v_name:=trim(coalesce(p_data->>'name',''));
  v_branch:=(p_data->>'branch_id')::uuid;
  if length(v_name) not between 1 and 80 or not exists(select 1 from public.wm_branches where id=v_branch and tenant_id=t) then raise exception 'Invalid department/branch';end if;
  if (select count(*) from public.wm_departments where tenant_id=t)>=20 then raise exception 'Demo department limit';end if;
  insert into public.wm_departments(tenant_id,branch_id,name) values(t,v_branch,v_name) returning id into v_id;
 elsif p_action='template' then
  v_name:=trim(coalesce(p_data->>'name',''));
  if length(v_name) not between 1 and 80 then raise exception '請輸入班型名稱';end if;
  if (select count(*) from public.wm_shift_templates where tenant_id=t)>=20 then raise exception 'Demo template limit';end if;
  insert into public.wm_shift_templates(tenant_id,name,starts_local,ends_local,break_minutes)
  values(t,v_name,(p_data->>'starts_local')::time,(p_data->>'ends_local')::time,
  coalesce((p_data->>'break_minutes')::int,0)) returning id into v_id;
 elsif p_action='requirement' then
  v_branch:=(p_data->>'branch_id')::uuid;
  if not exists(select 1 from public.wm_branches where id=v_branch and tenant_id=t) then raise exception 'Invalid branch';end if;
  insert into public.wm_staffing_requirements(tenant_id,branch_id,weekday,starts_local,ends_local,needed)
  values(t,v_branch,(p_data->>'weekday')::int,(p_data->>'starts_local')::time,
  (p_data->>'ends_local')::time,(p_data->>'needed')::int)
  on conflict(tenant_id,branch_id,weekday,starts_local,ends_local)
  do update set needed=excluded.needed returning id into v_id;
 elsif p_action='assign_department' then
  v_member:=(p_data->>'member_id')::uuid;
  v_id:=nullif(p_data->>'department_id','')::uuid;
  if v_id is not null and not exists(select 1 from public.wm_departments where id=v_id and tenant_id=t)
  then raise exception 'Department not in demo';end if;
  update public.wm_members set department_id=v_id where id=v_member and tenant_id=t returning id into v_member;
  if v_member is null then raise exception 'Member not in demo';end if;
  v_id:=v_member;
 elsif p_action='employee_status' then
  v_member:=(p_data->>'member_id')::uuid;
  if coalesce(p_data->>'status','') not in ('active','inactive') then raise exception 'Invalid status';end if;
  update public.wm_members set status=p_data->>'status' where id=v_member and tenant_id=t and role<>'owner' returning id into v_id;
  if v_id is null then raise exception 'Employee not found or owner cannot be disabled';end if;
 elsif p_action='branch_gps' then
  v_branch:=(p_data->>'branch_id')::uuid;
  update public.wm_branches
  set gps_required=coalesce((p_data->>'gps_required')::boolean,false),
    latitude=nullif(p_data->>'latitude','')::double precision,
    longitude=nullif(p_data->>'longitude','')::double precision,
    radius_m=coalesce((p_data->>'radius_m')::int,200)
  where id=v_branch and tenant_id=t returning id into v_id;
  if v_id is null then raise exception 'Branch not found';end if;
 elsif p_action='withdraw' then
  v_id:=(p_data->>'id')::uuid;
  update public.wm_requests set status='withdrawn',decided_at=clock_timestamp()
  where id=v_id and tenant_id=t and status='pending' returning id into v_id;
  if v_id is null then raise exception 'Only pending request can be withdrawn';end if;
  insert into public.wm_request_actions(tenant_id,request_id,action) values(t,v_id,'demo_withdrawn');
 elsif p_action='notify_read' then
  v_id:=(p_data->>'id')::uuid;
  update public.wm_notifications set read_at=clock_timestamp() where tenant_id=t and id=v_id returning id into v_id;
  if v_id is null then raise exception 'Notification unavailable';end if;
 elsif p_action='month_report' then
  v_year:=(p_data->>'year')::int;v_month:=(p_data->>'month')::int;
  return wm_private.month_report_core(t,v_year,v_month);
 elsif p_action='month_close' then
  v_year:=(p_data->>'year')::int;v_month:=(p_data->>'month')::int;
  if v_year not between 2000 and 2150 or v_month not between 1 and 12 then raise exception 'Invalid month';end if;
  v_first:=make_timestamptz(v_year,v_month,1,0,0,0,'Asia/Taipei');
  if v_first+interval '1 month'>now() then raise exception 'This month is not over';end if;
  v:=wm_private.month_report_core(t,v_year,v_month);
  insert into public.wm_period_closures(tenant_id,year,month,snapshot,closed_by)
  values(t,v_year,v_month,v,null) returning id into v_id;
 elsif p_action='period_adjustment' then
  v_id:=(p_data->>'closure_id')::uuid;v_member:=(p_data->>'member_id')::uuid;
  if not exists(select 1 from public.wm_period_closures where id=v_id and tenant_id=t)
   or not exists(select 1 from public.wm_members where id=v_member and tenant_id=t)
   or coalesce((p_data->>'minutes_delta')::int,0)=0
   or length(trim(coalesce(p_data->>'reason',''))) not between 3 and 500 then raise exception 'Invalid month correction';end if;
  insert into public.wm_period_adjustments(tenant_id,closure_id,member_id,minutes_delta,reason,adjusted_by)
  values(t,v_id,v_member,(p_data->>'minutes_delta')::int,p_data->>'reason',null) returning id into v_id;
  -- DEMO correction is separate from snapshot; don't rewrite closed data.
 elsif p_action='copy_week' then
  v_first:=(p_data->>'week_start')::timestamptz;
  if v_first<now()-interval '60 days' or v_first>now()+interval '300 days' then raise exception 'Week range unsupported';end if;
  insert into public.wm_shifts(tenant_id,member_id,branch_id,starts_at,ends_at,status,notes)
  select t,s.member_id,s.branch_id,s.starts_at+interval '7 days',s.ends_at+interval '7 days','draft',
  left('複製班表: '||s.notes,120)
  from public.wm_shifts s where s.tenant_id=t and s.status<>'cancelled'
    and s.starts_at>=v_first and s.starts_at<v_first+interval '7 days'
    and not exists(select 1 from public.wm_shifts d
      where d.tenant_id=t and d.member_id=s.member_id and d.status<>'cancelled'
      and tstzrange(d.starts_at,d.ends_at,'[)')&&tstzrange(s.starts_at+interval '7 days',s.ends_at+interval '7 days','[)'));
  return jsonb_build_object('ok',true,'action',p_action);
 else
  raise exception 'Unsupported demo action';
 end if;
 return jsonb_build_object('ok',true,'action',p_action,'id',v_id);
end $function$
