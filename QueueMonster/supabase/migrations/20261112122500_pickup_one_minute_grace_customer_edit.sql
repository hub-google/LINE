-- Pickup: one-minute customer edit/cancel grace, delayed merchant visibility and release notification.
-- so_pickup_staff
CREATE OR REPLACE FUNCTION public.so_pickup_staff(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;s public.so_pickup_settings;v_orders jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
  raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 if private.so_role(t.id)='STAFF'
  and coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true)=false
 then raise exception '此員工角色尚未開通訂餐檢視權限' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';
  s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;
  s.days_ahead:=7;s.prep_minutes:=20;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
  'scheduled',o.scheduled,'status',o.status,'items',o.items,
  'customer_name',o.customer_name,'customer_phone',o.customer_phone,
  'total',o.total,'note',o.note,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'prepare_at',to_char((o.pickup_at-make_interval(mins=>s.prep_minutes)) at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'can_prepare',not o.scheduled or now()>=o.pickup_at-make_interval(mins=>s.prep_minutes),
  'created_at',o.created_at) order by
    case when o.status in ('PICKED_UP','CANCELLED','REJECTED') then 1 else 0 end,
    case when o.status in ('PICKED_UP','CANCELLED','REJECTED') then o.created_at end desc nulls last,
    o.pickup_at,o.created_at),'[]'::jsonb) into v_orders
 from (
  select * from public.so_pickup_orders
   where tenant_id=t.id and created_at <= now()-interval '60 seconds'
   order by case when status in ('PICKED_UP','CANCELLED','REJECTED') then 1 else 0 end,
     case when status in ('PICKED_UP','CANCELLED','REJECTED') then created_at end desc nulls last,
     pickup_at,created_at
   limit 300
 ) o;
 return jsonb_build_object('settings',jsonb_build_object(
   'enabled',s.enabled,'schedule_mode',s.schedule_mode,
   'pickup_start',to_char(s.pickup_start,'HH24:MI'),
   'pickup_end',to_char(s.pickup_end,'HH24:MI'),
   'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'capacity_basis',s.capacity_basis,
   'min_notice_minutes',s.min_notice_minutes,'days_ahead',s.days_ahead,
   'prep_minutes',s.prep_minutes),'can_update',(
 private.so_role(t.id)<>'STAFF' or coalesce(private.so_platform(),false)
 or coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true)
 ),'staff_can_view',coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true),
 'staff_can_update',coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true),
 'orders',v_orders);
end $function$;

-- so_pickup_history
CREATE OR REPLACE FUNCTION public.so_pickup_history(p_slug text, p_page integer DEFAULT 1, p_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant public.so_tenants;v_total bigint;v_rows jsonb;v_page int:=least(greatest(coalesce(p_page,1),1),100000);
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into v_tenant from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(v_tenant.id) is null and not coalesce(private.so_platform(),false) then raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 if private.so_role(v_tenant.id)='STAFF'
  and not coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=v_tenant.id),true)
 then raise exception '此員工角色沒有訂餐歷史查詢權限' using errcode='42501';end if;
 if p_filter not in ('all','active','closed') then raise exception '無效的篩選';end if;
 select count(*) into v_total from public.so_pickup_orders o where o.tenant_id=v_tenant.id and o.created_at <= now()-interval '60 seconds'
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
 from (select * from public.so_pickup_orders o where o.tenant_id=v_tenant.id and o.created_at <= now()-interval '60 seconds'
  and (p_filter='all' or (p_filter='active' and o.status not in ('PICKED_UP','REJECTED','CANCELLED'))
  or (p_filter='closed' and o.status in ('PICKED_UP','REJECTED','CANCELLED')))
  order by pickup_at desc,created_at desc limit 25 offset (v_page-1)*25) o
 left join public.so_pickup_settings s on s.tenant_id=o.tenant_id;
 return jsonb_build_object('orders',v_rows,'page',v_page,'page_size',25,'total',v_total);
end $function$;

