-- PRD §102 K12 / NR-10: early/noon/evening/rest modes for NEW queue numbers only.
-- Non-destructive: never reset ticket numbering, archive old ticket, or modify reservation.
alter table public.so_tickets add column if not exists queue_session_code text not null default 'LEGACY';

create table if not exists public.so_queue_session_state(
 tenant_id uuid primary key references public.so_tenants(id),
 session_code text not null default 'MORNING'
  check(session_code in ('MORNING','AFTERNOON','EVENING','REST')),
 changed_by uuid,
 updated_at timestamptz not null default now()
);
alter table public.so_queue_session_state enable row level security;
revoke all on public.so_queue_session_state from public,anon,authenticated;

create or replace function public.so_set_queue_session(p_slug text,p_session text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501'; end if;
 if p_session is null or p_session not in('MORNING','AFTERNOON','EVENING','REST')
   then raise exception '無效的叫號場次';end if;
 insert into public.so_queue_session_state(tenant_id,session_code,changed_by)
 values(t.id,p_session,auth.uid())
 on conflict(tenant_id) do update set session_code=excluded.session_code,
 changed_by=excluded.changed_by,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'queue_session_change',jsonb_build_object('session',p_session));
 return jsonb_build_object('session',p_session,'queue_open',p_session<>'REST');
end $$;
revoke all on function public.so_set_queue_session(text,text) from public,anon;
grant execute on function public.so_set_queue_session(text,text) to authenticated;

create or replace function private.so_assign_ticket_queue_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session text;v_lock uuid;
begin
 -- Serialize each insertion with manager session transitions.
 select id into v_lock from public.so_tenants where id=new.tenant_id for share;
 if not found then raise exception '找不到門市'; end if;
 select session_code into v_session from public.so_queue_session_state where tenant_id=new.tenant_id;
 v_session:=coalesce(v_session,'MORNING');
 if v_session='REST' then raise exception '門市目前休息中，暫停新取號'; end if;
 new.queue_session_code:=v_session;
 return new;
end $$;
drop trigger if exists so_assign_ticket_queue_session on public.so_tickets;
create trigger so_assign_ticket_queue_session before insert on public.so_tickets
for each row execute function private.so_assign_ticket_queue_session();

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
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference_code',r.reference_code,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'reference_code',k.reference_code,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
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
end $function$;

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
   'queue_session',coalesce((select jsonb_build_object('code',session_code,'updated_at',updated_at) from public.so_queue_session_state where tenant_id=t.id),jsonb_build_object('code','MORNING')),
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
end $function$;
