-- Exclude unreleased pickup orders from HQ, store CRM and operations analytics.
-- so_my_business_groups
CREATE OR REPLACE FUNCTION public.so_my_business_groups()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_today date:=(now() at time zone 'Asia/Taipei')::date;v_groups jsonb;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'name',g.name,
   'branches',coalesce((
     select jsonb_agg(jsonb_build_object(
       'slug',t.slug,'name',t.name,'status',t.status,
       'today_reservations',(select count(*) from public.so_reservations r
         where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_today),
       'pickup_enabled',coalesce((select s.enabled from public.so_pickup_settings s where s.tenant_id=t.id),false),'today_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'today_order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'waiting',(select count(*) from public.so_tickets k where k.tenant_id=t.id
         and k.deleted_at is null and k.status='WAITING')
     ) order by t.name)
     from public.so_business_group_branches b join public.so_tenants t on t.id=b.tenant_id
     where b.group_id=g.id),'[]'::jsonb)
   ) order by g.created_at),'[]'::jsonb) into v_groups
 from public.so_business_groups g where g.owner_user_id=auth.uid();
 return v_groups;
end;
$function$;

-- so_platform_overview
CREATE OR REPLACE FUNCTION public.so_platform_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_platform boolean := private.so_platform();
  v_test boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.so_tenants t join public.so_members m
      on m.tenant_id=t.id
      where t.created_by=auth.uid() and t.is_test_tenant
      and m.user_id=auth.uid() and m.role='OWNER');
begin
  if not v_platform and not v_test then
    raise exception '沒有平台管理員權限' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',t.id,'slug',t.slug,'name',t.name,'status',t.status,'modules',t.modules,
    'line_status',t.line_status,'created_at',t.created_at,
    'description',t.description,'phone',t.phone,'address',t.address,
    'accent',t.accent,'logo_url',t.logo_url,'directory_category',t.directory_category,
    'open_time',t.open_time,'close_time',t.close_time,
    'slot_capacity',t.slot_capacity,'slot_minutes',t.slot_minutes,
    'onboarding_complete',t.onboarding_complete,
    'reservations',(select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null),
    'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null),
    'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),'pickup_enabled',coalesce((select s.enabled from public.so_pickup_settings s where s.tenant_id=t.id),false),'today_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'today_pending_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status='NEW'),'today_ready_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status='READY'),'today_order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),
    'today_reservations',(select count(*) from public.so_reservations r
      where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_today and r.status not in ('CANCELLED','NO_SHOW')),
    'today_tickets',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today),
    'today_waiting',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='WAITING'),
    'today_completed',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='COMPLETED'),
    'current_number',(select coalesce(k.number_prefix,'')||k.ticket_no::text
      from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today
      and k.status in ('CALLED','SERVING') order by k.updated_at desc limit 1)
  ) order by t.created_at desc) from public.so_tenants t
  where v_platform or (v_test and t.created_by=auth.uid() and t.is_test_tenant)),'[]'::jsonb);
end
$function$;

