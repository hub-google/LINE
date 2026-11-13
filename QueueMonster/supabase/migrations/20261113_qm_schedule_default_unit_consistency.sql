-- Make the generated general-session resource deterministic even if legacy/test data
-- contains more than one default service resource.
-- Match the resource selected by session generation to the resource accepted
-- by reservation and ticket guards; no customer records are altered.
CREATE OR REPLACE FUNCTION private.so_schedule_session_unit_allowed(p_tenant uuid, p_date date, p_unit uuid, p_start time without time zone, p_end time without time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; w jsonb;
BEGIN
 IF p_unit IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.qm_booking_resources u
    WHERE u.tenant_id=p_tenant AND u.id=p_unit AND u.active
 ) THEN RETURN false; END IF;
 v:=private.so_schedule_effective(p_tenant,p_date);
 IF (v->>'closed')::boolean THEN RETURN false; END IF;
 IF NOT (v->>'managed')::boolean THEN RETURN true; END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(v->'windows') LOOP
   IF p_start=(w->>'start')::time AND p_end=(w->>'end')::time AND (
     (nullif(w->>'unit_id','') IS NOT NULL AND (w->>'unit_id')::uuid=p_unit)
     OR (nullif(w->>'unit_id','') IS NULL AND p_unit=(
       SELECT u.id FROM public.qm_booking_resources u
       WHERE u.tenant_id=p_tenant AND u.is_default_session_unit AND u.active
       ORDER BY u.id LIMIT 1
     ))
   ) THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END
$function$
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
       select id into v_default from public.qm_booking_resources where tenant_id=p_tenant and is_default_session_unit and active order by id limit 1;
       if v_default is null then
         insert into public.qm_booking_resources(tenant_id,kind,name,group_label,unit_capacity,active,is_default_session_unit)
          values(p_tenant,'STAFF','一般場次','',1,true,true)
          on conflict do nothing;
         select id into v_default from public.qm_booking_resources where tenant_id=p_tenant and is_default_session_unit and active order by id limit 1;
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
