-- QueueMonster pickup final workflow: shared menu inventory, contact snapshots, quantity-aware slots, unified CRM.
alter table public.so_menu_items add column if not exists pickup_enabled boolean not null default true;
alter table public.so_menu_items add column if not exists pickup_sold_out boolean not null default false;
alter table public.so_pickup_orders add column if not exists customer_name text;
alter table public.so_pickup_orders add column if not exists customer_phone text;
alter table public.so_pickup_settings add column if not exists capacity_basis text not null default 'ORDERS';
alter table public.so_pickup_settings drop constraint if exists so_pickup_settings_capacity_basis_check;
alter table public.so_pickup_settings add constraint so_pickup_settings_capacity_basis_check check (capacity_basis in ('ORDERS','ITEMS'));
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
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'created_at',o.created_at)
  order by o.created_at desc),'[]'::jsonb) into v_orders
 from (select * from public.so_pickup_orders
       where tenant_id=t.id and user_id=auth.uid() order by created_at desc limit 30) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
    'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
    'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'capacity_basis',s.capacity_basis,'min_notice_minutes',s.min_notice_minutes,
    'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes),
    'day',v_date,'slots',v_slots,'items',v_catalog,'orders',v_orders);
end $function$
;

CREATE OR REPLACE FUNCTION public.so_pickup_place(p_slug text, p_date date, p_time time without time zone, p_items jsonb, p_note text, p_request_id uuid, p_immediate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;s public.so_pickup_settings; v_user uuid:=auth.uid();v_now date:=(now() at time zone 'Asia/Taipei')::date;
 v_pickup timestamptz;v_existing public.so_pickup_orders;v_row public.so_menu_items;
 v_e jsonb;v_id uuid;v_qty int;v_total numeric(12,2):=0;v_lines jsonb:='[]'::jsonb;v_count int:=0;
 v_used int;v_result public.so_pickup_orders;v_note text:=btrim(coalesce(p_note,''));
begin
 if v_user is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市未開放';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=v_user) then
  raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 if p_request_id is null then raise exception '缺少防重複下單識別';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id for update;
 if not found or not s.enabled then raise exception '店家尚未開放線上點餐';end if;
 select * into v_existing from public.so_pickup_orders where tenant_id=t.id and user_id=v_user and request_id=p_request_id;
 if found then return jsonb_build_object('id',v_existing.id,'number','P'||lpad(v_existing.order_no::text,5,'0'),'existing',true);end if;
 if length(v_note)>200 or p_items is null or jsonb_typeof(p_items)<>'array'
   or jsonb_array_length(p_items) not between 1 and 20 then raise exception '餐點或備註格式錯誤';end if;
 if coalesce(p_immediate,false) then
   if s.schedule_mode='REQUIRED' then raise exception '此店家必須選擇預約取餐時間';end if;
   v_pickup:=now()+make_interval(mins=>s.prep_minutes);
 else
   if s.schedule_mode='DISABLED' then raise exception '此店家不接受預約取餐時間';end if;
   if p_date is null or p_time is null or p_date<v_now or p_date>v_now+s.days_ahead then
      raise exception '選擇的取餐日期不在開放範圍';end if;
   if p_time<s.pickup_start or p_time>=s.pickup_end or
      (extract(epoch from (p_time-s.pickup_start))::integer / 60) % s.interval_minutes<>0 then
      raise exception '此取餐時段未開放';end if;
   v_pickup:=(p_date+p_time) at time zone 'Asia/Taipei';
   if v_pickup<now()+make_interval(mins=>s.min_notice_minutes) then
      raise exception '取餐時間過近，請重新選擇';end if;
   select count(*) into v_used from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
    and o.pickup_at=v_pickup and o.status not in('CANCELLED','REJECTED');
   if s.capacity_basis<>'ITEMS' and v_used>=s.slot_capacity then raise exception '此取餐時段已額滿，請選其他時間';end if;
 end if;
 for v_e in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_e)<>'object' or coalesce(v_e->>'id','') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
     raise exception '餐點代碼格式錯誤';end if;
   v_id:=(v_e->>'id')::uuid;
   if coalesce(v_e->>'qty','') !~ '^[0-9]{1,2}$' then raise exception '餐點數量格式錯誤';end if;
   v_qty:=(v_e->>'qty')::integer;
   if v_qty not between 1 and 20 then raise exception '單品數量須為 1 至 20';end if;
   if exists(select 1 from jsonb_array_elements(v_lines) x where x->>'id'=v_id::text) then raise exception '請合併重複餐點';end if;
   select * into v_row from public.so_menu_items
    where id=v_id and tenant_id=t.id and active=true and pickup_enabled=true and pickup_sold_out=false and kind<>'SERVICE' and price is not null;
   if not found then raise exception '有餐點已停售，請重新整理菜單';end if;
   v_count:=v_count+v_qty;
   if v_count>100 then raise exception '單筆訂單最多 100 份';end if;
   v_total:=v_total+v_row.price*v_qty;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_row.name,'kind',v_row.kind,
     'qty',v_qty,'unit_price',v_row.price,'amount',v_row.price*v_qty));
 end loop;

 if not coalesce(p_immediate,false) and s.capacity_basis='ITEMS' then
  select coalesce(sum((line.value->>'qty')::integer),0) into v_used
  from public.so_pickup_orders o
  cross join lateral jsonb_array_elements(o.items) line
  where o.tenant_id=t.id and o.scheduled and o.pickup_at=v_pickup
    and o.status not in ('REJECTED','CANCELLED');
  if v_used+v_count>s.slot_capacity then
   raise exception '此時段可製作的餐點份數已額滿，請選其他時間';
  end if;
 end if;
 insert into public.so_pickup_orders(tenant_id,user_id,request_id,scheduled,pickup_at,items,total,note)
 values(t.id,v_user,p_request_id,not coalesce(p_immediate,false),v_pickup,v_lines,v_total,v_note)
 returning * into v_result;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,v_user,'pickup_order_created',
  jsonb_build_object('order_id',v_result.id,'scheduled',v_result.scheduled));
 return jsonb_build_object('id',v_result.id,'number','P'||lpad(v_result.order_no::text,5,'0'),'existing',false);
