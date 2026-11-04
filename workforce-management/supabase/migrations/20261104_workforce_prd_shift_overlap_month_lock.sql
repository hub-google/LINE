CREATE OR REPLACE FUNCTION public.wm_review_swap(p_request uuid, p_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.wm_requests%rowtype;a public.wm_shifts%rowtype;b public.wm_shifts%rowtype;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into r from public.wm_requests where id=p_request for update;
 if not found or r.kind<>'swap' or r.status<>'pending' or not wm_private.can_manage(r.tenant_id) then
  raise exception '沒有此換班申請的審核權限' using errcode='42501';end if;
 if p_approved is null then raise exception '缺少審核結果';end if;
 if p_approved then
  if r.target_accepted_at is null then raise exception '被交換員工尚未同意';end if;
  -- lock both shifts with a fixed order, preventing simultaneous exchange races
  perform 1 from public.wm_shifts where id in(r.source_shift_id,r.target_shift_id) order by id for update;
  select * into a from public.wm_shifts where id=r.source_shift_id;
  select * into b from public.wm_shifts where id=r.target_shift_id;
  if a.id is null or b.id is null or a.tenant_id<>r.tenant_id or b.tenant_id<>r.tenant_id
    or a.member_id<>r.member_id or b.member_id<>r.target_member_id
    or a.status<>'published' or b.status<>'published' then raise exception '班表已變更，請重新申請';end if;
  if exists(select 1 from public.wm_shifts x where x.tenant_id=r.tenant_id and x.id<>b.id
   and x.member_id=b.member_id and x.status<>'cancelled'
   and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(a.starts_at,a.ends_at,'[)')) or
    exists(select 1 from public.wm_shifts x where x.tenant_id=r.tenant_id and x.id<>a.id
   and x.member_id=a.member_id and x.status<>'cancelled'
   and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(b.starts_at,b.ends_at,'[)'))
  then raise exception '換班後與其他班表時間衝突';end if;
  perform set_config('wm.swap_source',a.id::text,true);
  perform set_config('wm.swap_target',b.id::text,true);
  update public.wm_shifts set member_id=b.member_id,updated_at=clock_timestamp() where id=a.id;
  update public.wm_shifts set member_id=a.member_id,updated_at=clock_timestamp() where id=b.id;
  insert into public.wm_shift_revisions(tenant_id,shift_id,old_member_id,new_member_id,reason,actor_id)
  values(r.tenant_id,a.id,a.member_id,b.member_id,'已核准換班',auth.uid()),
        (r.tenant_id,b.id,b.member_id,a.member_id,'已核准換班',auth.uid());
 end if;
 update public.wm_requests set status=case when p_approved then 'approved' else 'rejected' end,
   reviewer_id=auth.uid(),decided_at=clock_timestamp(),
   decision_note=case when p_approved then '雙方同意，班表已交換' else '主管未核准換班' end
   where id=p_request;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action)
 values(r.tenant_id,p_request,auth.uid(),case when p_approved then 'swap_approved' else 'swap_rejected' end);
 return jsonb_build_object('id',p_request,'approved',p_approved);
end $function$;

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
 v_a public.wm_shifts%rowtype;v_b public.wm_shifts%rowtype;v_req public.wm_requests%rowtype;
