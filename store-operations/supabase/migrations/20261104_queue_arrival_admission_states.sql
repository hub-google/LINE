-- PRD §102 K11: track called, arrived, admitted and serving separately.
-- Additive only. Existing ticket UUID, numbering, LINE associations and QA history unchanged.
alter table public.so_tickets drop constraint if exists so_tickets_status_check;
alter table public.so_tickets add constraint so_tickets_status_check
 check (status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED','COMPLETED','CANCELLED'));

create table if not exists public.so_ticket_admission_events(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.so_tenants(id),
 ticket_id uuid not null references public.so_tickets(id),
 from_status text not null,
 to_status text not null check(to_status in ('ARRIVED','ADMITTED')),
 actor_id uuid,
 occurred_at timestamptz not null default now()
);
alter table public.so_ticket_admission_events enable row level security;
revoke all on public.so_ticket_admission_events from public,anon,authenticated;
create index if not exists so_ticket_admission_events_tenant_time_idx
 on public.so_ticket_admission_events(tenant_id,occurred_at desc);
create index if not exists so_ticket_admission_events_ticket_idx
 on public.so_ticket_admission_events(ticket_id,occurred_at desc);

create or replace function private.so_log_ticket_admission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in('ARRIVED','ADMITTED') then
   insert into public.so_ticket_admission_events(tenant_id,ticket_id,from_status,to_status,actor_id)
   values(new.tenant_id,new.id,old.status,new.status,auth.uid());
 end if;
 return new;
end $$;
drop trigger if exists so_log_ticket_admission on public.so_tickets;
create trigger so_log_ticket_admission after update of status on public.so_tickets
 for each row execute function private.so_log_ticket_admission();

-- Existing security-definer RPC signatures and grants are preserved; all mutations
-- continue to verify the staff role and tenant, and audit changes.
CREATE OR REPLACE FUNCTION public.so_staff_action(p_slug text, p_action text, p_ticket_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;r public.so_reservations;v_day date:=(now() at time zone 'Asia/Taipei')::date;v_seq jsonb;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 if p_action='checkin' then
  if t.modules->>'reservation'<>'true' then raise exception '未開通預約';end if;
  select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id
    and deleted_at is null and booking_date=v_day and status='CONFIRMED' for update;
  if not found then raise exception '預約不存在、非今日或已報到';end if;
  update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;
 elsif p_action='call' then
  -- Every expired hold re-enters before the next call, under the tenant lock.
  update public.so_tickets k set status='WAITING',hold_until=null,updated_at=now(),
    queue_joined_at=case when coalesce(h.return_mode,'END')='ORIGINAL' then k.queue_joined_at else now() end
  from public.so_queue_hold_policy h
  where h.tenant_id=t.id and k.tenant_id=t.id and k.status='HOLD'
    and k.deleted_at is null and k.hold_until<=now();
  update public.so_tickets set status='WAITING',hold_until=null,updated_at=now(),
    queue_joined_at=now()
  where tenant_id=t.id and status='HOLD' and deleted_at is null and hold_until<=now();
  if t.modules->>'calling'<>'true' then raise exception '未開通叫號';end if;
  if exists(select 1 from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','ARRIVED','ADMITTED','SERVING')) then raise exception '請先完成目前服務';end if;
  select * into k from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING' order by business_date,queue_joined_at,ticket_no,id limit 1 for update;
  if not found then raise exception '目前沒有等候中的號碼';end if;
  update public.so_tickets set status='CALLED',updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
 elsif p_action in('recall','start','complete','pass','return','cancel') then
  select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
  if not found then raise exception '找不到今日號碼';end if;
  if p_action='recall' then
    if k.status<>'CALLED' then raise exception '僅能重叫已叫號票券';end if;
    update public.so_tickets set updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
  elsif p_action='start' then
    if k.status not in ('CALLED','ARRIVED','ADMITTED') then raise exception '請先叫號並完成到場處理';end if;
    update public.so_tickets set status='SERVING',updated_at=now() where id=k.id;
  elsif p_action='complete' then
    if k.status not in('CALLED','ARRIVED','ADMITTED','SERVING') then raise exception '目前無法完成服務';end if;
    update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id;
    -- Independent queue completion: do not update reservation.
  elsif p_action='pass' then
    if k.status<>'CALLED' then raise exception '僅能標記已叫號為過號';end if;
    update public.so_tickets set status='PASSED',updated_at=now() where id=k.id;
  elsif p_action='return' then
    if k.status<>'PASSED' then raise exception '只有過號可以回復';end if;
    update public.so_tickets set status='WAITING',queue_joined_at=now(),hold_until=null,updated_at=now() where id=k.id;
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
 return jsonb_build_object('success',true,'number',case when k.id is null then null else coalesce(k.number_prefix,'')||k.ticket_no::text end,'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end$function$
;

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
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id);
 end if;
 if p_status='HOLD' then
   if v_old<>'WAITING' then raise exception '只能保留候位中的號碼'; end if;
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
     line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else k.line_call_event_id end
 where id=k.id returning * into k;
 -- No cross-modification of reservation status.
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id);
end $function$
;

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
  'queue_hold_policy',coalesce((select jsonb_build_object('hold_minutes',hold_minutes,'max_holds',max_holds,'return_mode',return_mode)
    from public.so_queue_hold_policy where tenant_id=t.id),
    '{"hold_minutes":20,"max_holds":2,"return_mode":"END"}'::jsonb),
  'pending_reservations',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'party',r.party_size,
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
      'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'party',r.party_size,
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
     'id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'party',r.party_size,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.so_queue_live(p_slug text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 d public.so_queue_displays;
 k public.so_tickets;
 v_ahead integer;
 v_viewer uuid:=auth.uid();
begin
 if v_viewer is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到門市';end if;
 select * into d from public.so_queue_displays where tenant_id=t.id;
 if p_ticket_id is not null then
   select ticket.* into k
   from public.so_tickets ticket
   where ticket.tenant_id=t.id and ticket.id=p_ticket_id
     and ticket.deleted_at is null
     and exists (
       select 1 from public.so_line_links viewer
       join public.so_line_links linked on linked.tenant_id=viewer.tenant_id
         and linked.line_sub=viewer.line_sub
       where viewer.tenant_id=t.id and viewer.user_id=v_viewer
         and linked.user_id=ticket.user_id
     );
 end if;
 if k.id is not null and k.status='WAITING' then
   select count(*)::integer into v_ahead from public.so_tickets ahead
   where ahead.tenant_id=t.id and ahead.deleted_at is null
     and ahead.status='WAITING'
     and (ahead.queue_joined_at,ahead.id)<(k.queue_joined_at,k.id);
   v_ahead:=v_ahead+coalesce(d.serving_count,0);
 elsif k.id is not null and k.status in ('CALLED','ARRIVED','ADMITTED','SERVING') then
   v_ahead:=0;
 else
   v_ahead:=null;
 end if;
 return jsonb_build_object(
   'tenant_id',t.id,'shop_name',t.name,
   'current',d.current_number,
   'waiting',coalesce(d.waiting_count,0),
   'serving',coalesce(d.serving_count,0),
   'updated_at',d.updated_at,
   'hold_policy',coalesce((select jsonb_build_object('hold_minutes',hold_minutes,'max_holds',max_holds,'return_mode',return_mode)
    from public.so_queue_hold_policy where tenant_id=t.id),
    '{"hold_minutes":20,"max_holds":2,"return_mode":"END"}'::jsonb),
   'mine',case when k.id is null then null else jsonb_build_object(
     'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,
     'hold_until',k.hold_until,'hold_count',k.hold_count,
     'created_at',k.created_at
   ) end
 );
end $function$
;

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
 'date',v_day,'today',v_today,'slots',v_slots,'current',v_current,'waiting',v_waiting,
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference_code',r.reference_code,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'reference_code',k.reference_code,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$
;

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
    'name',x.customer_name,'number',x.number,'day',x.booking_date,'time',to_char(x.booking_time,'HH24:MI'),
    'party',x.party_size,'status',x.status,'created_at',x.created_at,
    'selected_items',x.selected_items
  ) order by x.booking_date desc,x.booking_time desc),'[]'::jsonb)
  into v_reservations
  from (
    select r.id,t.slug,t.name as shop_name,r.customer_name,
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

  return jsonb_build_object('tickets',v_tickets,'reservations',v_reservations);
end
$function$
;

CREATE OR REPLACE FUNCTION private.so_refresh_queue_display(p_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_called text;
 v_waiting integer;
 v_serving integer;
begin
 -- Active call wins; after a call is completed, keep the most recently called
 -- number visible briefly, including across midnight.
 select coalesce(k.number_prefix,'')||k.ticket_no::text into v_called
 from public.so_tickets k
 where k.tenant_id=p_tenant and k.deleted_at is null
   and k.status in ('CALLED','ARRIVED','ADMITTED','SERVING')
 order by k.last_called_at desc nulls last,k.updated_at desc,k.created_at desc
 limit 1;
 if v_called is null then
   select coalesce(k.number_prefix,'')||k.ticket_no::text into v_called
   from public.so_tickets k
   where k.tenant_id=p_tenant and k.deleted_at is null
     and k.last_called_at>=now()-interval '24 hours'
   order by k.last_called_at desc,k.created_at desc limit 1;
 end if;
 select count(*)::integer into v_waiting from public.so_tickets
 where tenant_id=p_tenant and deleted_at is null and status='WAITING';
 select count(*)::integer into v_serving from public.so_tickets
 where tenant_id=p_tenant and deleted_at is null and status in ('CALLED','ARRIVED','ADMITTED','SERVING');
 insert into public.so_queue_displays(tenant_id,current_number,waiting_count,serving_count,updated_at)
 values(p_tenant,v_called,v_waiting,v_serving,now())
 on conflict (tenant_id) do update set
   current_number=excluded.current_number,
   waiting_count=excluded.waiting_count,
   serving_count=excluded.serving_count,
   updated_at=excluded.updated_at
 where so_queue_displays.current_number is distinct from excluded.current_number
   or so_queue_displays.waiting_count is distinct from excluded.waiting_count
   or so_queue_displays.serving_count is distinct from excluded.serving_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.so_staff_analytics(p_slug text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;v_days integer:=coalesce(p_days,30);v_start date;v_end date;v_booking jsonb;v_queue jsonb;v_daily jsonb;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) not in ('OWNER','MANAGER') and not private.so_platform() then
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
 select coalesce(jsonb_agg(jsonb_build_object('date',series.day,'reservations',
   (select count(*) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=series.day),
   'tickets',(select count(*) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=series.day))
   order by series.day),'[]'::jsonb) into v_daily
 from generate_series(v_start,v_end,'1 day'::interval) series(day);
 return jsonb_build_object('merchant',t.name,'days',v_days,'start',v_start,'end',v_end,
   'reservations',v_booking,'queue',v_queue,'daily',v_daily);
end;
$function$;
