-- LINE: staff deletion is reversible, hidden from customers, and never emits LINE messages.
alter table public.so_reservations add column if not exists deleted_at timestamptz,add column if not exists deleted_by uuid;
alter table public.so_tickets add column if not exists deleted_at timestamptz,add column if not exists deleted_by uuid,add column if not exists hidden_via_reservation boolean not null default false;
create index if not exists so_reservations_visible_idx on public.so_reservations(tenant_id,booking_date,booking_time) where deleted_at is null;
create index if not exists so_tickets_visible_idx on public.so_tickets(tenant_id,business_date,ticket_no) where deleted_at is null;

create or replace function public.so_staff_set_record_deleted(p_slug text,p_kind text,p_id uuid,p_deleted boolean)
returns jsonb language plpgsql security definer set search_path='' as $del$
declare t public.so_tenants; r public.so_reservations; k public.so_tickets; v_booked int; v_linked int:=0;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 if p_kind is null or p_kind not in ('reservation','ticket') or p_id is null or p_deleted is null then raise exception '刪除參數不正確';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有門市操作權限' using errcode='42501';end if;
 if p_kind='reservation' then
   select * into r from public.so_reservations where tenant_id=t.id and id=p_id for update;
   if not found then raise exception '找不到預約';end if;
   if (r.deleted_at is not null)=p_deleted then return jsonb_build_object('changed',false,'deleted',p_deleted);end if;
   if not p_deleted and r.status in ('CONFIRMED','CHECKED_IN') then
     select coalesce(sum(party_size),0) into v_booked from public.so_reservations
     where tenant_id=t.id and booking_date=r.booking_date and booking_time=r.booking_time and id<>r.id
       and status in ('CONFIRMED','CHECKED_IN') and deleted_at is null;
     if v_booked+r.party_size>t.slot_capacity then raise exception '此時段已額滿，無法恢復預約';end if;
   end if;
   if p_deleted then
     update public.so_reservations set deleted_at=now(),deleted_by=auth.uid() where id=r.id;
     update public.so_tickets set deleted_at=now(),deleted_by=auth.uid(),hidden_via_reservation=true
       where tenant_id=t.id and reservation_id=r.id and deleted_at is null;
   else
     update public.so_reservations set deleted_at=null,deleted_by=null where id=r.id;
     update public.so_tickets set deleted_at=null,deleted_by=null,hidden_via_reservation=false
       where tenant_id=t.id and reservation_id=r.id and hidden_via_reservation;
     if (select count(*) from public.so_tickets where tenant_id=t.id and deleted_at is null and status in ('CALLED','SERVING'))>1
       then raise exception '恢復後會有多筆叫號中號碼，請先完成目前服務';end if;
   end if;
   get diagnostics v_linked=row_count;
 else
   select * into k from public.so_tickets where tenant_id=t.id and id=p_id for update;
   if not found then raise exception '找不到號碼牌';end if;
   if (k.deleted_at is not null)=p_deleted then return jsonb_build_object('changed',false,'deleted',p_deleted);end if;
   if not p_deleted and k.reservation_id is not null and exists(select 1 from public.so_reservations x where x.id=k.reservation_id and x.deleted_at is not null)
     then raise exception '所屬預約仍已刪除，請先恢復預約';end if;
   if not p_deleted and k.status in ('CALLED','SERVING') and exists(
     select 1 from public.so_tickets x where x.tenant_id=t.id and x.id<>k.id and x.deleted_at is null and x.status in ('CALLED','SERVING'))
     then raise exception '已有叫號中號碼，請先完成目前服務';end if;
   update public.so_tickets set deleted_at=case when p_deleted then now() else null end,
     deleted_by=case when p_deleted then auth.uid() else null end,hidden_via_reservation=false where id=k.id;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),
   case when p_deleted then 'staff_delete' else 'staff_restore' end,
   jsonb_build_object('kind',p_kind,'id',p_id,'linked_tickets',v_linked,'line_notified',false));
 return jsonb_build_object('changed',true,'deleted',p_deleted,'id',p_id,'line_notified',false);
end $del$;
revoke all on function public.so_staff_set_record_deleted(text,text,uuid,boolean) from public,anon;
grant execute on function public.so_staff_set_record_deleted(text,text,uuid,boolean) to authenticated;

