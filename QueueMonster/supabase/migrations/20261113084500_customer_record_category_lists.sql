-- User-specific reservation, ticket and pickup-order history; same verified LINE identity only.
CREATE OR REPLACE FUNCTION public.so_my_platform_records(p_kind text DEFAULT 'reservation'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with verified_subjects as (
  select p.line_sub from public.qm_platform_line_identities p
   where p.user_id=(select auth.uid())
     and p.updated_at between now()-interval '30 days' and now()+interval '1 minute'
     and length(p.line_sub)>0
  union
  select own.line_sub from public.qm_line_links own
   where own.user_id=(select auth.uid())
     and own.updated_at between now()-interval '30 days' and now()+interval '1 minute'
     and length(own.line_sub)>0
),
linked_users as (
 select distinct ll.tenant_id,ll.user_id from public.qm_line_links ll
 where ll.line_sub in (select line_sub from verified_subjects)
),
mine as (
 select 'reservation'::text kind,r.id,t.slug,t.name shop_name,t.oa_mode,
   coalesce(r.booking_prefix,'')||coalesce(r.booking_no::text,'—') number,
   r.status,r.created_at,
   to_char(r.booking_date,'YYYY-MM-DD')||' '||to_char(r.booking_time,'HH24:MI') event_time,
   r.party_size,null::numeric total
 from public.qm_reservations r
 join public.qm_tenants t on t.id=r.tenant_id
 where p_kind='reservation' and t.status='ACTIVE' and r.deleted_at is null
  and exists(select 1 from verified_subjects)
  and (r.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=r.tenant_id and l.user_id=r.user_id))
 union all
 select 'ticket'::text kind,k.id,t.slug,t.name shop_name,t.oa_mode,
   coalesce(k.number_prefix,'')||coalesce(k.ticket_no::text,'—') number,
   k.status,k.created_at,
   to_char(k.business_date,'YYYY-MM-DD') event_time,
   k.party_size,null::numeric total
 from public.qm_tickets k
 join public.qm_tenants t on t.id=k.tenant_id
 where p_kind='ticket' and t.status='ACTIVE' and k.deleted_at is null
   and not coalesce(k.hidden_via_reservation,false)
   and exists(select 1 from verified_subjects)
   and (k.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=k.tenant_id and l.user_id=k.user_id))
 union all
 select 'order'::text kind,o.id,t.slug,t.name shop_name,t.oa_mode,
   'P'||lpad(o.order_no::text,5,'0') number,
   o.status,o.created_at,
   to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI') event_time,
   null::integer party_size,o.total
 from public.qm_pickup_orders o
 join public.qm_tenants t on t.id=o.tenant_id
 where p_kind='order' and t.status='ACTIVE'
   and exists(select 1 from verified_subjects)
   and (o.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=o.tenant_id and l.user_id=o.user_id))
)
select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc),'[]'::jsonb)
from (
 select kind,id,slug,shop_name,oa_mode,number,status,created_at,event_time,party_size,total
 from mine order by created_at desc limit 150
) recent;
$function$

revoke all on function public.so_my_platform_records(text) from public,anon,authenticated;
grant execute on function public.so_my_platform_records(text) to authenticated;

comment on function public.so_my_platform_records(text)
is 'Verified LINE-linked users only; caller cannot specify another identity or retrieve other customers records';
