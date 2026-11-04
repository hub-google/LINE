-- PRD FR-101 / NR-05 & NR-06: transactionally safe service duration, buffer and staff/room resource occupancy.
-- Additive migration. No reset or deletion of existing tenants, reservations, numbers, or test accounts.
create table if not exists public.so_booking_resources (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.so_tenants(id) on delete restrict,
 kind text not null check(kind in ('STAFF','ROOM','EQUIPMENT')),
 name text not null check (char_length(btrim(name)) between 1 and 80),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id)
);
alter table public.so_booking_resources enable row level security;
revoke all on public.so_booking_resources from public,anon,authenticated;

create unique index if not exists so_menu_items_tenant_item_unique on public.so_menu_items(tenant_id,id);
create table if not exists public.so_service_rules (
 tenant_id uuid not null references public.so_tenants(id) on delete restrict,
 item_id uuid primary key,
 duration_minutes integer not null check(duration_minutes between 5 and 480),
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120),
 resource_id uuid,
 show_duration_to_customer boolean not null default true,
 updated_at timestamptz not null default now(),
 foreign key (tenant_id,item_id) references public.so_menu_items(tenant_id,id) on delete restrict,
 foreign key (tenant_id,resource_id) references public.so_booking_resources(tenant_id,id) on delete restrict
);
alter table public.so_service_rules enable row level security;
revoke all on public.so_service_rules from public,anon,authenticated;

alter table public.so_reservations
 add column if not exists service_duration_minutes integer,
 add column if not exists service_buffer_minutes integer not null default 0,
 add column if not exists assigned_resource_id uuid;
update public.so_reservations r
 set service_duration_minutes=t.slot_minutes
 from public.so_tenants t
 where r.tenant_id=t.id and r.service_duration_minutes is null;
alter table public.so_reservations alter column service_duration_minutes set not null;
alter table public.so_reservations add constraint so_reservation_duration_positive check(service_duration_minutes between 5 and 4800);
alter table public.so_reservations add constraint so_reservation_buffer_positive check(service_buffer_minutes between 0 and 2400);
alter table public.so_reservations add constraint so_reservation_resource_same_tenant
 foreign key(tenant_id,assigned_resource_id) references public.so_booking_resources(tenant_id,id) on delete restrict;

create index if not exists so_active_booking_times
 on public.so_reservations(tenant_id,booking_date,booking_time)
 where deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
create index if not exists so_active_booking_resources
 on public.so_reservations(tenant_id,assigned_resource_id,booking_date)
 where assigned_resource_id is not null and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');

create or replace function private.so_booking_service_spec(p_tenant uuid,p_items jsonb,p_default_minutes integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count int;v_duration int;v_buffer int;v_resource_ids uuid[];v_resource uuid;
begin
 if coalesce(jsonb_typeof(p_items),'array')<>'array' then raise exception '服務資料格式錯誤';end if;
 select count(mi.id),
        coalesce(sum(coalesce(sr.duration_minutes,p_default_minutes)),0)::int,
        coalesce(sum(coalesce(sr.buffer_minutes,0)),0)::int,
        array_agg(distinct sr.resource_id) filter(where sr.resource_id is not null)
 into v_count,v_duration,v_buffer,v_resource_ids
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) j
 join public.so_menu_items mi on mi.tenant_id=p_tenant
    and mi.id=(j->>'id')::uuid and mi.kind='SERVICE'
 left join public.so_service_rules sr on sr.item_id=mi.id and sr.tenant_id=p_tenant;
 if cardinality(coalesce(v_resource_ids,'{}'::uuid[]))>1 then
   raise exception '本次選擇的服務使用不同資源，請拆開預約';
 end if;
 v_resource:=v_resource_ids[1];
 return jsonb_build_object('duration_minutes',case when v_count=0 then p_default_minutes else v_duration end,
   'buffer_minutes',v_buffer,'resource_id',v_resource);
end $$;

