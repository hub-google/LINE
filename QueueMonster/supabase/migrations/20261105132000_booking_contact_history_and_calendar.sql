-- Expose own or staff-scoped booking contact in previously existing history, calendar and cross-store projections.
CREATE OR REPLACE FUNCTION public.so_customer_cross_store_overview(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_line_sub text;
  v_tickets jsonb := '[]'::jsonb;
  v_reservations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception '請先登入 LINE' using errcode='28000';
  end if;
  select l.line_sub into v_line_sub
  from public.so_line_links l
  join public.so_tenants home on home.id=l.tenant_id
  where l.user_id=auth.uid() and home.slug=p_slug and home.status='ACTIVE'
  order by l.updated_at desc limit 1;
  if v_line_sub is null then
    raise exception '請先完成目前門市的 LINE 身分授權' using errcode='28000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
     'id',x.id,'tenant_id',x.tenant_id,'slug',x.slug,'shop_name',x.shop_name,
     'number',x.number,'status',x.status,'date',x.business_date,
     'created_at',x.created_at,'current',x.current_number,'ahead',x.ahead,
     'selected_items',x.selected_items,'party',x.party_size
  ) order by x.priority,x.created_at desc),'[]'::jsonb)
  into v_tickets
  from (
    select k.id,k.tenant_id,t.slug,t.name as shop_name,
      coalesce(k.number_prefix,'')||k.ticket_no::text as number,
      k.status,k.business_date,k.created_at,k.selected_items,k.party_size,
      case when k.status='WAITING' then
        (select count(*)::int from public.so_tickets ahead
         where ahead.tenant_id=k.tenant_id and ahead.deleted_at is null
           and ahead.status='WAITING'
           and (ahead.queue_joined_at,ahead.id)<(k.queue_joined_at,k.id))
        + coalesce(display.serving_count,0)
      when k.status in ('CALLED','ARRIVED','ADMITTED','SERVING') then 0
      else null end as ahead,
      (select coalesce(c.number_prefix,'')||c.ticket_no::text
         from public.so_tickets c
         where c.tenant_id=k.tenant_id and c.deleted_at is null
           and (c.status in ('CALLED','ARRIVED','ADMITTED','SERVING')
                or c.last_called_at>=now()-interval '24 hours')
         order by case when c.status in ('CALLED','ARRIVED','ADMITTED','SERVING') then 0 else 1 end,
           c.last_called_at desc nulls last,c.updated_at desc limit 1
      ) as current_number,
      case when k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING') then 0 else 1 end as priority
    from public.so_tickets k
    join public.so_tenants t on t.id=k.tenant_id
    left join public.so_queue_displays display on display.tenant_id=t.id
    where t.status='ACTIVE' and k.deleted_at is null
      and not coalesce(k.hidden_via_reservation,false)
      and (k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING')
           or k.created_at>=now()-interval '30 days')
      and exists (
        select 1 from public.so_line_links linked
        where linked.tenant_id=k.tenant_id and linked.user_id=k.user_id
          and linked.line_sub=v_line_sub
      )
    order by priority,k.created_at desc
    limit 300
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'slug',x.slug,'shop_name',x.shop_name,
    'name',x.customer_name,'phone',x.customer_phone,'number',x.number,'day',x.booking_date,'time',to_char(x.booking_time,'HH24:MI'),
    'party',x.party_size,'status',x.status,'created_at',x.created_at,
    'selected_items',x.selected_items
  ) order by x.booking_date desc,x.booking_time desc),'[]'::jsonb)
  into v_reservations
  from (
    select r.id,t.slug,t.name as shop_name,r.customer_name,r.customer_phone,
      coalesce(r.booking_prefix,'')||r.booking_no::text as number,r.booking_date,
      r.booking_time,r.party_size,r.status,r.created_at,r.selected_items
    from public.so_reservations r
    join public.so_tenants t on t.id=r.tenant_id
    where t.status='ACTIVE' and r.deleted_at is null
      and r.booking_date >= (now() at time zone 'Asia/Taipei')::date - 30
      and exists (
        select 1 from public.so_line_links linked
        where linked.tenant_id=r.tenant_id and linked.user_id=r.user_id
          and linked.line_sub=v_line_sub
      )
    order by r.booking_date desc,r.booking_time desc
    limit 150
  ) x;

  return jsonb_build_object('tickets',v_tickets,'reservations',v_reservations);