-- so_pickup_update
CREATE OR REPLACE FUNCTION public.so_pickup_update(p_slug text, p_order_id uuid, p_expected text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 o public.so_pickup_orders;
 s public.so_pickup_settings;
 v_used integer;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000'; end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
  raise exception '沒有這家店的操作權限' using errcode='42501';
 end if;
 if private.so_role(t.id)='STAFF'
  and (not coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true)
    or not coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true))
 then raise exception '此員工角色沒有修改訂餐狀態的權限' using errcode='42501';end if;
 select * into o from public.so_pickup_orders
  where tenant_id=t.id and id=p_order_id for update;
 if not found then raise exception '找不到訂單'; end if;
 if o.created_at > now()-interval '60 seconds' then raise exception '訂單送出後須等待 60 秒，店家才能操作'; end if;
 if o.status is distinct from p_expected then
  raise exception '訂單狀態已被其他店員更新，請重新整理';
 end if;
 if p_status is null or p_status not in
   ('NEW','ACCEPTED','PREPARING','READY','PICKED_UP','REJECTED','CANCELLED') then
  raise exception '不允許的訂單狀態';
 end if;
 if p_status=o.status then
  return jsonb_build_object('changed',false,'status',o.status);
 end if;
 -- Reopening a rejected/cancelled future reservation must not overbook its slot.
 if o.scheduled and o.pickup_at>now()
    and o.status in ('REJECTED','CANCELLED')
    and p_status not in ('REJECTED','CANCELLED') then
  select * into s from public.so_pickup_settings where tenant_id=t.id for update;
  select count(*) into v_used from public.so_pickup_orders x
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled
    and x.pickup_at=o.pickup_at and x.status not in ('REJECTED','CANCELLED');
  if s.capacity_basis='ITEMS' then
   select coalesce(sum((line.value->>'qty')::integer),0) into v_used
   from public.so_pickup_orders x cross join lateral jsonb_array_elements(x.items) line
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled
     and x.pickup_at=o.pickup_at and x.status not in ('REJECTED','CANCELLED');
   v_used:=v_used+(select coalesce(sum((line.value->>'qty')::integer),0)
     from jsonb_array_elements(o.items) line);
  end if;
  if (s.capacity_basis='ITEMS' and v_used>coalesce(s.slot_capacity,5))
     or (s.capacity_basis<>'ITEMS' and v_used>=coalesce(s.slot_capacity,5)) then
   raise exception '原取餐時段目前已額滿，無法重新接單；請聯絡顧客調整取餐時間';
  end if;
 end if;
 -- Keep the existing scheduled preparation guard for PREPARING.
 if p_status='PREPARING' and o.scheduled then
  select * into s from public.so_pickup_settings where tenant_id=t.id;
  if now()<o.pickup_at-make_interval(mins=>coalesce(s.prep_minutes,20)) then
   raise exception '尚未到建議製作時間，避免餐點過早完成放涼';
  end if;
 end if;
 update public.so_pickup_orders set status=p_status,updated_at=now()
  where id=o.id and tenant_id=t.id;
 insert into public.so_audit(tenant_id,actor,action,info)
  values(t.id,auth.uid(),'pickup_order_status',
   jsonb_build_object('order_id',o.id,'from',o.status,'to',p_status,'correction',true));
 return jsonb_build_object('changed',true,'status',p_status);
end $function$;

-- so_pickup_cancel
CREATE OR REPLACE FUNCTION public.so_pickup_cancel(p_slug text, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;o public.so_pickup_orders;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 select * into o from public.so_pickup_orders where tenant_id=t.id and id=p_order_id and user_id=auth.uid() for update;
 if not found then raise exception '無權取消這筆訂單';end if;
 if o.status <> 'NEW' or o.created_at <= now()-interval '60 seconds' then
  raise exception '送出超過 60 秒或店家已接單，無法取消；請聯絡店家' using errcode='22023';end if;
 update public.so_pickup_orders set status='CANCELLED',updated_at=now() where id=o.id;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'pickup_order_cancelled',
  jsonb_build_object('order_id',o.id));
 return jsonb_build_object('changed',true);
end $function$;