create or replace function private.so_peak_reserved_party(p_tenant uuid,p_start timestamp,p_end timestamp,p_exclude uuid default null)
returns integer language sql stable security definer set search_path='' as $$
 with spans as (
  select (r.booking_date+r.booking_time) as begins,
      (r.booking_date+r.booking_time)
        + make_interval(mins=>r.service_duration_minutes+r.service_buffer_minutes) as ends,
      r.party_size
  from public.so_reservations r
  where r.tenant_id=p_tenant and r.deleted_at is null
    and r.status in('CONFIRMED','CHECKED_IN')
    and (p_exclude is null or r.id<>p_exclude)
    and (r.booking_date+r.booking_time) < p_end
    and (r.booking_date+r.booking_time)
      + make_interval(mins=>r.service_duration_minutes+r.service_buffer_minutes) > p_start
 ), points as (
  select p_start as ts
  union
  select begins from spans where begins>p_start and begins<p_end
 )
 select coalesce(max(coalesce((
    select sum(s.party_size) from spans s where s.begins<=p.ts and s.ends>p.ts
  ),0)),0)::integer from points p;
$$;

create or replace function private.so_check_booking_resource()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.so_tenants; bp public.so_booking_policy; spec jsonb;
 v_start timestamp;v_finish timestamp;v_occupied_until timestamp;v_peak int;v_rid uuid;
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
 v_start:=new.booking_date+new.booking_time;
 v_finish:=v_start+make_interval(mins=>new.service_duration_minutes);
 v_occupied_until:=v_finish+make_interval(mins=>new.service_buffer_minutes);
 if new.party_size>t.slot_capacity then raise exception '預約人數超過門市容量';end if;
 if v_finish>(new.booking_date+t.close_time)::timestamp then raise exception '服務時間超過門市營業時間，請選擇較早時段';end if;
 select * into bp from public.so_booking_policy where tenant_id=new.tenant_id;
 if bp.break_start is not null and bp.break_end is not null
   and v_start < (new.booking_date+bp.break_end)::timestamp
   and v_finish > (new.booking_date+bp.break_start)::timestamp then
   raise exception '服務時間與門市休息時段重疊'; end if;
 v_peak:=private.so_peak_reserved_party(new.tenant_id,v_start,v_occupied_until,
    case when tg_op='INSERT' then null else new.id end);
 if v_peak+new.party_size>t.slot_capacity then
   raise exception '此服務時段剩餘容量不足，請改選其他時段'; end if;
 v_rid:=new.assigned_resource_id;
 if v_rid is not null then
  if not exists(select 1 from public.so_booking_resources
    where id=v_rid and tenant_id=new.tenant_id and active) then
    raise exception '指定員工或房間已停用';end if;
  if exists(select 1 from public.so_reservations r
   where r.tenant_id=new.tenant_id and r.id is distinct from new.id
     and r.assigned_resource_id=v_rid and r.deleted_at is null
     and r.status in('CONFIRMED','CHECKED_IN')
     and (r.booking_date+r.booking_time)<v_occupied_until
     and (r.booking_date+r.booking_time)
       + make_interval(mins=>r.service_duration_minutes+r.service_buffer_minutes)>v_start)
  then raise exception '指定員工或房間在此時段已有預約';end if;
 end if;
 return new;
end $$;
drop trigger if exists so_booking_resource_guard on public.so_reservations;
create trigger so_booking_resource_guard before insert or update of
 booking_date,booking_time,party_size,selected_items,status,deleted_at
 on public.so_reservations for each row execute function private.so_check_booking_resource();