end
$function$;

CREATE OR REPLACE FUNCTION public.so_staff_reservation_calendar(p_slug text, p_start date, p_end date, p_status text DEFAULT 'ALL'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select r.id,r.booking_date,r.booking_time,r.customer_name,r.customer_phone,r.party_size,
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
   'name',p.customer_name,'phone',p.customer_phone,'party',p.party_size,
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

CREATE OR REPLACE FUNCTION public.so_staff_reservation_search(p_slug text, p_search text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT 'ALL'::text, p_deleted text DEFAULT 'active'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_tenant_id uuid;
 v_term text := trim(coalesce(p_search,''));
 v_status text := upper(coalesce(p_status,'ALL'));
 v_deleted text := lower(coalesce(p_deleted,'active'));
 v_page integer := coalesce(p_page,1);
 v_size integer := coalesce(p_page_size,25);
 v_offset bigint;
 v_total bigint;
 v_rows jsonb;
begin
 if auth.uid() is null then
   raise exception '請先登入' using errcode='28000';
 end if;
 select t.id into v_tenant_id
 from public.so_tenants t where t.slug=p_slug and t.status='ACTIVE';
 if v_tenant_id is null then
   raise exception '找不到可管理的門市' using errcode='42501';
 end if;
 if private.so_role(v_tenant_id) is null and not private.so_platform() then
   raise exception '沒有門市預約資料查詢權限' using errcode='42501';
 end if;
 if length(v_term)>100 then
   raise exception '搜尋文字不得超過 100 字' using errcode='22023';
 end if;
 if v_status not in ('ALL','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW') then
   raise exception '不支援的預約狀態' using errcode='22023';
 end if;
 if v_deleted not in ('active','deleted','all') then
   raise exception '不支援的刪除篩選' using errcode='22023';
 end if;
 if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then
   raise exception '開始日期不得晚於結束日期' using errcode='22023';
 end if;
 if v_page<1 or v_page>100000 or v_size<1 or v_size>100 then
   raise exception '分頁範圍不正確（每頁 1～100 筆）' using errcode='22023';
 end if;
 v_offset := (v_page::bigint-1)*v_size;
 with filtered as (
  select r.id,r.booking_date,r.booking_time,r.booking_prefix,r.booking_no,r.booking_round,
    r.customer_name,r.customer_phone,r.party_size,r.status,r.created_at,r.updated_at,r.deleted_at,
    r.selected_items,r.reference_code
  from public.so_reservations r
  where r.tenant_id=v_tenant_id
   and (p_date_from is null or r.booking_date>=p_date_from)
   and (p_date_to is null or r.booking_date<=p_date_to)
   and (v_status='ALL' or r.status=v_status)
   and (v_deleted='all' or (v_deleted='active' and r.deleted_at is null)
                        or (v_deleted='deleted' and r.deleted_at is not null))
   and (v_term='' or strpos(lower(concat_ws(' ',
       r.customer_name,coalesce(r.booking_prefix,'')||r.booking_no::text,
       r.reference_code,r.selected_items::text)),lower(v_term))>0)
 ), page_rows as (
   select * from filtered
   order by booking_date desc, booking_time desc, created_at desc, id desc
   limit v_size offset v_offset
 )
 select
   (select count(*) from filtered),
   (select coalesce(jsonb_agg(jsonb_build_object(
     'id',p.id,
     'number',coalesce(p.booking_prefix,'')||p.booking_no::text,
     'round',p.booking_round,
     'reference_code',p.reference_code,
     'name',p.customer_name,'phone',p.customer_phone,
     'party',p.party_size,
     'day',to_char(p.booking_date,'YYYY-MM-DD'),
     'time',to_char(p.booking_time,'HH24:MI'),
     'status',p.status,
     'created_at',p.created_at,
     'updated_at',p.updated_at,
     'deleted_at',p.deleted_at,
     'selected_items',p.selected_items
   ) order by p.booking_date desc,p.booking_time desc,p.created_at desc,p.id desc),'[]'::jsonb)
   from page_rows p)
 into v_total,v_rows;

 return jsonb_build_object(
  'items',v_rows,'total',v_total,'page',v_page,'page_size',v_size,
  'has_more',v_offset+v_size<v_total
 );
end;
$function$;