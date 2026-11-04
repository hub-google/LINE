
-- Workforce PRD: genuine period snapshots, audit-only corrections, time report,
-- employee request withdrawal. Scoped to wm_ objects, never touch other products.
create table if not exists public.wm_attendance_adjustments(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.wm_tenants(id),
 request_id uuid not null unique references public.wm_requests(id),
 member_id uuid not null,
 corrected_start timestamptz not null,
 corrected_end timestamptz not null,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id),
 check(corrected_end>corrected_start)
);
alter table public.wm_attendance_adjustments enable row level security;
revoke all on public.wm_attendance_adjustments from anon,authenticated;
grant select on public.wm_attendance_adjustments to authenticated;
create policy wm_adjustments_read_self on public.wm_attendance_adjustments for select to authenticated
 using(wm_private.member_visible(tenant_id,member_id));

-- An approved correction does NOT overwrite an original PunchEvent.
create or replace function wm_private.on_correction_approved()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.kind='correction' and new.status='approved' and old.status is distinct from new.status then
  insert into public.wm_attendance_adjustments(tenant_id,request_id,member_id,corrected_start,corrected_end)
  values(new.tenant_id,new.id,new.member_id,new.starts_at,new.ends_at) on conflict(request_id) do nothing;
  insert into public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
  values(new.tenant_id,new.reviewer_id,'attendance_correction_approved','request',new.id,
   jsonb_build_object('corrected_start',new.starts_at,'corrected_end',new.ends_at));
 end if;
 return new;
end $fn$;
drop trigger if exists wm_correction_approved on public.wm_requests;
create trigger wm_correction_approved after update of status on public.wm_requests
 for each row execute function wm_private.on_correction_approved();

-- Freeze source punches after any transaction, preserving immutable attestation.
create or replace function wm_private.prevent_punch_mutation()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin raise exception '原始打卡不得修改或刪除；請透過補卡／更正申請'; end $fn$;
drop trigger if exists wm_punch_immutable on public.wm_punches;
create trigger wm_punch_immutable before update or delete on public.wm_punches
 for each row execute function wm_private.prevent_punch_mutation();

create or replace function wm_private.month_report_core(p_tenant uuid,p_year int,p_month int)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_start timestamptz;v_end timestamptz;v_rows jsonb;v_count int;
begin
 if p_year not between 2000 and 2150 or p_month not between 1 and 12 then
  raise exception '年月格式不正確'; end if;
 v_start:=make_timestamptz(p_year,p_month,1,0,0,0,'Asia/Taipei');
 v_end:=v_start+interval '1 month';
 -- Consecutive punch transitions calculate observable work segments, excluding breaks.
 -- Starting an IN creates a session; incomplete or unmatched sessions produce
 -- warnings and are never automatically recorded as a full scheduled shift.
 with events as (
  select p.member_id,p.kind,p.punched_at,p.id,
    sum(case when p.kind='IN' then 1 else 0 end)
      over(partition by p.member_id order by p.punched_at,p.id) session_no
  from public.wm_punches p where p.tenant_id=p_tenant
   and p.punched_at>=v_start-interval '2 days' and p.punched_at<v_end+interval '2 days'
 ),
 linked as (
  select e.*,lead(e.kind) over(partition by member_id,session_no order by punched_at,id) next_kind,
    lead(e.punched_at) over(partition by member_id,session_no order by punched_at,id) next_at,
    min(e.punched_at) filter(where e.kind='IN')
      over(partition by member_id,session_no) first_in
  from events e
 ),
 sessions as (
  select member_id,
   round(coalesce(sum(case
    when kind in ('IN','BREAK_END') and next_kind in ('BREAK_START','OUT')
       and next_at>punched_at and next_at<=punched_at+interval '36 hours'
       then extract(epoch from next_at-punched_at) else 0 end),0)/60)::int observed_minutes,
   count(*) filter(where next_kind is null and kind in ('IN','BREAK_START','BREAK_END'))::int incomplete_count
  from linked where first_in>=v_start and first_in<v_end group by member_id
 ),
 scheduled as (
  select member_id,round(sum(extract(epoch from ends_at-starts_at))/60)::int minutes,
   count(*)::int shift_count from public.wm_shifts
   where tenant_id=p_tenant and starts_at>=v_start and starts_at<v_end and status='published'
   group by member_id
 ),
 leave_used as (
  select member_id,round(sum(extract(epoch from ends_at-starts_at))/60)::int leave_minutes
   from public.wm_requests where tenant_id=p_tenant and kind='leave'
     and status='approved' and starts_at>=v_start and starts_at<v_end group by member_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'member_id',m.id,'employee_code',m.employee_code,'name',m.display_name,
   'branch_id',m.branch_id,'scheduled_minutes',coalesce(s.minutes,0),
   'observed_minutes',coalesce(p.observed_minutes,0),
   'leave_minutes',coalesce(l.leave_minutes,0),
   'shift_count',coalesce(s.shift_count,0),
   'incomplete_count',coalesce(p.incomplete_count,0),
   'hourly_rate',m.hourly_rate,
   'estimated_cost',round(coalesce(p.observed_minutes,0)/60.0*coalesce(m.hourly_rate,0),2)
 ) order by m.employee_code),'[]'::jsonb),count(*)
 into v_rows,v_count
 from public.wm_members m
 left join sessions p on p.member_id=m.id
 left join scheduled s on s.member_id=m.id
 left join leave_used l on l.member_id=m.id
 where m.tenant_id=p_tenant;
 return jsonb_build_object('tenant_id',p_tenant,'year',p_year,'month',p_month,
   'member_count',v_count,'rows',v_rows,'calculation','observed_segments_exclude_breaks',
   'is_payroll_final',false,'generated_at',clock_timestamp());
