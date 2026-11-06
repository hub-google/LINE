
alter table public.so_reservations add column if not exists customer_phone text;
alter table public.so_tickets add column if not exists line_restore_event_id uuid;
do $guard$ begin
 if not exists(select 1 from pg_constraint where conname='so_reservation_customer_phone_format' and conrelid='public.so_reservations'::regclass) then
  alter table public.so_reservations add constraint so_reservation_customer_phone_format
  check(customer_phone is null or customer_phone ~ '^09[0-9]{8}$');
 end if;
end $guard$;
create or replace function public.so_book_with_contact_once(
 p_slug text,p_date date,p_time text,p_name text,p_phone text,p_party integer,p_items jsonb,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_result jsonb;v_name text:=btrim(coalesce(p_name,''));v_phone text:=regexp_replace(coalesce(p_phone,''),'[[:space:]() -]','','g');v_booking public.so_reservations;
begin
 if auth.uid() is null then raise exception '請先完成 LINE 身分驗證';end if;
 if v_name='' or char_length(v_name)>80 or v_name ~ '[[:cntrl:]]' then raise exception '請填寫 1～80 字的預約姓名';end if;
 if v_phone ~ '^\+8869[0-9]{8}$' then v_phone:='0'||substring(v_phone from 5);end if;
 if v_phone !~ '^09[0-9]{8}$' then raise exception '請輸入有效的台灣手機號碼';end if;
 v_result:=public.so_book_with_items_once(p_slug,p_date,p_time,v_name,p_party,p_items,p_request_id);
 select * into v_booking from public.so_reservations where id=(v_result->>'id')::uuid and user_id=auth.uid() for update;
 if not found then raise exception '找不到本人的預約';end if;
 if coalesce((v_result->>'replayed')::boolean,false) then
  if v_booking.customer_name<>v_name or v_booking.customer_phone is distinct from v_phone then
   raise exception '預約資料已變更，請重新送出新的預約請求';end if;
 else
  update public.so_reservations set customer_name=v_name,customer_phone=v_phone,updated_at=now() where id=v_booking.id;
 end if;
 return v_result;
end $func$;
revoke all on function public.so_book_with_contact_once(text,date,text,text,text,integer,jsonb,uuid) from public,anon;
grant execute on function public.so_book_with_contact_once(text,date,text,text,text,integer,jsonb,uuid) to authenticated;
create or replace function public.so_update_booking_contact(
 p_slug text,p_booking_id uuid,p_name text,p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_name text:=btrim(coalesce(p_name,''));v_phone text:=regexp_replace(coalesce(p_phone,''),'[[:space:]() -]','','g');v_tenant uuid;v_booking public.so_reservations;
begin
 if auth.uid() is null then raise exception '請先登入 LINE';end if;
 if v_name='' or char_length(v_name)>80 or v_name ~ '[[:cntrl:]]' then raise exception '請填寫 1～80 字的預約姓名';end if;
 if v_phone ~ '^\+8869[0-9]{8}$' then v_phone:='0'||substring(v_phone from 5);end if;
 if v_phone !~ '^09[0-9]{8}$' then raise exception '請輸入有效的台灣手機號碼';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug and status='ACTIVE';
 if v_tenant is null then raise exception '找不到門市';end if;
 select * into v_booking from public.so_reservations where id=p_booking_id and tenant_id=v_tenant and deleted_at is null for update;
 if not found then raise exception '找不到預約';end if;
 if not exists(select 1 from public.so_line_links a
  join public.so_line_links b on b.tenant_id=a.tenant_id and b.line_sub=a.line_sub
  where a.user_id=auth.uid() and a.tenant_id=v_tenant and b.user_id=v_booking.user_id) then
  raise exception '沒有修改此預約的權限' using errcode='42501';end if;
 if v_booking.status<>'CONFIRMED' then raise exception '僅能修改有效且未報到的預約';end if;
 if v_booking.customer_name=v_name and v_booking.customer_phone is not distinct from v_phone then
  return jsonb_build_object('id',v_booking.id,'changed',false);end if;
 update public.so_reservations set customer_name=v_name,customer_phone=v_phone,
  line_update_event_id=gen_random_uuid(),updated_at=now() where id=v_booking.id returning * into v_booking;
 insert into public.so_audit(tenant_id,actor,action,info)
  values(v_tenant,auth.uid(),'update_booking_contact',jsonb_build_object('reservation_id',v_booking.id));
 return jsonb_build_object('id',v_booking.id,'changed',true,'event_id',v_booking.line_update_event_id);
end $func$;
revoke all on function public.so_update_booking_contact(text,uuid,text,text) from public,anon;
grant execute on function public.so_update_booking_contact(text,uuid,text,text) to authenticated;
alter table public.so_line_push_log drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log add constraint so_line_push_log_event_kind_check check(
 event_kind in ('CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED','TICKET_RESTORED',
 'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR','RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H'));
alter table public.so_line_notice_outbox drop constraint if exists so_line_notice_outbox_event_kind_check;
alter table public.so_line_notice_outbox add constraint so_line_notice_outbox_event_kind_check check(
 event_kind in ('CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED','TICKET_RESTORED',
 'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR','RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H'));
CREATE OR REPLACE FUNCTION public.so_staff_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 k public.so_tickets;
 hp public.so_queue_hold_policy;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','COMPLETED','PASSED','CANCELLED') then
   raise exception '不支援的叫號狀態';
 end if;
 select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
 if not found then raise exception '找不到今日號碼牌'; end if;
 v_old:=k.status;
 select * into hp from public.so_queue_hold_policy where tenant_id=t.id;
 if p_expected_status is distinct from v_old then
   raise exception '此號碼已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
 end if;
 if p_status='HOLD' then
   if v_old not in ('WAITING','CANCELLED') then raise exception '只能保留候位中或已取消的號碼'; end if;
   if k.hold_count>=coalesce(hp.max_holds,2) then raise exception '已達候位保留次數上限'; end if;
 end if;
 if v_old='HOLD' and p_status not in ('WAITING','CANCELLED') then
   raise exception '保留中的號碼只能恢復候位或取消';
 end if;
 if p_status in ('CALLED','ARRIVED','ADMITTED','SERVING') and t.modules->>'calling' <> 'true' then
   raise exception '門市尚未啟用叫號功能';
 end if;
 if p_status in ('CALLED','ARRIVED','ADMITTED','SERVING') and exists (
  select 1 from public.so_tickets v where v.tenant_id=t.id and v.deleted_at is null and v.id<>k.id and v.status in ('CALLED','ARRIVED','ADMITTED','SERVING')
 ) then raise exception '目前已有服務中的號碼，請先結束或修改該號碼'; end if;
 -- Staff may correct or restore multiple tickets for the same customer.
 update public.so_tickets
 set status=p_status,updated_at=now(),
     hold_count=case when p_status='HOLD' then k.hold_count+1 else k.hold_count end,
     hold_until=case when p_status='HOLD' then now()+make_interval(mins=>coalesce(hp.hold_minutes,20))
                     when v_old='HOLD' then null else k.hold_until end,
     queue_joined_at=case when p_status='WAITING' and v_old in ('HOLD','PASSED')
                             and (v_old='PASSED' or coalesce(hp.return_mode,'END')='END')
                            then now() else k.queue_joined_at end,
     line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else k.line_call_event_id end,
     line_restore_event_id=case when v_old='CANCELLED' and p_status in ('WAITING','HOLD') then gen_random_uuid() else k.line_restore_event_id end
 where id=k.id returning * into k;
 -- No cross-modification of reservation status.
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
end $function$;

CREATE OR REPLACE FUNCTION public.so_enqueue_line_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_kind text; v_ref uuid;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_table_name = 'so_tickets' then
    if tg_op = 'INSERT' then
      if new.status='WAITING' then
        v_kind:='TICKET_CREATED'; v_ref:=new.id;
      end if;
    elsif tg_op='UPDATE' then
      if new.status='CALLED' and new.line_call_event_id is not null
        and (old.line_call_event_id is distinct from new.line_call_event_id) then
        v_kind:='CALLED'; v_ref:=new.line_call_event_id;
      elsif old.status='CANCELLED' and new.status in ('WAITING','HOLD') and new.line_restore_event_id is not null
        and old.line_restore_event_id is distinct from new.line_restore_event_id then
        v_kind:='TICKET_RESTORED';v_ref:=new.line_restore_event_id;
      elsif new.status='CANCELLED' and new.line_cancel_event_id is not null
        and (old.line_cancel_event_id is distinct from new.line_cancel_event_id) then
        v_kind:='TICKET_CANCELLED'; v_ref:=new.line_cancel_event_id;
      end if;
    end if;
  elsif tg_table_name='so_reservations' then
    if tg_op='INSERT' then
      if new.status='CONFIRMED' then
        v_kind:='RESERVED'; v_ref:=new.id;
      end if;
    elsif tg_op='UPDATE' then
      if new.status='CANCELLED' and new.line_cancel_event_id is not null
        and (old.line_cancel_event_id is distinct from new.line_cancel_event_id) then
        v_kind:='RESERVATION_CANCELLED'; v_ref:=new.line_cancel_event_id;
      elsif new.status='CONFIRMED' and old.status='CANCELLED' and new.line_restore_event_id is not null
        and (old.line_restore_event_id is distinct from new.line_restore_event_id) then
        v_kind:='RESERVATION_RESTORED'; v_ref:=new.line_restore_event_id;
      elsif new.status='CONFIRMED' and new.line_update_event_id is not null
        and (old.line_update_event_id is distinct from new.line_update_event_id) then
        v_kind:='RESERVATION_UPDATED'; v_ref:=new.line_update_event_id;
      end if;
    end if;
  end if;
  if v_kind is not null and v_ref is not null then
    insert into public.so_line_notice_outbox(tenant_id,event_kind,reference_id)
    values(new.tenant_id,v_kind,v_ref) on conflict do nothing;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.so_public_state(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_policy public.so_booking_policy; v_day date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_today date:=(now() at time zone 'Asia/Taipei')::date; v_slots jsonb;v_current text;v_waiting int;
begin
 if auth.uid() is null then raise exception '請先完成登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '企業網站不存在或未開放';end if;
 select * into v_policy from public.so_booking_policy where tenant_id=t.id;
 select coalesce(number_prefix,'')||ticket_no::text into v_current from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','ARRIVED','ADMITTED','SERVING') order by updated_at desc limit 1;
 select count(*) into v_waiting from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING';
 select coalesce(jsonb_agg(jsonb_build_object('time',to_char(gs,'HH24:MI'),'capacity',t.slot_capacity,'booked',
 (select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')),
 'available',greatest(0,t.slot_capacity-(select coalesce(sum(party_size),0) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and booking_date=v_day and booking_time=gs::time and r.status in('CONFIRMED','CHECKED_IN')))) order by gs),'[]'::jsonb) into v_slots
 from generate_series((v_day+t.open_time)::timestamp,(v_day+t.close_time)::timestamp - make_interval(mins=>t.slot_minutes),make_interval(mins=>t.slot_minutes)) gs
 where (v_policy.break_start is null or v_policy.break_end is null
       or gs::time + make_interval(mins=>t.slot_minutes) <= v_policy.break_start
       or gs::time >= v_policy.break_end)
   and gs >= (now() at time zone 'Asia/Taipei') + make_interval(mins=>coalesce(v_policy.min_notice_minutes,0));
 if extract(dow from v_day)::int = any(coalesce(v_policy.closed_weekdays,'{}'::smallint[]))
    or v_day = any(coalesce(v_policy.closed_dates,'{}'::date[]))
    or v_day < v_today or v_day>v_today+30 then v_slots:='[]'::jsonb; end if;
 return jsonb_build_object('tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,
  'price',m.price,'sort_order',m.sort_order,'active',m.active)
  order by m.sort_order,m.created_at)
 from public.so_menu_items m where m.tenant_id=t.id and m.active),'[]'::jsonb),
 'queue_session',coalesce((select jsonb_build_object('code',session_code,'updated_at',updated_at) from public.so_queue_session_state where tenant_id=t.id),jsonb_build_object('code','MORNING')),'date',v_day,'today',v_today,'slots',v_slots,'current',v_current,'waiting',v_waiting,
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference_code',r.reference_code,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'reference_code',k.reference_code,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$;

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
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode,
 'queue_prefix',t.queue_prefix,'queue_last_number',t.queue_last_number,'queue_round',t.queue_round,
 'booking_prefix',t.booking_prefix,'booking_last_number',t.booking_last_number,'booking_round',t.booking_round),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active) order by m.sort_order,m.created_at)
  from public.so_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
