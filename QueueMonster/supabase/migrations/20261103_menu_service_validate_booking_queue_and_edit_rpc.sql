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
 select coalesce(sum(party_size),0) into v_booked from public.so_reservations where tenant_id=t.id and booking_date=p_date and booking_time=v_time and status in('CONFIRMED','CHECKED_IN');
 if v_booked+p_party>t.slot_capacity then raise exception '該時段已額滿，請重新選擇';end if;
 v_items:=private.so_menu_validate_items(t.id,'BOOKING',p_items);
 insert into public.so_reservations(tenant_id,user_id,customer_name,party_size,booking_date,booking_time,selected_items)
 values(t.id,auth.uid(),trim(p_name),p_party,p_date,v_time,v_items) returning * into v_booking;
 return jsonb_build_object('id',v_booking.id,'status','CONFIRMED');
end$function$
;

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

 
 if exists(select 1 from public.so_tickets where tenant_id=t.id and business_date=v_day and user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and status in('WAITING','CALLED','SERVING')) then raise exception '您已有有效的候位號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',p_items);
 select coalesce(max(ticket_no),0)+1 into v_no from public.so_tickets where tenant_id=t.id and business_date=v_day;
 insert into public.so_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,selected_items)
 values(t.id,auth.uid(),trim(p_name),v_day,v_no,v_items) returning * into k;
 return jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'));
end$function$
;

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
      and id<>r.id and status in ('CONFIRMED','CHECKED_IN');
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
end $function$
;

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
     or new.party_size is distinct from old.party_size
     or new.selected_items is distinct from old.selected_items then
    new.line_update_event_id := gen_random_uuid();
  end if;
  if new.status = 'CONFIRMED' and old.status = 'CANCELLED' then
    new.line_restore_event_id := gen_random_uuid();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.so_book(p_slug text, p_date date, p_time text, p_name text, p_party integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return public.so_book_with_items(p_slug,p_date,p_time,p_name,p_party,'[]'::jsonb); end $function$
;

CREATE OR REPLACE FUNCTION public.so_take_number(p_slug text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return public.so_take_number_with_items(p_slug,p_name,'[]'::jsonb); end $function$
;

CREATE OR REPLACE FUNCTION public.so_customer_edit_booking(p_slug text, p_booking_id uuid, p_date date, p_time text, p_party integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin return public.so_customer_edit_booking_with_items(p_slug,p_booking_id,p_date,p_time,p_party,null);end $function$
;

revoke all on function public.so_book_with_items(text,date,text,text,integer,jsonb) from public,anon;
grant execute on function public.so_book_with_items(text,date,text,text,integer,jsonb) to authenticated;
revoke all on function public.so_take_number_with_items(text,text,jsonb) from public,anon;
grant execute on function public.so_take_number_with_items(text,text,jsonb) to authenticated;
revoke all on function public.so_customer_edit_booking_with_items(text,uuid,date,text,integer,jsonb) from public,anon;
grant execute on function public.so_customer_edit_booking_with_items(text,uuid,date,text,integer,jsonb) to authenticated;
