-- Two independent, per-merchant serials. Existing records preserved.
alter table public.so_tenants
 add column if not exists booking_prefix text not null default '',
 add column if not exists booking_round integer not null default 1,
 add column if not exists booking_last_number integer not null default 0;
alter table public.so_reservations
 add column if not exists booking_no integer,
 add column if not exists booking_prefix text not null default '',
 add column if not exists booking_round integer not null default 1;
do $sql$
begin
 if not exists(select 1 from pg_constraint where conname='so_tenants_booking_prefix_check') then
  alter table public.so_tenants add constraint so_tenants_booking_prefix_check
  check (char_length(booking_prefix)<=3 and booking_prefix !~ '[[:cntrl:]]');end if;
 if not exists(select 1 from pg_constraint where conname='so_tenants_booking_last_number_check') then
  alter table public.so_tenants add constraint so_tenants_booking_last_number_check
  check (booking_last_number between 0 and 9999999);end if;
 if not exists(select 1 from pg_constraint where conname='so_reservations_booking_no_check') then
  alter table public.so_reservations add constraint so_reservations_booking_no_check
  check (booking_no between 1 and 9999999);end if;
 if not exists(select 1 from pg_constraint where conname='so_reservations_booking_round_check') then
  alter table public.so_reservations add constraint so_reservations_booking_round_check
  check (booking_round > 0);end if;
end $sql$;
with serials as (
 select id,row_number() over(partition by tenant_id order by created_at,id)::integer as n
 from public.so_reservations)
update public.so_reservations r set booking_no=s.n from serials s
where r.id=s.id and r.booking_no is null;
update public.so_tenants t set booking_last_number=greatest(t.booking_last_number,
 coalesce((select max(r.booking_no) from public.so_reservations r where r.tenant_id=t.id and r.booking_round=t.booking_round),0));
alter table public.so_reservations alter column booking_no set not null;
create unique index if not exists so_reservations_booking_serial_key
 on public.so_reservations(tenant_id,booking_round,booking_no);
create or replace function private.so_assign_booking_number()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_tenant public.so_tenants;v_next integer;
begin
 select * into v_tenant from public.so_tenants where id=new.tenant_id for update;
 if not found then raise exception '找不到門市';end if;
 v_next:=v_tenant.booking_last_number+1;
 if v_next>9999999 then raise exception '預約流水號已達 9999999，請由管理員重置';end if;
 update public.so_tenants set booking_last_number=v_next where id=new.tenant_id;
 new.booking_no:=v_next;
 new.booking_prefix:=v_tenant.booking_prefix;
 new.booking_round:=v_tenant.booking_round;
 return new;
end $function$;
drop trigger if exists so_assign_booking_number on public.so_reservations;
create trigger so_assign_booking_number before insert on public.so_reservations
for each row execute function private.so_assign_booking_number();
create or replace function public.so_set_booking_prefix(p_slug text,p_prefix text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if p_prefix is null or char_length(p_prefix)>3 or p_prefix ~ '[[:cntrl:]]'
 then raise exception '前綴限 0 至 3 字元，不能包含控制字元';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform()
 then raise exception '只有企業管理者可修改前綴' using errcode='42501';end if;
 if t.booking_prefix is distinct from p_prefix then
  update public.so_tenants set booking_prefix=p_prefix where id=t.id;
  insert into public.so_audit(tenant_id,actor,action,info)
  values(t.id,auth.uid(),'booking_prefix_change',jsonb_build_object('from',t.booking_prefix,'to',p_prefix));
 end if;
 return jsonb_build_object('prefix',p_prefix,'changed',t.booking_prefix is distinct from p_prefix);
end $function$;
create or replace function public.so_reset_booking_number(p_slug text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare t public.so_tenants;v_open bigint;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform()
 then raise exception '只有企業管理者可重置編號' using errcode='42501';end if;
 select count(*) into v_open from public.so_reservations
 where tenant_id=t.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
 update public.so_tenants set booking_last_number=0,booking_round=booking_round+1 where id=t.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'booking_number_reset',jsonb_build_object('round',t.booking_round+1,'still_open',v_open));
 return jsonb_build_object('next_number',1,'round',t.booking_round+1,'prefix',t.booking_prefix,'still_open',v_open);
end $function$;
revoke all on function public.so_set_booking_prefix(text,text) from public,anon;
grant execute on function public.so_set_booking_prefix(text,text) to authenticated;
revoke all on function public.so_reset_booking_number(text) from public,anon;
grant execute on function public.so_reset_booking_number(text) to authenticated;

CREATE OR REPLACE FUNCTION private.so_next_ticket_number(p_tenant_id uuid, p_business_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_no integer; v_round integer;
begin
  -- Locks the tenant row: all issuance paths are serialized, including reset.
  select * into t from public.so_tenants where id=p_tenant_id for update;
  if not found then raise exception '找不到門市'; end if;
  v_no:=t.queue_last_number+1;v_round:=t.queue_round;
  if v_no>9999999 then raise exception '今日編號已達 9999999，請由管理員重置號碼'; end if;
  update public.so_tenants set
    queue_current_day=p_business_date,queue_last_number=v_no,queue_round=v_round
    where id=t.id;
  return jsonb_build_object('ticket_no',v_no,'number_round',v_round,'number_prefix',t.queue_prefix);
end
$function$;

CREATE OR REPLACE FUNCTION public.so_reset_queue_number(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_day date:=(now() at time zone 'Asia/Taipei')::date;
 v_round int; v_open bigint;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select * into t from public.so_tenants where slug=p_slug for update;
  if not found then raise exception '找不到門市'; end if;
  if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
     raise exception '只有企業管理者可重置號碼' using errcode='42501'; end if;
  v_round:=t.queue_round+1;
  select count(*) into v_open from public.so_tickets where tenant_id=t.id
    and deleted_at is null and status in ('WAITING','CALLED','SERVING','PASSED');
  update public.so_tenants set queue_current_day=v_day,queue_round=v_round,queue_last_number=0 where id=t.id;
  insert into public.so_audit(tenant_id,actor,action,info) values
    (t.id,auth.uid(),'queue_number_reset',jsonb_build_object('business_date',v_day,'round',v_round,'still_open',v_open));
  return jsonb_build_object('next_number',1,'round',v_round,'prefix',t.queue_prefix,'still_open',v_open);
end $function$;

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
 'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'name',k.customer_name,'status',k.status,'source',k.source,'reservation_id',k.reservation_id,'created_at',k.created_at,'selected_items',k.selected_items) order by k.ticket_no) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.business_date=v_day),'[]'::jsonb),
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
      'created_at',k.created_at,'updated_at',k.updated_at,'selected_items',k.selected_items
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
     'selected_items',k.selected_items) order by k.deleted_at desc)
   from (select * from public.so_tickets where tenant_id=t.id and deleted_at is not null
     and deleted_at>=now()-make_interval(days=>p_history_days)
     order by deleted_at desc limit 500) k
 ),'[]'::jsonb)
 );