-- so_pickup_my_orders
CREATE OR REPLACE FUNCTION public.so_pickup_my_orders(p_slug text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid;v_uid uuid:=auth.uid();v_page integer:=least(greatest(coalesce(p_page,1),1),100000);
 v_total bigint;v_rows jsonb;
begin
 if v_uid is null then raise exception '請先登入' using errcode='28000';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null then raise exception '找不到門市';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=v_tenant
   and l.user_id=v_uid) then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select count(*) into v_total from public.so_pickup_orders o where o.tenant_id=v_tenant and o.user_id=v_uid;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),'status',o.status,
   'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
   'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
   'created_at',o.created_at,'customer_name',o.customer_name,'customer_phone',o.customer_phone
 ) order by o.created_at desc,o.id desc),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=v_tenant and o.user_id=v_uid
  order by o.created_at desc,o.id desc limit 25 offset (v_page-1)*25) o;
 return jsonb_build_object('total',v_total,'page',v_page,'page_size',25,'orders',v_rows);
end $function$;

-- so_pickup_public
CREATE OR REPLACE FUNCTION public.so_pickup_public(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; s public.so_pickup_settings; v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_slots jsonb:='[]'::jsonb;
 v_catalog jsonb:='[]'::jsonb; v_orders jsonb:='[]'::jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid())
   and not exists(select 1 from public.so_members m where m.tenant_id=t.id and m.user_id=auth.uid())
   and not coalesce(private.so_platform(),false)
 then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;s.days_ahead:=7;s.prep_minutes:=20;
 end if;
 if v_date>=v_today and v_date<=v_today+s.days_ahead and s.enabled and s.schedule_mode<>'DISABLED' then
  select coalesce(jsonb_agg(jsonb_build_object('time',to_char(ts,'HH24:MI'),'left',greatest(0,s.slot_capacity-
      (select coalesce(sum(case when s.capacity_basis='ITEMS' then (select coalesce(sum((line.value->>'qty')::int),0) from jsonb_array_elements(o.items) line) else 1 end),0) from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
       and (o.pickup_at at time zone 'Asia/Taipei')::date=v_date
       and to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI')=to_char(ts,'HH24:MI')
       and o.status not in('REJECTED','CANCELLED')))) order by ts),'[]'::jsonb) into v_slots
  from generate_series((v_date+s.pickup_start)::timestamp,
       (v_date+s.pickup_end)::timestamp - make_interval(mins=>s.interval_minutes),
       make_interval(mins=>s.interval_minutes)) ts
  where ts at time zone 'Asia/Taipei' >= now()+make_interval(mins=>s.min_notice_minutes);
 end if;
 if s.enabled then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'description',m.description,
   'price',m.price,'sort_order',m.sort_order) order by m.sort_order,m.created_at),'[]'::jsonb) into v_catalog
  from public.so_menu_items m where m.tenant_id=t.id and m.active and m.pickup_enabled and not m.pickup_sold_out and m.kind<>'SERVICE' and m.price is not null;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
  'status',o.status,'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'created_at',o.created_at,'customer_name',o.customer_name,'customer_phone',o.customer_phone)
  order by o.created_at desc),'[]'::jsonb) into v_orders
 from (select * from public.so_pickup_orders
       where tenant_id=t.id and user_id=auth.uid() order by created_at desc limit 30) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
    'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
    'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'capacity_basis',s.capacity_basis,'min_notice_minutes',s.min_notice_minutes,
    'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes),
    'day',v_date,'slots',v_slots,'items',v_catalog,'orders',v_orders);
end $function$;

-- so_pickup_calendar
CREATE OR REPLACE FUNCTION public.so_pickup_calendar(p_slug text, p_start date, p_end date, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;v_page integer:=least(greatest(coalesce(p_page,1),1),100000);
  v_total bigint;v_amount numeric;v_rows jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not coalesce(private.so_platform(),false) then
  raise exception '沒有這家店的操作權限' using errcode='42501';end if;
 if private.so_role(t.id)='STAFF'
  and not coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true)
 then raise exception '此員工角色沒有訂餐日曆查詢權限' using errcode='42501';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+41 then
  raise exception '取餐日曆僅能查詢 42 天內的有效期間' using errcode='22023';end if;
 select count(*),coalesce(sum(total),0) into v_total,v_amount
 from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at <= now()-interval '60 seconds' and o.scheduled
 and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
 and o.status not in ('REJECTED','CANCELLED');
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
   'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
   'status',o.status,'items',o.items,'total',o.total
 ) order by o.pickup_at,o.id),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=t.id and o.created_at <= now()-interval '60 seconds' and o.scheduled
   and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
   and o.status not in ('REJECTED','CANCELLED')
   order by o.pickup_at,o.id limit 100 offset (v_page-1)*100) o;
 return jsonb_build_object('total',v_total,'amount',v_amount,
   'page',v_page,'page_size',100,'orders',v_rows);
