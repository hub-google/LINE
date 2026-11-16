-- Audit 2026-11-16: verified defects only. Keep store-scoped queue alerts and allow
-- LINE-verified customers to page their own history even after a store closes.
-- Existing identity ownership checks and private schema protections are unchanged.
CREATE OR REPLACE FUNCTION public.so_queue_enqueue_near_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
  with eligible as (
    select k.tenant_id,k.id
    from public.qm_tickets k
    join public.qm_tenants t on t.id=k.tenant_id and t.status='ACTIVE'
    where k.deleted_at is null and k.status='WAITING'
      and k.queue_near_alert_threshold in (3,5)
      -- Do not starve new tickets when older alerts were already SENT.
      and not exists (
        select 1 from public.qm_line_notice_outbox sent
        where sent.tenant_id=k.tenant_id and sent.event_kind='QUEUE_NEAR'
          and sent.reference_id=k.id and sent.status<>'SKIPPED'
      )
      and (
        select count(*)
        from public.qm_tickets ahead
        where ahead.tenant_id=k.tenant_id and ahead.status='WAITING'
          and ahead.service_unit_id is not distinct from k.service_unit_id
          and ahead.service_session_id is not distinct from k.service_session_id
          and ahead.queue_session_code is not distinct from k.queue_session_code
          and ahead.deleted_at is null
          and (ahead.business_date,ahead.queue_joined_at,ahead.ticket_no,ahead.id)
            < (k.business_date,k.queue_joined_at,k.ticket_no,k.id)
      ) <= k.queue_near_alert_threshold
    order by k.created_at
    limit 500
  ), enqueued as (
    insert into public.qm_line_notice_outbox(tenant_id,event_kind,reference_id)
      select e.tenant_id,'QUEUE_NEAR',e.id from eligible e
    on conflict (tenant_id,event_kind,reference_id) do update
      set status='PENDING',attempts=0,processing_at=null,
          last_error=null,next_attempt_at=now()
      where qm_line_notice_outbox.status='SKIPPED'
    returning id
  ) select count(*) into v_count from enqueued;
  return v_count;
