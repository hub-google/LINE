-- Queue Monster site-wide pickup integration. Additive; original booking/queue logic unchanged.
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
 select jsonb_build_object('total',count(*),'valid',count(*) filter (where status not in ('REJECTED','CANCELLED')),'pending',count(*) filter (where status='NEW'),'accepted',count(*) filter (where status='ACCEPTED'),'preparing',count(*) filter (where status='PREPARING'),'ready',count(*) filter (where status='READY'),'picked_up',count(*) filter (where status='PICKED_UP'),'rejected',count(*) filter (where status='REJECTED'),'cancelled',count(*) filter (where status='CANCELLED'),'amount',coalesce(sum(total) filter (where status not in ('REJECTED','CANCELLED')),0),'picked_up_amount',coalesce(sum(total) filter (where status='PICKED_UP'),0)) into v_orders from public.so_pickup_orders where tenant_id=t.id and (pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end;
 select coalesce(jsonb_agg(jsonb_build_object('date',series.day,'reservations',
   (select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=series.day),
   'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=series.day),'orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=series.day and o.status not in ('REJECTED','CANCELLED')),'order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=series.day and o.status not in ('REJECTED','CANCELLED')))
   order by series.day),'[]'::jsonb) into v_daily
 from generate_series(v_start,v_end,'1 day'::interval) series(day);
 return jsonb_build_object('merchant',t.name,'days',v_days,'start',v_start,'end',v_end,
   'reservations',v_booking,'queue',v_queue,'orders',v_orders,'daily',v_daily);
end;
$function$
;

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
    'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),'pickup_enabled',coalesce((select s.enabled from public.so_pickup_settings s where s.tenant_id=t.id),false),'today_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'today_pending_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status='NEW'),'today_ready_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status='READY'),'today_order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),
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
$function$
;

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
       'pickup_enabled',coalesce((select s.enabled from public.so_pickup_settings s where s.tenant_id=t.id),false),'today_orders',(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'today_order_amount',(select coalesce(sum(o.total),0) from public.so_pickup_orders o where o.tenant_id=t.id and (o.pickup_at at time zone 'Asia/Taipei')::date=v_today and o.status not in ('REJECTED','CANCELLED')),'waiting',(select count(*) from public.so_tickets k where k.tenant_id=t.id
         and k.deleted_at is null and k.status='WAITING')
     ) order by t.name)
     from public.so_business_group_branches b join public.so_tenants t on t.id=b.tenant_id
     where b.group_id=g.id),'[]'::jsonb)
   ) order by g.created_at),'[]'::jsonb) into v_groups
 from public.so_business_groups g where g.owner_user_id=auth.uid();
 return v_groups;
end;
$function$
;

