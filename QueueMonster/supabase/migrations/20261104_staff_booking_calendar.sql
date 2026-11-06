-- PRD UX-14 / C17-C18 / FR-119: tenant-isolated day/week/month calendar.
-- Query exact date range and compute daily summary on the database, not from
-- capped 500-row worklists. Read-only; does not affect queue or notifications.
create or replace function public.so_staff_reservation_calendar(
 p_slug text,
 p_start date,
 p_end date,
 p_status text default 'ALL',
 p_page integer default 1,
 p_page_size integer default 100
) returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
 v_tenant uuid;
 v_status text := upper(coalesce(p_status,'ALL'));
 v_page integer := coalesce(p_page,1);
 v_size integer := coalesce(p_page_size,100);
 v_offset bigint;
 v_total bigint;
 v_daily jsonb;
 v_items jsonb;
begin
 if auth.uid() is null then
  raise exception '請先登入' using errcode='28000';
 end if;
 select t.id into v_tenant from public.so_tenants t
 where t.slug=p_slug and t.status='ACTIVE';
 if v_tenant is null then
  raise exception '無法取得門市' using errcode='42501';
 end if;
 if private.so_role(v_tenant) is null and not private.so_platform() then
  raise exception '無此門市日曆權限' using errcode='42501';
 end if;
 if p_start is null or p_end is null or p_start>p_end or p_end-p_start>41 then
  raise exception '請選擇 1～42 天的有效日期區間' using errcode='22023';
 end if;
 if v_status not in ('ALL','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW') then
  raise exception '無效的預約狀態' using errcode='22023';
 end if;
 if v_page<1 or v_page>100000 or v_size<1 or v_size>100 then
  raise exception '分頁大小或頁碼不正確' using errcode='22023';
 end if;
 v_offset:=(v_page::bigint-1)*v_size;

 with filtered as (
  select r.id,r.booking_date,r.booking_time,r.customer_name,r.party_size,
   r.booking_prefix,r.booking_no,r.booking_round,r.reference_code,r.status,
   r.selected_items,r.created_at,r.updated_at
  from public.so_reservations r
  where r.tenant_id=v_tenant and r.deleted_at is null
   and r.booking_date between p_start and p_end
   and (v_status='ALL' or r.status=v_status)
 ), by_day as (
  select booking_date,
    count(*) as total,
    count(*) filter(where status='CONFIRMED') as confirmed,
    count(*) filter(where status='CHECKED_IN') as checked_in,
    count(*) filter(where status='COMPLETED') as completed,
    count(*) filter(where status='CANCELLED') as cancelled,
    count(*) filter(where status='NO_SHOW') as no_show,
    coalesce(sum(party_size) filter(where status in ('CONFIRMED','CHECKED_IN')),0) as booked_people
  from filtered group by booking_date
 ), page_rows as (
  select * from filtered
  order by booking_date,booking_time,created_at,id
  limit v_size offset v_offset
 )
 select
  (select count(*) from filtered),
  (select coalesce(jsonb_agg(jsonb_build_object(
   'day',to_char(d.booking_date,'YYYY-MM-DD'),
   'total',d.total,'confirmed',d.confirmed,'checked_in',d.checked_in,
   'completed',d.completed,'cancelled',d.cancelled,'no_show',d.no_show,
   'booked_people',d.booked_people
  ) order by d.booking_date),'[]'::jsonb) from by_day d),
  (select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,
   'day',to_char(p.booking_date,'YYYY-MM-DD'),
   'time',to_char(p.booking_time,'HH24:MI'),
   'number',coalesce(p.booking_prefix,'')||p.booking_no::text,
   'round',p.booking_round,
   'reference_code',p.reference_code,
   'name',p.customer_name,'party',p.party_size,
   'status',p.status,'selected_items',p.selected_items,
   'created_at',p.created_at,'updated_at',p.updated_at
  ) order by p.booking_date,p.booking_time,p.created_at,p.id),'[]'::jsonb)
   from page_rows p)
 into v_total,v_daily,v_items;

 return jsonb_build_object(
  'start',p_start,'end',p_end,'page',v_page,'page_size',v_size,
  'total',v_total,'daily',v_daily,'items',v_items,
  'has_more',v_offset+v_size<v_total
 );
end;
$function$;

revoke all on function public.so_staff_reservation_calendar(text,date,date,text,integer,integer) from public,anon;
grant execute on function public.so_staff_reservation_calendar(text,date,date,text,integer,integer) to authenticated;
comment on function public.so_staff_reservation_calendar(text,date,date,text,integer,integer) is
 'Read-only tenant-scoped aggregate calendar (up to 42 days) and page of reservations; no personal LINE identity leaks.';
