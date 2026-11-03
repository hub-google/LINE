-- Live schema applied in Supabase project unapiwajmgqqtdkixaab on 2026-11-03.
-- Snapshot committed to Git for environment reproducibility. Safe to reapply.
-- All real operational/QA tables use so_ prefix; no simulated customer rows inserted.

alter table public.so_tenants
 add column if not exists directory_enabled boolean not null default false,
 add column if not exists oa_mode text not null default 'PLATFORM';
do $check$ begin
 if not exists (select 1 from pg_constraint where conname='so_tenants_oa_mode_check'
 and conrelid='public.so_tenants'::regclass) then
  alter table public.so_tenants add constraint so_tenants_oa_mode_check
  check (oa_mode in ('PLATFORM','OWN'));
 end if;
end $check$;

create table if not exists public.so_merchant_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 name text not null, slug text not null,
 phone text, address text,
 requested_oa_mode text not null default 'PLATFORM'
    check (requested_oa_mode in ('PLATFORM','OWN')),
 status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create index if not exists so_merchant_requests_user_idx on public.so_merchant_requests(user_id,created_at desc);
create index if not exists so_merchant_requests_status_idx on public.so_merchant_requests(status,created_at desc);
alter table public.so_merchant_requests enable row level security;
revoke all on public.so_merchant_requests from public,anon,authenticated;

-- so_my_merchant_activity
CREATE OR REPLACE FUNCTION public.so_my_merchant_activity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with linked_users as (
    select ll.tenant_id,ll.user_id
    from public.so_line_links ll
    where ll.user_id=auth.uid()
       or ll.line_sub in (
         select source.line_sub from public.so_line_links source
         where source.user_id=auth.uid()
       )
  ), mine as (
    select t.slug,t.name,t.modules,
      (select count(*) from public.so_reservations r
       where r.tenant_id=t.id and r.booking_date >= (now() at time zone 'Asia/Taipei')::date-30
         and (r.user_id=auth.uid() or exists(
           select 1 from linked_users u where u.tenant_id=t.id and u.user_id=r.user_id
         ))) as booking_count,
      (select count(*) from public.so_tickets k
       where k.tenant_id=t.id and k.business_date >= (now() at time zone 'Asia/Taipei')::date-2
         and (k.user_id=auth.uid() or exists(
           select 1 from linked_users u where u.tenant_id=t.id and u.user_id=k.user_id
         ))) as ticket_count
    from public.so_tenants t
    where t.status='ACTIVE'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'name',name,'booking_count',booking_count,
    'ticket_count',ticket_count,'modules',modules
  ) order by name),'[]'::jsonb)
  from mine
  where booking_count > 0 or ticket_count > 0;
$function$;

-- so_my_merchant_requests
CREATE OR REPLACE FUNCTION public.so_my_merchant_requests()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select coalesce(jsonb_agg(jsonb_build_object(
  'name',r.name,'slug',r.slug,'status',r.status,
  'requested_oa_mode',r.requested_oa_mode,'created_at',r.created_at
) order by r.created_at desc),'[]'::jsonb)
from public.so_merchant_requests r
where r.user_id=auth.uid();
$function$;

-- so_pending_merchant_requests
CREATE OR REPLACE FUNCTION public.so_pending_merchant_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not private.so_platform() then
   raise exception '只有總公司管理員可以檢視申請' using errcode='42501';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'name',r.name,'slug',r.slug,'phone',r.phone,'address',r.address,
   'requested_oa_mode',r.requested_oa_mode,'email',u.email,'created_at',r.created_at
  ) order by r.created_at)
  from public.so_merchant_requests r
  join auth.users u on u.id=r.user_id
  where r.status='PENDING'
 ),'[]'::jsonb);
end;
$function$;

-- so_public_directory
CREATE OR REPLACE FUNCTION public.so_public_directory(p_query text DEFAULT NULL::text, p_mode text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug',q.slug,'name',q.name,'description',q.description,
      'address',q.address,'logo_url',q.logo_url,
      'modules',q.modules,'oa_mode',q.oa_mode
    ) order by q.name), '[]'::jsonb)
  from (
    select t.slug,t.name,t.description,t.address,t.logo_url,t.modules,t.oa_mode
    from public.so_tenants t
    where t.status='ACTIVE' and t.directory_enabled = true
      and t.slug not like 'qa-%'
      and t.slug not in ('greenfield-salon','demo-clinic')
      and (
        nullif(trim(p_query),'') is null
        or t.name ilike '%'||left(trim(p_query),80)||'%'
        or coalesce(t.address,'') ilike '%'||left(trim(p_query),80)||'%'
      )
      and (
        p_mode is null or p_mode='all'
        or (p_mode='queue' and coalesce((t.modules->>'queue')::boolean,false))
        or (p_mode='reserve' and coalesce((t.modules->>'reservation')::boolean,false))
      )
    order by t.name
    limit 100
  ) q;
$function$;