end $function$;

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
 select coalesce(number_prefix,'')||ticket_no::text into v_current from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING') order by updated_at desc limit 1;
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
 'my_reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',coalesce(r.booking_prefix,'')||r.booking_no::text,'name',r.customer_name,'day',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size,'status',r.status,'created_at',r.created_at,'selected_items',r.selected_items) order by r.booking_date desc,r.booking_time desc) from public.so_reservations r where r.tenant_id=t.id and r.deleted_at is null and r.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and active_link.tenant_id=t.id) and r.booking_date >= v_today-30),'[]'::jsonb),
 'my_tickets',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'status',k.status,'date',k.business_date,'created_at',k.created_at,'selected_items',k.selected_items) order by k.created_at desc) from public.so_tickets k where k.tenant_id=t.id and k.deleted_at is null and k.user_id in (select linked.user_id from public.so_line_links active_link join public.so_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=t.id) and (k.status in ('WAITING','CALLED','SERVING','PASSED') or k.business_date>=v_today-30)),'[]'::jsonb));
end$function$;

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
     'selected_items',x.selected_items
  ) order by x.priority,x.created_at desc),'[]'::jsonb)
  into v_tickets
  from (
    select k.id,k.tenant_id,t.slug,t.name as shop_name,
      coalesce(k.number_prefix,'')||k.ticket_no::text as number,
      k.status,k.business_date,k.created_at,k.selected_items,
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
$function$;

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
 v_seq jsonb;
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
 -- Booking check-in stays in reservations only; no automatic queue ticket.
 update public.so_reservations set status=p_status,updated_at=now() where id=r.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_reservation_status',jsonb_build_object('reservation',r.id,'ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'reservation_id',r.id,'ticket_id',k.id,'previous_status',v_old,'status',p_status);
end $function$;

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
  if t.modules->>'calling'<>'true' then raise exception '未開通叫號';end if;
  if exists(select 1 from public.so_tickets where tenant_id=t.id and deleted_at is null and status in('CALLED','SERVING')) then raise exception '請先完成目前服務';end if;
  select * into k from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING' order by business_date,created_at,ticket_no limit 1 for update;
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
    -- Independent queue completion: do not update reservation.
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
 return jsonb_build_object('success',true,'number',case when k.id is null then null else coalesce(k.number_prefix,'')||k.ticket_no::text end,'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end$function$;

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
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id);
 end if;
 if p_status in ('CALLED','SERVING') and t.modules->>'calling' <> 'true' then
   raise exception '門市尚未啟用叫號功能';
 end if;
 if p_status in ('CALLED','SERVING') and exists (
  select 1 from public.so_tickets v where v.tenant_id=t.id and v.deleted_at is null and v.id<>k.id and v.status in ('CALLED','SERVING')
 ) then raise exception '目前已有服務中的號碼，請先結束或修改該號碼'; end if;
 -- Staff may correct or restore multiple tickets for the same customer.
 update public.so_tickets set status=p_status,updated_at=now(),line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else k.line_call_event_id end where id=k.id returning * into k;
 -- No cross-modification of reservation status.
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id);
end $function$;