create or replace function public.so_resource_upsert(p_slug text,p_name text,p_kind text,p_active boolean default true,p_resource_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants; r public.so_booking_resources;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if coalesce(private.so_role(t.id),'') not in('OWNER','MANAGER') and not private.so_platform() then
  raise exception '無權修改本店預約資源' using errcode='42501';end if;
 if p_kind not in('STAFF','ROOM','EQUIPMENT') or char_length(btrim(coalesce(p_name,''))) not between 1 and 80
 then raise exception '請正確輸入資源名稱及類型';end if;
 if p_resource_id is null then
   insert into public.so_booking_resources(tenant_id,kind,name,active)
    values(t.id,p_kind,btrim(p_name),coalesce(p_active,true)) returning * into r;
 else
   update public.so_booking_resources set kind=p_kind,name=btrim(p_name),active=coalesce(p_active,true),updated_at=now()
    where id=p_resource_id and tenant_id=t.id returning * into r;
   if not found then raise exception '找不到本店資源';end if;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'resource_upsert',jsonb_build_object('resource',r.id,'kind',r.kind,'active',r.active));
 return jsonb_build_object('id',r.id,'name',r.name,'kind',r.kind,'active',r.active);
end $$;
revoke all on function public.so_resource_upsert(text,text,text,boolean,uuid) from public,anon;
grant execute on function public.so_resource_upsert(text,text,text,boolean,uuid) to authenticated;

create or replace function public.so_service_rule_save(p_slug text,p_item_id uuid,p_duration integer,p_buffer integer,p_resource_id uuid default null,p_show_duration boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants; s public.so_service_rules;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if coalesce(private.so_role(t.id),'') not in('OWNER','MANAGER') and not private.so_platform() then
  raise exception '無權修改本店服務規則' using errcode='42501';end if;
 if p_duration not between 5 and 480 or p_buffer not between 0 and 120
 then raise exception '服務時長需為 5～480 分鐘，緩衝 0～120 分鐘';end if;
 if not exists(select 1 from public.so_menu_items where id=p_item_id and tenant_id=t.id and kind='SERVICE')
 then raise exception '只能設定本店的服務項目';end if;
 if p_resource_id is not null and not exists(select 1 from public.so_booking_resources
    where id=p_resource_id and tenant_id=t.id and active)
 then raise exception '指定的本店資源不存在或已停用';end if;
 insert into public.so_service_rules(tenant_id,item_id,duration_minutes,buffer_minutes,resource_id,show_duration_to_customer)
 values(t.id,p_item_id,p_duration,p_buffer,p_resource_id,coalesce(p_show_duration,true))
 on conflict(item_id) do update set
  duration_minutes=excluded.duration_minutes,buffer_minutes=excluded.buffer_minutes,
  resource_id=excluded.resource_id,show_duration_to_customer=excluded.show_duration_to_customer,updated_at=now()
 returning * into s;
 insert into public.so_audit(tenant_id,actor,action,info)
  values(t.id,auth.uid(),'service_rule_save',jsonb_build_object('item',s.item_id,'duration',s.duration_minutes,'buffer',s.buffer_minutes,'resource',s.resource_id));
 return jsonb_build_object('item_id',s.item_id,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'resource_id',s.resource_id);
end $$;
revoke all on function public.so_service_rule_save(text,uuid,integer,integer,uuid,boolean) from public,anon;
grant execute on function public.so_service_rule_save(text,uuid,integer,integer,uuid,boolean) to authenticated;

create or replace function public.so_staff_resource_context(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '無權查看本店資源';end if;
 return jsonb_build_object(
  'resources',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'active',active)
    order by kind,name) from public.so_booking_resources where tenant_id=t.id),'[]'::jsonb),
  'service_rules',coalesce((select jsonb_agg(jsonb_build_object('item_id',item_id,
    'duration_minutes',duration_minutes,'buffer_minutes',buffer_minutes,
    'resource_id',resource_id,'show_duration_to_customer',show_duration_to_customer))
    from public.so_service_rules where tenant_id=t.id),'[]'::jsonb));
end $$;
revoke all on function public.so_staff_resource_context(text) from public,anon;
grant execute on function public.so_staff_resource_context(text) to authenticated;

