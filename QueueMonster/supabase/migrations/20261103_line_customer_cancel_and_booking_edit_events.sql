-- Add idempotent notification events for cancellation and reservation edits.
alter table public.so_tickets add column if not exists line_cancel_event_id uuid;
alter table public.so_reservations add column if not exists line_cancel_event_id uuid, add column if not exists line_update_event_id uuid;

CREATE OR REPLACE FUNCTION public.so_ticket_cancel_notification_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'CANCELLED' and old.status is distinct from new.status then
    new.line_cancel_event_id := gen_random_uuid();
  end if;
  return new;
end $function$
;
drop trigger if exists so_ticket_cancel_notification_stamp on public.so_tickets;
create trigger so_ticket_cancel_notification_stamp
before update on public.so_tickets
for each row execute function public.so_ticket_cancel_notification_stamp();

CREATE OR REPLACE FUNCTION public.so_booking_notification_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'CANCELLED' and old.status is distinct from new.status then
    new.line_cancel_event_id := gen_random_uuid();
  end if;
  if new.booking_date is distinct from old.booking_date
     or new.booking_time is distinct from old.booking_time
     or new.party_size is distinct from old.party_size then
    new.line_update_event_id := gen_random_uuid();
  end if;
  return new;
end $function$
;
drop trigger if exists so_booking_notification_stamp on public.so_reservations;
create trigger so_booking_notification_stamp
before update on public.so_reservations
for each row execute function public.so_booking_notification_stamp();

CREATE OR REPLACE FUNCTION public.so_customer_edit_booking(p_slug text, p_booking_id uuid, p_date date, p_time text, p_party integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.so_tenants;
  r public.so_reservations;
  v_time time;
  v_booked int;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select * into t from public.so_tenants
  where slug=p_slug and status='ACTIVE' for update;
  if not found or t.modules->>'reservation'<>'true' then
    raise exception '此門市尚未開放預約'; end if;
  select * into r from public.so_reservations
  where id=p_booking_id and tenant_id=t.id for update;
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
  if r.booking_date=p_date and r.booking_time=v_time and r.party_size=p_party then
    return jsonb_build_object('id',r.id,'changed',false,
      'status',r.status,'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),
      'party',r.party_size);
  end if;
  select coalesce(sum(party_size),0) into v_booked
    from public.so_reservations
    where tenant_id=t.id and booking_date=p_date and booking_time=v_time
      and id<>r.id and status in ('CONFIRMED','CHECKED_IN');
  if v_booked+p_party>t.slot_capacity then
    raise exception '這個時段剩餘名額不足，請調整人數或時段';
  end if;
  update public.so_reservations
    set booking_date=p_date,booking_time=v_time,party_size=p_party,updated_at=now()
    where id=r.id returning * into r;
  insert into public.so_audit(tenant_id,actor,action,info)
    values(t.id,auth.uid(),'customer_edit_booking',
      jsonb_build_object('reservation',r.id,'date',r.booking_date,'time',r.booking_time,'party',r.party_size));
  return jsonb_build_object('id',r.id,'changed',true,
    'status',r.status,'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),
    'party',r.party_size,'event_id',r.line_update_event_id);
end $function$
;
revoke all on function public.so_customer_edit_booking(text,uuid,date,text,integer) from public,anon;
grant execute on function public.so_customer_edit_booking(text,uuid,date,text,integer) to authenticated;
