-- Verified deployed on Supabase 2026-11-11; extracted from pg_get_functiondef to prevent drift.
CREATE OR REPLACE FUNCTION private.so_ticket_set_status_core(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text, p_unit boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 t public.so_tenants;
 k public.so_tickets;
 hp public.so_queue_hold_policy;
 v_old text;
 v_unit boolean := coalesce(p_unit,false);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 SELECT * INTO t FROM public.so_tenants WHERE slug=p_slug FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '找不到門市'; END IF;
 IF v_unit AND NOT t.multi_unit_enabled THEN RAISE EXCEPTION '此店未啟用多隊列'; END IF;
 IF private.so_role(t.id) IS NULL AND NOT private.so_platform() THEN
   RAISE EXCEPTION '沒有門市操作權限' USING ERRCODE='42501';
 END IF;
 IF p_status IS NULL OR p_status NOT IN
   ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','COMPLETED','PASSED','CANCELLED') THEN
   RAISE EXCEPTION '不支援的叫號狀態';
 END IF;
 SELECT * INTO k FROM public.so_tickets
 WHERE id=p_ticket_id AND tenant_id=t.id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR (v_unit AND k.service_session_id IS NULL) THEN
   RAISE EXCEPTION '找不到號碼牌';
 END IF;
 v_old:=k.status;
 IF v_old IS DISTINCT FROM p_expected_status THEN
   RAISE EXCEPTION '此號碼已由其他店員更新，請重新整理後重試';
 END IF;
 IF v_old=p_status THEN
   IF v_unit THEN
     RETURN jsonb_build_object('changed',false,'number',
       coalesce(k.number_prefix,'')||k.ticket_no::text);
   END IF;
   RETURN jsonb_build_object('changed',false,'ticket_id',k.id,
    'previous_status',v_old,'status',v_old,
    'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
    'line_call_event_id',k.line_call_event_id,
    'line_restore_event_id',k.line_restore_event_id);
 END IF;
 IF NOT v_unit THEN
   SELECT * INTO hp FROM public.so_queue_hold_policy WHERE tenant_id=t.id;
   IF p_status='HOLD' THEN
     IF v_old NOT IN ('WAITING','CANCELLED') THEN
       RAISE EXCEPTION '只能保留候位中或已取消的號碼';
     END IF;
     IF k.hold_count>=coalesce(hp.max_holds,2) THEN
       RAISE EXCEPTION '已達候位保留次數上限';
     END IF;
   END IF;
   IF v_old='HOLD' AND p_status NOT IN ('WAITING','CANCELLED') THEN
     RAISE EXCEPTION '保留中的號碼只能恢復候位或取消';
   END IF;
   IF p_status IN ('CALLED','ARRIVED','ADMITTED','SERVING')
      AND t.modules->>'calling'<>'true' THEN
     RAISE EXCEPTION '門市尚未啟用叫號功能';
   END IF;
 END IF;
 IF p_status='CALLED' AND EXISTS(
   SELECT 1 FROM public.so_tickets x
   WHERE x.tenant_id=t.id AND x.deleted_at IS NULL
     AND x.id<>k.id AND x.status='CALLED'
     AND (NOT v_unit OR x.service_session_id=k.service_session_id)
 ) THEN
   IF v_unit THEN RAISE EXCEPTION '此場次已有尚未確認的叫號'; END IF;
   RAISE EXCEPTION '已經有尚未確認的叫號，請先處理該號碼';
 END IF;
 UPDATE public.so_tickets SET
   status=p_status,updated_at=now(),
   hold_count=CASE WHEN NOT v_unit AND p_status='HOLD' THEN k.hold_count+1
                   ELSE k.hold_count END,
   hold_until=CASE WHEN NOT v_unit AND p_status='HOLD'
                       THEN now()+make_interval(mins=>coalesce(hp.hold_minutes,20))
                   WHEN NOT v_unit AND v_old='HOLD' THEN NULL
                   ELSE k.hold_until END,
   queue_joined_at=CASE
     WHEN v_unit AND p_status='WAITING' AND v_old='PASSED' THEN now()
     WHEN NOT v_unit AND p_status='WAITING' AND v_old IN ('HOLD','PASSED')
        AND (v_old='PASSED' OR coalesce(hp.return_mode,'END')='END') THEN now()
     ELSE k.queue_joined_at END,
   last_called_at=CASE WHEN p_status='CALLED' THEN now() ELSE k.last_called_at END,
   line_call_event_id=CASE WHEN p_status='CALLED' THEN gen_random_uuid()
                           ELSE k.line_call_event_id END,
   line_restore_event_id=CASE WHEN v_old='CANCELLED' AND p_status IN ('WAITING','HOLD')
                             THEN gen_random_uuid() ELSE k.line_restore_event_id END
 WHERE id=k.id RETURNING * INTO k;
 IF v_unit THEN
   INSERT INTO public.so_audit(tenant_id,actor,action,info)
   VALUES(t.id,auth.uid(),'unit_ticket_status',
      jsonb_build_object('ticket',k.id,'from',v_old,'to',p_status));
   RETURN jsonb_build_object('changed',true,'number',
       coalesce(k.number_prefix,'')||k.ticket_no::text,
       'ticket_id',k.id,'line_call_event_id',k.line_call_event_id,
       'line_restore_event_id',k.line_restore_event_id);
 END IF;
 INSERT INTO public.so_audit(tenant_id,actor,action,info)
 VALUES(t.id,auth.uid(),'set_ticket_status',
        jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,
                           'from',v_old,'to',p_status));
 RETURN jsonb_build_object('changed',true,'ticket_id',k.id,
   'previous_status',v_old,'status',p_status,
   'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'line_call_event_id',k.line_call_event_id,
   'line_restore_event_id',k.line_restore_event_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.so_staff_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.so_ticket_set_status_core(p_slug,p_ticket_id,p_status,p_expected_status,false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.so_unit_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.so_ticket_set_status_core(p_slug,p_ticket_id,p_status,p_expected_status,true);
END;
$function$
;
REVOKE ALL ON FUNCTION private.so_ticket_set_status_core(text,uuid,text,text,boolean) FROM PUBLIC;