end $fn$;

create or replace function public.wm_month_report(p_tenant uuid,p_year int,p_month int)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not wm_private.can_manage(p_tenant) then
  raise exception '沒有查看企業工時彙整的權限' using errcode='42501';end if;
 return wm_private.month_report_core(p_tenant,p_year,p_month);
end $fn$;

create or replace function public.wm_close_month(p_tenant uuid,p_year int,p_month int)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_first timestamptz;v_summary jsonb;v_id uuid;
begin
 if auth.uid() is null or not wm_private.can_manage(p_tenant) then
  raise exception '只有企業主管可以月結' using errcode='42501';end if;
 if p_year not between 2000 and 2150 or p_month not between 1 and 12 then raise exception '年月不正確';end if;
 v_first:=make_timestamptz(p_year,p_month,1,0,0,0,'Asia/Taipei');
 if v_first+interval '1 month'>now() then raise exception '該月份尚未結束，不可月結';end if;
 v_summary:=wm_private.month_report_core(p_tenant,p_year,p_month);
 insert into public.wm_period_closures(tenant_id,year,month,snapshot,closed_by)
 values(p_tenant,p_year,p_month,v_summary,auth.uid()) returning id into v_id;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 values(p_tenant,auth.uid(),'month_closed','period',v_id,
   jsonb_build_object('year',p_year,'month',p_month));
 return jsonb_build_object('id',v_id,'snapshot',v_summary);
end $fn$;

create or replace function public.wm_adjust_closed_month(p_close_id uuid,p_member_id uuid,p_minutes int,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_close public.wm_period_closures%rowtype;v_id uuid;
begin
 select * into v_close from public.wm_period_closures where id=p_close_id;
 if not found or auth.uid() is null or not wm_private.can_manage(v_close.tenant_id) then
  raise exception '沒有調整月結的權限' using errcode='42501';end if;
 if p_minutes=0 or abs(p_minutes)>43200 or length(trim(coalesce(p_reason,''))) not between 3 and 500 then
  raise exception '調整分鐘數或原因不正確';end if;
 if not exists(select 1 from public.wm_members where tenant_id=v_close.tenant_id and id=p_member_id) then raise exception '員工不存在';end if;
 insert into public.wm_period_adjustments(tenant_id,closure_id,member_id,minutes_delta,reason,adjusted_by)
 values(v_close.tenant_id,v_close.id,p_member_id,p_minutes,p_reason,auth.uid()) returning id into v_id;
 insert into public.wm_audit(tenant_id,actor_id,action,target_type,target_id,details)
 values(v_close.tenant_id,auth.uid(),'month_adjustment_added','period',v_close.id,
 jsonb_build_object('member_id',p_member_id,'minutes_delta',p_minutes,'reason',p_reason));
 return jsonb_build_object('adjustment_id',v_id,'closure_id',v_close.id);
end $fn$;

create or replace function public.wm_withdraw_request(p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_request public.wm_requests%rowtype;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into v_request from public.wm_requests where id=p_request for update;
 if not found or v_request.status<>'pending' then raise exception '只有待審申請可以撤回'; end if;
 if not exists(select 1 from public.wm_members m where m.id=v_request.member_id
   and m.tenant_id=v_request.tenant_id and m.user_id=auth.uid() and m.status='active') then
  raise exception '只有提出申請的員工可以撤回' using errcode='42501';end if;
 update public.wm_requests set status='withdrawn',decided_at=clock_timestamp() where id=p_request;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action)
 values(v_request.tenant_id,p_request,auth.uid(),'withdrawn');
 return jsonb_build_object('id',p_request,'status','withdrawn');
end $fn$;
revoke all on function public.wm_month_report(uuid,int,int) from public,anon;
revoke all on function public.wm_close_month(uuid,int,int) from public,anon;
revoke all on function public.wm_adjust_closed_month(uuid,uuid,int,text) from public,anon;
revoke all on function public.wm_withdraw_request(uuid) from public,anon;
grant execute on function public.wm_month_report(uuid,int,int),public.wm_close_month(uuid,int,int),
 public.wm_adjust_closed_month(uuid,uuid,int,text),public.wm_withdraw_request(uuid) to authenticated;
