-- Follow-up hardening: regenerate only valid sessions and guard rescheduling to closed days.
CREATE OR REPLACE FUNCTION private.so_schedule_session_allowed(p_tenant uuid, p_date date, p_start time without time zone, p_end time without time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb; w jsonb;
begin
 v:=private.so_schedule_effective(p_tenant,p_date);
 if (v->>'closed')::boolean then return false;end if;
 if not (v->>'managed')::boolean then return true;end if;
 for w in select value from jsonb_array_elements(v->'windows') loop
  if p_start = (w->>'start')::time and p_end = (w->>'end')::time then return true;end if;
 end loop;
 return false;
end $function$
;

CREATE OR REPLACE FUNCTION private.so_schedule_ensure_sessions(p_tenant uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   -- Refresh only unoccupied generated instances; customer records remain untouched.
   update public.so_service_sessions s set name=w->>'name',capacity=(w->>'capacity')::integer,updated_at=now()
   where s.tenant_id=p_tenant and s.unit_id=v_unit and s.session_date=p_date
     and s.start_time=v_start and s.end_time=v_end and s.schedule_generated and s.deleted_at is null
     and (s.name is distinct from w->>'name' or s.capacity is distinct from (w->>'capacity')::integer)
     and not exists(select 1 from public.so_reservations r where r.service_session_id=s.id and r.deleted_at is null)
     and not exists(select 1 from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null);
 end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.so_unit_config(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',(s.active and (not s.schedule_generated or coalesce((select enabled from public.so_schedule_rules where tenant_id=t.id),false)) and private.so_schedule_session_allowed(t.id,s.session_date,s.start_time,s.end_time)),
    'booked',(select coalesce(sum(party_size),0) from public.so_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.so_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and s.deleted_at is null and
      ((s.active and (not s.schedule_generated or coalesce((select enabled from public.so_schedule_rules where tenant_id=t.id),false)) and private.so_schedule_session_allowed(t.id,s.session_date,s.start_time,s.end_time)) or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.so_schedule_manage(p_slug text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   if exists(select 1 from public.so_schedule_exceptions x
       where x.tenant_id=t.id and x.exception_date >= (now() at time zone 'Asia/Taipei')::date
         and x.template_key is not null and not (v_templates ? x.template_key)) then
       raise exception '特殊日期仍引用某個被刪除的模板，請先修改特殊日期';
   end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION private.so_schedule_new_record_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;v_date date;v_at timestamp;v_session public.so_service_sessions;
begin
 if TG_OP='UPDATE' then
   -- Changing a status, contact number, or note must not erase or block historical records.
   if TG_TABLE_NAME='so_reservations' and new.booking_date is not distinct from old.booking_date
     and new.booking_time is not distinct from old.booking_time
     and new.service_session_id is not distinct from old.service_session_id then return new;end if;
   if TG_TABLE_NAME='so_tickets' and new.business_date is not distinct from old.business_date
     and new.service_session_id is not distinct from old.service_session_id then return new;end if;
   if TG_TABLE_NAME='so_pickup_orders' and new.pickup_at is not distinct from old.pickup_at
     and new.scheduled is not distinct from old.scheduled then return new;end if;
 end if;
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
end $function$
;
drop trigger if exists so_schedule_reservation_update_guard on public.so_reservations;
create trigger so_schedule_reservation_update_guard before update on public.so_reservations
 for each row execute function private.so_schedule_new_record_guard();
drop trigger if exists so_schedule_ticket_update_guard on public.so_tickets;
create trigger so_schedule_ticket_update_guard before update on public.so_tickets
 for each row execute function private.so_schedule_new_record_guard();
drop trigger if exists so_schedule_pickup_update_guard on public.so_pickup_orders;
create trigger so_schedule_pickup_update_guard before update on public.so_pickup_orders
 for each row execute function private.so_schedule_new_record_guard();
