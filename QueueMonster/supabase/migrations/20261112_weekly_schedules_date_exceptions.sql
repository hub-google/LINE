
-- QueueMonster persistent weekly templates + per-date operating exceptions.
-- Existing reservations, tickets, and orders are NOT removed.
create table if not exists public.so_schedule_rules (
 tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
 enabled boolean not null default false,
 weekdays jsonb not null default '{}'::jsonb,
 templates jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.so_schedule_exceptions (
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 exception_date date not null,
 mode text not null check (mode in ('CLOSED','CUSTOM')),
 template_key text,
 windows jsonb,
 note text not null default '',
 updated_at timestamptz not null default now(),
 primary key(tenant_id,exception_date),
 check (char_length(note)<=120)
);
alter table public.so_schedule_rules enable row level security;
alter table public.so_schedule_exceptions enable row level security;
revoke all on public.so_schedule_rules from public,anon,authenticated;
revoke all on public.so_schedule_exceptions from public,anon,authenticated;
alter table public.so_service_sessions add column if not exists schedule_generated boolean not null default false;
create index if not exists so_schedule_generated_dates on public.so_service_sessions(tenant_id,session_date) where schedule_generated and deleted_at is null;

create or replace function private.so_schedule_windows_valid(p_windows jsonb)
returns boolean language plpgsql immutable set search_path=''
as $f$
declare w jsonb; v_name text; v_start text;v_end text;v_capacity text;
begin
 if p_windows is null or jsonb_typeof(p_windows)<>'array' or jsonb_array_length(p_windows)<1 or jsonb_array_length(p_windows)>20 then return false;end if;
 for w in select value from jsonb_array_elements(p_windows) loop
   if jsonb_typeof(w)<>'object' then return false;end if;
   v_name:=btrim(coalesce(w->>'name',''));v_start:=w->>'start';v_end:=w->>'end';v_capacity:=w->>'capacity';
   if char_length(v_name) not between 1 and 60
      or v_start is null or v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or v_end is null or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or v_end<=v_start or coalesce(v_capacity,'') !~ '^[0-9]{1,3}$'
      or (v_capacity::int) not between 1 and 300 then return false;end if;
   if coalesce(w->>'unit_id','')<>'' and
    (w->>'unit_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 end loop;
 return true;
end $f$;

create or replace function private.so_schedule_effective(p_tenant uuid,p_date date)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare r public.so_schedule_rules; x public.so_schedule_exceptions; v_key text;v_windows jsonb;
 v_policy public.so_booking_policy;
begin
 select * into r from public.so_schedule_rules where tenant_id=p_tenant;
 if found and r.enabled then
   select * into x from public.so_schedule_exceptions
    where tenant_id=p_tenant and exception_date=p_date;
   if found then
     if x.mode='CLOSED' then return jsonb_build_object('managed',true,'closed',true,'windows','[]'::jsonb,'source','exception');end if;
     if x.template_key is not null then v_windows:=r.templates->x.template_key;
     else v_windows:=x.windows;end if;
     return jsonb_build_object('managed',true,'closed',false,'windows',coalesce(v_windows,'[]'::jsonb),'source','exception');
   end if;
   v_key:=coalesce(r.weekdays->>(extract(isodow from p_date)::int)::text,'off');
   if v_key='off' or not (r.templates ? v_key) then
     return jsonb_build_object('managed',true,'closed',true,'windows','[]'::jsonb,'source','weekly');
   end if;
   return jsonb_build_object('managed',true,'closed',false,'windows',r.templates->v_key,'source','weekly');
 end if;
 select * into v_policy from public.so_booking_policy where tenant_id=p_tenant;
 if found and (extract(dow from p_date)::int=any(coalesce(v_policy.closed_weekdays, '{}'::integer[]))
  or p_date=any(coalesce(v_policy.closed_dates, '{}'::date[]))) then
  return jsonb_build_object('managed',false,'closed',true,'windows','[]'::jsonb,'source','legacy');
 end if;
 return jsonb_build_object('managed',false,'closed',false,'windows','[]'::jsonb,'source','legacy');
end $f$;

create or replace function private.so_schedule_time_allowed(p_tenant uuid,p_at timestamp without time zone)
returns boolean language plpgsql stable security definer set search_path=''
as $f$
declare v jsonb; w jsonb;
begin
 v:=private.so_schedule_effective(p_tenant,p_at::date);
 if (v->>'closed')::boolean then return false;end if;
 if not (v->>'managed')::boolean then return true;end if;
 for w in select value from jsonb_array_elements(v->'windows') loop
  if p_at::time >= (w->>'start')::time and p_at::time < (w->>'end')::time then return true;end if;
 end loop;
 return false;
end $f$;

create or replace function private.so_schedule_session_allowed(p_tenant uuid,p_date date,p_start time,p_end time)
returns boolean language plpgsql stable security definer set search_path=''
as $f$
declare v jsonb; w jsonb;
begin
 v:=private.so_schedule_effective(p_tenant,p_date);
 if (v->>'closed')::boolean then return false;end if;
 if not (v->>'managed')::boolean then return true;end if;
 for w in select value from jsonb_array_elements(v->'windows') loop
  if p_start >= (w->>'start')::time and p_end <= (w->>'end')::time then return true;end if;
 end loop;
 return false;
end $f$;

create or replace function private.so_schedule_ensure_sessions(p_tenant uuid,p_date date)
returns void language plpgsql security definer set search_path=''
as $f$
declare v jsonb;w jsonb;v_unit uuid;v_default uuid;v_start time;v_end time;
begin
 if p_date<(now() at time zone 'Asia/Taipei')::date-1 or p_date>(now() at time zone 'Asia/Taipei')::date+90 then return;end if;
 v:=private.so_schedule_effective(p_tenant,p_date);
 if (v->>'closed')::boolean or not (v->>'managed')::boolean then return;end if;
 for w in select value from jsonb_array_elements(v->'windows') loop
   v_start:=(w->>'start')::time;v_end:=(w->>'end')::time;
   v_unit:=nullif(w->>'unit_id','')::uuid;
   if v_unit is null then
     if v_default is null then
       select id into v_default from public.so_booking_resources where tenant_id=p_tenant and is_default_session_unit limit 1;
       if v_default is null then
         insert into public.so_booking_resources(tenant_id,kind,name,group_label,unit_capacity,active,is_default_session_unit)
          values(p_tenant,'STAFF','一般場次','',1,true,true)
          on conflict do nothing;
         select id into v_default from public.so_booking_resources where tenant_id=p_tenant and is_default_session_unit limit 1;
       end if;
     end if;
     v_unit:=v_default;
   end if;
   if v_unit is null or not exists(select 1 from public.so_booking_resources where tenant_id=p_tenant and id=v_unit and active) then continue;end if;
   insert into public.so_service_sessions(tenant_id,unit_id,session_date,name,start_time,end_time,capacity,active,schedule_generated)
    select p_tenant,v_unit,p_date,w->>'name',v_start,v_end,(w->>'capacity')::integer,true,true
    where not exists(select 1 from public.so_service_sessions s
        where s.tenant_id=p_tenant and s.unit_id=v_unit and s.session_date=p_date
          and s.start_time=v_start and s.deleted_at is null)
    on conflict do nothing;
 end loop;
end $f$;

create or replace function public.so_schedule_config(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare t public.so_tenants;r public.so_schedule_rules;v_exceptions jsonb;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到商家';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有管理者可以查看營業排程' using errcode='42501';end if;
 select * into r from public.so_schedule_rules where tenant_id=t.id;
 select coalesce(jsonb_agg(jsonb_build_object('date',exception_date,'mode',mode,'template_key',template_key,
   'windows',windows,'note',note) order by exception_date),'[]'::jsonb) into v_exceptions
 from public.so_schedule_exceptions where tenant_id=t.id and exception_date>=
   (now() at time zone 'Asia/Taipei')::date-7;
 return jsonb_build_object('enabled',coalesce(r.enabled,false),'weekdays',coalesce(r.weekdays,'{}'::jsonb),
   'templates',coalesce(r.templates,'{}'::jsonb),'exceptions',v_exceptions);
end $f$;

create or replace function public.so_schedule_manage(p_slug text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $f$
declare t public.so_tenants;v_weekdays jsonb;v_templates jsonb;v_key text;v_windows jsonb;v_date date;v_end date;
 v_mode text;v_template text;v_note text;v_enabled boolean;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found then raise exception '找不到商家';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not coalesce(private.so_platform(),false)
 then raise exception '只有管理者可以調整營業排程' using errcode='42501';end if;
 if p_action='weekly' then
   v_weekdays:=p_data->'weekdays';v_templates:=p_data->'templates';v_enabled:=coalesce((p_data->>'enabled')::boolean,true);
   if jsonb_typeof(v_weekdays)<>'object' or jsonb_typeof(v_templates)<>'object' or
     (select count(*) from jsonb_object_keys(v_templates)) not between 1 and 15 then
     raise exception '請建立至少一種場次模板，並設定每週營業日';end if;
   for v_key in select key from jsonb_each(v_templates) loop
     if char_length(v_key) not between 1 and 40 or v_key !~ '^[a-zA-Z0-9_-]+$'
       or not private.so_schedule_windows_valid(v_templates->v_key) then
        raise exception '場次模板內容無效：%',v_key;end if;
     -- Every manually selected unit must belong to this shop.
     if exists(select 1 from jsonb_array_elements(v_templates->v_key) w
       where coalesce(w->>'unit_id','')<>'' and not exists(
         select 1 from public.so_booking_resources u
         where u.id=(w->>'unit_id')::uuid and u.tenant_id=t.id and u.active)) then
         raise exception '場次模板中有不存在的服務窗口';end if;
   end loop;
   for v_key in select x::text from generate_series(1,7) as g(x) loop
     if not (v_weekdays ? v_key) or coalesce(v_weekdays->>v_key,'') not in ('off')
       and not (v_templates ? (v_weekdays->>v_key)) then
       raise exception '星期 % 的場次模板不存在',v_key;end if;
   end loop;
   insert into public.so_schedule_rules(tenant_id,enabled,weekdays,templates)
     values(t.id,v_enabled,v_weekdays,v_templates)
     on conflict(tenant_id) do update set enabled=excluded.enabled,weekdays=excluded.weekdays,
        templates=excluded.templates,updated_at=now();
   if v_enabled then update public.so_tenants set multi_unit_enabled=true,updated_at=now() where id=t.id;end if;
 elsif p_action in ('exception_set','exception_delete') then
   v_date:=(p_data->>'start')::date;v_end:=(p_data->>'end')::date;
   if v_date is null or v_end is null or v_end<v_date or v_end-v_date>366
      or v_date<(now() at time zone 'Asia/Taipei')::date-365
      or v_end>(now() at time zone 'Asia/Taipei')::date+3650
   then raise exception '特殊日期區間無效，單次最多設定 367 天';end if;
   if p_action='exception_delete' then
     delete from public.so_schedule_exceptions where tenant_id=t.id and exception_date between v_date and v_end;
   else
     v_mode:=p_data->>'mode';v_template:=nullif(p_data->>'template_key','');v_note:=left(btrim(coalesce(p_data->>'note','')),120);
     if v_mode not in ('CLOSED','CUSTOM') then raise exception '特殊日期模式無效';end if;
     if v_mode='CUSTOM' then
       if v_template is not null then
         if not exists(select 1 from public.so_schedule_rules r
           where r.tenant_id=t.id and r.templates ? v_template) then raise exception '指定的場次模板不存在';end if;
         v_windows:=null;
       else
         v_windows:=p_data->'windows';
         if not private.so_schedule_windows_valid(v_windows) then raise exception '自訂營業時間無效';end if;
       end if;
     else v_template:=null;v_windows:=null;end if;
     insert into public.so_schedule_exceptions(tenant_id,exception_date,mode,template_key,windows,note)
       select t.id,g::date,v_mode,v_template,v_windows,v_note
       from generate_series(v_date,v_end,'1 day'::interval) g
       on conflict(tenant_id,exception_date) do update set mode=excluded.mode,
           template_key=excluded.template_key,windows=excluded.windows,note=excluded.note,updated_at=now();
   end if;
 else raise exception '未知排程操作';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
    values(t.id,auth.uid(),'schedule_'||p_action,jsonb_build_object('start',p_data->>'start','end',p_data->>'end','mode',p_data->>'mode'));
 return jsonb_build_object('ok',true);
end $f$;

-- Server-side guard: editing a closed day never deletes existing records,
-- but stale pages cannot create new reservations, tickets or pickup orders.
create or replace function private.so_schedule_new_record_guard()
returns trigger language plpgsql security definer set search_path=''
as $f$
declare v jsonb;v_date date;v_at timestamp;v_session public.so_service_sessions;
begin
 if TG_TABLE_NAME='so_reservations' then
   v_date:=new.booking_date;
   v:=private.so_schedule_effective(new.tenant_id,v_date);
   if (v->>'closed')::boolean then raise exception '此日期已暫停營業，請選其他日期';end if;
   if (v->>'managed')::boolean then
     if new.service_session_id is null then raise exception '營業排程已更新，請重新整理後選擇場次';end if;
     select * into v_session from public.so_service_sessions where id=new.service_session_id and tenant_id=new.tenant_id;
     if not found or not private.so_schedule_session_allowed(new.tenant_id,v_date,v_session.start_time,v_session.end_time)
       then raise exception '此場次已不開放預約';end if;
   end if;
 elsif TG_TABLE_NAME='so_tickets' then
   if new.reservation_id is not null then return new;end if; -- preserve existing booking check-ins
   v_date:=new.business_date;
   v:=private.so_schedule_effective(new.tenant_id,v_date);
   if (v->>'closed')::boolean then raise exception '今日暫停取號';end if;
   if (v->>'managed')::boolean then
     if new.service_session_id is null then raise exception '營業排程已更新，請重新選擇取號場次';end if;
     select * into v_session from public.so_service_sessions where id=new.service_session_id and tenant_id=new.tenant_id;
     if not found or not private.so_schedule_session_allowed(new.tenant_id,v_date,v_session.start_time,v_session.end_time)
       then raise exception '此場次已不開放取號';end if;
   end if;
 elsif TG_TABLE_NAME='so_pickup_orders' then
   v_at:=(new.pickup_at at time zone 'Asia/Taipei')::timestamp;
   if not private.so_schedule_time_allowed(new.tenant_id,v_at) then
     raise exception '選擇的取餐時間不在營業時段內';end if;
   if not new.scheduled and not private.so_schedule_time_allowed(new.tenant_id,(now() at time zone 'Asia/Taipei')::timestamp)
     then raise exception '目前非營業時間，無法立即下單';end if;
 end if;
 return new;
end $f$;
drop trigger if exists so_schedule_reservation_insert_guard on public.so_reservations;
create trigger so_schedule_reservation_insert_guard before insert on public.so_reservations
 for each row execute function private.so_schedule_new_record_guard();
drop trigger if exists so_schedule_ticket_insert_guard on public.so_tickets;
create trigger so_schedule_ticket_insert_guard before insert on public.so_tickets
 for each row execute function private.so_schedule_new_record_guard();
drop trigger if exists so_schedule_pickup_insert_guard on public.so_pickup_orders;
create trigger so_schedule_pickup_insert_guard before insert on public.so_pickup_orders
 for each row execute function private.so_schedule_new_record_guard();
revoke all on function private.so_schedule_windows_valid(jsonb) from public,anon,authenticated;
revoke all on function private.so_schedule_effective(uuid,date) from public,anon,authenticated;
revoke all on function private.so_schedule_time_allowed(uuid,timestamp without time zone) from public,anon,authenticated;
revoke all on function private.so_schedule_session_allowed(uuid,date,time,time) from public,anon,authenticated;
revoke all on function private.so_schedule_ensure_sessions(uuid,date) from public,anon,authenticated;
revoke all on function private.so_schedule_new_record_guard() from public,anon,authenticated;
revoke all on function public.so_schedule_config(text) from public,anon;
revoke all on function public.so_schedule_manage(text,text,jsonb) from public,anon;
grant execute on function public.so_schedule_config(text) to authenticated;
grant execute on function public.so_schedule_manage(text,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.so_unit_config(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 perform private.so_schedule_ensure_sessions(t.id,v_date);
 return jsonb_build_object('multi',t.multi_unit_enabled,'picker',t.unit_selection_enabled,
 'grouped',t.grouped_units_enabled,'linked',t.checkin_queue_enabled,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'group',u.group_label,
   'capacity',u.unit_capacity,'active',u.active,'kind',u.kind,'sort_order',u.sort_order,
   'is_default',u.is_default_session_unit) order by u.is_default_session_unit desc,u.sort_order,u.name)
   from public.so_booking_resources u where u.tenant_id=t.id and
   (u.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,
    'name',s.name,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',(s.active and private.so_schedule_session_allowed(t.id,s.session_date,s.start_time,s.end_time)),
    'booked',(select coalesce(sum(party_size),0) from public.so_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.so_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and s.deleted_at is null and
      ((s.active and private.so_schedule_session_allowed(t.id,s.session_date,s.start_time,s.end_time)) or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.so_pickup_public(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; s public.so_pickup_settings; v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date); v_slots jsonb:='[]'::jsonb;
 v_catalog jsonb:='[]'::jsonb; v_orders jsonb:='[]'::jsonb; v_rules jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到營業中的門市';end if;
 if not exists(select 1 from public.so_line_links l where l.tenant_id=t.id and l.user_id=auth.uid())
   and not exists(select 1 from public.so_members m where m.tenant_id=t.id and m.user_id=auth.uid())
   and not coalesce(private.so_platform(),false)
 then raise exception '請先完成本店 LINE 身分綁定' using errcode='42501';end if;
 select * into s from public.so_pickup_settings where tenant_id=t.id;
 if not found then
  s.tenant_id:=t.id;s.enabled:=false;s.schedule_mode:='REQUIRED';s.pickup_start:=t.open_time;s.pickup_end:=t.close_time;
  s.interval_minutes:=15;s.slot_capacity:=5;s.min_notice_minutes:=20;s.days_ahead:=7;s.prep_minutes:=20;
 end if;
 v_rules:=private.so_schedule_effective(t.id,v_date);
 if v_date>=v_today and v_date<=v_today+s.days_ahead and s.enabled and s.schedule_mode<>'DISABLED' then
  select coalesce(jsonb_agg(jsonb_build_object('time',to_char(ts,'HH24:MI'),'left',greatest(0,s.slot_capacity-
      (select coalesce(sum(case when s.capacity_basis='ITEMS' then (select coalesce(sum((line.value->>'qty')::int),0) from jsonb_array_elements(o.items) line) else 1 end),0) from public.so_pickup_orders o where o.tenant_id=t.id and o.scheduled
       and (o.pickup_at at time zone 'Asia/Taipei')::date=v_date
       and to_char(o.pickup_at at time zone 'Asia/Taipei','HH24:MI')=to_char(ts,'HH24:MI')
       and o.status not in('REJECTED','CANCELLED')))) order by ts),'[]'::jsonb) into v_slots
  from generate_series((v_date+s.pickup_start)::timestamp,
       (v_date+s.pickup_end)::timestamp - make_interval(mins=>s.interval_minutes),
       make_interval(mins=>s.interval_minutes)) ts
  where ts at time zone 'Asia/Taipei' >= now()+make_interval(mins=>s.min_notice_minutes)
    and not (v_rules->>'closed')::boolean
    and (not (v_rules->>'managed')::boolean or exists(
      select 1 from jsonb_array_elements(v_rules->'windows') w
      where ts::time >= (w->>'start')::time
        and (ts+make_interval(mins=>s.interval_minutes))::time <= (w->>'end')::time));
 end if;
 if s.enabled then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'description',m.description,
   'price',m.price,'sort_order',m.sort_order) order by m.sort_order,m.created_at),'[]'::jsonb) into v_catalog
  from public.so_menu_items m where m.tenant_id=t.id and m.active and m.pickup_enabled and not m.pickup_sold_out and m.kind<>'SERVICE' and m.price is not null;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number','P'||lpad(o.order_no::text,5,'0'),
  'status',o.status,'items',o.items,'total',o.total,'note',o.note,'scheduled',o.scheduled,
  'pickup_at',to_char(o.pickup_at at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI'),'created_at',o.created_at,'customer_name',o.customer_name,'customer_phone',o.customer_phone)
  order by o.created_at desc),'[]'::jsonb) into v_orders
 from (select * from public.so_pickup_orders
       where tenant_id=t.id and user_id=auth.uid() order by created_at desc limit 30) o;
 return jsonb_build_object('settings',jsonb_build_object('enabled',s.enabled,'schedule_mode',s.schedule_mode,
    'pickup_start',to_char(s.pickup_start,'HH24:MI'),'pickup_end',to_char(s.pickup_end,'HH24:MI'),
    'interval_minutes',s.interval_minutes,'slot_capacity',s.slot_capacity,'capacity_basis',s.capacity_basis,'min_notice_minutes',s.min_notice_minutes,
    'days_ahead',s.days_ahead,'prep_minutes',s.prep_minutes,
    'open_now',private.so_schedule_time_allowed(t.id,(now() at time zone 'Asia/Taipei')::timestamp)),
    'day',v_date,'slots',v_slots,'items',v_catalog,'orders',v_orders);
end $function$
;