-- so_request_merchant
CREATE OR REPLACE FUNCTION public.so_request_merchant(p_name text, p_slug text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_requested_oa_mode text DEFAULT 'PLATFORM'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user auth.users%rowtype; v_new public.so_merchant_requests%rowtype;
begin
 if auth.uid() is null then raise exception '請先註冊並驗證電子郵件'; end if;
 select * into v_user from auth.users where id=auth.uid();
 if not found or v_user.email_confirmed_at is null or
    coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '請使用已驗證 Email 的正式帳號申請';
 end if;
 if char_length(trim(coalesce(p_name,'')))<2 or
    p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception '請填寫正確店名及英文代碼（3–40 字元）';
 end if;
 if p_requested_oa_mode not in ('PLATFORM','OWN') then
    raise exception '請選擇正確的 LINE OA 模式';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('so_request:'||auth.uid()::text,0));
 if (select count(*) from public.so_merchant_requests where user_id=auth.uid() and status='PENDING')>=3 then
    raise exception '每個帳號最多保留三筆待審核申請';
 end if;
 if exists(select 1 from public.so_tenants where slug=p_slug)
    or exists(select 1 from public.so_merchant_requests where slug=p_slug and status in ('PENDING','APPROVED')) then
    raise exception '此英文代碼已被使用，請更換';
 end if;
 insert into public.so_merchant_requests(user_id,name,slug,phone,address,requested_oa_mode)
 values(auth.uid(),left(trim(p_name),120),p_slug,
        nullif(left(trim(coalesce(p_phone,'')),50),''),
        nullif(left(trim(coalesce(p_address,'')),240),''),
        p_requested_oa_mode)
 returning * into v_new;
 return jsonb_build_object('id',v_new.id,'status',v_new.status,'slug',v_new.slug);
end;
$function$;

-- so_review_merchant_request
CREATE OR REPLACE FUNCTION public.so_review_merchant_request(p_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_merchant_requests%rowtype;
 declare_tenant public.so_tenants%rowtype;
begin
 if auth.uid() is null or not private.so_platform() then
   raise exception '只有總公司管理員可以審核' using errcode='42501';
 end if;
 select * into r from public.so_merchant_requests where id=p_id for update;
 if not found or r.status<>'PENDING' then raise exception '申請不存在或已處理'; end if;
 if p_approve then
   if exists(select 1 from public.so_tenants where slug=r.slug) then
     raise exception '店家代碼已被使用，請聯絡申請者更換';
   end if;
   insert into public.so_tenants(name,slug,phone,address,modules,created_by,oa_mode,directory_enabled)
   values (r.name,r.slug,r.phone,r.address,
     '{"reservation":true,"queue":true,"calling":true,"line_notice":true}'::jsonb,
     r.user_id,'PLATFORM',false)
   returning * into declare_tenant;
   insert into public.so_members(tenant_id,user_id,role)
   values(declare_tenant.id,r.user_id,'OWNER');
 end if;
 update public.so_merchant_requests
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
 reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_id;
 return jsonb_build_object('status',case when p_approve then 'APPROVED' else 'REJECTED' end,
 'slug',r.slug);
end;
$function$;

-- so_set_directory_listing
CREATE OR REPLACE FUNCTION public.so_set_directory_listing(p_slug text, p_enabled boolean, p_oa_mode text DEFAULT 'PLATFORM'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_t public.so_tenants%rowtype;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 if p_oa_mode not in ('PLATFORM','OWN') then raise exception '無效的 LINE OA 模式'; end if;
 select * into v_t from public.so_tenants where slug=p_slug;
 if not found then raise exception '店家不存在'; end if;
 if not private.so_platform() and not exists(
   select 1 from public.so_members m
   where m.tenant_id=v_t.id and m.user_id=auth.uid() and m.role in ('OWNER','MANAGER')
 ) then raise exception '只有店家管理員可修改公開資訊' using errcode='42501'; end if;
 if p_oa_mode='OWN' then
   raise exception '自有 LINE OA 串接尚未開放，請先使用總公司共用 OA';
 end if;
 update public.so_tenants
 set directory_enabled=p_enabled, oa_mode=p_oa_mode, updated_at=now()
 where id=v_t.id returning * into v_t;
 insert into public.so_audit(tenant_id,actor,action)
 values(v_t.id,auth.uid(),'set_directory_listing');
 return jsonb_build_object('slug',v_t.slug,'enabled',v_t.directory_enabled,'oa_mode',v_t.oa_mode);
end;
$function$;

-- so_staff_state
CREATE OR REPLACE FUNCTION public.so_staff_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);v_role text;
begin
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到企業';end if;
 v_role:=private.so_role(t.id);
 if v_role is null and not private.so_platform() then raise exception '沒有企業後台權限' using errcode='42501';end if;
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.customer_name,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$;

revoke all on function public.so_public_directory(text,text) from public;
grant execute on function public.so_public_directory(text,text) to anon,authenticated;
revoke all on function public.so_my_merchant_activity() from public;
grant execute on function public.so_my_merchant_activity() to authenticated;
revoke all on function public.so_set_directory_listing(text,boolean,text) from public;
grant execute on function public.so_set_directory_listing(text,boolean,text) to authenticated;
revoke all on function public.so_request_merchant(text,text,text,text,text) from public;
grant execute on function public.so_request_merchant(text,text,text,text,text) to authenticated;
revoke all on function public.so_my_merchant_requests() from public;
grant execute on function public.so_my_merchant_requests() to authenticated;
revoke all on function public.so_pending_merchant_requests() from public;
grant execute on function public.so_pending_merchant_requests() to authenticated;
revoke all on function public.so_review_merchant_request(uuid,boolean) from public;
grant execute on function public.so_review_merchant_request(uuid,boolean) to authenticated;
