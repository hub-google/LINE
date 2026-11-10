-- Platform-wide LINE identity: users must log in before choosing a store.
-- Only line-bridge, after LINE token verification, may write this table.
create table if not exists public.so_platform_line_identities (
 user_id uuid primary key references auth.users(id) on delete cascade,
 line_sub text not null check (line_sub ~ '^U[0-9a-fA-F]{32}$'),
 display_name text not null check (length(btrim(display_name)) between 1 and 60),
 login_channel_id text not null check (login_channel_id ~ '^[0-9]{8,}$'),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.so_platform_line_identities enable row level security;
revoke all on public.so_platform_line_identities from public, anon, authenticated;
grant select,insert,update,delete on public.so_platform_line_identities to service_role;
create index if not exists so_platform_line_identities_subject_idx on public.so_platform_line_identities(line_sub);

create or replace function public.so_site_header_identity()
returns jsonb language sql stable security definer set search_path to ''
as $function$
 select coalesce(
   (select jsonb_build_object('display_name',left(trim(p.display_name),80),'source','LINE')
    from public.so_platform_line_identities p
    where p.user_id=(select auth.uid())
      and (select auth.uid()) is not null
      and p.updated_at between (now()-interval '30 days') and (now()+interval '1 minute')
      and length(trim(p.display_name))>0
      and p.login_channel_id ~ '^[0-9]{8,}$'
    order by p.updated_at desc limit 1),
   (select jsonb_build_object('display_name',left(trim(l.display_name),80),'source','LINE')
    from public.so_line_links l
    join public.so_tenants t on t.id=l.tenant_id
    where l.user_id=(select auth.uid())
      and (select auth.uid()) is not null and t.status='ACTIVE'
      and length(trim(coalesce(l.display_name,'')))>0
      and nullif(l.login_channel_id,'') is not null
      and l.updated_at between (now()-interval '30 days') and (now()+interval '1 minute')
    order by l.updated_at desc,l.tenant_id limit 1),
   'null'::jsonb);
$function$;
revoke all on function public.so_site_header_identity() from public,anon,authenticated;
grant execute on function public.so_site_header_identity() to authenticated;

create or replace function public.so_my_merchant_activity()
returns jsonb language sql stable security definer set search_path to ''
as $function$
with verified_subjects as (
  select ll.line_sub
  from public.so_line_links ll
  where ll.user_id=(select auth.uid())
  union
  select p.line_sub
  from public.so_platform_line_identities p
  where p.user_id=(select auth.uid())
    and p.updated_at >= now()-interval '30 days'
    and p.updated_at <= now()+interval '1 minute'
), linked_users as (
  select ll.tenant_id,ll.user_id
  from public.so_line_links ll
  where ll.user_id=(select auth.uid())
    or ll.line_sub in (select line_sub from verified_subjects)
), mine as (
  select t.slug,t.name,t.modules,
    (select count(*) from public.so_reservations r
     where r.tenant_id=t.id and r.deleted_at is null
       and r.booking_date >= (now() at time zone 'Asia/Taipei')::date-30
       and (r.user_id=(select auth.uid()) or exists(
         select 1 from linked_users u where u.tenant_id=t.id and u.user_id=r.user_id
       ))) as booking_count,
    (select count(*) from public.so_tickets k
     where k.tenant_id=t.id and k.deleted_at is null
       and k.business_date >= (now() at time zone 'Asia/Taipei')::date-2
       and (k.user_id=(select auth.uid()) or exists(
         select 1 from linked_users u where u.tenant_id=t.id and u.user_id=k.user_id
       ))) as ticket_count
  from public.so_tenants t
  where t.status='ACTIVE'
)
select coalesce(jsonb_agg(jsonb_build_object(
 'slug',slug,'name',name,'booking_count',booking_count,
 'ticket_count',ticket_count,'modules',modules
) order by name),'[]'::jsonb)
from mine where booking_count>0 or ticket_count>0;
$function$;
revoke all on function public.so_my_merchant_activity() from public,anon,authenticated;
grant execute on function public.so_my_merchant_activity() to authenticated;
