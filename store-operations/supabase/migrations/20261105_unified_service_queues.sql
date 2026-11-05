-- Unified service units and independent session queues.
-- Opt-in only: existing tenants remain in single-unit, independent mode.
alter table public.so_tenants
  add column if not exists multi_unit_enabled boolean not null default false,
  add column if not exists grouped_units_enabled boolean not null default false,
  add column if not exists checkin_queue_enabled boolean not null default false;
alter table public.so_booking_resources
  add column if not exists group_label text not null default '',
  add column if not exists sort_order integer not null default 0,
  add column if not exists unit_capacity integer not null default 1;
alter table public.so_booking_resources
  add constraint so_unit_group_label_len check (char_length(group_label)<=60),
  add constraint so_unit_capacity_range check (unit_capacity between 1 and 200);
create table if not exists public.so_service_sessions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.so_tenants(id) on delete restrict,
  unit_id uuid not null,
  session_date date not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  capacity integer not null default 10,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  unique(tenant_id,unit_id,session_date,start_time),
  foreign key (tenant_id,unit_id) references public.so_booking_resources(tenant_id,id) on delete restrict,
  constraint so_session_name_len check (length(btrim(name)) between 1 and 60),
  constraint so_session_time check (end_time > start_time),
  constraint so_session_capacity check (capacity between 1 and 300)
);
alter table public.so_service_sessions enable row level security;
revoke all on public.so_service_sessions from public,anon,authenticated;
alter table public.so_reservations
  add column if not exists service_unit_id uuid,
  add column if not exists service_session_id uuid;
alter table public.so_tickets
  add column if not exists service_unit_id uuid,
  add column if not exists service_session_id uuid;
alter table public.so_reservations
  add constraint so_reservation_unit_fk foreign key (tenant_id,service_unit_id) references public.so_booking_resources(tenant_id,id) on delete restrict,
  add constraint so_reservation_session_fk foreign key (tenant_id,service_session_id) references public.so_service_sessions(tenant_id,id) on delete restrict;
alter table public.so_tickets
  add constraint so_ticket_unit_fk foreign key (tenant_id,service_unit_id) references public.so_booking_resources(tenant_id,id) on delete restrict,
  add constraint so_ticket_session_fk foreign key (tenant_id,service_session_id) references public.so_service_sessions(tenant_id,id) on delete restrict;
create index if not exists so_session_date_idx on public.so_service_sessions(tenant_id,session_date,active);
create index if not exists so_res_session_idx on public.so_reservations(tenant_id,service_session_id,status) where deleted_at is null;
create index if not exists so_tickets_session_idx on public.so_tickets(tenant_id,service_session_id,status,queue_joined_at) where deleted_at is null;

-- Existing resource/overlap guard still applies unchanged to standard bookings.
-- Session bookings use per-session capacity, not exclusive resource-time occupancy.
create or replace function private.so_check_booking_resource()
returns trigger language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants; bp public.so_booking_policy; spec jsonb;
 v_start timestamp;v_finish timestamp;v_occupied_until timestamp;v_peak int;v_rid uuid;
 s public.so_service_sessions;v_count integer;
