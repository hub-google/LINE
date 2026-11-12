-- Production migration version: 20261112082609
-- Fix pickup order updates failing with record NEW has no booking_date field.
-- Dispatch by table BEFORE accessing table-specific columns (PostgreSQL AND is not a safe short-circuit).
-- Keep weekly opening-hours, closures, service-session and pickup-window validation unchanged.

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
      IF NOT FOUND OR NOT private.so_schedule_session_allowed(NEW.tenant_id,v_date,v_session.start_time,v_session.end_time) THEN
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
      IF NOT FOUND OR NOT private.so_schedule_session_allowed(NEW.tenant_id,v_date,v_session.start_time,v_session.end_time) THEN
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

