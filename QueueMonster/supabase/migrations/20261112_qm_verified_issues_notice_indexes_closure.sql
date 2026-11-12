-- QueueMonster #39: make both pickup foreign-key references index-efficient.
-- Composite indexes led by tenant_id cannot serve order_id/user_id FK references alone.
CREATE INDEX IF NOT EXISTS qm_pickup_orders_user_id_fk_idx
  ON public.qm_pickup_orders (user_id);
CREATE INDEX IF NOT EXISTS qm_pickup_notice_events_order_id_fk_idx
  ON public.qm_pickup_notice_events (order_id);

-- QueueMonster #16: read-only, manager-authorized preview of existing customer records
-- before changing special business dates to CLOSED. Returns counts only; never mutates orders.
CREATE OR REPLACE FUNCTION public.so_schedule_closure_impact(
  p_slug text, p_start date, p_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_tenant public.qm_tenants;
  v_reservations integer := 0;
  v_tickets integer := 0;
  v_orders integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入' USING errcode='28000';
  END IF;
  SELECT * INTO v_tenant
    FROM public.qm_tenants WHERE slug=p_slug AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION '找不到門市' USING errcode='22023'; END IF;
  IF coalesce(private.so_role(v_tenant.id),'') NOT IN ('OWNER','MANAGER')
     AND NOT coalesce(private.so_platform(),false) THEN
    RAISE EXCEPTION '只有店家管理者可查看影響範圍' USING errcode='42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>366
    OR p_start<(now() AT TIME ZONE 'Asia/Taipei')::date-365
    OR p_end>(now() AT TIME ZONE 'Asia/Taipei')::date+3650 THEN
    RAISE EXCEPTION '特殊日期區間無效' USING errcode='22023';
  END IF;

  SELECT count(*) INTO v_reservations
    FROM public.qm_reservations r
   WHERE r.tenant_id=v_tenant.id AND r.deleted_at IS NULL
     AND r.booking_date BETWEEN p_start AND p_end
     AND r.status IN ('CONFIRMED','CHECKED_IN');

  SELECT count(*) INTO v_tickets
    FROM public.qm_tickets t
   WHERE t.tenant_id=v_tenant.id AND t.deleted_at IS NULL
     AND t.business_date BETWEEN p_start AND p_end
     AND t.status IN ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED');

  SELECT count(*) INTO v_orders
    FROM public.qm_pickup_orders o
   WHERE o.tenant_id=v_tenant.id
     AND (o.pickup_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN p_start AND p_end
     AND o.status IN ('NEW','ACCEPTED','PREPARING','READY');

  RETURN jsonb_build_object(
    'reservations',v_reservations,'tickets',v_tickets,'orders',v_orders,
    'total',v_reservations+v_tickets+v_orders
  );
END
$$;
REVOKE ALL ON FUNCTION public.so_schedule_closure_impact(text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.so_schedule_closure_impact(text,date,date) TO authenticated;