-- so_staff_analytics
CREATE OR REPLACE FUNCTION public.so_staff_analytics(p_slug text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;v_days integer:=coalesce(p_days,30);v_start date;v_end date;v_booking jsonb;v_queue jsonb;v_daily jsonb;v_orders jsonb;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '沒有查看報表權限' using errcode='42501'; end if;
 if v_days not in (7,30,90) then raise exception '報表範圍僅支援 7、30、90 天';end if;
 v_end:=(now() at time zone 'Asia/Taipei')::date;
 v_start:=v_end-(v_days-1);
 select jsonb_build_object(
   'total',count(*),
   'confirmed',count(*) filter (where status='CONFIRMED'),
   'checked_in',count(*) filter (where status='CHECKED_IN'),
   'completed',count(*) filter (where status='COMPLETED'),
   'cancelled',count(*) filter (where status='CANCELLED'),
   'no_show',count(*) filter (where status='NO_SHOW')
 ) into v_booking
 from public.so_reservations where tenant_id=t.id and deleted_at is null and booking_date between v_start and v_end;
 select jsonb_build_object(
   'total',count(*),
   'waiting',count(*) filter (where status='WAITING'),
   'called',count(*) filter (where status='CALLED'),
   'arrived',count(*) filter (where status='ARRIVED'),
   'admitted',count(*) filter (where status='ADMITTED'),
   'serving',count(*) filter (where status='SERVING'),
   'completed',count(*) filter (where status='COMPLETED'),
   'cancelled',count(*) filter (where status='CANCELLED'),
   'passed',count(*) filter (where status='PASSED'),
   'avg_wait_minutes',round((avg(extract(epoch from (last_called_at-created_at))/60)
     filter (where last_called_at is not null and last_called_at>=created_at))::numeric,1)
 ) into v_queue from public.so_tickets where tenant_id=t.id and deleted_at is null and business_date between v_start and v_end;
 select jsonb_build_object('total',count(*),'valid',count(*) filter (where status not in ('REJECTED','CANCELLED')),'pending',count(*) filter (where status='NEW'),'accepted',count(*) filter (where status='ACCEPTED'),'preparing',count(*) filter (where status='PREPARING'),'ready',count(*) filter (where status='READY'),'picked_up',count(*) filter (where status='PICKED_UP'),'rejected',count(*) filter (where status='REJECTED'),'cancelled',count(*) filter (where status='CANCELLED'),'amount',coalesce(sum(total) filter (where status not in ('REJECTED','CANCELLED')),0),'picked_up_amount',coalesce(sum(total) filter (where status='PICKED_UP'),0)) into v_orders from public.so_pickup_orders where tenant_id=t.id and created_at<=now()-interval '60 seconds' and (pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end;
 select coalesce(jsonb_agg(jsonb_build_object('date',series.day,'reservations',
   (select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=series.day),
   'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=series.day),'orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=series.day and o.status not in ('REJECTED','CANCELLED')),'order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at<=now()-interval '60 seconds' and (o.pickup_at at time zone 'Asia/Taipei')::date=series.day and o.status not in ('REJECTED','CANCELLED')))
   order by series.day),'[]'::jsonb) into v_daily
 from generate_series(v_start,v_end,'1 day'::interval) series(day);
 return jsonb_build_object('merchant',t.name,'days',v_days,'start',v_start,'end',v_end,
   'reservations',v_booking,'queue',v_queue,'orders',v_orders,'daily',v_daily);
end;
$function$;

-- so_staff_customer_book
CREATE OR REPLACE FUNCTION public.so_staff_customer_book(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null or (private.so_role(v_tenant) is null and not coalesce(private.so_platform(),false))
  then raise exception '沒有查看顧客簿的權限' using errcode='42501';end if;
 return coalesce((
  with combined as (
    select r.id,r.user_id,r.customer_name,r.status,r.created_at,
      'BOOKING'::text as kind,0::numeric as order_total,
      case when l.line_sub is not null then concat('LINE:',coalesce(l.login_channel_id,'legacy'),':',l.line_sub)
        else 'AUTH:'||r.user_id::text end as identity_key
    from public.so_reservations r
    left join public.so_line_links l on l.tenant_id=r.tenant_id and l.user_id=r.user_id
    where r.tenant_id=v_tenant and r.user_id is not null
    union all
    select o.id,o.user_id,coalesce(nullif(o.customer_name,''),l.display_name,'LINE 顧客'),
      o.status,o.created_at,'PICKUP'::text,o.total,
      case when l.line_sub is not null then concat('LINE:',coalesce(l.login_channel_id,'legacy'),':',l.line_sub)
        else 'AUTH:'||o.user_id::text end
    from public.so_pickup_orders o
    left join public.so_line_links l on l.tenant_id=o.tenant_id and l.user_id=o.user_id
    where o.tenant_id=v_tenant and o.created_at<=now()-interval '60 seconds' and o.user_id is not null
  ), grouped as (
    select identity_key,(array_agg(user_id order by created_at,id))[1] as id,
      (array_agg(customer_name order by (customer_name is not null and customer_name<>'LINE 顧客') desc,created_at desc,id desc))[1] as name,
      count(*) filter(where kind='BOOKING')::integer as bookings,
      count(*) filter(where kind='PICKUP' and status not in ('REJECTED','CANCELLED'))::integer as orders,
      coalesce(sum(order_total) filter(where kind='PICKUP' and status not in ('REJECTED','CANCELLED')),0) as order_amount,
      count(*) filter(where kind='BOOKING' and status='NO_SHOW')::integer as no_shows,
      max(created_at) as last_booking
    from combined group by identity_key order by max(created_at) desc limit 250
  ), flags_by_identity as (
    select x.identity_key,
      coalesce((array_agg(to_jsonb(f.tags) order by f.updated_at desc nulls last)
         filter(where f.user_id is not null))[1], '[]'::jsonb) as tags,
      coalesce((array_agg(f.notes order by f.updated_at desc nulls last)
         filter(where f.user_id is not null))[1], '') as notes,
      bool_or(coalesce(f.blacklisted,false)) as blacklisted,
      bool_or(coalesce(f.block_new_bookings,false)) as block_new_bookings
    from (select distinct identity_key,user_id from combined) x
    left join public.so_customer_flags f on f.tenant_id=v_tenant and f.user_id=x.user_id
    group by x.identity_key
  )
  select jsonb_agg(to_jsonb(z) order by z.last_booking desc) from (
    select g.id,g.name,g.bookings,g.orders,g.order_amount,g.no_shows,g.last_booking,
      coalesce(f.tags,'[]'::jsonb) as tags,coalesce(f.notes,'') as notes,
      coalesce(f.blacklisted,false) as blacklisted,
      coalesce(f.block_new_bookings,false) as block_new_bookings
    from grouped g left join flags_by_identity f using(identity_key)
  ) z
 ),'[]'::jsonb);
end $function$;