end $function$
;

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
 select * into o from public.so_pickup_orders
  where tenant_id=t.id and id=p_order_id for update;
 if not found then raise exception '找不到訂單'; end if;
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
   from public.so_pickup_orders x
   cross join lateral jsonb_array_elements(x.items) line
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled
     and x.pickup_at=o.pickup_at and x.status not in ('REJECTED','CANCELLED');
   v_used:=v_used+(select coalesce(sum((line.value->>'qty')::integer),0)
     from jsonb_array_elements(o.items) line);
  end if;
  if v_used >= coalesce(s.slot_capacity,5) and s.capacity_basis<>'ITEMS' or
     s.capacity_basis='ITEMS' and v_used>coalesce(s.slot_capacity,5) then
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
end $function$
;

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
  'total',o.total,'note',o.note,'customer_name',o.customer_name,'customer_phone',o.customer_phone,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'prepare_at',to_char((o.pickup_at-make_interval(mins=>s.prep_minutes)) at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
  'can_prepare',not o.scheduled or now()>=o.pickup_at-make_interval(mins=>s.prep_minutes),
  'created_at',o.created_at) order by
    case when o.status in ('PICKED_UP','CANCELLED','REJECTED') then 1 else 0 end,
    case when o.status in ('PICKED_UP','CANCELLED','REJECTED') then o.created_at end desc nulls last,
    o.pickup_at,o.created_at),'[]'::jsonb) into v_orders
 from (
  select * from public.so_pickup_orders
   where tenant_id=t.id
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
   'prep_minutes',s.prep_minutes),'orders',v_orders);
end $function$
;

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
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'directory_category',t.directory_category,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'onboarding_complete',t.onboarding_complete,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity,
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode,
 'queue_prefix',t.queue_prefix,'queue_last_number',t.queue_last_number,'queue_round',t.queue_round,
 'booking_prefix',t.booking_prefix,'booking_last_number',t.booking_last_number,'booking_round',t.booking_round),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active,
  'pickup_enabled',m.pickup_enabled,'pickup_sold_out',m.pickup_sold_out) order by m.sort_order,m.created_at)
  from public.so_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$
