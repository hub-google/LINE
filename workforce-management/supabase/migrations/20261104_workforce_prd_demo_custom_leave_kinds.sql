CREATE OR REPLACE FUNCTION public.wm_demo_api_base(p_action text DEFAULT 'snapshot'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t constant uuid:='98d3505c-cbe6-46ed-a95a-13672e6d98f4';
  v_member uuid;
  v_branch uuid;
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_kind text;
  v_status text;
  v_key text;
  v_hours numeric;
  v_total numeric;
  v_used numeric;
  v_r public.wm_requests%rowtype;
  v_result jsonb;
begin
 if p_data is null or pg_catalog.jsonb_typeof(p_data)<>'object' then raise exception 'Invalid data'; end if;
 if p_action = 'snapshot' then
   return pg_catalog.jsonb_build_object(
     'tenant',(select pg_catalog.jsonb_build_object('id',id,'name',name,'is_demo',is_demo) from public.wm_tenants where id=t and is_demo),
     'branches',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'name',name,'gps_required',gps_required,'radius_m',radius_m,'latitude',latitude,'longitude',longitude) order by name),'[]'::jsonb) from public.wm_branches where tenant_id=t),
     'members',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'branch_id',branch_id,'display_name',display_name,'employee_code',employee_code,'role',role,'status',status,'employment_type',employment_type) order by employee_code),'[]'::jsonb) from public.wm_members where tenant_id=t),
     'shifts',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'member_id',member_id,'branch_id',branch_id,'starts_at',starts_at,'ends_at',ends_at,'status',status,'notes',notes) order by starts_at),'[]'::jsonb) from (select * from public.wm_shifts where tenant_id=t and starts_at>now()-interval '60 days' order by starts_at desc limit 600) s),
     'punches',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'member_id',member_id,'kind',kind,'punched_at',punched_at,'latitude',latitude,'longitude',longitude,'source',source) order by punched_at desc),'[]'::jsonb) from (select * from public.wm_punches where tenant_id=t order by punched_at desc limit 600) p),
     'requests',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'member_id',member_id,'kind',kind,'leave_kind',leave_kind,'starts_at',starts_at,'ends_at',ends_at,'reason',reason,'status',status,'created_at',created_at,'decided_at',decided_at,'decision_note',decision_note) order by created_at desc),'[]'::jsonb) from (select * from public.wm_requests where tenant_id=t order by created_at desc limit 300) r),
     'entitlements',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('member_id',member_id,'leave_kind',leave_kind,'year',year,'hours',hours)),'[]'::jsonb) from public.wm_leave_entitlements where tenant_id=t),
     'availability',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'member_id',member_id,'starts_at',starts_at,'ends_at',ends_at,'available',available,'note',note)),'[]'::jsonb) from (select * from public.wm_availability where tenant_id=t order by starts_at desc limit 300) a),
     'server_at',clock_timestamp()
   );
 end if;
 if not exists(select 1 from public.wm_tenants where id=t and is_demo) then raise exception 'Demo is not configured'; end if;
 if p_action='employee' then
   if (select count(*) from public.wm_members where tenant_id=t)>=40 then raise exception 'Demo employee limit reached'; end if;
   if length(trim(coalesce(p_data->>'name',''))) not between 1 and 40 or length(trim(coalesce(p_data->>'code',''))) not between 1 and 20 then raise exception 'Name/code required'; end if;
   if coalesce(p_data->>'role','employee') not in ('employee','manager') then raise exception 'Invalid role'; end if;
   v_branch:=(p_data->>'branch_id')::uuid;
   if not exists(select 1 from public.wm_branches where id=v_branch and tenant_id=t) then raise exception 'Branch not found'; end if;
   insert into public.wm_members(tenant_id,branch_id,display_name,employee_code,role,employment_type)
   values(t,v_branch,left(trim(p_data->>'name'),40),left(trim(p_data->>'code'),20),coalesce(p_data->>'role','employee'),
   case when p_data->>'employment_type'='part_time' then 'part_time' else 'full_time' end) returning id into v_id;
 elsif p_action='shift' then
   v_member:=(p_data->>'member_id')::uuid;
   v_branch:=(p_data->>'branch_id')::uuid;
   v_start:=(p_data->>'starts_at')::timestamptz;
   v_end:=(p_data->>'ends_at')::timestamptz;
   if v_end<=v_start or v_end>v_start+interval '24 hours' then raise exception 'Invalid shift interval'; end if;
   if not exists(select 1 from public.wm_members where id=v_member and tenant_id=t and status='active') then raise exception 'Employee not found'; end if;
   if not exists(select 1 from public.wm_branches where id=v_branch and tenant_id=t) then raise exception 'Branch not found'; end if;
   if exists(select 1 from public.wm_shifts where tenant_id=t and member_id=v_member and status <> 'cancelled' and tstzrange(starts_at,ends_at,'[)') && tstzrange(v_start,v_end,'[)')) then raise exception 'Shift overlaps another shift'; end if;
   if (select count(*) from public.wm_shifts where tenant_id=t)>=800 then raise exception 'Demo shift limit reached'; end if;
   insert into public.wm_shifts(tenant_id,member_id,branch_id,starts_at,ends_at,status,notes)
   values(t,v_member,v_branch,v_start,v_end,case when p_data->>'status'='draft' then 'draft' else 'published' end,left(coalesce(p_data->>'notes',''),120)) returning id into v_id;
 elsif p_action='shift_status' then
   v_id:=(p_data->>'id')::uuid;
   v_status:=p_data->>'status';
   if v_status not in ('published','cancelled') then raise exception 'Invalid status'; end if;
   update public.wm_shifts set status=v_status,updated_at=now() where id=v_id and tenant_id=t returning id into v_id;
   if v_id is null then raise exception 'Shift not found'; end if;
 elsif p_action='clock' then
   v_member:=(p_data->>'member_id')::uuid;
   v_kind:=p_data->>'kind';
   v_key:=p_data->>'key';
   if v_kind not in ('IN','OUT','BREAK_START','BREAK_END') or length(coalesce(v_key,'')) not between 8 and 120 then raise exception 'Invalid clock-in parameters'; end if;
   if not exists(select 1 from public.wm_members where id=v_member and tenant_id=t and status='active') then raise exception 'Employee not found'; end if;
   if (select count(*) from public.wm_punches where tenant_id=t)>=3000 then raise exception 'Demo punch limit reached'; end if;
   insert into public.wm_punches(tenant_id,member_id,kind,idempotency_key,source,latitude,longitude,accuracy_m)
   values(t,v_member,v_kind,v_key,'admin_demo',(p_data->>'latitude')::double precision,(p_data->>'longitude')::double precision,(p_data->>'accuracy')::double precision) on conflict(tenant_id,idempotency_key) do nothing returning id into v_id;
   if v_id is null then select id into v_id from public.wm_punches where tenant_id=t and idempotency_key=v_key; end if;
 elsif p_action='request' then
   v_member:=(p_data->>'member_id')::uuid;
   v_start:=(p_data->>'starts_at')::timestamptz;
   v_end:=(p_data->>'ends_at')::timestamptz;
   v_kind:=p_data->>'kind';
   if v_kind not in ('leave','correction','overtime','swap') or v_end<=v_start or v_end>v_start+interval '31 days' then raise exception 'Invalid request'; end if;
   if v_kind='leave' and not exists(
    select 1 from public.wm_leave_policies lp
    where lp.tenant_id=t and lp.leave_kind=p_data->>'leave_kind'
      and lp.effective_from<=(v_start at time zone 'Asia/Taipei')::date
      and lp.is_active=true
      and not exists(select 1 from public.wm_leave_policies newer
        where newer.tenant_id=t and newer.leave_kind=lp.leave_kind
          and newer.effective_from>lp.effective_from
          and newer.effective_from<=(v_start at time zone 'Asia/Taipei')::date)
  ) then raise exception 'Invalid or inactive leave type'; end if;
   if not exists(select 1 from public.wm_members where id=v_member and tenant_id=t and status='active') then raise exception 'Employee not found'; end if;
   if (select count(*) from public.wm_requests where tenant_id=t)>=800 then raise exception 'Demo request limit reached'; end if;
   insert into public.wm_requests(tenant_id,member_id,kind,leave_kind,starts_at,ends_at,reason)
   values(t,v_member,v_kind,p_data->>'leave_kind',v_start,v_end,left(coalesce(p_data->>'reason',''),500)) returning id into v_id;
   insert into public.wm_request_actions(tenant_id,request_id,action) values(t,v_id,'demo_submitted');
 elsif p_action='decide' then
   v_id:=(p_data->>'id')::uuid;
   v_status:=p_data->>'status';
   if v_status not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
   select * into v_r from public.wm_requests where id=v_id and tenant_id=t for update;
   if not found then raise exception 'Request not found'; end if;
   if v_r.status<>'pending' then raise exception 'Request already decided'; end if;
   if v_r.kind='leave' and v_status='approved' then
    select hours into v_total from public.wm_leave_entitlements where tenant_id=t and member_id=v_r.member_id and leave_kind=v_r.leave_kind and year=extract(year from v_r.starts_at at time zone 'Asia/Taipei')::int for update;
    if v_total is not null then
      select coalesce(sum(extract(epoch from (ends_at-starts_at))/3600),0) into v_used from public.wm_requests
      where tenant_id=t and member_id=v_r.member_id and kind='leave' and status='approved' and leave_kind=v_r.leave_kind and extract(year from starts_at at time zone 'Asia/Taipei')=extract(year from v_r.starts_at at time zone 'Asia/Taipei');
      if v_used + extract(epoch from (v_r.ends_at-v_r.starts_at))/3600 > v_total then raise exception 'Insufficient leave balance'; end if;
    end if;
   end if;
   update public.wm_requests set status=v_status,decided_at=clock_timestamp(),decision_note=left(coalesce(p_data->>'note',''),200) where id=v_id and tenant_id=t;
   insert into public.wm_request_actions(tenant_id,request_id,action,note) values(t,v_id,'demo_'||v_status,left(coalesce(p_data->>'note',''),200));
 elsif p_action='availability' then
   v_member:=(p_data->>'member_id')::uuid;
   v_start:=(p_data->>'starts_at')::timestamptz;
   v_end:=(p_data->>'ends_at')::timestamptz;
   if v_end<=v_start or v_end>v_start+interval '31 days' or not exists(select 1 from public.wm_members where id=v_member and tenant_id=t) then raise exception 'Invalid availability'; end if;
   insert into public.wm_availability(tenant_id,member_id,starts_at,ends_at,available,note)
   values(t,v_member,v_start,v_end,coalesce((p_data->>'available')::boolean,false),left(coalesce(p_data->>'note',''),200)) returning id into v_id;
 elsif p_action='branch' then
   if (select count(*) from public.wm_branches where tenant_id=t)>=10 then raise exception 'Demo branch limit reached'; end if;
   if length(trim(coalesce(p_data->>'name',''))) not between 1 and 60 then raise exception 'Invalid branch name'; end if;
   insert into public.wm_branches(tenant_id,name) values(t,trim(p_data->>'name')) returning id into v_id;
 else
   raise exception 'Unsupported demo action';
 end if;
 return pg_catalog.jsonb_build_object('ok',true,'id',v_id,'action',p_action,'server_at',clock_timestamp());
end $function$;
NOTIFY pgrst,'reload schema';