end$function$;

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
  'queue_session',coalesce((select jsonb_build_object('code',session_code,'updated_at',updated_at) from public.so_queue_session_state where tenant_id=t.id),jsonb_build_object('code','MORNING')),
  'queue_hold_policy',coalesce((select jsonb_build_object('hold_minutes',hold_minutes,'max_holds',max_holds,'return_mode',return_mode)
    from public.so_queue_hold_policy where tenant_id=t.id),
    '{"hold_minutes":20,"max_holds":2,"return_mode":"END"}'::jsonb),
  'pending_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,
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
      'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,
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
      'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),'number_round',k.number_round,
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items,'party',k.party_size,'hold_until',k.hold_until,'hold_count',k.hold_count,'queue_joined_at',k.queue_joined_at
    ) order by k.business_date,k.created_at,k.ticket_no)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and deleted_at is null and status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED')
      order by business_date,created_at,ticket_no limit 500
    ) k
  ), '[]'::jsonb),
  'processed_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),'number_round',k.number_round,
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items,'party',k.party_size,'hold_until',k.hold_until,'hold_count',k.hold_count,'queue_joined_at',k.queue_joined_at
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
     'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'phone',r.customer_phone,'party',r.party_size,
     'day',to_char(r.booking_date,'YYYY-MM-DD'),'time',to_char(r.booking_time,'HH24:MI'),
     'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'deleted_at',r.deleted_at,
     'selected_items',r.selected_items) order by r.deleted_at desc)
   from (select * from public.so_reservations where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) r
 ),'[]'::jsonb),
 'deleted_tickets',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),'number_round',k.number_round,
     'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
     'created_at',k.created_at,'updated_at',k.updated_at,'deleted_at',k.deleted_at,
     'selected_items',k.selected_items,'party',k.party_size,'hold_until',k.hold_until,'hold_count',k.hold_count,'queue_joined_at',k.queue_joined_at) order by k.deleted_at desc)
   from (select * from public.so_tickets where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) k
 ),'[]'::jsonb)
 );
end $function$;
drop trigger if exists so_ticket_notice_outbox on public.so_tickets;
create trigger so_ticket_notice_outbox after insert or update of status,line_call_event_id,line_cancel_event_id,line_restore_event_id
 on public.so_tickets for each row execute function public.so_enqueue_line_notice();