-- so_public_store_search
CREATE OR REPLACE FUNCTION public.so_public_store_search(p_query text DEFAULT NULL::text, p_mode text DEFAULT 'all'::text, p_category text DEFAULT NULL::text, p_area text DEFAULT NULL::text, p_service text DEFAULT NULL::text, p_sort text DEFAULT 'popular'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with visible as (
 select t.slug,t.name,t.description,t.address,t.logo_url,coalesce(t.modules,'{}'::jsonb)||jsonb_build_object('pickup',coalesce(p.enabled,false)) as modules,t.oa_mode,t.directory_category,
        (coalesce(a.activity_count,0)+(select count(*) from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at>=now()-interval '30 days' and o.status not in ('REJECTED','CANCELLED')))::bigint popularity_score
 from public.so_tenants t
 left join private.so_store_popularity_30d a on a.tenant_id=t.id
 left join public.so_pickup_settings p on p.tenant_id=t.id
 where t.status='ACTIVE' and t.directory_enabled=true and t.onboarding_complete=true
   and (coalesce(p_mode,'all') <> 'queue' or coalesce((t.modules->>'queue')::boolean,false))
 and (coalesce(p_mode,'all') <> 'pickup' or coalesce(p.enabled,false))
), filtered as (
 select * from visible v
 where (nullif(btrim(coalesce(p_query,'')),'') is null
        or v.name ilike '%'||left(btrim(p_query),80)||'%'
        or coalesce(v.address,'') ilike '%'||left(btrim(p_query),80)||'%')
   and (coalesce(p_category,'全部')='全部' or coalesce(v.directory_category,'其他')=p_category)
   and (coalesce(p_area,'全部')='全部'
     or (p_area='線上商圈' and coalesce(v.address,'') !~ '(基隆市|台北市|臺北市|新北市|桃園市|新竹市|新竹縣|苗栗縣|台中市|臺中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|台南市|臺南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣)')
     or (p_area<>'線上商圈' and position(replace(p_area,'臺','台') in replace(coalesce(v.address,''),'臺','台'))>0))
   and (coalesce(p_service,'全部')='全部'
     or (p_service='點餐' and coalesce((v.modules->>'pickup')::boolean,false))
     or (p_service='預約' and coalesce((v.modules->>'reservation')::boolean,false))
     or (p_service='取號' and coalesce((v.modules->>'queue')::boolean,false))
     or (p_service='看板' and coalesce((v.modules->>'queue')::boolean,false)
         and coalesce((v.modules->>'calling')::boolean,false)))
), numbered as (
 select *,row_number() over(
   order by case when coalesce(p_sort,'popular')='popular' then popularity_score end desc nulls last,
            case when p_sort='category' then coalesce(directory_category,'其他') end asc nulls last,
            name asc,slug asc
 ) rn from filtered
), page as (
 select * from numbered order by rn limit 50 offset (least(greatest(coalesce(p_page,1),1),100000)-1)*50
)
select jsonb_build_object(
 'total',(select count(*) from filtered),
 'page',least(greatest(coalesce(p_page,1),1),100000),
 'page_size',50,
 'items',coalesce((select jsonb_agg(jsonb_build_object(
   'slug',slug,'name',name,'description',description,'address',address,'logo_url',logo_url,
   'category',directory_category,'modules',modules,'oa_mode',oa_mode) order by rn) from page),'[]'::jsonb));
$function$
;

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
      'address',q.address,'logo_url',q.logo_url,'category',q.directory_category,
      'modules',q.modules,'oa_mode',q.oa_mode
    ) order by q.name), '[]'::jsonb)
  from (
    select t.slug,t.name,t.description,t.address,t.logo_url,coalesce(t.modules,'{}'::jsonb)||jsonb_build_object('pickup',coalesce(s.enabled,false)) as modules,t.oa_mode,t.directory_category
    from public.so_tenants t
    left join public.so_pickup_settings s on s.tenant_id=t.id
    where t.status='ACTIVE' and t.directory_enabled = true and t.onboarding_complete = true
      and (
        nullif(trim(p_query),'') is null
        or t.name ilike '%'||left(trim(p_query),80)||'%'
        or coalesce(t.address,'') ilike '%'||left(trim(p_query),80)||'%'
      )
      and (
        p_mode is null or p_mode='all'
        or (p_mode='queue' and coalesce((t.modules->>'queue')::boolean,false))
        or (p_mode='reserve' and coalesce((t.modules->>'reservation')::boolean,false))
        or (p_mode='pickup' and coalesce(s.enabled,false))
      )
    order by t.name
    limit 100
  ) q;
$function$
;

-- so_customer_cross_store_overview
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
  from (select * from public.so_pickup_orders where (status not in ('PICKED_UP','REJECTED','CANCELLED') or created_at>=now()-interval '30 days') order by created_at desc limit 150) o
  join public.so_tenants t on t.id=o.tenant_id and t.status='ACTIVE'
  where exists(select 1 from public.so_line_links linked where linked.tenant_id=o.tenant_id and linked.user_id=o.user_id and linked.line_sub=v_line_sub);
  return jsonb_build_object('tickets',v_tickets,'reservations',v_reservations,'orders',v_orders);
end
$function$
;

create or replace function public.so_pickup_history(p_slug text,p_page integer default 1,p_filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tenant public.so_tenants;v_total bigint;v_rows jsonb;v_page int:=least(greatest(coalesce(p_page,1),1),100000);
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into v_tenant from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(v_tenant.id) is null and not coalesce(private.so_platform(),false) then raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 if p_filter not in ('all','active','closed') then raise exception '無效的篩選';end if;
 select count(*) into v_total from public.so_pickup_orders o where o.tenant_id=v_tenant.id
  and (p_filter='all' or (p_filter='active' and o.status not in ('PICKED_UP','REJECTED','CANCELLED'))
  or (p_filter='closed' and o.status in ('PICKED_UP','REJECTED','CANCELLED')));
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),'status',o.status,'items',o.items,
  'total',o.total,'note',o.note,'scheduled',o.scheduled,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'created_at',o.created_at,'updated_at',o.updated_at,
  'prepare_at',to_char((o.pickup_at-make_interval(mins=>coalesce(s.prep_minutes,20))) at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'can_prepare',not o.scheduled or now()>=o.pickup_at-make_interval(mins=>coalesce(s.prep_minutes,20))
 ) order by o.pickup_at desc,o.created_at desc),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=v_tenant.id
  and (p_filter='all' or (p_filter='active' and o.status not in ('PICKED_UP','REJECTED','CANCELLED'))
  or (p_filter='closed' and o.status in ('PICKED_UP','REJECTED','CANCELLED')))
  order by pickup_at desc,created_at desc limit 25 offset (v_page-1)*25) o
 left join public.so_pickup_settings s on s.tenant_id=o.tenant_id;
 return jsonb_build_object('orders',v_rows,'page',v_page,'page_size',25,'total',v_total);
end $$;
revoke all on function public.so_pickup_history(text,integer,text) from public,anon;
grant execute on function public.so_pickup_history(text,integer,text) to authenticated;