-- so_book_with_items
CREATE OR REPLACE FUNCTION public.so_book_with_items(p_slug text, p_date date, p_time text, p_name text, p_party integer, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_booked int; v_time time; v_booking public.so_reservations;v_items jsonb;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or t.modules->>'reservation' <> 'true' then raise exception '未開放預約';end if;
 select nullif(btrim(l.display_name),'') into p_name from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid() and l.display_name is not null;
 if p_name is null then raise exception '請先完成 LINE 身分授權';end if;

 if p_date < (now() at time zone 'Asia/Taipei')::date or p_date > (now() at time zone 'Asia/Taipei')::date + 30 then raise exception '預約日期須在 30 天內';end if;
 if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '時段格式錯誤';end if;
 v_time:=p_time::time;
 if v_time<t.open_time or v_time+make_interval(mins=>t.slot_minutes)>t.close_time or
 mod((extract(epoch from (v_time-t.open_time))/60)::int,t.slot_minutes)<>0 then raise exception '非營業預約時段';end if;
 if p_party<1 or p_party>20 then raise exception '預約人數格式錯誤';end if;
 select coalesce(sum(party_size),0) into v_booked from public.so_reservations where tenant_id=t.id and booking_date=p_date and booking_time=v_time and deleted_at is null and status in('CONFIRMED','CHECKED_IN');
 if v_booked+p_party>t.slot_capacity then raise exception '該時段已額滿，請重新選擇';end if;
 v_items:=private.so_menu_validate_items(t.id,'BOOKING',p_items);
 insert into public.so_reservations(tenant_id,user_id,customer_name,party_size,booking_date,booking_time,selected_items)
 values(t.id,auth.uid(),trim(p_name),p_party,p_date,v_time,v_items) returning * into v_booking;
 return jsonb_build_object('id',v_booking.id,'status','CONFIRMED');
end$function$;

-- so_cancel_booking
CREATE OR REPLACE FUNCTION public.so_cancel_booking(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_reservations;
begin
 update public.so_reservations as booking set status='CANCELLED',updated_at=now() where id=p_id and exists(select 1 from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=booking.tenant_id and linked.user_id=booking.user_id) and deleted_at is null and status='CONFIRMED' returning * into r;
 if not found then raise exception '無權限取消或預約已不能取消';end if;
 return jsonb_build_object('id',r.id,'status',r.status);
end$function$;

-- so_cancel_number
CREATE OR REPLACE FUNCTION public.so_cancel_number(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.so_tickets;
begin
 update public.so_tickets as ticket set status='CANCELLED',updated_at=now() where id=p_id and exists(select 1 from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=ticket.tenant_id and linked.user_id=ticket.user_id) and deleted_at is null and status='WAITING' returning * into k;
 if not found then raise exception '不能取消此號碼';end if;
 return jsonb_build_object('id',k.id,'status',k.status);
end$function$;

-- so_customer_edit_booking_with_items
CREATE OR REPLACE FUNCTION public.so_customer_edit_booking_with_items(p_slug text, p_booking_id uuid, p_date date, p_time text, p_party integer, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.so_tenants;
  r public.so_reservations;
  v_time time;
  v_items jsonb;
  v_booked int;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select * into t from public.so_tenants
  where slug=p_slug and status='ACTIVE' for update;
  if not found or t.modules->>'reservation'<>'true' then
    raise exception '此門市尚未開放預約'; end if;
  select * into r from public.so_reservations
  where id=p_booking_id and tenant_id=t.id and deleted_at is null for update;
  if not found then raise exception '找不到預約資料'; end if;
  if not exists(
    select 1 from public.so_line_links active_link
    join public.so_line_links linked
      on linked.tenant_id=active_link.tenant_id
      and linked.line_sub=active_link.line_sub
    where active_link.user_id=auth.uid()
      and active_link.tenant_id=t.id
      and linked.user_id=r.user_id
  ) then
    raise exception '沒有修改此預約的權限' using errcode='42501';
  end if;
  if r.status<>'CONFIRMED' then
    raise exception '僅能修改尚未報到的有效預約';
  end if;
  if p_date is null or p_date<v_today or p_date>v_today+30 then
    raise exception '請選擇未來 30 天內的預約日期';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '請選擇有效的預約時間';
  end if;
  v_time:=p_time::time;
  if v_time<t.open_time
    or v_time+make_interval(mins=>t.slot_minutes)>t.close_time
    or mod((extract(epoch from (v_time-t.open_time))/60)::int,t.slot_minutes)<>0 then
    raise exception '所選時間不在可預約時段';
  end if;
  if p_party is null or p_party<1 or p_party>20 then
    raise exception '預約人數需在 1 至 20 人之間';
  end if;
  v_items:=private.so_menu_validate_items(t.id,'BOOKING',coalesce(
    p_items,
    (select coalesce(jsonb_agg(elem->'id'),'[]'::jsonb)
     from jsonb_array_elements(r.selected_items) elem)
  ));
  if r.booking_date=p_date and r.booking_time=v_time and r.party_size=p_party and r.selected_items=v_items then
    return jsonb_build_object('id',r.id,'changed',false,
      'status',r.status,'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),
      'party',r.party_size);
  end if;
  select coalesce(sum(party_size),0) into v_booked
    from public.so_reservations
    where tenant_id=t.id and booking_date=p_date and booking_time=v_time
      and id<>r.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
  if v_booked+p_party>t.slot_capacity then
    raise exception '這個時段剩餘名額不足，請調整人數或時段';
  end if;
  update public.so_reservations
    set booking_date=p_date,booking_time=v_time,party_size=p_party,selected_items=v_items,updated_at=now()
    where id=r.id returning * into r;
  insert into public.so_audit(tenant_id,actor,action,info)
    values(t.id,auth.uid(),'customer_edit_booking',
      jsonb_build_object('reservation',r.id,'date',r.booking_date,'time',r.booking_time,'party',r.party_size));
  return jsonb_build_object('id',r.id,'changed',true,
    'status',r.status,'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),
    'party',r.party_size,'event_id',r.line_update_event_id);
end $function$;

-- so_my_merchant_activity
CREATE OR REPLACE FUNCTION public.so_my_merchant_activity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with linked_users as (
    select ll.tenant_id,ll.user_id
    from public.so_line_links ll
    where ll.user_id=auth.uid()
       or ll.line_sub in (
         select source.line_sub from public.so_line_links source
         where source.user_id=auth.uid()
       )
  ), mine as (
    select t.slug,t.name,t.modules,
      (select count(*) from public.so_reservations r
       where r.tenant_id=t.id and r.deleted_at is null and r.booking_date >= (now() at time zone 'Asia/Taipei')::date-30
         and (r.user_id=auth.uid() or exists(
           select 1 from linked_users u where u.tenant_id=t.id and u.user_id=r.user_id
         ))) as booking_count,
      (select count(*) from public.so_tickets k
       where k.tenant_id=t.id and k.deleted_at is null and k.business_date >= (now() at time zone 'Asia/Taipei')::date-2
         and (k.user_id=auth.uid() or exists(
           select 1 from linked_users u where u.tenant_id=t.id and u.user_id=k.user_id
         ))) as ticket_count
    from public.so_tenants t
    where t.status='ACTIVE'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'name',name,'booking_count',booking_count,
    'ticket_count',ticket_count,'modules',modules
  ) order by name),'[]'::jsonb)
  from mine
  where booking_count > 0 or ticket_count > 0;
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
      where t.created_by=auth.uid() and t.slug like 'qa-%'
      and m.user_id=auth.uid() and m.role='OWNER');
begin
  if not v_platform and not v_test then
    raise exception '沒有平台管理員權限' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',t.id,'slug',t.slug,'name',t.name,'status',t.status,'modules',t.modules,
    'line_status',t.line_status,'created_at',t.created_at,
    'reservations',(select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null),
    'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null),
    'staff',(select count(*) from public.so_members m where m.tenant_id=t.id),
    'today_reservations',(select count(*) from public.so_reservations r
      where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_today and r.status not in ('CANCELLED','NO_SHOW')),
    'today_tickets',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today),
    'today_waiting',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='WAITING'),
    'today_completed',(select count(*) from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today and k.status='COMPLETED'),
    'current_number',(select 'A'||lpad(k.ticket_no::text,3,'0')
      from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_today
      and k.status in ('CALLED','SERVING') order by k.updated_at desc limit 1)
  ) order by t.created_at desc) from public.so_tenants t
  where v_platform or (v_test and t.created_by=auth.uid() and t.slug like 'qa-%')),'[]'::jsonb);