create or replace function public.so_service_slot_availability(p_slug text,p_date date,p_items uuid[] default '{}'::uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.so_tenants; bp public.so_booking_policy; spec jsonb; v_items jsonb;
 v_duration integer;v_buffer integer;v_rid uuid; v_slots jsonb:='[]'::jsonb;
 v_begin timestamp;v_finish timestamp;v_occupied timestamp;v_available integer;
 v_resource_busy boolean;v_step record; v_today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found or t.modules->>'reservation'<>'true' then raise exception '門市沒有開放預約';end if;
 if p_date is null or p_date<v_today or p_date>v_today+30 then raise exception '日期不在可預約範圍';end if;
 if coalesce(cardinality(p_items),0)>20 then raise exception '每次最多選擇 20 項服務';end if;
 if exists(select 1 from unnest(coalesce(p_items,'{}'::uuid[])) id
   where not exists(select 1 from public.so_menu_items mi where mi.id=id and mi.tenant_id=t.id and mi.active))
 then raise exception '服務選擇包含本店未上架的項目';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.item)),'[]'::jsonb) into v_items
   from unnest(coalesce(p_items,'{}'::uuid[])) v(item);
 spec:=private.so_booking_service_spec(t.id,v_items,t.slot_minutes);
 v_duration:=(spec->>'duration_minutes')::integer;
 v_buffer:=(spec->>'buffer_minutes')::integer;
 v_rid:=(spec->>'resource_id')::uuid;
 select * into bp from public.so_booking_policy where tenant_id=t.id;
 if extract(dow from p_date)::int=any(coalesce(bp.closed_weekdays,'{}'::smallint[]))
    or p_date=any(coalesce(bp.closed_dates,'{}'::date[])) then
   return jsonb_build_object('slots','[]'::jsonb,'duration_minutes',v_duration,'buffer_minutes',v_buffer);
 end if;
 for v_step in
  select gs as ts from generate_series((p_date+t.open_time)::timestamp,
    (p_date+t.close_time)::timestamp-make_interval(mins=>t.slot_minutes),
    make_interval(mins=>t.slot_minutes)) gs
 loop
  v_begin:=v_step.ts;
  v_finish:=v_begin+make_interval(mins=>v_duration);
  v_occupied:=v_finish+make_interval(mins=>v_buffer);
  if v_finish>(p_date+t.close_time)::timestamp
     or v_begin<((now() at time zone 'Asia/Taipei')+make_interval(mins=>coalesce(bp.min_notice_minutes,0)))
     or (bp.break_start is not null and bp.break_end is not null
       and v_begin<(p_date+bp.break_end)::timestamp
       and v_finish>(p_date+bp.break_start)::timestamp)
  then continue;end if;
  v_available:=greatest(0,t.slot_capacity-private.so_peak_reserved_party(t.id,v_begin,v_occupied,null));
  if v_rid is not null then
   v_resource_busy:=
    not exists(select 1 from public.so_booking_resources where tenant_id=t.id and id=v_rid and active)
    or exists(select 1 from public.so_reservations r
      where r.tenant_id=t.id and r.assigned_resource_id=v_rid and r.deleted_at is null
        and r.status in('CONFIRMED','CHECKED_IN')
        and (r.booking_date+r.booking_time)<v_occupied
        and (r.booking_date+r.booking_time)
         +make_interval(mins=>r.service_duration_minutes+r.service_buffer_minutes)>v_begin);
   if v_resource_busy then v_available:=0;end if;
  end if;
  v_slots:=v_slots||jsonb_build_array(jsonb_build_object('time',to_char(v_begin,'HH24:MI'),
   'capacity',t.slot_capacity,'available',v_available,
   'booked',t.slot_capacity-v_available));
 end loop;
 return jsonb_build_object('slots',v_slots,'duration_minutes',v_duration,
  'buffer_minutes',v_buffer,'resource_assigned',v_rid is not null);
end $$;
revoke all on function public.so_service_slot_availability(text,date,uuid[]) from public,anon;
grant execute on function public.so_service_slot_availability(text,date,uuid[]) to authenticated;