end $function$;

-- so_pickup_analytics
CREATE OR REPLACE FUNCTION public.so_pickup_analytics(p_slug text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;v_start date;v_end date:=(now() at time zone 'Asia/Taipei')::date;
 v_popular jsonb:='[]'::jsonb;v_hours jsonb:='[]'::jsonb;
 v_on_time bigint:=0;v_has_ready bigint:=0;v_ready_total bigint:=0;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市不存在' using errcode='22023';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有店家管理者可以查看營運分析' using errcode='42501';end if;
 if p_days not in (7,30,90) then raise exception '請選擇 7、30 或 90 天';end if;
 v_start:=v_end-p_days+1;

 select coalesce(jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.qty,'amount',i.amount)
    order by i.qty desc,i.amount desc),'[]'::jsonb) into v_popular from (
   select line.value->>'name' as name,
    sum((line.value->>'qty')::numeric) as qty,
    sum((line.value->>'amount')::numeric) as amount
   from public.so_pickup_orders o
   cross join lateral jsonb_array_elements(o.items) line
   where o.tenant_id=t.id and o.created_at <= now()-interval '60 seconds' and o.status not in ('REJECTED','CANCELLED')
    and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end
   group by line.value->>'name'
   order by qty desc,amount desc
   limit 10
 ) i;
 select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour,'orders',h.orders,'amount',h.amount)
    order by h.hour),'[]'::jsonb) into v_hours from (
   select to_char(o.pickup_at at time zone 'Asia/Taipei','HH24') as hour,
    count(*)::integer as orders,coalesce(sum(o.total),0) as amount
   from public.so_pickup_orders o
   where o.tenant_id=t.id and o.created_at <= now()-interval '60 seconds' and o.status not in ('REJECTED','CANCELLED')
    and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end
   group by to_char(o.pickup_at at time zone 'Asia/Taipei','HH24')
 ) h;
 select count(*) filter (where ready.first_ready is not null),
   count(*) filter (where ready.first_ready <= o.pickup_at),
   count(*)
 into v_has_ready,v_on_time,v_ready_total
 from public.so_pickup_orders o
 left join lateral (
   select min(a.created_at) first_ready from public.so_audit a
   where a.tenant_id=o.tenant_id and a.action='pickup_order_status'
    and a.info->>'order_id'=o.id::text and a.info->>'to'='READY'
 ) ready on true
 where o.tenant_id=t.id and o.created_at <= now()-interval '60 seconds' and o.status in ('READY','PICKED_UP')
   and (o.pickup_at at time zone 'Asia/Taipei')::date between v_start and v_end;
 return jsonb_build_object('popular_items',v_popular,'pickup_hours',v_hours,
   'on_time',v_on_time,'ready_recorded',v_has_ready,'completed_or_ready',v_ready_total);
end $function$;