end
$function$;

-- so_public_state
CREATE OR REPLACE FUNCTION public.so_public_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_today date:=(now() at time zone 'Asia/Taipei')::date; v_slots jsonb;v_current text;v_waiting int;
begin
 if auth.uid() is null then raise exception '請先完成登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '企業網站不存在或未開放';end if;
 select 'A'||lpad(ticket_no::text,3,'0') into v_current from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING') order by updated_at desc limit 1;
 select count(*) into v_waiting from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING';
 select coalesce(jsonb_agg(jsonb_build_object('time',to_char(gs,'HH24:MI'),'capacity',t.slot_capacity,'booked',
 (select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')),
 'available',greatest(0,t.slot_capacity-(select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')))) order by gs),'[]'::jsonb) into v_slots
 from generate_series((v_day+t.open_time)::timestamp,(v_day+t.close_time)::timestamp - make_interval(mins=>t.slot_minutes),make_interval(mins=>t.slot_minutes)) gs;
 return jsonb_build_object('tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,
  'price',m.price,'sort_order',m.sort_order,'active',m.active)
  order by m.sort_order,m.created_at)
 from public.so_menu_items m where m.tenant_id=t.id and m.active),'[]'::jsonb),
 'date',v_day,'today',v_today,'slots',v_slots,'current',v_current,'waiting',v_waiting,
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','CALLED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$;

-- so_staff_action
CREATE OR REPLACE FUNCTION public.so_staff_action(p_slug text, p_action text, p_ticket_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;r public.so_reservations;v_day date:=(now() at time zone 'Asia/Taipei')::date;v_number int;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 if p_action='checkin' then
  if t.modules->>'reservation'<>'true' then raise exception '未開通預約';end if;
  select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id and deleted_at is null and booking_date=v_day and status='CONFIRMED' for update;
  if not found then raise exception '預約不存在、非今日或已報到';end if;
  -- Staff check-in is not blocked by another ticket of the same customer.
  select coalesce(max(ticket_no),0)+1 into v_number from public.so_tickets where tenant_id=t.id and business_date=v_day;
  insert into public.so_tickets(tenant_id,user_id,customer_name,reservation_id,business_date,ticket_no,source)
  values(t.id,r.user_id,r.customer_name,r.id,v_day,v_number,'RESERVATION') returning * into k;
  update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;
 elsif p_action='call' then
  if t.modules->>'calling'<>'true' then raise exception '未開通叫號';end if;
  if exists(select 1 from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING')) then raise exception '請先完成目前服務';end if;
  select * into k from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING' order by business_date,ticket_no limit 1 for update;
  if not found then raise exception '目前沒有等候中的號碼';end if;
  update public.so_tickets set status='CALLED',updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
 elsif p_action in('recall','start','complete','pass','return','cancel') then
  select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
  if not found then raise exception '找不到今日號碼';end if;
  if p_action='recall' then
    if k.status<>'CALLED' then raise exception '僅能重叫已叫號票券';end if;
    update public.so_tickets set updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
  elsif p_action='start' then
    if k.status<>'CALLED' then raise exception '請先叫號';end if;
    update public.so_tickets set status='SERVING',updated_at=now() where id=k.id;
  elsif p_action='complete' then
    if k.status not in('CALLED','SERVING') then raise exception '目前無法完成服務';end if;
    update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id;
    update public.so_reservations set status='COMPLETED',updated_at=now() where id=k.reservation_id and deleted_at is null and status='CHECKED_IN';
  elsif p_action='pass' then
    if k.status<>'CALLED' then raise exception '僅能標記已叫號為過號';end if;
    update public.so_tickets set status='PASSED',updated_at=now() where id=k.id;
  elsif p_action='return' then
    if k.status<>'PASSED' then raise exception '只有過號可以回復';end if;
    update public.so_tickets set status='WAITING',updated_at=now() where id=k.id;
  elsif p_action='cancel' then
    if k.status not in('WAITING','PASSED') then raise exception '無法取消此號碼';end if;
    update public.so_tickets set status='CANCELLED',updated_at=now() where id=k.id;
  end if;
 elsif p_action in('cancel_booking','no_show') then
  update public.so_reservations set status=case when p_action='no_show' then 'NO_SHOW' else 'CANCELLED' end,updated_at=now()
  where id=p_reservation_id and tenant_id=t.id and deleted_at is null and booking_date=v_day and status='CONFIRMED' returning * into r;
  if not found then raise exception '不可修改此預約';end if;
 else raise exception '不支援的操作';
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),p_action,jsonb_build_object('ticket',p_ticket_id,'reservation',p_reservation_id));
 return jsonb_build_object('success',true,'number',case when k.id is null then null else 'A'||lpad(k.ticket_no::text,3,'0') end,'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end$function$;

-- so_staff_set_reservation_status
CREATE OR REPLACE FUNCTION public.so_staff_set_reservation_status(p_slug text, p_reservation_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 r public.so_reservations;
 k public.so_tickets;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
 v_booked integer;
 v_no integer;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if t.modules->>'reservation'<>'true' then raise exception '門市尚未啟用預約'; end if;
 if p_status is null or p_status not in ('CONFIRMED','CHECKED_IN','COMPLETED','NO_SHOW','CANCELLED') then
   raise exception '不支援的預約狀態';
 end if;
 select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id and deleted_at is null for update;
 if not found then raise exception '找不到今日或未來的預約'; end if;
 if r.booking_date>v_day and p_status not in ('CONFIRMED','CANCELLED') then
   raise exception '未來的預約僅能保留或取消；到店報到、未到及完成請於預約當天操作';
 end if;
 v_old:=r.status;
 if p_expected_status is distinct from v_old then
   raise exception '此預約已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'reservation_id',r.id,'previous_status',v_old,'status',v_old);
 end if;
 if p_status in ('CONFIRMED','CHECKED_IN') and v_old not in ('CONFIRMED','CHECKED_IN') then
   select coalesce(sum(party_size),0) into v_booked from public.so_reservations
    where tenant_id=t.id and booking_date=r.booking_date and booking_time=r.booking_time and id<>r.id
      and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
   if v_booked+r.party_size>t.slot_capacity then
     raise exception '此時段已額滿，無法恢復預約，請先調整名額或其他預約';
   end if;
 end if;
 select * into k from public.so_tickets where reservation_id=r.id and deleted_at is null for update;
 if p_status='CHECKED_IN' then
   -- Staff check-in may coexist with other active tickets for the same customer.
   if k.id is null then
     select coalesce(max(ticket_no),0)+1 into v_no from public.so_tickets where tenant_id=t.id and business_date=v_day;
     insert into public.so_tickets(tenant_id,user_id,customer_name,reservation_id,business_date,ticket_no,source,status)
      values(t.id,r.user_id,r.customer_name,r.id,v_day,v_no,'RESERVATION','WAITING') returning * into k;
   elsif k.status not in ('WAITING','CALLED','SERVING','PASSED') then
     update public.so_tickets set status='WAITING',updated_at=now() where id=k.id;
   end if;
 elsif k.id is not null then
   update public.so_tickets set status=case when p_status='COMPLETED' then 'COMPLETED' else 'CANCELLED' end,
     updated_at=now() where id=k.id;
 end if;
 update public.so_reservations set status=p_status,updated_at=now() where id=r.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_reservation_status',jsonb_build_object('reservation',r.id,'ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'reservation_id',r.id,'ticket_id',k.id,'previous_status',v_old,'status',p_status);
end $function$;

-- so_staff_set_ticket_status
CREATE OR REPLACE FUNCTION public.so_staff_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 k public.so_tickets;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('WAITING','CALLED','SERVING','COMPLETED','PASSED','CANCELLED') then
   raise exception '不支援的叫號狀態';
 end if;
 select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
 if not found then raise exception '找不到今日號碼牌'; end if;
 v_old:=k.status;
 if p_expected_status is distinct from v_old then
   raise exception '此號碼已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number','A'||lpad(k.ticket_no::text,3,'0'),'line_call_event_id',k.line_call_event_id);
 end if;
 if p_status in ('CALLED','SERVING') and t.modules->>'calling' <> 'true' then
   raise exception '門市尚未啟用叫號功能';
 end if;
 if p_status in ('CALLED','SERVING') and exists (
  select 1 from public.so_tickets v where v.tenant_id=t.id and v.deleted_at is null and v.id<>k.id and v.status in ('CALLED','SERVING')
 ) then raise exception '目前已有服務中的號碼，請先結束或修改該號碼'; end if;
 -- Staff may correct or restore multiple tickets for the same customer.
 update public.so_tickets set status=p_status,updated_at=now(),line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else k.line_call_event_id end where id=k.id returning * into k;
 if k.reservation_id is not null then
   update public.so_reservations set
     status=case when p_status='COMPLETED' then 'COMPLETED'
                 when p_status='CANCELLED' then 'CANCELLED'
                 else 'CHECKED_IN' end,
     updated_at=now()
   where id=k.reservation_id and tenant_id=t.id and deleted_at is null;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number','A'||lpad(k.ticket_no::text,3,'0'),'line_call_event_id',k.line_call_event_id);
end $function$;

-- so_staff_state
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
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity,
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active) order by m.sort_order,m.created_at)
  from public.so_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.customer_name,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$;

-- so_staff_worklist
CREATE OR REPLACE FUNCTION public.so_staff_worklist(p_slug text, p_history_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_history_days not in (7,14,30,90) then
   raise exception '只能查詢最近 7、14、30 或 90 天的已處理紀錄';
 end if;
 return jsonb_build_object(
  'pending_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.customer_name,'party',r.party_size,
      'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
      'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'selected_items',r.selected_items
    ) order by r.booking_date,r.booking_time,r.created_at)
    from (
      select * from public.so_reservations
      where tenant_id=t.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN')
      order by booking_date,booking_time,created_at limit 500
    ) r
  ), '[]'::jsonb),
  'processed_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.customer_name,'party',r.party_size,
      'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
      'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'selected_items',r.selected_items
    ) order by r.updated_at desc,r.created_at desc)
    from (
      select * from public.so_reservations
      where tenant_id=t.id and deleted_at is null and status in ('COMPLETED','CANCELLED','NO_SHOW')
        and updated_at>=now()-make_interval(days=>p_history_days)
      order by updated_at desc,created_at desc limit 500
    ) r
  ), '[]'::jsonb),
  'active_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items
    ) order by k.business_date,k.ticket_no)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and deleted_at is null and status in ('WAITING','CALLED','SERVING','PASSED')
      order by business_date,ticket_no limit 500
    ) k
  ), '[]'::jsonb),
  'processed_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items
    ) order by k.updated_at desc,k.ticket_no desc)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and deleted_at is null and status in ('COMPLETED','CANCELLED')
        and updated_at>=now()-make_interval(days=>p_history_days)
      order by updated_at desc,ticket_no desc limit 500
    ) k
  ), '[]'::jsonb),
 'deleted_reservations',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',r.id,'name',r.customer_name,'party',r.party_size,
     'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
     'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at,
     'selected_items',r.selected_items) order by r.deleted_at desc)
   from (select * from public.so_reservations where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) r
 ),'[]'::jsonb),
 'deleted_tickets',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),
     'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),
     'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
     'created_at',k.created_at,'updated_at',k.updated_at,'deleted_at',k.deleted_at,
     'selected_items',k.selected_items) order by k.deleted_at desc)
   from (select * from public.so_tickets where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) k
 ),'[]'::jsonb)
 );
end $function$;

-- so_take_number_with_items
CREATE OR REPLACE FUNCTION public.so_take_number_with_items(p_slug text, p_name text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=(now() at time zone 'Asia/Taipei')::date;v_no int; k public.so_tickets;v_items jsonb;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or t.modules->>'queue'<>'true' then raise exception '未開放取號';end if;
 select nullif(btrim(l.display_name),'') into p_name from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid() and l.display_name is not null;
 if p_name is null then raise exception '請先完成 LINE 身分授權';end if;

 
 if exists(select 1 from public.so_tickets where tenant_id=t.id and business_date=v_day and user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and deleted_at is null and status in('WAITING','CALLED','SERVING')) then raise exception '您已有有效的候位號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',p_items);
 select coalesce(max(ticket_no),0)+1 into v_no from public.so_tickets where tenant_id=t.id and business_date=v_day;
 insert into public.so_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,selected_items)
 values(t.id,auth.uid(),trim(p_name),v_day,v_no,v_items) returning * into k;
 return jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'));
end$function$;
