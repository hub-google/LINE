
-- LINE Workforce schema v1, isolated from existing LINE SaaS tables.
create extension if not exists pgcrypto;
create schema if not exists wm_private;

create table if not exists public.wm_tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 120),
 is_demo boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.wm_branches (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.wm_tenants(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 latitude double precision,
 longitude double precision,
 radius_m integer not null default 200 check (radius_m between 30 and 5000),
 gps_required boolean not null default false,
 created_at timestamptz not null default now(),
 unique (tenant_id,id),
 unique (tenant_id,name)
);
create table if not exists public.wm_members (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.wm_tenants(id) on delete cascade,
 branch_id uuid,
 user_id uuid references auth.users(id) on delete set null,
 display_name text not null check(length(trim(display_name)) between 1 and 100),
 employee_code text not null check(length(trim(employee_code)) between 1 and 40),
 role text not null default 'employee' check(role in ('owner','hr','manager','employee')),
 employment_type text not null default 'full_time' check(employment_type in ('full_time','part_time','hourly')),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(),
 unique (tenant_id,id),
 unique (tenant_id,employee_code),
 foreign key(tenant_id,branch_id) references public.wm_branches(tenant_id,id)
);
create unique index if not exists wm_members_one_user_per_tenant on public.wm_members(tenant_id,user_id) where user_id is not null;
create table if not exists public.wm_shifts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 member_id uuid not null,
 branch_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','published','cancelled')),
 notes text not null default '',
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at + interval '48 hours'),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id),
 foreign key(tenant_id,branch_id) references public.wm_branches(tenant_id,id)
);
create table if not exists public.wm_availability (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 member_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 available boolean not null default false,
 note text not null default '',
 created_at timestamptz not null default now(),
 check(ends_at>starts_at),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id)
);
create table if not exists public.wm_punches (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 member_id uuid not null,
 kind text not null check(kind in ('IN','OUT','BREAK_START','BREAK_END')),
 punched_at timestamptz not null default clock_timestamp(),
 latitude double precision,
 longitude double precision,
 accuracy_m double precision,
 source text not null default 'web' check(source in ('web','liff','qr','admin_demo')),
 actor_id uuid not null references auth.users(id),
 idempotency_key text not null check(length(idempotency_key) between 8 and 120),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id),
 unique(tenant_id,actor_id,idempotency_key)
);
create table if not exists public.wm_requests (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 member_id uuid not null,
 kind text not null check(kind in ('leave','correction','overtime','swap')),
 leave_kind text,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 reason text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 target_member_id uuid,
 reviewer_id uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 decision_note text,
 created_at timestamptz not null default now(),
 check(ends_at > starts_at),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id),
 foreign key(tenant_id,target_member_id) references public.wm_members(tenant_id,id)
);
create table if not exists public.wm_request_actions (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.wm_tenants(id),
 request_id uuid not null references public.wm_requests(id),
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 note text,
 at timestamptz not null default now()
);
create table if not exists public.wm_leave_entitlements (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 member_id uuid not null,
 year integer not null check(year between 2000 and 2150),
 leave_kind text not null,
 hours numeric(8,2) not null default 0 check(hours>=0),
 foreign key(tenant_id,member_id) references public.wm_members(tenant_id,id),
 unique(tenant_id,member_id,year,leave_kind)
);
create table if not exists public.wm_audit (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.wm_tenants(id),
 actor_id uuid references auth.users(id) on delete set null,
 action text not null,
 target_type text not null,
 target_id uuid,
 details jsonb not null default '{}'::jsonb,
 at timestamptz not null default now()
);
create index if not exists wm_shifts_by_member_date on public.wm_shifts(tenant_id,member_id,starts_at);
create index if not exists wm_punches_by_member_date on public.wm_punches(tenant_id,member_id,punched_at desc);
create index if not exists wm_requests_by_tenant_status on public.wm_requests(tenant_id,status,created_at desc);
create index if not exists wm_members_tenant on public.wm_members(tenant_id,status);
create index if not exists wm_audit_tenant_date on public.wm_audit(tenant_id,at desc);

create or replace function wm_private.my_role(p_tenant uuid) returns text
language sql stable security definer set search_path = '' as $$
 select m.role from public.wm_members m where m.tenant_id=p_tenant and m.user_id=(select auth.uid()) and m.status='active' limit 1;