begin
 select * into t from public.so_tenants where id=new.tenant_id for update;
 if not found then raise exception '找不到門市';end if;
 if tg_op='INSERT' or new.selected_items is distinct from old.selected_items then
   spec:=private.so_booking_service_spec(new.tenant_id,new.selected_items,t.slot_minutes);
   new.service_duration_minutes:=(spec->>'duration_minutes')::int;
   new.service_buffer_minutes:=(spec->>'buffer_minutes')::int;
   new.assigned_resource_id:=(spec->>'resource_id')::uuid;
 end if;
 if new.deleted_at is not null or new.status not in('CONFIRMED','CHECKED_IN') then return new;end if;
 if new.service_session_id is not null then
   if not t.multi_unit_enabled then raise exception '此店尚未啟用多服務單位';end if;
   select * into s from public.so_service_sessions where id=new.service_session_id
    and tenant_id=new.tenant_id and unit_id=new.service_unit_id and active;
   if not found or new.booking_date<>s.session_date or new.booking_time<>s.start_time then
     raise exception '預約場次已變更，請重新選擇';end if;
   select coalesce(sum(party_size),0)::int into v_count from public.so_reservations
    where tenant_id=new.tenant_id and service_session_id=s.id
      and deleted_at is null and status in ('CONFIRMED','CHECKED_IN')
      and id is distinct from new.id;
   if v_count+new.party_size>s.capacity then raise exception '此場次已額滿';end if;
   return new;
 end if;
 v_start:=new.booking_date+new.booking_time;
 v_finish:=v_start+make_interval(mins=>new.service_duration_minutes);
 v_occupied_until:=v_finish+make_interval(mins=>new.service_buffer_minutes);
 if new.party_size>t.slot_capacity then raise exception '預約人數超過門市容量';end if;
 if v_finish>(new.booking_date+t.close_time)::timestamp then raise exception '服務時間超過門市營業時間，請選擇較早時段';end if;
 select * into bp from public.so_booking_policy where tenant_id=new.tenant_id;
 if bp.break_start is not null and bp.break_end is not null and
   v_start<(new.booking_date+bp.break_end)::timestamp and v_finish>(new.booking_date+bp.break_start)::timestamp then
   raise exception '服務時間與門市休息時段重疊';end if;
 v_peak:=private.so_peak_reserved_party(new.tenant_id,v_start,v_occupied_until,
   case when tg_op='INSERT' then null else new.id end);
 if v_peak+new.party_size>t.slot_capacity then raise exception '此服務時段剩餘容量不足，請改選其他時段';end if;
 v_rid:=new.assigned_resource_id;
 if v_rid is not null then
   if not exists(select 1 from public.so_booking_resources where id=v_rid and tenant_id=new.tenant_id and active)
     then raise exception '指定員工或房間已停用';end if;
   if exists(select 1 from public.so_reservations r where r.tenant_id=new.tenant_id
     and r.id is distinct from new.id and r.assigned_resource_id=v_rid and r.deleted_at is null
     and r.status in('CONFIRMED','CHECKED_IN') and (r.booking_date+r.booking_time)<v_occupied_until
     and (r.booking_date+r.booking_time)+make_interval(mins=>r.service_duration_minutes+r.service_buffer_minutes)>v_start)
     then raise exception '指定員工或房間在此時段已有預約';end if;
 end if;
 return new;
end $f$;

