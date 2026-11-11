-- Preserve one pickup-order state machine; make corrections reversible for shop staff.
-- Concurrency check, merchant isolation, status audit and scheduled-slot capacity are retained.
create or replace function public.so_pickup_update(
 p_slug text,p_order_id uuid,p_expected text,p_status text)
returns jsonb language plpgsql security definer set search_path=''
as $$
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
  select * into s from public.so_pickup_settings where tenant_id=t.id;
  select count(*) into v_used from public.so_pickup_orders x
   where x.tenant_id=t.id and x.id<>o.id and x.scheduled
    and x.pickup_at=o.pickup_at and x.status not in ('REJECTED','CANCELLED');
  if v_used >= coalesce(s.slot_capacity,5) then
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
end $$;

-- Include older completed/rejected orders for corrections, not just the last 48 hours.
-- Prioritize currently open orders, then the most recently closed records.
create or replace function public.so_pickup_staff(p_slug text)
returns jsonb language plpgsql security definer set search_path=''
as $$
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
   'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,
   'min_notice_minutes',s.min_notice_minutes,'days_ahead',s.days_ahead,
   'prep_minutes',s.prep_minutes),'orders',v_orders);
end $$;
revoke all on function public.so_pickup_update(text,uuid,text,text) from public,anon;
revoke all on function public.so_pickup_staff(text) from public,anon;
grant execute on function public.so_pickup_update(text,uuid,text,text) to authenticated;
grant execute on function public.so_pickup_staff(text) to authenticated;