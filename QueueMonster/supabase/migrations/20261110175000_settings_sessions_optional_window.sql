-- Service-session editing, safe deletion and optional service windows.
-- Default window is internal only; ordinary shops create sessions without adding a window.
do $backfill$
begin
 if not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='so_tenants' and column_name='unit_selection_enabled'
 ) then
  alter table public.so_tenants add column unit_selection_enabled boolean not null default false;
  update public.so_tenants set unit_selection_enabled=true where multi_unit_enabled=true;
 end if;
end $backfill$;
alter table public.so_booking_resources add column if not exists is_default_session_unit boolean not null default false;
create unique index if not exists so_one_default_session_unit on public.so_booking_resources(tenant_id) where is_default_session_unit;
alter table public.so_service_sessions add column if not exists deleted_at timestamptz;
alter table public.so_service_sessions drop constraint if exists so_service_sessions_tenant_id_unit_id_session_date_start_ti_key;
create unique index if not exists so_session_active_start_unique
 on public.so_service_sessions(tenant_id,unit_id,session_date,start_time) where deleted_at is null;

create or replace function public.so_unit_config(p_slug text,p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare t public.so_tenants; v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 return jsonb_build_object('multi',t.multi_unit_enabled,'picker',t.unit_selection_enabled,
 'grouped',t.grouped_units_enabled,'linked',t.checkin_queue_enabled,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'group',u.group_label,
   'capacity',u.unit_capacity,'active',u.active,'kind',u.kind,'sort_order',u.sort_order,
   'is_default',u.is_default_session_unit) order by u.is_default_session_unit desc,u.sort_order,u.name)
   from public.so_booking_resources u where u.tenant_id=t.id and
   (u.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,
    'name',s.name,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',s.active,
    'booked',(select coalesce(sum(party_size),0) from public.so_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.so_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and s.deleted_at is null and
      (s.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $f$;

create or replace function public.so_unit_manage(p_slug text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare
 t public.so_tenants; u public.so_booking_resources; s public.so_service_sessions;
 v_unit uuid;v_session uuid;v_day date;v_start time;v_end time;v_capacity int;
 v_name text;v_active boolean;v_booked int;v_is_busy boolean;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到商家';end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '只有管理者可以修改設定' using errcode='42501';end if;
 if p_action='settings' then
   if coalesce((p_data->>'linked')::boolean,false) and
     (t.modules->>'reservation'<>'true' or t.modules->>'calling'<>'true') then
     raise exception '報到連動需要啟用預約與叫號功能';end if;
   update public.so_tenants set
     unit_selection_enabled=coalesce((p_data->>'multi')::boolean,false),
     multi_unit_enabled=coalesce((p_data->>'multi')::boolean,false) or
       exists(select 1 from public.so_service_sessions ss where ss.tenant_id=t.id and ss.deleted_at is null),
     grouped_units_enabled=coalesce((p_data->>'multi')::boolean,false) and
       coalesce((p_data->>'grouped')::boolean,false),
     checkin_queue_enabled=coalesce((p_data->>'linked')::boolean,false),updated_at=now() where id=t.id;
 elsif p_action='unit' then
   v_name:=btrim(coalesce(p_data->>'name',''));
   if length(v_name) not between 1 and 80 then raise exception '請填寫服務窗口名稱';end if;
   v_unit:=nullif(p_data->>'id','')::uuid;
   if v_unit is null then
     insert into public.so_booking_resources(tenant_id,kind,name,group_label,sort_order,unit_capacity,active)
     values(t.id,'STAFF',v_name,left(btrim(coalesce(p_data->>'group','')),60),
       coalesce((p_data->>'sort_order')::int,0),1,coalesce((p_data->>'active')::boolean,true))
       returning * into u;
   else
     update public.so_booking_resources set name=v_name,
       group_label=left(btrim(coalesce(p_data->>'group','')),60),
       sort_order=coalesce((p_data->>'sort_order')::int,0),
       active=coalesce((p_data->>'active')::boolean,true),updated_at=now()
      where tenant_id=t.id and id=v_unit and not is_default_session_unit returning * into u;
     if not found then raise exception '找不到服務窗口';end if;
   end if;
 elsif p_action in ('session','session_delete') then
   v_session:=nullif(p_data->>'id','')::uuid;
   if p_action='session_delete' then
     if v_session is null then raise exception '請指定要刪除的場次';end if;
     select * into s from public.so_service_sessions
       where id=v_session and tenant_id=t.id and deleted_at is null for update;
     if not found then raise exception '找不到這個場次';end if;
   else
     v_day:=(p_data->>'date')::date;
     if v_day is null or v_day<(now() at time zone 'Asia/Taipei')::date-1 or
       v_day>(now() at time zone 'Asia/Taipei')::date+90 then
       raise exception '僅能設定最近 90 天內的場次';end if;
     v_name:=btrim(coalesce(p_data->>'name',''));
     v_start:=(p_data->>'start')::time;v_end:=(p_data->>'end')::time;
     v_capacity:=(p_data->>'capacity')::int;
     v_active:=coalesce((p_data->>'active')::boolean,true);
     if length(v_name) not between 1 and 60 then raise exception '請輸入 1～60 字的場次名稱';end if;
     if v_start is null or v_end is null or v_end<=v_start then raise exception '結束時間必須晚於開始時間';end if;
     if v_capacity is null or v_capacity<1 or v_capacity>300 then raise exception '開放名額必須介於 1～300';end if;
     if v_session is not null then
       select * into s from public.so_service_sessions
         where id=v_session and tenant_id=t.id and deleted_at is null for update;
       if not found then raise exception '找不到這個場次';end if;
       if s.session_date<>v_day then raise exception '不能直接更改場次日期，請在新日期新增場次';end if;
     end if;
     v_unit:=nullif(p_data->>'unit_id','')::uuid;
     if v_unit is null and v_session is not null then v_unit:=s.unit_id;end if;
     if v_unit is null then
       select * into u from public.so_booking_resources
        where tenant_id=t.id and is_default_session_unit for update;
       if not found then
         insert into public.so_booking_resources(tenant_id,kind,name,group_label,unit_capacity,active,is_default_session_unit)
         values(t.id,'STAFF','一般場次','',1,true,true) returning * into u;
       elsif not u.active then
         update public.so_booking_resources set active=true,updated_at=now() where id=u.id returning * into u;
       end if;
       v_unit:=u.id;
     end if;
     if not exists(select 1 from public.so_booking_resources
       where tenant_id=t.id and id=v_unit and active) then raise exception '服務窗口不存在或已停用';end if;
   end if;
   if v_session is not null then
     select exists(select 1 from public.so_reservations r
       where r.tenant_id=t.id and r.service_session_id=v_session and r.deleted_at is null
         and r.status in ('CONFIRMED','CHECKED_IN')
       union all select 1 from public.so_tickets k
       where k.tenant_id=t.id and k.service_session_id=v_session and k.deleted_at is null
         and k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED')
     ) into v_is_busy;
     if p_action='session_delete' then
       if v_is_busy then raise exception '此場次仍有有效預約或候位號碼，請先完成或取消後再刪除';end if;
       update public.so_service_sessions set active=false,deleted_at=now(),updated_at=now()
         where id=v_session and tenant_id=t.id returning * into s;
       if not t.unit_selection_enabled and not exists
         (select 1 from public.so_service_sessions remain
           where remain.tenant_id=t.id and remain.deleted_at is null) then
         update public.so_tenants set multi_unit_enabled=false,updated_at=now() where id=t.id;
       end if;
     else
       if v_unit<>s.unit_id then raise exception '既有場次不能更換服務窗口，請另建場次';end if;
       if (s.start_time<>v_start or s.end_time<>v_end) and
         (exists(select 1 from public.so_reservations r where r.service_session_id=s.id)
          or exists(select 1 from public.so_tickets k where k.service_session_id=s.id)) then
         raise exception '此場次已有預約或取號紀錄，不能修改時間；請另建場次';end if;
       if v_is_busy and not v_active then raise exception '此場次仍有有效預約或候位號碼，不能直接關閉';end if;
       select coalesce(sum(party_size),0)::int into v_booked from public.so_reservations
         where service_session_id=s.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
       if v_capacity<v_booked then raise exception '開放名額不可少於已預約人數';end if;
       update public.so_service_sessions set name=v_name,start_time=v_start,end_time=v_end,
         capacity=v_capacity,active=v_active,updated_at=now()
         where id=v_session and tenant_id=t.id returning * into s;
     end if;
   else
     insert into public.so_service_sessions(tenant_id,unit_id,session_date,name,start_time,end_time,capacity,active)
     values(t.id,v_unit,v_day,v_name,v_start,v_end,v_capacity,v_active) returning * into s;
   end if;
   if p_action='session' then
     update public.so_tenants set multi_unit_enabled=true,updated_at=now() where id=t.id;
   end if;
 else
   raise exception '不支援的操作';end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),'service_unit_'||p_action,p_data);
 return jsonb_build_object('ok',true,'id',coalesce(s.id,u.id));
end $f$;

revoke all on function public.so_unit_manage(text,text,jsonb) from public,anon;
grant execute on function public.so_unit_manage(text,text,jsonb) to authenticated;
revoke all on function public.so_unit_config(text,date) from public,anon;
grant execute on function public.so_unit_config(text,date) to authenticated;