$$;
create or replace function wm_private.can_manage(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(wm_private.my_role(p_tenant) in ('owner','hr','manager'),false);
$$;
create or replace function wm_private.is_owner(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(wm_private.my_role(p_tenant)='owner',false);
$$;
create or replace function wm_private.member_visible(p_tenant uuid,p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select wm_private.can_manage(p_tenant) or exists(select 1 from public.wm_members m where m.id=p_member and m.tenant_id=p_tenant and m.user_id=(select auth.uid()) and m.status='active');
$$;
revoke all on schema wm_private from public;
grant usage on schema wm_private to authenticated;
revoke all on all functions in schema wm_private from public;
grant execute on all functions in schema wm_private to authenticated;

create or replace function wm_private.bootstrap_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.created_by is not null then
  insert into public.wm_branches(tenant_id,name) values(new.id,'總店');
  insert into public.wm_members(tenant_id,branch_id,user_id,display_name,employee_code,role)
  values(new.id,(select id from public.wm_branches where tenant_id=new.id limit 1),new.created_by,'企業擁有者','OWNER','owner');
 end if;
 return new;
end $$;
drop trigger if exists wm_tenant_bootstrap on public.wm_tenants;
create trigger wm_tenant_bootstrap after insert on public.wm_tenants for each row execute function wm_private.bootstrap_owner();

-- Enable row-level security without allowing unrelated application data through.
alter table public.wm_tenants enable row level security;
alter table public.wm_branches enable row level security;
alter table public.wm_members enable row level security;
alter table public.wm_shifts enable row level security;
alter table public.wm_availability enable row level security;
alter table public.wm_punches enable row level security;
alter table public.wm_requests enable row level security;
alter table public.wm_request_actions enable row level security;
alter table public.wm_leave_entitlements enable row level security;
alter table public.wm_audit enable row level security;

create policy wm_tenant_read on public.wm_tenants for select to authenticated using (wm_private.my_role(id) is not null);
create policy wm_tenant_create on public.wm_tenants for insert to authenticated with check (created_by=(select auth.uid()) and is_demo=false and coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false);
create policy wm_tenant_update on public.wm_tenants for update to authenticated using(wm_private.is_owner(id)) with check(wm_private.is_owner(id));
create policy wm_branch_read on public.wm_branches for select to authenticated using(wm_private.my_role(tenant_id) is not null);
create policy wm_branch_create on public.wm_branches for insert to authenticated with check(wm_private.can_manage(tenant_id));
create policy wm_branch_update on public.wm_branches for update to authenticated using(wm_private.can_manage(tenant_id)) with check(wm_private.can_manage(tenant_id));
create policy wm_member_read on public.wm_members for select to authenticated using(wm_private.member_visible(tenant_id,id));
create policy wm_member_create on public.wm_members for insert to authenticated with check(wm_private.is_owner(tenant_id) and role in ('employee','manager','hr'));
create policy wm_member_update on public.wm_members for update to authenticated using(wm_private.is_owner(tenant_id)) with check(wm_private.is_owner(tenant_id));
create policy wm_shift_read on public.wm_shifts for select to authenticated using(wm_private.member_visible(tenant_id,member_id));
create policy wm_shift_create on public.wm_shifts for insert to authenticated with check(wm_private.can_manage(tenant_id) and created_by=(select auth.uid()));
create policy wm_shift_update on public.wm_shifts for update to authenticated using(wm_private.can_manage(tenant_id)) with check(wm_private.can_manage(tenant_id));
create policy wm_shift_delete on public.wm_shifts for delete to authenticated using(wm_private.can_manage(tenant_id) and status='draft');
create policy wm_availability_read on public.wm_availability for select to authenticated using(wm_private.member_visible(tenant_id,member_id));
create policy wm_availability_create on public.wm_availability for insert to authenticated with check(
 exists(select 1 from public.wm_members m where m.id=member_id and m.user_id=(select auth.uid()) and m.tenant_id=wm_availability.tenant_id)
 or (wm_private.is_owner(tenant_id) and exists(select 1 from public.wm_tenants t where t.id=tenant_id and t.is_demo))
);
create policy wm_availability_delete on public.wm_availability for delete to authenticated using(
 exists(select 1 from public.wm_members m where m.id=member_id and m.user_id=(select auth.uid()) and m.tenant_id=wm_availability.tenant_id)
 or wm_private.can_manage(tenant_id)
);
create policy wm_punch_read on public.wm_punches for select to authenticated using(wm_private.member_visible(tenant_id,member_id));
create policy wm_request_read on public.wm_requests for select to authenticated using(wm_private.member_visible(tenant_id,member_id));
create policy wm_actions_read on public.wm_request_actions for select to authenticated using(
 exists(select 1 from public.wm_requests r where r.id=request_id and r.tenant_id=wm_request_actions.tenant_id and wm_private.member_visible(r.tenant_id,r.member_id))
);
create policy wm_entitlement_read on public.wm_leave_entitlements for select to authenticated using(wm_private.member_visible(tenant_id,member_id));
create policy wm_entitlement_write on public.wm_leave_entitlements for insert to authenticated with check(wm_private.can_manage(tenant_id));
create policy wm_entitlement_update on public.wm_leave_entitlements for update to authenticated using(wm_private.can_manage(tenant_id)) with check(wm_private.can_manage(tenant_id));
create policy wm_audit_read on public.wm_audit for select to authenticated using(wm_private.can_manage(tenant_id));

-- Direct writes to immutable attendance/requests/audit tables are blocked at RLS and permission levels.
revoke all on public.wm_punches,public.wm_requests,public.wm_request_actions,public.wm_audit from anon,authenticated;
grant select on public.wm_punches,public.wm_requests,public.wm_request_actions,public.wm_audit to authenticated;
grant select,insert,update on public.wm_tenants,public.wm_branches,public.wm_members,public.wm_shifts,public.wm_leave_entitlements to authenticated;
grant select,insert,delete on public.wm_availability to authenticated;

-- Attest real clock time on the database server, not device supplied time.
create or replace function public.wm_clock(p_member uuid,p_kind text,p_key text,p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null)
returns public.wm_punches language plpgsql security definer set search_path = '' as $$
declare v_member public.wm_members%rowtype; v_branch public.wm_branches%rowtype; v_demo boolean; v_row public.wm_punches%rowtype; v_actor uuid:=auth.uid(); v_distance double precision;
begin
 if v_actor is null then raise exception '請先登入'; end if;
 if p_kind not in ('IN','OUT','BREAK_START','BREAK_END') or length(coalesce(p_key,'')) not between 8 and 120 then raise exception '打卡參數不正確'; end if;
 select * into v_member from public.wm_members where id=p_member and status='active';
 if not found then raise exception '員工不存在或已停用'; end if;
 select is_demo into v_demo from public.wm_tenants where id=v_member.tenant_id;
 if v_member.user_id is distinct from v_actor and not (v_demo and wm_private.is_owner(v_member.tenant_id)) then raise exception '僅能為本人打卡'; end if;
 select * into v_branch from public.wm_branches where id=v_member.branch_id and tenant_id=v_member.tenant_id;
 if v_branch.gps_required then
  if p_lat is null or p_lng is null or v_branch.latitude is null or v_branch.longitude is null then raise exception '此據點須授權定位後打卡'; end if;
  v_distance:=6371000 * 2 * asin(sqrt(least(1,power(sin(radians(p_lat-v_branch.latitude)/2),2)+cos(radians(v_branch.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_branch.longitude)/2),2))));
  if v_distance > v_branch.radius_m + greatest(coalesce(p_accuracy,0),0) then raise exception '不在允許的打卡範圍內'; end if;
 end if;
 insert into public.wm_punches(tenant_id,member_id,kind,latitude,longitude,accuracy_m,source,actor_id,idempotency_key)
 values(v_member.tenant_id,p_member,p_kind,p_lat,p_lng,p_accuracy,case when v_demo and v_member.user_id is distinct from v_actor then 'admin_demo' else 'web' end,v_actor,p_key)
 on conflict(tenant_id,actor_id,idempotency_key) do nothing
 returning * into v_row;
 if v_row.id is null then
  select * into v_row from public.wm_punches where tenant_id=v_member.tenant_id and actor_id=v_actor and idempotency_key=p_key;
 end if;
 return v_row;
end $$;

create or replace function public.wm_submit_request(p_member uuid,p_kind text,p_start timestamptz,p_end timestamptz,p_reason text default '',p_leave_kind text default null,p_target_member uuid default null)
returns public.wm_requests language plpgsql security definer set search_path = '' as $$
declare v_member public.wm_members%rowtype; v_demo boolean; v_row public.wm_requests%rowtype; v_actor uuid:=auth.uid();
begin
 if v_actor is null then raise exception '請先登入'; end if;
 if p_kind not in ('leave','correction','overtime','swap') or p_end<=p_start or p_end>p_start+interval '31 days' then raise exception '申請類型或期間不正確'; end if;
 if p_kind='leave' and coalesce(p_leave_kind,'')='' then raise exception '請選擇假別'; end if;
 select * into v_member from public.wm_members where id=p_member and status='active';
 if not found then raise exception '員工不存在'; end if;
 select is_demo into v_demo from public.wm_tenants where id=v_member.tenant_id;
 if v_member.user_id is distinct from v_actor and not (v_demo and wm_private.is_owner(v_member.tenant_id)) then raise exception '不可替其他員工送件'; end if;
 if p_target_member is not null and not exists(select 1 from public.wm_members where id=p_target_member and tenant_id=v_member.tenant_id) then raise exception '換班對象不在同企業'; end if;
 insert into public.wm_requests(tenant_id,member_id,kind,leave_kind,starts_at,ends_at,reason,target_member_id)
 values(v_member.tenant_id,p_member,p_kind,p_leave_kind,p_start,p_end,left(coalesce(p_reason,''),1000),p_target_member) returning * into v_row;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action,note) values(v_member.tenant_id,v_row.id,v_actor,'submitted',null);
 return v_row;
end $$;

create or replace function public.wm_decide_request(p_request uuid,p_decision text,p_note text default '')
returns public.wm_requests language plpgsql security definer set search_path = '' as $$
declare v_row public.wm_requests%rowtype; v_actor uuid:=auth.uid(); v_total numeric; v_used numeric; v_need numeric;
begin
 if v_actor is null or p_decision not in ('approved','rejected') then raise exception '審核資料不正確'; end if;
 select * into v_row from public.wm_requests where id=p_request for update;
 if not found or not wm_private.can_manage(v_row.tenant_id) then raise exception '沒有審核權限'; end if;
 if v_row.status<>'pending' then raise exception '這筆申請已處理，不能重複審核'; end if;
 if v_row.kind='leave' and p_decision='approved' then
  select hours into v_total from public.wm_leave_entitlements where tenant_id=v_row.tenant_id and member_id=v_row.member_id and year=extract(year from v_row.starts_at at time zone 'Asia/Taipei')::int and leave_kind=v_row.leave_kind for update;
  select coalesce(sum(extract(epoch from (ends_at-starts_at))/3600),0) into v_used from public.wm_requests
   where tenant_id=v_row.tenant_id and member_id=v_row.member_id and kind='leave' and leave_kind=v_row.leave_kind and status='approved' and extract(year from starts_at at time zone 'Asia/Taipei')=extract(year from v_row.starts_at at time zone 'Asia/Taipei');
  v_need:=extract(epoch from (v_row.ends_at-v_row.starts_at))/3600;
  if v_total is not null and v_used+v_need>v_total then raise exception '假別可用時數不足'; end if;
 end if;
 update public.wm_requests set status=p_decision,reviewer_id=v_actor,decided_at=clock_timestamp(),decision_note=left(coalesce(p_note,''),500) where id=p_request returning * into v_row;
 insert into public.wm_request_actions(tenant_id,request_id,actor_id,action,note) values(v_row.tenant_id,v_row.id,v_actor,p_decision,p_note);
 return v_row;
end $$;

-- RPCs are exposed intentionally but always verify auth.uid(), ownership and membership.
revoke all on function public.wm_clock(uuid,text,text,double precision,double precision,double precision) from public,anon;
revoke all on function public.wm_submit_request(uuid,text,timestamptz,timestamptz,text,text,uuid) from public,anon;
revoke all on function public.wm_decide_request(uuid,text,text) from public,anon;
grant execute on function public.wm_clock(uuid,text,text,double precision,double precision,double precision) to authenticated;
grant execute on function public.wm_submit_request(uuid,text,timestamptz,timestamptz,text,text,uuid) to authenticated;
grant execute on function public.wm_decide_request(uuid,text,text) to authenticated;