begin
 if not exists(select 1 from public.wm_tenants where id=t and is_demo) then
  raise exception 'Demo tenant unavailable';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid demo parameters';end if;
 if p_action='snapshot' then
  v:=public.wm_demo_api_base('snapshot','{}'::jsonb);
  v:=jsonb_set(v,'{requests}',(
   select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'member_id',r.member_id,'kind',r.kind,'leave_kind',r.leave_kind,
    'starts_at',r.starts_at,'ends_at',r.ends_at,'reason',r.reason,
    'status',r.status,'target_member_id',r.target_member_id,
    'source_shift_id',r.source_shift_id,'target_shift_id',r.target_shift_id,
    'target_accepted_at',r.target_accepted_at,
    'created_at',r.created_at,'decided_at',r.decided_at,'decision_note',r.decision_note
   ) order by r.created_at desc),'[]'::jsonb)
   from (select * from public.wm_requests where tenant_id=t order by created_at desc limit 300) r));
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
 
 elsif p_action='swap_create' then
   v_a.id:=(p_data->>'source_shift_id')::uuid;
   v_b.id:=(p_data->>'target_shift_id')::uuid;
   if v_a.id=v_b.id then raise exception 'Cannot swap the same shift';end if;
   select * into v_a from public.wm_shifts where tenant_id=t and id=v_a.id and status='published' for update;
   select * into v_b from public.wm_shifts where tenant_id=t and id=v_b.id and status='published' for update;
   if v_a.id is null or v_b.id is null or v_a.member_id=v_b.member_id then raise exception 'Select two published shifts for different members';end if;
   if exists(select 1 from public.wm_requests r where r.tenant_id=t and r.source_shift_id=v_a.id and r.status='pending') then raise exception 'This shift already has a pending swap';end if;
   insert into public.wm_requests(tenant_id,member_id,kind,starts_at,ends_at,reason,target_member_id,source_shift_id,target_shift_id)
   values(t,v_a.member_id,'swap',v_a.starts_at,v_a.ends_at,left(coalesce(p_data->>'reason',''),500),v_b.member_id,v_a.id,v_b.id)
   returning id into v_id;
   insert into public.wm_request_actions(tenant_id,request_id,action) values(t,v_id,'demo_swap_submitted');
 elsif p_action='swap_accept' then
   v_id:=(p_data->>'id')::uuid;
   select * into v_req from public.wm_requests where id=v_id and tenant_id=t and kind='swap' and status='pending' for update;
   if v_req.id is null then raise exception 'Swap request unavailable';end if;
   if coalesce((p_data->>'accepted')::boolean,false) then
    update public.wm_requests set target_accepted_at=clock_timestamp() where id=v_id;
   else
    update public.wm_requests set status='rejected',decision_note='對方拒絕換班',decided_at=clock_timestamp() where id=v_id;
   end if;
 elsif p_action='swap_review' then
   v_id:=(p_data->>'id')::uuid;
   select * into v_req from public.wm_requests where id=v_id and tenant_id=t and kind='swap' and status='pending' for update;
   if v_req.id is null then raise exception 'Swap request unavailable';end if;
   if coalesce((p_data->>'approved')::boolean,false) then
    if v_req.target_accepted_at is null then raise exception 'Other employee has not accepted';end if;
    perform 1 from public.wm_shifts where id in(v_req.source_shift_id,v_req.target_shift_id) order by id for update;
    select * into v_a from public.wm_shifts where id=v_req.source_shift_id and tenant_id=t;
    select * into v_b from public.wm_shifts where id=v_req.target_shift_id and tenant_id=t;
    if v_a.id is null or v_b.id is null or v_a.status<>'published' or v_b.status<>'published'
       or v_a.member_id<>v_req.member_id or v_b.member_id<>v_req.target_member_id then raise exception 'Shift assignments changed';end if;
    if exists(select 1 from public.wm_shifts x where x.tenant_id=t and x.id<>v_b.id
     and x.member_id=v_b.member_id and x.status<>'cancelled'
     and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(v_a.starts_at,v_a.ends_at,'[)')) or
     exists(select 1 from public.wm_shifts x where x.tenant_id=t and x.id<>v_a.id
     and x.member_id=v_a.member_id and x.status<>'cancelled'
     and tstzrange(x.starts_at,x.ends_at,'[)')&&tstzrange(v_b.starts_at,v_b.ends_at,'[)')) then raise exception 'Swap creates shift overlap';end if;
    perform set_config('wm.swap_source',v_a.id::text,true);
    perform set_config('wm.swap_target',v_b.id::text,true);
    update public.wm_shifts set member_id=v_b.member_id,updated_at=clock_timestamp() where id=v_a.id;
    update public.wm_shifts set member_id=v_a.member_id,updated_at=clock_timestamp() where id=v_b.id;
    insert into public.wm_shift_revisions(tenant_id,shift_id,old_member_id,new_member_id,reason)
    values(t,v_a.id,v_a.member_id,v_b.member_id,'Demo 換班已核准'),
          (t,v_b.id,v_b.member_id,v_a.member_id,'Demo 換班已核准');
   end if;
   update public.wm_requests set status=case when coalesce((p_data->>'approved')::boolean,false) then 'approved' else 'rejected' end,
    decided_at=clock_timestamp(),decision_note='Demo 主管審核' where id=v_id;
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
end $function$;


create or replace function wm_private.guard_shift_overlap()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_source text:=current_setting('wm.swap_source',true);v_target text:=current_setting('wm.swap_target',true);
begin
 if new.status='cancelled' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.member_id::text,815));
 if exists(select 1 from public.wm_shifts s
  where s.tenant_id=new.tenant_id and s.member_id=new.member_id
   and s.status<>'cancelled' and s.id is distinct from new.id
   and tstzrange(s.starts_at,s.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)')
   and not (v_source is not null and v_target is not null
      and new.id::text in (v_source,v_target) and s.id::text in (v_source,v_target))
 ) then raise exception '員工已有重疊班別，不可重複排班';end if;
 return new;
end $fn$;
drop trigger if exists wm_no_overlapping_shifts on public.wm_shifts;
create trigger wm_no_overlapping_shifts before insert or update of member_id,starts_at,ends_at,status
 on public.wm_shifts for each row execute function wm_private.guard_shift_overlap();

create or replace function wm_private.guard_closed_shift_period()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_tenant uuid;v_date timestamptz;
begin
 if tg_op='DELETE' then v_tenant:=old.tenant_id;v_date:=old.starts_at;
 else v_tenant:=new.tenant_id;v_date:=new.starts_at;end if;
 if exists(select 1 from public.wm_period_closures c where c.tenant_id=v_tenant
  and c.year=extract(year from v_date at time zone 'Asia/Taipei')::int
  and c.month=extract(month from v_date at time zone 'Asia/Taipei')::int)
 then raise exception '此月份已月結，請用更正單追溯調整';end if;
 if tg_op='UPDATE' and old.starts_at is distinct from new.starts_at and exists(
  select 1 from public.wm_period_closures c where c.tenant_id=old.tenant_id
   and c.year=extract(year from old.starts_at at time zone 'Asia/Taipei')::int
   and c.month=extract(month from old.starts_at at time zone 'Asia/Taipei')::int)
 then raise exception '不可從已月結的月份移出班次'; end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $fn$;
drop trigger if exists wm_closed_shift_period_guard on public.wm_shifts;
create trigger wm_closed_shift_period_guard before insert or update or delete on public.wm_shifts
 for each row execute function wm_private.guard_closed_shift_period();
notify pgrst,'reload schema';
