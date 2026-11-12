-- Queue Monster: allow staff to call the next ticket without manually resolving the previous CALLED ticket.
-- Only the same queue is affected. Already ARRIVED/ADMITTED/SERVING tickets remain unchanged.
-- The existing tenant row lock serializes concurrent calls; audit records preserve automatic passes.
-- Database migration is code-only and does not modify existing tickets at apply time.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('private.so_ticket_queue_action_core(text,uuid,text,uuid)'::regprocedure)) <> '5798dd94aa59c0d4413d2fd8ca94e7b0'
 THEN RAISE EXCEPTION 'Queue action function changed concurrently; recheck before migration'; END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION private.so_ticket_queue_action_core(p_slug text, p_session_id uuid, p_action text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 t public.qm_tenants;
 s public.qm_service_sessions;
 k public.qm_tickets;
 v_unit boolean:=p_session_id IS NOT NULL;
BEGIN
 SELECT * INTO t FROM public.qm_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '找不到企業'; END IF;
 IF v_unit AND (NOT t.multi_unit_enabled OR t.modules->>'calling'<>'true') THEN
    RAISE EXCEPTION '此店未啟用多隊列叫號';
 END IF;
 IF private.so_role(t.id) IS NULL AND NOT private.so_platform() THEN
    RAISE EXCEPTION '沒有叫號權限' USING ERRCODE='42501';
 END IF;
 IF v_unit THEN
    SELECT * INTO s FROM public.qm_service_sessions
    WHERE id=p_session_id AND tenant_id=t.id;
    IF NOT FOUND THEN RAISE EXCEPTION '指定隊列不存在'; END IF;
 END IF;
 IF p_action='call' THEN
   IF true THEN
     -- Resume expired holds for the active queue scope, with original return order policy.
     UPDATE public.qm_tickets hold_ticket
     SET status='WAITING',hold_until=NULL,updated_at=now(),
       queue_joined_at=CASE WHEN coalesce(h.return_mode,'END')='ORIGINAL'
                            THEN hold_ticket.queue_joined_at ELSE now() END
     FROM public.qm_queue_hold_policy h
     WHERE h.tenant_id=t.id AND hold_ticket.tenant_id=t.id
       AND (NOT v_unit OR hold_ticket.service_session_id=s.id)
       AND hold_ticket.status='HOLD' AND hold_ticket.deleted_at IS NULL
       AND hold_ticket.hold_until<=now();
     UPDATE public.qm_tickets
     SET status='WAITING',hold_until=NULL,updated_at=now(),queue_joined_at=now()
     WHERE tenant_id=t.id AND (NOT v_unit OR service_session_id=s.id)
       AND status='HOLD' AND deleted_at IS NULL
       AND hold_until<=now();
   END IF;
   IF t.modules->>'calling'<>'true' THEN RAISE EXCEPTION '未開通叫號'; END IF;
   -- Select the next waiting ticket before changing the previous call; an empty queue preserves the current call.
SELECT * INTO k FROM public.qm_tickets x
   WHERE x.tenant_id=t.id AND x.deleted_at IS NULL AND x.status='WAITING'
     AND ((v_unit AND x.service_session_id=s.id) OR (NOT v_unit AND x.service_session_id IS NULL))
   ORDER BY CASE WHEN v_unit THEN NULL ELSE x.business_date END,
            x.queue_joined_at,x.ticket_no,x.id
   LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN
     IF v_unit THEN RAISE EXCEPTION '此隊列目前沒有等候號碼'; END IF;
     RAISE EXCEPTION '目前沒有等候中的號碼';
   END IF;
   -- An earlier CALLED ticket is automatically marked passed only when a new ticket is available.
   -- Scope precisely to the chosen service session or legacy queue to avoid cross-session changes.
   INSERT INTO public.qm_audit(tenant_id,actor,action,info)
   SELECT t.id,auth.uid(),'auto_pass_before_next_call',
     jsonb_build_object('ticket',x.id,'next_ticket',k.id,'session',p_session_id)
   FROM public.qm_tickets x
   WHERE x.tenant_id=t.id AND x.deleted_at IS NULL AND x.status='CALLED'
     AND ((v_unit AND x.service_session_id=s.id) OR (NOT v_unit AND x.service_session_id IS NULL));
   UPDATE public.qm_tickets x SET status='PASSED',updated_at=now()
   WHERE x.tenant_id=t.id AND x.deleted_at IS NULL AND x.status='CALLED'
     AND ((v_unit AND x.service_session_id=s.id) OR (NOT v_unit AND x.service_session_id IS NULL));
   UPDATE public.qm_tickets
      SET status='CALLED',updated_at=now(),last_called_at=now(),
          line_call_event_id=gen_random_uuid()
   WHERE id=k.id RETURNING * INTO k;
 ELSIF p_action IN ('recall','start','complete','pass','return','cancel') THEN
   SELECT * INTO k FROM public.qm_tickets
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
     UPDATE public.qm_tickets SET line_call_event_id=gen_random_uuid(),updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='start' THEN
     IF k.status NOT IN ('CALLED','ARRIVED','ADMITTED') THEN
       IF v_unit THEN RAISE EXCEPTION '未叫號不能開始服務'; END IF;
       RAISE EXCEPTION '請先叫號並完成到場處理';
     END IF;
     UPDATE public.qm_tickets SET status='SERVING',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='complete' THEN
     IF k.status NOT IN ('CALLED','ARRIVED','ADMITTED','SERVING') THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能結案'; END IF;
       RAISE EXCEPTION '目前無法完成服務';
     END IF;
     UPDATE public.qm_tickets SET status='COMPLETED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='pass' THEN
     IF k.status<>'CALLED' THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能標記過號'; END IF;
       RAISE EXCEPTION '僅能標記已叫號為過號';
     END IF;
     UPDATE public.qm_tickets SET status='PASSED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='return' THEN
     IF k.status<>'PASSED' THEN
       IF v_unit THEN RAISE EXCEPTION '只有過號可以返回候位'; END IF;
       RAISE EXCEPTION '只有過號可以回復';
     END IF;
     UPDATE public.qm_tickets SET status='WAITING',queue_joined_at=now(),
          hold_until=CASE WHEN v_unit THEN hold_until ELSE NULL END,
          updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   ELSIF p_action='cancel' THEN
     IF k.status NOT IN ('WAITING','PASSED') THEN
       IF v_unit THEN RAISE EXCEPTION '此號碼不能取消'; END IF;
       RAISE EXCEPTION '無法取消此號碼';
     END IF;
     UPDATE public.qm_tickets SET status='CANCELLED',updated_at=now()
       WHERE id=k.id RETURNING * INTO k;
   END IF;
 ELSE
   RAISE EXCEPTION '不支援的叫號操作';
 END IF;
 IF v_unit THEN
   INSERT INTO public.qm_audit(tenant_id,actor,action,info)
   VALUES(t.id,auth.uid(),'unit_'||p_action,
     jsonb_build_object('session',s.id,'ticket',k.id));
   RETURN jsonb_build_object('id',k.id,'ticket_id',k.id,
     'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'line_call_event_id',k.line_call_event_id,'status',k.status);
 END IF;
 INSERT INTO public.qm_audit(tenant_id,actor,action,info)
 VALUES(t.id,auth.uid(),p_action,
        jsonb_build_object('ticket',p_ticket_id,'reservation',NULL));
 RETURN jsonb_build_object('success',true,
   'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
END;
$function$
;
