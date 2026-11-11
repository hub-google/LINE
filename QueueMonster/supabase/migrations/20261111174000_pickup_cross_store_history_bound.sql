-- Filter before pagination so busy merchants cannot hide older customer orders.
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
  v_orders jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'slug',t.slug,'shop_name',t.name,'number','P'||lpad(o.order_no::text,5,'0'),'status',o.status,'items',o.items,'total',o.total,'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'scheduled',o.scheduled,'created_at',o.created_at) order by o.pickup_at desc),'[]'::jsonb) into v_orders
  from (select * from public.so_pickup_orders o0
    where exists(select 1 from public.so_line_links linked0
      where linked0.tenant_id=o0.tenant_id and linked0.user_id=o0.user_id
        and linked0.line_sub=v_line_sub) and (status not in ('PICKED_UP','REJECTED','CANCELLED') or created_at>=now()-interval '30 days') order by created_at desc limit 150) o
  join public.so_tenants t on t.id=o.tenant_id and t.status='ACTIVE'
  where exists(select 1 from public.so_line_links linked where linked.tenant_id=o.tenant_id and linked.user_id=o.user_id and linked.line_sub=v_line_sub);
  return jsonb_build_object('tickets',v_tickets,'reservations',v_reservations,'orders',v_orders);
end
$function$
;
