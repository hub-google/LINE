-- The live Supabase project already applied the migration
-- line_customer_verified_name_autofill_and_linked_sessions on 2026-11-03.
-- This checked-in script preserves its SQL definition for repeatable deployments.
-- Customer display names come ONLY from LINE-verified ID-token/profile data.
alter table public.so_line_links add column if not exists display_name text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='so_line_links_display_name_length') then
    alter table public.so_line_links add constraint so_line_links_display_name_length
      check (display_name is null or char_length(btrim(display_name)) between 1 and 60);
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.so_book(p_slug text, p_date date, p_time text, p_name text, p_party integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_booked int; v_time time; v_booking public.so_reservations;
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
 insert into public.so_reservations(tenant_id,user_id,customer_name,party_size,booking_date,booking_time)
 values(t.id,auth.uid(),trim(p_name),p_party,p_date,v_time) returning * into v_booking;
 return jsonb_build_object('id',v_booking.id,'status','CONFIRMED');
end$function$
;

CREATE OR REPLACE FUNCTION public.so_cancel_booking(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.so_reservations;
begin
 update public.so_reservations as booking set status='CANCELLED',updated_at=now() where id=p_id and exists(select 1 from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=booking.tenant_id and linked.user_id=booking.user_id) and status='CONFIRMED' returning * into r;
 if not found then raise exception '無權限取消或預約已不能取消';end if;
 return jsonb_build_object('id',r.id,'status',r.status);
end$function$
;

CREATE OR REPLACE FUNCTION public.so_cancel_number(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.so_tickets;
begin
 update public.so_tickets as ticket set status='CANCELLED',updated_at=now() where id=p_id and exists(select 1 from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=ticket.tenant_id and linked.user_id=ticket.user_id) and status='WAITING' returning * into k;
 if not found then raise exception '不能取消此號碼';end if;
 return jsonb_build_object('id',k.id,'status',k.status);
end$function$
;

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
 select 'A'||lpad(ticket_no::text,3,'0') into v_current from public.so_tickets where tenant_id=t.id and business_date=v_today and status in('CALLED','SERVING') order by updated_at desc limit 1;
 select count(*) into v_waiting from public.so_tickets where tenant_id=t.id and business_date=v_today and status='WAITING';
 select coalesce(jsonb_agg(jsonb_build_object('time',to_char(gs,'HH24:MI'),'capacity',t.slot_capacity,'booked',
 (select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')),
 'available',greatest(0,t.slot_capacity-(select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')))) order by gs),'[]'::jsonb) into v_slots
 from generate_series((v_day+t.open_time)::timestamp,(v_day+t.close_time)::timestamp - make_interval(mins=>t.slot_minutes),make_interval(mins=>t.slot_minutes)) gs;
 return jsonb_build_object('tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI')),
 'date',v_day,'today',v_today,'slots',v_slots,'current',v_current,'waiting',v_waiting,
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'),'status',k.status,'date',k.business_date) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and k.business_date=v_today),'[]'::jsonb));
end$function$
;

CREATE OR REPLACE FUNCTION public.so_take_number(p_slug text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=(now() at time zone 'Asia/Taipei')::date;v_no int; k public.so_tickets;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or t.modules->>'queue'<>'true' then raise exception '未開放取號';end if;
 select nullif(btrim(l.display_name),'') into p_name from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid() and l.display_name is not null;
 if p_name is null then raise exception '請先完成 LINE 身分授權';end if;

 
 if exists(select 1 from public.so_tickets where tenant_id=t.id and business_date=v_day and user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and status in('WAITING','CALLED','SERVING')) then raise exception '您已有有效的候位號碼';end if;
 select coalesce(max(ticket_no),0)+1 into v_no from public.so_tickets where tenant_id=t.id and business_date=v_day;
 insert into public.so_tickets(tenant_id,user_id,customer_name,business_date,ticket_no)
 values(t.id,auth.uid(),trim(p_name),v_day,v_no) returning * into k;
 return jsonb_build_object('id',k.id,'number','A'||lpad(k.ticket_no::text,3,'0'));
end$function$
;