;

create or replace function public.so_staff_customer_book(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
    where o.tenant_id=v_tenant and o.user_id is not null
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
end $$;
create or replace function public.so_pickup_menu_control(p_slug text,p_item_id uuid,p_enabled boolean,p_sold_out boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants;i public.so_menu_items;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市不存在' using errcode='22023';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
  then raise exception '只有管理者可設定訂餐商品' using errcode='42501';end if;
 update public.so_menu_items set pickup_enabled=coalesce(p_enabled,true),pickup_sold_out=coalesce(p_sold_out,false),updated_at=now()
  where id=p_item_id and tenant_id=t.id and kind<>'SERVICE' returning * into i;
 if not found then raise exception '找不到可訂餐的商品';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'pickup_menu_control',jsonb_build_object('item_id',i.id,'enabled',i.pickup_enabled,'sold_out',i.pickup_sold_out));
 return jsonb_build_object('id',i.id,'pickup_enabled',i.pickup_enabled,'pickup_sold_out',i.pickup_sold_out);
end $$;
revoke all on function public.so_pickup_menu_control(text,uuid,boolean,boolean) from public,anon;
grant execute on function public.so_pickup_menu_control(text,uuid,boolean,boolean) to authenticated;
create or replace function public.so_pickup_place_contact(
 p_slug text,p_date date,p_time time,p_items jsonb,p_note text,p_request_id uuid,p_immediate boolean,
 p_customer_name text,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_tenant uuid;v_name text:=btrim(coalesce(p_customer_name,''));v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[[:space:]()\-]','','g');
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 if length(v_name) not between 1 and 60 or v_name~'[[:cntrl:]<>]'
   then raise exception '請填寫 1～60 字的取餐姓名' using errcode='22023';end if;
 if v_phone !~ '^\+?[0-9]{8,15}$' then raise exception '請填寫有效的聯絡電話（8～15 位數字）' using errcode='22023';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug and status='ACTIVE';
 if v_tenant is null then raise exception '門市不存在' using errcode='22023';end if;
 select public.so_pickup_place(p_slug,p_date,p_time,p_items,p_note,p_request_id,p_immediate) into v_result;
 update public.so_pickup_orders set customer_name=v_name,customer_phone=v_phone,updated_at=now()
 where tenant_id=v_tenant and id=(v_result->>'id')::uuid and user_id=auth.uid()
   and coalesce((v_result->>'existing')::boolean,false)=false;
 return v_result;
end $$;
revoke all on function public.so_pickup_place_contact(text,date,time,jsonb,text,uuid,boolean,text,text) from public,anon;
grant execute on function public.so_pickup_place_contact(text,date,time,jsonb,text,uuid,boolean,text,text) to authenticated;
create or replace function public.so_pickup_save_capacity_settings(
 p_slug text,p_enabled boolean,p_mode text,p_start time,p_end time,
 p_interval integer,p_capacity integer,p_notice integer,p_days integer,p_prep integer,p_capacity_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_tenant uuid;
begin
 if p_capacity_basis not in ('ORDERS','ITEMS') then raise exception '請選擇有效的容量計算方式';end if;
 select public.so_pickup_save_settings(p_slug,p_enabled,p_mode,p_start,p_end,p_interval,p_capacity,p_notice,p_days,p_prep) into v_result;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 update public.so_pickup_settings set capacity_basis=p_capacity_basis,updated_at=now() where tenant_id=v_tenant;
 return v_result||jsonb_build_object('capacity_basis',p_capacity_basis);
end $$;
revoke all on function public.so_pickup_save_capacity_settings(text,boolean,text,time,time,integer,integer,integer,integer,integer,text) from public,anon;
grant execute on function public.so_pickup_save_capacity_settings(text,boolean,text,time,time,integer,integer,integer,integer,integer,text) to authenticated;