create or replace function public.so_unit_config(p_slug text,p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare t public.so_tenants; v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 return jsonb_build_object('multi',t.multi_unit_enabled,'grouped',t.grouped_units_enabled,
 'linked',t.checkin_queue_enabled,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'group',u.group_label,
   'capacity',u.unit_capacity,'active',u.active,'kind',u.kind,'sort_order',u.sort_order) order by u.sort_order,u.name)
   from public.so_booking_resources u where u.tenant_id=t.id and (u.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,
    'name',s.name,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',s.active,
    'booked',(select coalesce(sum(party_size),0) from public.so_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.so_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and (s.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $f$;

create or replace function public.so_unit_manage(p_slug text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants; u public.so_booking_resources; s public.so_service_sessions;
 v_unit uuid;v_session uuid;v_day date;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到商家';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '只有管理者可以設定服務單位' using errcode='42501';end if;
 if p_action='settings' then
   if coalesce((p_data->>'linked')::boolean,false) and
      (t.modules->>'reservation'<>'true' or t.modules->>'calling'<>'true')
      then raise exception '報到連動需要啟用預約與叫號功能';end if;
   update public.so_tenants set
     multi_unit_enabled=coalesce((p_data->>'multi')::boolean,false),
     grouped_units_enabled=coalesce((p_data->>'multi')::boolean,false) and coalesce((p_data->>'grouped')::boolean,false),
     checkin_queue_enabled=coalesce((p_data->>'multi')::boolean,false) and coalesce((p_data->>'linked')::boolean,false),
     updated_at=now() where id=t.id;
 elsif p_action='unit' then
   if length(btrim(coalesce(p_data->>'name',''))) not between 1 and 80 then raise exception '請填寫服務單位名稱';end if;
   v_unit:=nullif(p_data->>'id','')::uuid;
   if v_unit is null then
     insert into public.so_booking_resources(tenant_id,kind,name,group_label,sort_order,unit_capacity,active)
     values(t.id,coalesce(nullif(p_data->>'kind',''),'STAFF'),btrim(p_data->>'name'),
       left(btrim(coalesce(p_data->>'group','')),60),coalesce((p_data->>'sort_order')::int,0),
       coalesce((p_data->>'capacity')::int,1),coalesce((p_data->>'active')::boolean,true)) returning * into u;
   else
     update public.so_booking_resources set name=btrim(p_data->>'name'),
       group_label=left(btrim(coalesce(p_data->>'group','')),60),
       sort_order=coalesce((p_data->>'sort_order')::int,0),
       unit_capacity=coalesce((p_data->>'capacity')::int,1),
       active=coalesce((p_data->>'active')::boolean,true),updated_at=now()
      where tenant_id=t.id and id=v_unit returning * into u;
     if not found then raise exception '服務單位不存在';end if;
   end if;
 elsif p_action='session' then
   v_unit:=(p_data->>'unit_id')::uuid;
   v_day:=(p_data->>'date')::date;
   if v_day<(now() at time zone 'Asia/Taipei')::date-1 or v_day>(now() at time zone 'Asia/Taipei')::date+90
     then raise exception '只允許設定最近 90 天場次';end if;
   if not exists(select 1 from public.so_booking_resources where tenant_id=t.id and id=v_unit and active)
     then raise exception '請先啟用服務單位';end if;
   v_session:=nullif(p_data->>'id','')::uuid;
   if v_session is null then
     insert into public.so_service_sessions(tenant_id,unit_id,session_date,name,start_time,end_time,capacity)
     values(t.id,v_unit,v_day,btrim(p_data->>'name'),(p_data->>'start')::time,
       (p_data->>'end')::time,(p_data->>'capacity')::integer) returning * into s;
   else
     update public.so_service_sessions set name=btrim(p_data->>'name'),
       capacity=(p_data->>'capacity')::int,active=coalesce((p_data->>'active')::boolean,true),
       updated_at=now()
       where id=v_session and tenant_id=t.id and unit_id=v_unit and session_date=v_day
       returning * into s;
     if not found then raise exception '場次不存在，不能更改所屬單位或日期';end if;
   end if;
 else raise exception '不支援的操作';end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'service_unit_'||p_action,p_data);
 return jsonb_build_object('ok',true,'id',coalesce(s.id,u.id));
end $f$;

create or replace function public.so_unit_book_once(
p_slug text,p_session_id uuid,p_name text,p_phone text,p_party int,p_items jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants;s public.so_service_sessions; r public.so_reservations;
 v_name text:=btrim(coalesce(p_name,''));v_phone text:=regexp_replace(coalesce(p_phone,''),'[[:space:]() -]','','g');
 v_items jsonb;v_user uuid:=auth.uid();v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_count integer;v_policy public.so_booking_policy;v_lname text;
begin
 if v_user is null then raise exception '請先完成 LINE 身分驗證';end if;
 if p_request_id is null then raise exception '請重新提交預約';end if;
 if length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]]' then raise exception '姓名必須介於 1～60 字';end if;
 if v_phone ~ '^\+8869[0-9]{8}$' then v_phone:='0'||substring(v_phone from 5);end if;
 if v_phone !~ '^09[0-9]{8}$' then raise exception '請輸入有效手機號碼';end if;
 if p_party not between 1 and 20 then raise exception '人數必須介於 1～20';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or not t.multi_unit_enabled or t.modules->>'reservation'<>'true' then raise exception '店家未開放多服務單位預約';end if;
 select display_name into v_lname from public.so_line_links where tenant_id=t.id and user_id=v_user and display_name is not null limit 1;
 if v_lname is null then raise exception '請先完成 LINE 身分綁定';end if;
 select * into r from public.so_reservations where tenant_id=t.id and user_id=v_user and client_request_id=p_request_id;
 if found then
   if r.service_session_id is distinct from p_session_id or r.party_size<>p_party or r.customer_name<>v_name or
      r.customer_phone is distinct from v_phone then raise exception '預約內容已變更，請重新提交';end if;
   return jsonb_build_object('id',r.id,'status',r.status,'replayed',true);
 end if;
 select * into s from public.so_service_sessions where id=p_session_id and tenant_id=t.id and active for update;
 if not found then raise exception '此場次不存在或已停用';end if;
 if s.session_date<v_today or s.session_date>v_today+30 then raise exception '日期不在可預約範圍';end if;
 if (s.session_date+s.start_time)::timestamp <= (now() at time zone 'Asia/Taipei') then raise exception '本場次已開始，請聯絡櫃台';end if;
 if not exists(select 1 from public.so_booking_resources where tenant_id=t.id and id=s.unit_id and active)
   then raise exception '此服務單位已停用';end if;
 v_items:=private.so_menu_validate_items(t.id,'BOOKING',coalesce(p_items,'[]'::jsonb));
 select count(*) into v_count from public.so_reservations
   where tenant_id=t.id and service_session_id=s.id and deleted_at is null and status in('CONFIRMED','CHECKED_IN');
 -- Party capacity is calculated by people, not just number of reservation rows.
 if (select coalesce(sum(party_size),0) from public.so_reservations
     where tenant_id=t.id and service_session_id=s.id and deleted_at is null
       and status in('CONFIRMED','CHECKED_IN'))+p_party>s.capacity then raise exception '此場次名額已滿';end if;
 insert into public.so_reservations(tenant_id,user_id,customer_name,customer_phone,party_size,
   booking_date,booking_time,selected_items,client_request_id,service_unit_id,service_session_id)
 values(t.id,v_user,v_name,v_phone,p_party,s.session_date,s.start_time,v_items,p_request_id,s.unit_id,s.id)
 returning * into r;
 return jsonb_build_object('id',r.id,'status',r.status,'replayed',false);
end $f$;

create or replace function public.so_unit_checkin(p_slug text,p_reservation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants;r public.so_reservations;s public.so_service_sessions;
 k public.so_tickets;v_seq jsonb;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found or not t.multi_unit_enabled or not t.checkin_queue_enabled then
   raise exception '此門市未啟用報到連動';end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有報到權限' using errcode='42501';end if;
 select * into r from public.so_reservations
   where tenant_id=t.id and id=p_reservation_id and deleted_at is null for update;
 if not found or r.service_session_id is null then raise exception '找不到可報到的場次預約';end if;
 if r.booking_date<>(now() at time zone 'Asia/Taipei')::date then raise exception '只能報到今日的場次';end if;
 if r.status not in ('CONFIRMED','CHECKED_IN') then raise exception '此預約目前不能報到';end if;
 select * into s from public.so_service_sessions where id=r.service_session_id and tenant_id=t.id;
 select * into k from public.so_tickets where reservation_id=r.id for update;
 if found then
   if k.deleted_at is not null or k.status in ('CANCELLED','COMPLETED') then raise exception '既有候診票券已結案，請由管理者處理';end if;
   if r.status<>'CHECKED_IN' then update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;end if;
   return jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'replayed',true);
 end if;
 update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;
 v_seq:=private.so_next_ticket_number(t.id,r.booking_date);
 insert into public.so_tickets(tenant_id,user_id,reservation_id,customer_name,business_date,ticket_no,
   number_round,number_prefix,selected_items,source,party_size,service_unit_id,service_session_id)
 values(t.id,r.user_id,r.id,r.customer_name,r.booking_date,(v_seq->>'ticket_no')::int,
   (v_seq->>'number_round')::int,v_seq->>'number_prefix',r.selected_items,'RESERVATION',
   r.party_size,r.service_unit_id,r.service_session_id) returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'unit_checkin',
   jsonb_build_object('reservation',r.id,'ticket',k.id,'session',s.id));
 return jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'replayed',false);
