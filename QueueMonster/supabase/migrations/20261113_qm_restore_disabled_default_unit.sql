-- A disabled canonical default service resource blocked all generated general
-- sessions after switching on managed weekly scheduling. Restore only this
-- default resource when a general window is needed. No other resource or
-- existing customer record is changed.
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
       select id into v_default from public.qm_booking_resources
        where tenant_id=p_tenant and is_default_session_unit order by id limit 1 for update;
       if v_default is null then
         insert into public.qm_booking_resources(tenant_id,kind,name,group_label,unit_capacity,active,is_default_session_unit)
          values(p_tenant,'STAFF','一般場次','',1,true,true)
          on conflict do nothing;
         select id into v_default from public.qm_booking_resources
          where tenant_id=p_tenant and is_default_session_unit order by id limit 1 for update;
       end if;
       -- Legacy/QA merchants may have the canonical default unit disabled.
       -- A managed weekly general session requires that very same default unit.
       if v_default is not null then
         update public.qm_booking_resources
           set active=true,updated_at=now()
           where id=v_default and tenant_id=p_tenant and not active;
       end if;
     end if;
     v_unit:=v_default;
   end if;
   if v_unit is null or not exists(select 1 from public.qm_booking_resources where tenant_id=p_tenant and id=v_unit and active) then continue;end if;
   insert into public.qm_service_sessions(tenant_id,unit_id,session_date,name,start_time,end_time,capacity,active,schedule_generated)
    select p_tenant,v_unit,p_date,w->>'name',v_start,v_end,(w->>'capacity')::integer,true,true
    where not exists(select 1 from public.qm_service_sessions s
        where s.tenant_id=p_tenant and s.unit_id=v_unit and s.session_date=p_date
          and s.start_time=v_start and s.deleted_at is null)
    on conflict do nothing;
   -- Refresh only unoccupied generated instances; customer records remain untouched.
   update public.qm_service_sessions s set name=w->>'name',capacity=(w->>'capacity')::integer,updated_at=now()
   where s.tenant_id=p_tenant and s.unit_id=v_unit and s.session_date=p_date
     and s.start_time=v_start and s.end_time=v_end and s.schedule_generated and s.deleted_at is null
     and (s.name is distinct from w->>'name' or s.capacity is distinct from (w->>'capacity')::integer)
     and not exists(select 1 from public.qm_reservations r where r.service_session_id=s.id and r.deleted_at is null)
     and not exists(select 1 from public.qm_tickets k where k.service_session_id=s.id and k.deleted_at is null);
 end loop;
end $function$
;
