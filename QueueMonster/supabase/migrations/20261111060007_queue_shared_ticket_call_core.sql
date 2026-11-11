-- Applied to Supabase on 2026-11-11; extracted using pg_get_functiondef.
CREATE OR REPLACE FUNCTION private.so_ticket_queue_action_core(p_slug text, p_session_id uuid, p_action text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 t public.so_tenants;
 s public.so_service_sessions;
 k public.so_tickets;
 v_unit boolean:=p_session_id IS NOT NULL;
BEGIN
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '找不到企業'; END IF;
 IF v_unit AND (NOT t.multi_unit_enabled OR t.modules->>'calling'<>'true') THEN
    RAISE EXCEPTION '此店未啟用多隊列叫號';
 END IF;
 IF private.so_role(t.id) IS NULL AND NOT private.so_platform() THEN
    RAISE EXCEPTION '沒有叫號權限' USING ERRCODE='42501';
 END IF;
 IF v_unit THEN
    SELECT * INTO s FROM public.so_service_sessions
    WHERE id=p_session_id AND tenant_id=t.id;
    IF NOT FOUND THEN RAISE EXCEPTION '指定隊列不存在'; END IF;
 END IF;
 IF p_action='call' THEN
   IF NOT v_unit THEN
     -- Preserve the original general-queue policy for expired holds.
     UPDATE public.so_tickets hold_ticket
     SET status='WAITING',hold_until=NULL,updated_at=now(),
       queue_joined_at=CASE WHEN coalesce(h.return_mode,'END')='ORIGINAL'
                            THEN hold_ticket.queue_joined_at ELSE now() END
     FROM public.so_queue_hold_policy h
     WHERE h.tenant_id=t.id AND hold_ticket.tenant_id=t.id
       AND hold_ticket.status='HOLD' AND hold_ticket.deleted_at IS NULL
       AND hold_ticket.hold_until<=now();
     UPDATE public.so_tickets
     SET status='WAITING',hold_until=NULL,updated_at=now(),queue_joined_at=now()
     WHERE tenant_id=t.id AND status='HOLD' AND deleted_at IS NULL
       AND hold_until<=now();
   END IF;
   IF t.modules->>'calling'<>'true' THEN RAISE EXCEPTION '未開通叫號'; END IF;
   IF EXISTS (
     SELECT 1 FROM public.so_tickets x
     WHERE x.tenant_id=t.id AND x.deleted_at IS NULL AND x.status='CALLED'
       AND (NOT v_unit OR x.service_session_id=s.id)
   ) THEN
     IF v_unit THEN
       RAISE EXCEPTION '本場次仍有尚未確認的叫號，請先標記已到場或過號';
     END IF;
     RAISE EXCEPTION '已有已叫號但尚未確認到場或過號的顧客，請先處理該號碼';
   END IF;
   SELECT * INTO k FROM public.so_tickets x
   WHERE x.tenant_id=t.id AND x.deleted_at IS NULL AND x.status='WAITING'
     AND (NOT v_unit OR x.service_session_id=s.id)
   ORDER BY CASE WHEN v_unit THEN NULL ELSE x.business_date END,
            x.queue_joined_at,x.ticket_no,x.id
   LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN
     IF v_unit THEN RAISE EXCEPTION '此隊列目前沒有等候號碼'; END IF;
     RAISE EXCEPTION '目前沒有等候中的號碼';
   END IF;
   UPDATE public.so_tickets
      SET status='CALLED',updated_at=now(),last_called_at=now(),
          line_call_event_id=gen_random_uuid()
   WHERE id=k.id RETURNING * INTO k;
 ELSIF p_action IN ('recall','start','complete','pass','return','cancel') THEN
   SELECT * INTO k FROM public.so_tickets
   WHERE tenant_id=t.id AND id=p_ticket_id AND deleted_at IS NULL
     AND (NOT v_unit OR service_session_id=s.id) FOR UPDATE;
   IF NOT FOUND THEN
     IF v_unit THEN RAISE EXCEPTION '找不到此隊列的號碼'; END IF;
     RAISE EXCEPTION '找不到今日號碼';
   END IF;
   IF p_action='recall' THEN
     IF k.status<>'CALLED' THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能重叫'; END IF;
       RAISE EXCEPTION '僅能重叫已叫號票券';
     END IF;
     UPDATE public.so_tickets SET line_call_event_id=gen_random_uuid(),updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='start' THEN
     IF k.status NOT IN ('CALLED','ARRIVED','ADMITTED') THEN
       IF v_unit THEN RAISE EXCEPTION '未叫號不能開始服務'; END IF;
       RAISE EXCEPTION '請先叫號並完成到場處理';
     END IF;
     UPDATE public.so_tickets SET status='SERVING',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='complete' THEN
     IF k.status NOT IN ('CALLED','ARRIVED','ADMITTED','SERVING') THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能結案'; END IF;
       RAISE EXCEPTION '目前無法完成服務';
     END IF;
     UPDATE public.so_tickets SET status='COMPLETED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='pass' THEN
     IF k.status<>'CALLED' THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能標記過號'; END IF;
       RAISE EXCEPTION '僅能標記已叫號為過號';
     END IF;
     UPDATE public.so_tickets SET status='PASSED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='return' THEN
     IF k.status<>'PASSED' THEN
       IF v_unit THEN RAISE EXCEPTION '只有過號可以返回候位'; END IF;
       RAISE EXCEPTION '只有過號可以回復';
     END IF;
     UPDATE public.so_tickets SET status='WAITING',queue_joined_at=now(),
          hold_until=CASE WHEN v_unit THEN hold_until ELSE NULL END,
          updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='cancel' THEN
     IF k.status NOT IN ('WAITING','PASSED') THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能取消'; END IF;
       RAISE EXCEPTION '無法取消此號碼';
     END IF;
     UPDATE public.so_tickets SET status='CANCELLED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   END IF;
 ELSE
   RAISE EXCEPTION '不支援的叫號操作';
 END IF;
 IF v_unit THEN
   INSERT INTO public.so_audit(tenant_id,actor,action,info)
   VALUES(t.id,auth.uid(),'unit_'||p_action,
     jsonb_build_object('session',s.id,'ticket',k.id));
   RETURN jsonb_build_object('id',k.id,'ticket_id',k.id,
     'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'line_call_event_id',k.line_call_event_id,'status',k.status);
 END IF;
 INSERT INTO public.so_audit(tenant_id,actor,action,info)
 VALUES(t.id,auth.uid(),p_action,
        jsonb_build_object('ticket',p_ticket_id,'reservation',NULL));
 RETURN jsonb_build_object('success',true,
   'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.so_staff_action(p_slug text, p_action text, p_ticket_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 t public.so_tenants;
 r public.so_reservations;
 v_day date:=(now() at time zone 'Asia/Taipei')::date;
BEGIN
 IF p_action IN ('call','recall','start','complete','pass','return','cancel') THEN
   RETURN private.so_ticket_queue_action_core(p_slug,NULL,p_action,p_ticket_id);
 END IF;
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '找不到企業'; END IF;
 IF private.so_role(t.id) IS NULL AND NOT private.so_platform() THEN
    RAISE EXCEPTION '沒有叫號權限' USING ERRCODE='42501';
 END IF;
 IF p_action='checkin' THEN
   IF t.modules->>'reservation'<>'true' THEN RAISE EXCEPTION '未開通預約'; END IF;
   SELECT * INTO r FROM public.so_reservations WHERE id=p_reservation_id
     AND tenant_id=t.id AND deleted_at IS NULL AND booking_date=v_day
     AND status='CONFIRMED' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION '預約不存在、非今日或已報到'; END IF;
   UPDATE public.so_reservations SET status='CHECKED_IN',updated_at=now()
      WHERE id=r.id;
 ELSIF p_action IN ('cancel_booking','no_show') THEN
   UPDATE public.so_reservations
      SET status=CASE WHEN p_action='no_show' THEN 'NO_SHOW' ELSE 'CANCELLED' END,
          updated_at=now()
    WHERE id=p_reservation_id AND tenant_id=t.id AND deleted_at IS NULL
      AND booking_date=v_day AND status='CONFIRMED'
    RETURNING * INTO r;
   IF NOT FOUND THEN RAISE EXCEPTION '不可修改此預約'; END IF;
 ELSE
   RAISE EXCEPTION '不支援的操作';
 END IF;
 INSERT INTO public.so_audit(tenant_id,actor,action,info)
 VALUES(t.id,auth.uid(),p_action,jsonb_build_object('ticket',p_ticket_id,
                                                    'reservation',p_reservation_id));
 RETURN jsonb_build_object('success',true,'number',NULL,
                           'ticket_id',NULL,'line_call_event_id',NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.so_unit_call(p_slug text, p_session_id uuid, p_action text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.so_ticket_queue_action_core(p_slug,p_session_id,p_action,p_ticket_id);
END;
$function$
;
REVOKE ALL ON FUNCTION private.so_ticket_queue_action_core(text,uuid,text,uuid) FROM PUBLIC;
