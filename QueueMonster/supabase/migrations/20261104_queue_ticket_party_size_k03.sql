-- PRD K03 / NR-08: one queue ticket represents one group, with explicit people count.
-- Existing records automatically default to 1; IDs, statuses and ordering remain unchanged.
alter table public.so_tickets
  add column if not exists party_size integer not null default 1;
alter table public.so_tickets
  drop constraint if exists so_ticket_party_size_check;
alter table public.so_tickets
  add constraint so_ticket_party_size_check check(party_size between 1 and 20);

-- New dedicated entry point retains existing so_take_number_with_items signature and validation.
create or replace function public.so_take_number_with_party(
 p_slug text,p_name text,p_items jsonb,p_party_size integer
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
 v_result jsonb;
 v_ticket uuid;
 v_count integer;
begin
 if auth.uid() is null then raise exception '請先登入 LINE' using errcode='28000';end if;
 if p_party_size is null or p_party_size<1 or p_party_size>20 then
  raise exception '候位人數請輸入 1～20 人' using errcode='22023';
 end if;
 v_result:=public.so_take_number_with_items(p_slug,p_name,p_items);
 v_ticket:=(v_result->>'id')::uuid;
 update public.so_tickets k set party_size=p_party_size,updated_at=now()
 from public.so_tenants t
 where k.id=v_ticket and k.tenant_id=t.id and t.slug=p_slug
   and k.user_id=auth.uid() and k.deleted_at is null;
 get diagnostics v_count = row_count;
 if v_count<>1 then
  raise exception '取號資料確認失敗，請重新整理' using errcode='23503';
 end if;
 return v_result||jsonb_build_object('party',p_party_size);
end;
$function$;
revoke all on function public.so_take_number_with_party(text,text,jsonb,integer) from public,anon;
grant execute on function public.so_take_number_with_party(text,text,jsonb,integer) to authenticated;

-- Extend the existing authorized views only; no new public access grants.
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
 select coalesce(number_prefix,'')||ticket_no::text into v_current from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING') order by updated_at desc limit 1;
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
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','CALLED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$
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
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items,'party',k.party_size
    ) order by k.business_date,k.created_at,k.ticket_no)
    from (
      select * from public.so_tickets
      where tenant_id=t.id and deleted_at is null and status in ('WAITING','CALLED','SERVING','PASSED')
      order by business_date,created_at,ticket_no limit 500
    ) k
  ), '[]'::jsonb),
  'processed_tickets',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
      'name',k.customer_name,'day',to_char(k.business_date,'YYYY-MM-DD'),'number_round',k.number_round,
      'status',k.status,'source',k.source,'reservation_id',k.reservation_id,
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items,'party',k.party_size
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
     'selected_items',k.selected_items,'party',k.party_size) order by k.deleted_at desc)
   from (select * from public.so_tickets where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) k
 ),'[]'::jsonb)
 );
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
 return jsonb_build_object('role',coalesce(v_role,'PLATFORM'),'tenant',jsonb_build_object('slug',t.slug,'name',t.name,'description',t.description,'phone',t.phone,'address',t.address,'accent',t.accent,'logo_url',t.logo_url,'modules',t.modules,'status',t.status,'line_status',t.line_status,'oa_mode',t.oa_mode,'directory_enabled',t.directory_enabled,'open_time',to_char(t.open_time,'HH24:MI'),'close_time',to_char(t.close_time,'HH24:MI'),'slot_minutes',t.slot_minutes,'slot_capacity',t.slot_capacity,
 'menu_booking_mode',t.menu_booking_mode,'menu_queue_mode',t.menu_queue_mode,
 'queue_prefix',t.queue_prefix,'queue_last_number',t.queue_last_number,'queue_round',t.queue_round,
 'booking_prefix',t.booking_prefix,'booking_last_number',t.booking_last_number,'booking_round',t.booking_round),
 'menu_items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'kind',m.kind,'name',m.name,'description',m.description,'price',m.price,
  'sort_order',m.sort_order,'active',m.active) order by m.sort_order,m.created_at)
  from public.so_menu_items m where m.tenant_id=t.id),'[]'::jsonb),
 'date',v_day,
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'party',r.party_size,'time',to_char(r.booking_time,'HH24:MI'),'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_time,r.created_at) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_day),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items,'party',k.party_size) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'email',u.email) order by m.joined_at) from public.so_members m join auth.users u on u.id=m.user_id where m.tenant_id=t.id),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role) order by i.created_at desc) from public.so_invites i where i.tenant_id=t.id and i.accepted_at is null),'[]'::jsonb));
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
           and (ahead.created_at,ahead.id)<(k.created_at,k.id))
        + coalesce(display.serving_count,0)
      when k.status in ('CALLED','SERVING') then 0
      else null end as ahead,
      (select coalesce(c.number_prefix,'')||c.ticket_no::text
         from public.so_tickets c
         where c.tenant_id=k.tenant_id and c.deleted_at is null
           and (c.status in ('CALLED','SERVING')
                or c.last_called_at>=now()-interval '24 hours')
         order by case when c.status in ('CALLED','SERVING') then 0 else 1 end,
           c.last_called_at desc nulls last,c.updated_at desc limit 1
      ) as current_number,
      case when k.status in ('WAITING','CALLED','SERVING') then 0 else 1 end as priority
    from public.so_tickets k
    join public.so_tenants t on t.id=k.tenant_id
    left join public.so_queue_displays display on display.tenant_id=t.id
    where t.status='ACTIVE' and k.deleted_at is null
      and not coalesce(k.hidden_via_reservation,false)
      and (k.status in ('WAITING','CALLED','SERVING')
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
     and (ahead.created_at,ahead.id)<(k.created_at,k.id);
   v_ahead:=v_ahead+coalesce(d.serving_count,0);
 elsif k.id is not null and k.status in ('CALLED','SERVING') then
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
   'mine',case when k.id is null then null else jsonb_build_object(
     'id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,
     'created_at',k.created_at
   ) end
 );
end $function$
;
