-- Reuse the same staff/member roles and tenancy boundaries for pickup permissions.
create table if not exists public.so_pickup_permissions(
 tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
 staff_can_view boolean not null default true,
 staff_can_update boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.so_pickup_permissions enable row level security;
revoke all on public.so_pickup_permissions from public,anon,authenticated;
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
   'prep_minutes',s.prep_minutes),'can_update',(
 private.so_role(t.id)<>'STAFF' or coalesce(private.so_platform(),false)
 or coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true)
 ),'staff_can_view',coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true),
 'staff_can_update',coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true),
 'orders',v_orders);
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
 if private.so_role(t.id)='STAFF'
  and (not coalesce((select p.staff_can_view from public.so_pickup_permissions p where p.tenant_id=t.id),true)
    or not coalesce((select p.staff_can_update from public.so_pickup_permissions p where p.tenant_id=t.id),true))
 then raise exception '此員工角色沒有修改訂餐狀態的權限' using errcode='42501';end if;
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
end $function$
;
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
end $function$
;
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
 from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
 and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
 and o.status not in ('REJECTED','CANCELLED');
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
   'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),
   'status',o.status,'items',o.items,'total',o.total
 ) order by o.pickup_at,o.id),'[]'::jsonb) into v_rows
 from (select * from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
   and (o.pickup_at at time zone 'Asia/Taipei')::date between p_start and p_end
   and o.status not in ('REJECTED','CANCELLED')
   order by o.pickup_at,o.id limit 100 offset (v_page-1)*100) o;
 return jsonb_build_object('total',v_total,'amount',v_amount,
   'page',v_page,'page_size',100,'orders',v_rows);
end $function$
;
create or replace function public.so_pickup_set_staff_permissions(p_slug text,p_can_view boolean,p_can_update boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '門市不存在' using errcode='22023';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有管理者可修改員工訂餐權限' using errcode='42501';end if;
 if p_can_view is null or p_can_update is null or (not p_can_view and p_can_update) then
  raise exception '沒有檢視權限的員工不能具有修改權限' using errcode='22023';end if;
 insert into public.so_pickup_permissions(tenant_id,staff_can_view,staff_can_update)
 values(t.id,p_can_view,p_can_update)
 on conflict(tenant_id) do update set staff_can_view=excluded.staff_can_view,staff_can_update=excluded.staff_can_update,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'pickup_staff_permission',jsonb_build_object('view',p_can_view,'update',p_can_update));
 return jsonb_build_object('staff_can_view',p_can_view,'staff_can_update',p_can_update);
end $$;
revoke all on function public.so_pickup_set_staff_permissions(text,boolean,boolean) from public,anon;
grant execute on function public.so_pickup_set_staff_permissions(text,boolean,boolean) to authenticated;