-- so_pickup_public_board
CREATE OR REPLACE FUNCTION public.so_pickup_public_board(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;v_ready jsonb;v_preparing jsonb;v_count int;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('number','P'||lpad(o.order_no::text,5,'0'),
  'pickup_time',to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI'),'status','READY')
  order by o.pickup_at,o.id),'[]'::jsonb) into v_ready
 from (select * from public.so_pickup_orders where tenant_id=t.id and status='READY'
    and pickup_at>=now()-interval '24 hours' and pickup_at<now()+interval '24 hours'
    order by pickup_at,id limit 30) o;
 select coalesce(jsonb_agg(jsonb_build_object('number','P'||lpad(o.order_no::text,5,'0'),
   'pickup_time',to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI'),'status',o.status)
   order by o.pickup_at,o.id),'[]'::jsonb) into v_preparing
 from (select * from public.so_pickup_orders where tenant_id=t.id
    and status in ('ACCEPTED','PREPARING')
    and pickup_at>=now()-interval '12 hours' and pickup_at<=now()+interval '2 hours'
    order by pickup_at,id limit 30) o;
 select count(*) into v_count from public.so_pickup_orders where tenant_id=t.id and created_at <= now()-interval '60 seconds' and status='NEW'
   and pickup_at>=now()-interval '12 hours' and pickup_at<now()+interval '2 hours';
 return jsonb_build_object('store',jsonb_build_object('name',t.name,'logo_url',t.logo_url,'accent',t.accent),
   'ready',v_ready,'preparing',v_preparing,'pending_count',v_count,
   'checked_at',now());
end $function$;

-- Server-side release notice after the customer's immutable 60-second grace period.
alter table public.so_pickup_orders add column if not exists release_notified_at timestamptz;
update public.so_pickup_orders set release_notified_at=created_at+interval '60 seconds'
 where created_at<=now()-interval '60 seconds' and release_notified_at is null;
create index if not exists so_pickup_release_due_idx on public.so_pickup_orders(created_at)
 where release_notified_at is null and status='NEW';

create or replace function public.so_pickup_edit(
 p_slug text,p_order_id uuid,p_date date,p_time time,p_items jsonb,p_note text,
 p_immediate boolean,p_customer_name text,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 t public.so_tenants;s public.so_pickup_settings;o public.so_pickup_orders;
 v_pickup timestamptz;v_row public.so_menu_items;v_e jsonb;v_id uuid;
 v_qty integer;v_count integer:=0;v_used integer:=0;
 v_total numeric(12,2):=0;v_lines jsonb:='[]'::jsonb;
 v_name text:=btrim(coalesce(p_customer_name,''));
 v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[[:space:]()-]','','g');
 v_note text:=btrim(coalesce(p_note,''));
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市' using errcode='22023';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid())
 then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id for update;
 if not found then raise exception '店家尚未設定取餐方式';end if;
 select * into o from public.so_pickup_orders
 where tenant_id=t.id and id=p_order_id and user_id=auth.uid() for update;
 if not found then raise exception '無權修改這筆訂單' using errcode='42501';end if;
 if o.status<>'NEW' or o.created_at<=now()-interval '60 seconds' then
  raise exception '只能在下單後 60 秒內修改，訂單已交給店家' using errcode='22023';end if;
 if length(v_name) not between 1 and 60 or v_name~'[[:cntrl:]<>]' or v_name~'^[0-9]+$' then
  raise exception '請填寫有效的取餐姓名' using errcode='22023';end if;
 if left(v_phone,4)='+886' then v_phone:='0'||substr(v_phone,5);end if;
 if v_phone !~ '^(09[0-9]{8}|02[235678][0-9]{7}|03[2-689][0-9]{6}|037[2-9][0-9]{5}|04[23][0-9]{7}|04[78][0-9]{6}|049[2-9][0-9]{6}|05[2-7][0-9]{6}|06[235679][0-9]{6}|07[2-9][0-9]{6}|08[478][0-9]{6}|082[2-57-9][0-9]{5}|08266[0-9]{4}|0836[2-9][0-9]{4}|089[2-9][0-9]{5})$' then
  raise exception '請填寫有效台灣手機或市話' using errcode='22023';end if;
 if length(v_note)>200 or p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
  raise exception '餐點或備註格式錯誤' using errcode='22023';end if;
 if coalesce(p_immediate,false) then
  if s.schedule_mode='REQUIRED' then raise exception '此店家必須選擇預約取餐時間';end if;
  -- Keep the promised immediate pickup time if only changing items/notes.
  v_pickup:=case when o.scheduled then now()+make_interval(mins=>s.prep_minutes) else o.pickup_at end;
 else
  if s.schedule_mode='DISABLED' then raise exception '此店家不接受預約取餐時間';end if;
  if p_date is null or p_time is null or p_date<v_today or p_date>v_today+s.days_ahead then
    raise exception '選擇的取餐日期不在開放範圍';end if;
  if p_time<s.pickup_start or p_time>=s.pickup_end
    or (extract(epoch from(p_time-s.pickup_start))::integer/60)%s.interval_minutes<>0 then
   raise exception '此取餐時段未開放';end if;
  v_pickup:=(p_date+p_time) at time zone 'Asia/Taipei';
  if v_pickup<now()+make_interval(mins=>s.min_notice_minutes) then
    raise exception '取餐時間過近，請重新選擇';end if;
 end if;
 for v_e in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_e)<>'object' or coalesce(v_e->>'id','') !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   raise exception '餐點代碼格式錯誤';end if;
  v_id:=(v_e->>'id')::uuid;
  if coalesce(v_e->>'qty','') !~ '^[0-9]{1,2}$' then raise exception '餐點數量格式錯誤';end if;
  v_qty:=(v_e->>'qty')::integer;
  if v_qty not between 1 and 20 then raise exception '單品數量須為 1 至 20';end if;
  if exists(select 1 from jsonb_array_elements(v_lines) x where x->>'id'=v_id::text) then
   raise exception '請合併重複餐點';end if;
  select * into v_row from public.so_menu_items where id=v_id and tenant_id=t.id
   and active and pickup_enabled and not pickup_sold_out and kind<>'SERVICE' and price is not null;
  if not found then raise exception '有餐點已停售，請重新整理菜單';end if;
  v_count:=v_count+v_qty;
  if v_count>100 then raise exception '單筆訂單最多 100 份';end if;
  v_total:=v_total+v_row.price*v_qty;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_row.name,
   'kind',v_row.kind,'qty',v_qty,'unit_price',v_row.price,'amount',v_row.price*v_qty));
 end loop;
 if not coalesce(p_immediate,false) then
  if s.capacity_basis='ITEMS' then
   select coalesce(sum((line.value->>'qty')::integer),0) into v_used
   from public.so_pickup_orders x cross join lateral jsonb_array_elements(x.items) line
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled and x.pickup_at=v_pickup
    and x.status not in('REJECTED','CANCELLED');
   if v_used+v_count>s.slot_capacity then raise exception '此時段餐點份數已額滿';end if;
  else
   select count(*) into v_used from public.so_pickup_orders x
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled and x.pickup_at=v_pickup
    and x.status not in('REJECTED','CANCELLED');
   if v_used>=s.slot_capacity then raise exception '此取餐時段已額滿';end if;
  end if;
 end if;
 update public.so_pickup_orders
 set scheduled=not coalesce(p_immediate,false),pickup_at=v_pickup,items=v_lines,total=v_total,
     note=v_note,customer_name=v_name,customer_phone=v_phone,updated_at=now()
 where id=o.id and tenant_id=t.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'pickup_order_customer_edit',
   jsonb_build_object('order_id',o.id,'old_total',o.total,'new_total',v_total,
     'old_pickup_at',o.pickup_at,'new_pickup_at',v_pickup));
 return jsonb_build_object('changed',true,'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),'total',v_total);
end $fn$;
revoke all on function public.so_pickup_edit(text,uuid,date,time,jsonb,text,boolean,text,text) from public,anon;
grant execute on function public.so_pickup_edit(text,uuid,date,time,jsonb,text,boolean,text,text) to authenticated;

create or replace function private.so_pickup_release_due()
returns void language plpgsql security definer set search_path='' as $fn$
begin
 update public.so_pickup_orders set release_notified_at=clock_timestamp()
 where release_notified_at is null and status='NEW'
 and created_at<=clock_timestamp()-interval '60 seconds';
end $fn$;
revoke all on function private.so_pickup_release_due() from public,anon,authenticated;
drop trigger if exists so_pickup_release_broadcast on public.so_pickup_orders;
create trigger so_pickup_release_broadcast after update of release_notified_at on public.so_pickup_orders
 for each row when (new.release_notified_at is not null)
 execute function private.so_pickup_broadcast();

select cron.schedule('queue-monster-pickup-release','10 seconds',
 'select private.so_pickup_release_due()');
