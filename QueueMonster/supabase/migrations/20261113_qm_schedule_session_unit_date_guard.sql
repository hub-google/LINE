-- Verify exact service window AND session date when enforcing schedule-derived bookings.
-- Prevent an old/other doctor's unit at matching hours from being accepted.
-- Existing reservations and tickets are not modified.
CREATE OR REPLACE FUNCTION private.so_schedule_session_unit_allowed(
 p_tenant uuid, p_date date, p_unit uuid,
 p_start time without time zone, p_end time without time zone
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
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
     OR (nullif(w->>'unit_id','') IS NULL AND EXISTS(
       SELECT 1 FROM public.qm_booking_resources u
       WHERE u.tenant_id=p_tenant AND u.id=p_unit
         AND u.is_default_session_unit AND u.active
     ))
   ) THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION private.so_schedule_new_record_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v jsonb;
  v_date date;
  v_at timestamp;
  v_session public.qm_service_sessions;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only inspect columns that exist on the active trigger table.
    -- Routine status/contact changes must not be rejected as new bookings.
    IF TG_TABLE_NAME = 'qm_reservations' THEN
      IF NEW.booking_date IS NOT DISTINCT FROM OLD.booking_date
         AND NEW.booking_time IS NOT DISTINCT FROM OLD.booking_time
         AND NEW.service_session_id IS NOT DISTINCT FROM OLD.service_session_id THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'qm_tickets' THEN
      IF NEW.business_date IS NOT DISTINCT FROM OLD.business_date
         AND NEW.service_session_id IS NOT DISTINCT FROM OLD.service_session_id THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'qm_pickup_orders' THEN
      IF NEW.pickup_at IS NOT DISTINCT FROM OLD.pickup_at
         AND NEW.scheduled IS NOT DISTINCT FROM OLD.scheduled THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'qm_reservations' THEN
    v_date := NEW.booking_date;
    v := private.so_schedule_effective(NEW.tenant_id, v_date);
    IF (v->>'closed')::boolean THEN
      RAISE EXCEPTION '此日期已暫停營業，請選其他日期';
    END IF;
    IF (v->>'managed')::boolean THEN
      IF NEW.service_session_id IS NULL THEN
        RAISE EXCEPTION '營業排程已更新，請重新整理後選擇場次';
      END IF;
      SELECT * INTO v_session FROM public.qm_service_sessions
      WHERE id=NEW.service_session_id AND tenant_id=NEW.tenant_id;
      IF NOT FOUND OR v_session.session_date IS DISTINCT FROM v_date
         OR v_session.deleted_at IS NOT NULL OR v_session.active IS NOT TRUE
         OR NOT private.so_schedule_session_unit_allowed(
           NEW.tenant_id,v_date,v_session.unit_id,v_session.start_time,v_session.end_time) THEN
        RAISE EXCEPTION '此場次已不開放預約';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'qm_tickets' THEN
    IF NEW.reservation_id IS NOT NULL THEN
      RETURN NEW; -- Keep existing booking check-ins working.
    END IF;
    v_date := NEW.business_date;
    v := private.so_schedule_effective(NEW.tenant_id,v_date);
    IF (v->>'closed')::boolean THEN
      RAISE EXCEPTION '今日暫停取號';
    END IF;
    IF (v->>'managed')::boolean THEN
      IF NEW.service_session_id IS NULL THEN
        RAISE EXCEPTION '營業排程已更新，請重新選擇取號場次';
      END IF;
      SELECT * INTO v_session FROM public.qm_service_sessions
      WHERE id=NEW.service_session_id AND tenant_id=NEW.tenant_id;
      IF NOT FOUND OR v_session.session_date IS DISTINCT FROM v_date
         OR v_session.deleted_at IS NOT NULL OR v_session.active IS NOT TRUE
         OR NOT private.so_schedule_session_unit_allowed(
           NEW.tenant_id,v_date,v_session.unit_id,v_session.start_time,v_session.end_time) THEN
        RAISE EXCEPTION '此場次已不開放取號';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'qm_pickup_orders' THEN
    v_at := (NEW.pickup_at AT TIME ZONE 'Asia/Taipei')::timestamp;
    IF NOT private.so_schedule_time_allowed(NEW.tenant_id,v_at) THEN
      RAISE EXCEPTION '選擇的取餐時間不在營業時段內';
    END IF;
    IF NOT NEW.scheduled
       AND NOT private.so_schedule_time_allowed(NEW.tenant_id,(now() AT TIME ZONE 'Asia/Taipei')::timestamp) THEN
      RAISE EXCEPTION '目前非營業時間，無法立即下單';
    END IF;
  END IF;
  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.so_unit_config(p_slug text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.qm_tenants; v_date date:=coalesce(p_date,(now() at time zone 'Asia/Taipei')::date);
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into t from public.qm_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 perform private.so_schedule_ensure_sessions(t.id,v_date);
 return jsonb_build_object('multi',t.multi_unit_enabled,'picker',t.unit_selection_enabled,
 'grouped',t.grouped_units_enabled,'linked',t.checkin_queue_enabled,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'group',u.group_label,
   'capacity',u.unit_capacity,'active',u.active,'kind',u.kind,'sort_order',u.sort_order,
   'is_default',u.is_default_session_unit) order by u.is_default_session_unit desc,u.sort_order,u.name)
   from public.qm_booking_resources u where u.tenant_id=t.id and
   (u.active or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,
    'name',s.name,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
    'end',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'active',(s.active and (not s.schedule_generated or coalesce((select enabled from public.qm_schedule_rules where tenant_id=t.id),false)) and private.so_schedule_session_unit_allowed(t.id,s.session_date,s.unit_id,s.start_time,s.end_time)),
    'booked',(select coalesce(sum(party_size),0) from public.qm_reservations r
      where r.service_session_id=s.id and r.deleted_at is null and r.status in('CONFIRMED','CHECKED_IN')))
    order by s.start_time,s.name)
    from public.qm_service_sessions s where s.tenant_id=t.id and s.session_date=v_date
      and s.deleted_at is null and
      ((s.active and (not s.schedule_generated or coalesce((select enabled from public.qm_schedule_rules where tenant_id=t.id),false)) and private.so_schedule_session_unit_allowed(t.id,s.session_date,s.unit_id,s.start_time,s.end_time)) or private.so_role(t.id) is not null or private.so_platform())),'[]'::jsonb));
end $function$
;

REVOKE ALL ON FUNCTION private.so_schedule_session_unit_allowed(
  uuid,date,uuid,time without time zone,time without time zone
) FROM PUBLIC, anon, authenticated;
