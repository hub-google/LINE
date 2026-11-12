-- Keep service-session booking active while a recurring schedule is enabled.
CREATE OR REPLACE FUNCTION public.so_unit_manage(p_slug text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       exists(select 1 from public.so_service_sessions ss where ss.tenant_id=t.id and ss.deleted_at is null)
       or coalesce((select enabled from public.so_schedule_rules where tenant_id=t.id),false),
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
       -- Existing sessions retain their ID when their date is changed.
     end if;
     v_unit:=nullif(p_data->>'unit_id','')::uuid;
     -- An explicit null means move this session to the shop's default unit.
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
       if not t.unit_selection_enabled
         and not coalesce((select enabled from public.so_schedule_rules where tenant_id=t.id),false)
         and not exists
         (select 1 from public.so_service_sessions remain
           where remain.tenant_id=t.id and remain.deleted_at is null) then
         update public.so_tenants set multi_unit_enabled=false,updated_at=now() where id=t.id;
       end if;
     else
       -- Reassignment is allowed; dependent records are synchronized below.
       -- Booking date/time are kept in sync below, even when records already exist.
       -- Closing a session does not delete its existing reservations or tickets.
       select coalesce(sum(party_size),0)::int into v_booked from public.so_reservations
         where service_session_id=s.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
       -- Overbooked sessions do not accept further reservations until capacity is available.
       -- Keep session identity and all related reservation and ticket references intact.
       -- A date move can collide with an existing ticket identity; fail atomically with a clear error.
       if v_day<>s.session_date and exists(
         select 1 from public.so_tickets moving
         join public.so_tickets existing
           on existing.tenant_id=moving.tenant_id
          and existing.business_date=v_day
          and existing.number_round=moving.number_round
          and existing.ticket_no=moving.ticket_no
          and existing.id<>moving.id
          and existing.service_session_id is distinct from v_session
         where moving.tenant_id=t.id and moving.service_session_id=v_session
       ) then
         raise exception '新日期有重複號碼牌編號，請先處理衝突後再修改日期';
       end if;
       update public.so_service_sessions set unit_id=v_unit,session_date=v_day,
         name=v_name,start_time=v_start,end_time=v_end,
         capacity=v_capacity,active=v_active,updated_at=now()
         where id=v_session and tenant_id=t.id returning * into s;
       update public.so_reservations set service_unit_id=v_unit,
         booking_date=v_day,booking_time=v_start,updated_at=now()
         where tenant_id=t.id and service_session_id=v_session
           and (service_unit_id is distinct from v_unit
             or booking_date is distinct from v_day
             or booking_time is distinct from v_start);
       update public.so_tickets set service_unit_id=v_unit,business_date=v_day,updated_at=now()
         where tenant_id=t.id and service_session_id=v_session
           and (service_unit_id is distinct from v_unit or business_date is distinct from v_day);
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
end $function$
;