end $f$;

create or replace function public.so_unit_take_number(p_slug text,p_session_id uuid,p_party integer,p_items jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants;s public.so_service_sessions;k public.so_tickets;
 v_seq jsonb;v_name text;v_items jsonb;v_day date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if p_party not between 1 and 20 then raise exception '取號人數需介於 1～20';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' for update;
 if not found or not t.multi_unit_enabled or t.modules->>'queue'<>'true' then raise exception '門市未開放此種取號';end if;
 select * into s from public.so_service_sessions where tenant_id=t.id and id=p_session_id and active;
 if not found or s.session_date<>v_day or now() at time zone 'Asia/Taipei' < (s.session_date+s.start_time)::timestamp - interval '3 hours'
   or now() at time zone 'Asia/Taipei' > (s.session_date+s.end_time)::timestamp then raise exception '此服務場次目前未開放取號';end if;
 select display_name into v_name from public.so_line_links where tenant_id=t.id and user_id=auth.uid() and display_name is not null limit 1;
 if v_name is null then raise exception '請先完成 LINE 驗證';end if;
 if exists(select 1 from public.so_tickets k where k.tenant_id=t.id and k.service_session_id=s.id
   and k.user_id in(select linked.user_id from public.so_line_links me
    join public.so_line_links linked on linked.tenant_id=me.tenant_id and linked.line_sub=me.line_sub
    where me.tenant_id=t.id and me.user_id=auth.uid()) and k.deleted_at is null
    and k.status in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING','HOLD'))
   then raise exception '您在此場次已有有效號碼';end if;
 v_items:=private.so_menu_validate_items(t.id,'QUEUE',coalesce(p_items,'[]'::jsonb));
 v_seq:=private.so_next_ticket_number(t.id,v_day);
 insert into public.so_tickets(tenant_id,user_id,customer_name,business_date,ticket_no,number_round,number_prefix,
   selected_items,party_size,service_unit_id,service_session_id)
 values(t.id,auth.uid(),btrim(v_name),v_day,(v_seq->>'ticket_no')::int,(v_seq->>'number_round')::int,
   v_seq->>'number_prefix',v_items,p_party,s.unit_id,s.id) returning * into k;
 return jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text);
end $f$;

create or replace function public.so_unit_call(p_slug text,p_session_id uuid,p_action text,p_ticket_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants;s public.so_service_sessions;k public.so_tickets;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found or not t.multi_unit_enabled or t.modules->>'calling'<>'true' then raise exception '此店未啟用多隊列叫號';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 select * into s from public.so_service_sessions where id=p_session_id and tenant_id=t.id;
 if not found then raise exception '指定隊列不存在';end if;
 if p_action='call' then
   if exists(select 1 from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and deleted_at is null and status in('CALLED','ARRIVED','ADMITTED','SERVING'))
     then raise exception '請先結束本服務單位正在處理的號碼';end if;
   select * into k from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and deleted_at is null and status='WAITING' order by queue_joined_at,ticket_no,id limit 1 for update;
   if not found then raise exception '此隊列目前沒有等候號碼';end if;
   update public.so_tickets set status='CALLED',updated_at=now(),last_called_at=now(),
     line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
 elsif p_action in ('recall','start','complete','pass','return','cancel') then
   select * into k from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and id=p_ticket_id and deleted_at is null for update;
   if not found then raise exception '找不到此隊列的號碼';end if;
   if p_action='recall' then
     if k.status<>'CALLED' then raise exception '此號碼不能重叫';end if;
     update public.so_tickets set line_call_event_id=gen_random_uuid(),updated_at=now() where id=k.id returning * into k;
   elsif p_action='start' then
     if k.status not in('CALLED','ARRIVED','ADMITTED') then raise exception '未叫號不能開始服務';end if;
     update public.so_tickets set status='SERVING',updated_at=now() where id=k.id returning * into k;
   elsif p_action='complete' then
     if k.status not in('CALLED','ARRIVED','ADMITTED','SERVING') then raise exception '此號碼不能結案';end if;
     update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id returning * into k;
   elsif p_action='pass' then
     if k.status<>'CALLED' then raise exception '此號碼不能標記過號';end if;
     update public.so_tickets set status='PASSED',updated_at=now() where id=k.id returning * into k;
   elsif p_action='return' then
     if k.status<>'PASSED' then raise exception '只有過號可以返回候位';end if;
     update public.so_tickets set status='WAITING',queue_joined_at=now(),updated_at=now() where id=k.id returning * into k;
   elsif p_action='cancel' then
     if k.status not in('WAITING','PASSED') then raise exception '此號碼不能取消';end if;
     update public.so_tickets set status='CANCELLED',updated_at=now() where id=k.id returning * into k;
   end if;
 else raise exception '不支援的叫號操作';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'unit_'||p_action,jsonb_build_object('session',s.id,'ticket',k.id));
 return jsonb_build_object('id',k.id,'ticket_id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
    'line_call_event_id',k.line_call_event_id,'status',k.status);
end $f$;

create or replace function public.so_unit_set_ticket_status(p_slug text,p_ticket_id uuid,p_status text,p_expected_status text)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare t public.so_tenants;k public.so_tickets;v_old text;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found or not t.multi_unit_enabled then raise exception '此店未啟用多隊列';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有權限';end if;
 select * into k from public.so_tickets where tenant_id=t.id and id=p_ticket_id and deleted_at is null for update;
 if not found or k.service_session_id is null then raise exception '找不到此隊列的號碼';end if;
 v_old:=k.status;
 if v_old is distinct from p_expected_status then raise exception '狀態已被其他員工更新，請重新整理';end if;
 if p_status not in('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','COMPLETED','PASSED','CANCELLED')
   then raise exception '不支援的狀態';end if;
 if v_old=p_status then return jsonb_build_object('changed',false,'number',coalesce(k.number_prefix,'')||k.ticket_no::text);end if;
 if p_status in('CALLED','ARRIVED','ADMITTED','SERVING') and exists(
    select 1 from public.so_tickets other where other.tenant_id=t.id
      and other.service_session_id=k.service_session_id and other.id<>k.id and other.deleted_at is null
      and other.status in('CALLED','ARRIVED','ADMITTED','SERVING'))
   then raise exception '此隊列已有服務中的號碼';end if;
 update public.so_tickets set status=p_status,updated_at=now(),
    queue_joined_at=case when p_status='WAITING' and v_old='PASSED' then now() else queue_joined_at end,
    line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else line_call_event_id end,
    line_restore_event_id=case when v_old='CANCELLED' and p_status in('WAITING','HOLD')
       then gen_random_uuid() else line_restore_event_id end
   where id=k.id returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'unit_ticket_status',jsonb_build_object('ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
end $f$;

create or replace function public.so_unit_public_board(p_slug text,p_session_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare t public.so_tenants;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到商家';end if;
 return jsonb_build_object('shop',t.name,'multi',t.multi_unit_enabled,
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
      'unit_id',s.unit_id,'unit',u.name,'group',u.group_label,'start',to_char(s.start_time,'HH24:MI'),
      'end',to_char(s.end_time,'HH24:MI'),
      'current',(select coalesce(k.number_prefix,'')||k.ticket_no::text from public.so_tickets k
        where k.tenant_id=t.id and k.service_session_id=s.id and k.deleted_at is null
         and k.status in('CALLED','ARRIVED','ADMITTED','SERVING') order by k.updated_at desc limit 1),
      'waiting',(select count(*) from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null and k.status='WAITING'),
      'next',(select coalesce(jsonb_agg(coalesce(k.number_prefix,'')||k.ticket_no::text order by k.queue_joined_at,k.ticket_no),'[]'::jsonb)
        from (select * from public.so_tickets k2 where k2.service_session_id=s.id
          and k2.deleted_at is null and k2.status='WAITING' order by k2.queue_joined_at,k2.ticket_no limit 5) k))
    order by s.start_time,u.sort_order,u.name) from public.so_service_sessions s
    join public.so_booking_resources u on u.id=s.unit_id and u.tenant_id=t.id and u.active
    where s.tenant_id=t.id and s.active and s.session_date=(now() at time zone 'Asia/Taipei')::date
      and (p_session_id is null or s.id=p_session_id)),'[]'::jsonb));