end $function$
;
CREATE OR REPLACE FUNCTION public.so_queue_near_alert_eligibility(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.qm_tickets;v_ahead integer;
begin
  select * into k from public.qm_tickets where id=p_ticket_id;
  if not found or k.deleted_at is not null or k.status<>'WAITING'
    or k.queue_near_alert_threshold not in (3,5)
    or not exists(select 1 from public.qm_tenants tenant
      where tenant.id=k.tenant_id and tenant.status='ACTIVE') then
    return jsonb_build_object('eligible',false);
  end if;
  select count(*) into v_ahead from public.qm_tickets ahead
  where ahead.tenant_id=k.tenant_id and ahead.status='WAITING'
          and ahead.service_unit_id is not distinct from k.service_unit_id
          and ahead.service_session_id is not distinct from k.service_session_id
          and ahead.queue_session_code is not distinct from k.queue_session_code
    and ahead.deleted_at is null
    and (ahead.business_date,ahead.queue_joined_at,ahead.ticket_no,ahead.id)
      < (k.business_date,k.queue_joined_at,k.ticket_no,k.id);
  return jsonb_build_object('eligible',v_ahead<=k.queue_near_alert_threshold,'ahead',v_ahead);
end $function$
;
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
 select 'reservation'::text kind,r.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   coalesce(r.booking_prefix,'')||coalesce(r.booking_no::text,'—') number,
   r.status,r.created_at,
   to_char(r.booking_date,'YYYY-MM-DD')||' '||to_char(r.booking_time,'HH24:MI') event_time,
   r.party_size,null::numeric total
 from public.qm_reservations r
 join public.qm_tenants t on t.id=r.tenant_id
 where p_kind='reservation' and r.deleted_at is null
  and exists(select 1 from verified_subjects)
  and (r.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=r.tenant_id and l.user_id=r.user_id))
 union all
 select 'ticket'::text kind,k.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   coalesce(k.number_prefix,'')||coalesce(k.ticket_no::text,'—') number,
   k.status,k.created_at,
   to_char(k.business_date,'YYYY-MM-DD') event_time,
   k.party_size,null::numeric total
 from public.qm_tickets k
 join public.qm_tenants t on t.id=k.tenant_id
 where p_kind='ticket' and k.deleted_at is null
   and not coalesce(k.hidden_via_reservation,false)
   and exists(select 1 from verified_subjects)
   and (k.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=k.tenant_id and l.user_id=k.user_id))
 union all
 select 'order'::text kind,o.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   'P'||lpad(o.order_no::text,5,'0') number,
   o.status,o.created_at,
   to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI') event_time,
   null::integer party_size,o.total
 from public.qm_pickup_orders o
 join public.qm_tenants t on t.id=o.tenant_id
 where p_kind='order'
   and exists(select 1 from verified_subjects)
   and (o.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=o.tenant_id and l.user_id=o.user_id))
)
select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc),'[]'::jsonb)
from (
 select kind,id,slug,shop_name,oa_mode,merchant_status,number,status,created_at,event_time,party_size,total
 from mine order by created_at desc,id desc limit 150
) recent;
$function$
;
CREATE OR REPLACE FUNCTION public.so_my_platform_records_page(p_kind text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
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
 select 'reservation'::text kind,r.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   coalesce(r.booking_prefix,'')||coalesce(r.booking_no::text,'—') number,
   r.status,r.created_at,
   to_char(r.booking_date,'YYYY-MM-DD')||' '||to_char(r.booking_time,'HH24:MI') event_time,
   r.party_size,null::numeric total
 from public.qm_reservations r
 join public.qm_tenants t on t.id=r.tenant_id
 where p_kind='reservation' and r.deleted_at is null
  and exists(select 1 from verified_subjects)
  and (r.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=r.tenant_id and l.user_id=r.user_id))
 union all
 select 'ticket'::text kind,k.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   coalesce(k.number_prefix,'')||coalesce(k.ticket_no::text,'—') number,
   k.status,k.created_at,
   to_char(k.business_date,'YYYY-MM-DD') event_time,
   k.party_size,null::numeric total
 from public.qm_tickets k
 join public.qm_tenants t on t.id=k.tenant_id
 where p_kind='ticket' and k.deleted_at is null
   and not coalesce(k.hidden_via_reservation,false)
   and exists(select 1 from verified_subjects)
   and (k.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=k.tenant_id and l.user_id=k.user_id))
 union all
 select 'order'::text kind,o.id,t.slug,t.name shop_name,t.oa_mode,t.status merchant_status,
   'P'||lpad(o.order_no::text,5,'0') number,
   o.status,o.created_at,
   to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI') event_time,
   null::integer party_size,o.total
 from public.qm_pickup_orders o
 join public.qm_tenants t on t.id=o.tenant_id
 where p_kind='order'
   and exists(select 1 from verified_subjects)
   and (o.user_id=(select auth.uid())
    or exists(select 1 from linked_users l where l.tenant_id=o.tenant_id and l.user_id=o.user_id))
)
select coalesce(jsonb_agg(to_jsonb(recent) order by recent.created_at desc),'[]'::jsonb)
from (
 select kind,id,slug,shop_name,oa_mode,merchant_status,number,status,created_at,event_time,party_size,total
 from mine order by created_at desc,id desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
) recent;
$function$
;
revoke all on function public.so_my_platform_records_page(text,integer,integer) from public,anon,authenticated;
grant execute on function public.so_my_platform_records_page(text,integer,integer) to authenticated;
comment on function public.so_my_platform_records_page(text,integer,integer)
is 'LINE-verified user-scoped cross-store history; page size bounded to 100; includes records of no-longer-active stores';
-- Make the new RPC available to PostgREST without requiring a deployment restart.
notify pgrst, 'reload schema';