end $f$;

create or replace function public.so_unit_progress(p_slug text,p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare t public.so_tenants;k public.so_tickets;s public.so_service_sessions;v_current text;v_ahead int;v_waiting int;
begin
 if auth.uid() is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 select * into k from public.so_tickets where tenant_id=t.id and id=p_ticket_id and deleted_at is null
   and exists(select 1 from public.so_line_links v
    join public.so_line_links owner_link on owner_link.tenant_id=v.tenant_id and owner_link.line_sub=v.line_sub
    where v.tenant_id=t.id and v.user_id=auth.uid() and owner_link.user_id=so_tickets.user_id);
 if not found then raise exception '找不到自己的候診號碼';end if;
 if k.service_session_id is null then return public.so_queue_live(p_slug,p_ticket_id);end if;
 select * into s from public.so_service_sessions where id=k.service_session_id;
 select count(*) into v_waiting from public.so_tickets where service_session_id=s.id and deleted_at is null and status='WAITING';
 select coalesce(number_prefix,'')||ticket_no::text into v_current from public.so_tickets
  where service_session_id=s.id and deleted_at is null and status in('CALLED','ARRIVED','ADMITTED','SERVING') order by updated_at desc limit 1;
 select count(*)::int into v_ahead from public.so_tickets a where a.service_session_id=s.id and a.deleted_at is null
   and a.status='WAITING' and (a.queue_joined_at,a.ticket_no,a.id)<(k.queue_joined_at,k.ticket_no,k.id);
 if k.status in('CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=0;end if;
 if k.status not in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=null;end if;
 return jsonb_build_object('tenant_id',t.id,'shop_name',t.name,'current',v_current,'waiting',v_waiting,
   'serving',case when v_current is null then 0 else 1 end,'updated_at',now(),
   'unit_name',(select name from public.so_booking_resources where id=s.unit_id),
   'session_name',s.name,
   'mine',jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,'created_at',k.created_at));
end $f$;

-- Existing tenants and historical records remain untouched.
revoke all on function public.so_unit_manage(text,text,jsonb) from public,anon;
revoke all on function public.so_unit_book_once(text,uuid,text,text,integer,jsonb,uuid) from public,anon;
revoke all on function public.so_unit_checkin(text,uuid) from public,anon;
revoke all on function public.so_unit_take_number(text,uuid,integer,jsonb) from public,anon;
revoke all on function public.so_unit_call(text,uuid,text,uuid) from public,anon;
revoke all on function public.so_unit_set_ticket_status(text,uuid,text,text) from public,anon;
revoke all on function public.so_unit_config(text,date) from public,anon;
revoke all on function public.so_unit_progress(text,uuid) from public,anon;
grant execute on function public.so_unit_manage(text,text,jsonb) to authenticated;
grant execute on function public.so_unit_book_once(text,uuid,text,text,integer,jsonb,uuid) to authenticated;
grant execute on function public.so_unit_checkin(text,uuid) to authenticated;
grant execute on function public.so_unit_take_number(text,uuid,integer,jsonb) to authenticated;
grant execute on function public.so_unit_call(text,uuid,text,uuid) to authenticated;
grant execute on function public.so_unit_set_ticket_status(text,uuid,text,text) to authenticated;
grant execute on function public.so_unit_config(text,date) to authenticated;
grant execute on function public.so_unit_progress(text,uuid) to authenticated;
grant execute on function public.so_unit_public_board(text,uuid) to anon,authenticated;
