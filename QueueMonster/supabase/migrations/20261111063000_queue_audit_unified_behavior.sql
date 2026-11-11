-- Audit fixes: preserve existing RPC contracts, service concurrency, and tenant isolation.
-- Source snapshot read from deployed pg_get_functiondef on 2026-11-11.

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
 IF true THEN
   -- Apply one hold policy to ordinary and session queues.
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
   hold_count=CASE WHEN p_status='HOLD' THEN k.hold_count+1
                   ELSE k.hold_count END,
   hold_until=CASE WHEN p_status='HOLD'
                       THEN now()+make_interval(mins=>coalesce(hp.hold_minutes,20))
                   WHEN v_old='HOLD' THEN NULL
                   ELSE k.hold_until END,
   queue_joined_at=CASE
     WHEN v_unit AND p_status='WAITING' AND v_old='PASSED' THEN now()
     WHEN p_status='WAITING' AND v_old IN ('HOLD','PASSED')
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
   IF true THEN
     -- Resume expired holds for the active queue scope, with original return order policy.
     UPDATE public.so_tickets hold_ticket
     SET status='WAITING',hold_until=NULL,updated_at=now(),
       queue_joined_at=CASE WHEN coalesce(h.return_mode,'END')='ORIGINAL'
                            THEN hold_ticket.queue_joined_at ELSE now() END
     FROM public.so_queue_hold_policy h
     WHERE h.tenant_id=t.id AND hold_ticket.tenant_id=t.id
       AND (NOT v_unit OR hold_ticket.service_session_id=s.id)
       AND hold_ticket.status='HOLD' AND hold_ticket.deleted_at IS NULL
       AND hold_ticket.hold_until<=now();
     UPDATE public.so_tickets
     SET status='WAITING',hold_until=NULL,updated_at=now(),queue_joined_at=now()
     WHERE tenant_id=t.id AND (NOT v_unit OR service_session_id=s.id)
       AND status='HOLD' AND deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION public.so_staff_set_record_deleted(p_slug text, p_kind text, p_id uuid, p_deleted boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; r public.so_reservations; k public.so_tickets; v_booked int; v_linked int:=0;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 if p_kind is null or p_kind not in ('reservation','ticket') or p_id is null or p_deleted is null then raise exception '刪除參數不正確';end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有門市操作權限' using errcode='42501';end if;
 if p_kind='reservation' then
   select * into r from public.so_reservations where tenant_id=t.id and id=p_id for update;
   if not found then raise exception '找不到預約';end if;
   if (r.deleted_at is not null)=p_deleted then return jsonb_build_object('changed',false,'deleted',p_deleted);end if;
   if not p_deleted and r.status in ('CONFIRMED','CHECKED_IN') and r.service_session_id is null then
     select coalesce(sum(party_size),0) into v_booked from public.so_reservations
     where tenant_id=t.id and booking_date=r.booking_date and booking_time=r.booking_time and id<>r.id
       and status in ('CONFIRMED','CHECKED_IN') and deleted_at is null;
     if v_booked+r.party_size>t.slot_capacity then raise exception '此時段已額滿，無法恢復預約';end if;
   end if;
   if p_deleted then
     update public.so_reservations set deleted_at=now(),deleted_by=auth.uid() where id=r.id;
     -- Independent booking deletion does not affect queue tickets.
   else
     update public.so_reservations set deleted_at=null,deleted_by=null where id=r.id;
     -- Independent booking restoration does not affect queue tickets.
   end if;
   v_linked:=0;
 else
   select * into k from public.so_tickets where tenant_id=t.id and id=p_id for update;
   if not found then raise exception '找不到號碼牌';end if;
   if (k.deleted_at is not null)=p_deleted then return jsonb_build_object('changed',false,'deleted',p_deleted);end if;
   -- A ticket can be restored independently of any legacy linked reservation.
   if not p_deleted and k.status='CALLED' and exists(
     select 1 from public.so_tickets x where x.tenant_id=t.id and x.id<>k.id and x.deleted_at is null and x.status='CALLED'
       and (k.service_session_id is null or x.service_session_id=k.service_session_id))
     then raise exception '已有叫號中號碼，請先完成目前服務';end if;
   update public.so_tickets set deleted_at=case when p_deleted then now() else null end,
     deleted_by=case when p_deleted then auth.uid() else null end,hidden_via_reservation=false where id=k.id;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),
   case when p_deleted then 'staff_delete' else 'staff_restore' end,
   jsonb_build_object('kind',p_kind,'id',p_id,'linked_tickets',v_linked,'line_notified',false));
 return jsonb_build_object('changed',true,'deleted',p_deleted,'id',p_id,'line_notified',false);
end $function$
;

CREATE OR REPLACE FUNCTION public.so_staff_set_reservation_status(p_slug text, p_reservation_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 r public.so_reservations;
 k public.so_tickets;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
 v_booked integer;
 v_seq jsonb;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if t.modules->>'reservation'<>'true' then raise exception '門市尚未啟用預約'; end if;
 if p_status is null or p_status not in ('CONFIRMED','CHECKED_IN','COMPLETED','NO_SHOW','CANCELLED') then
   raise exception '不支援的預約狀態';
 end if;
 select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id and deleted_at is null for update;
 if not found then raise exception '找不到今日或未來的預約'; end if;
 if r.booking_date>v_day and p_status not in ('CONFIRMED','CANCELLED') then
   raise exception '未來的預約僅能保留或取消；到店報到、未到及完成請於預約當天操作';
 end if;
 v_old:=r.status;
 if p_expected_status is distinct from v_old then
   raise exception '此預約已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'reservation_id',r.id,'previous_status',v_old,'status',v_old);
 end if;
 if p_status in ('CONFIRMED','CHECKED_IN') and v_old not in ('CONFIRMED','CHECKED_IN') and r.service_session_id is null then
   select coalesce(sum(party_size),0) into v_booked from public.so_reservations
    where tenant_id=t.id and booking_date=r.booking_date and booking_time=r.booking_time and id<>r.id
      and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
   if v_booked+r.party_size>t.slot_capacity then
     raise exception '此時段已額滿，無法恢復預約，請先調整名額或其他預約';
   end if;
 end if;
 -- Booking check-in stays in reservations only; no automatic queue ticket.
 update public.so_reservations set status=p_status,updated_at=now() where id=r.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_reservation_status',jsonb_build_object('reservation',r.id,'ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'reservation_id',r.id,'ticket_id',k.id,'previous_status',v_old,'status',p_status);
end $function$
;

CREATE OR REPLACE FUNCTION public.so_unit_progress(p_slug text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;s public.so_service_sessions;v_current text;v_ahead int;v_waiting int;v_serving int;
begin
 if auth.uid() is null then raise exception '請先登入 LINE';end if;
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '商家不存在';end if;
 select * into k from public.so_tickets where tenant_id=t.id and id=p_ticket_id and deleted_at is null
   and exists(select 1 from public.so_line_links v
    join public.so_line_links owner_link on owner_link.tenant_id=v.tenant_id and owner_link.line_sub=v.line_sub
    where v.tenant_id=t.id and v.user_id=auth.uid() and owner_link.user_id=so_tickets.user_id);
 if not found then raise exception '找不到自己的候診號碼';end if;
 if k.service_session_id is null then return public.so_queue_live(p_slug,p_ticket_id);end if;
 select * into s from public.so_service_sessions where id=k.service_session_id;
 select count(*) into v_waiting from public.so_tickets where service_session_id=s.id and tenant_id=t.id and deleted_at is null and status='WAITING';
 select count(*) into v_serving from public.so_tickets where service_session_id=s.id and tenant_id=t.id and deleted_at is null and status in('CALLED','ARRIVED','ADMITTED','SERVING');
 v_current:=private.so_queue_current_number(t.id,s.id);
 select count(*)::int into v_ahead from public.so_tickets a where a.service_session_id=s.id and a.deleted_at is null
   and a.status='WAITING' and (a.queue_joined_at,a.ticket_no,a.id)<(k.queue_joined_at,k.ticket_no,k.id);
 if k.status='WAITING' then v_ahead:=v_ahead+v_serving;end if;
 if k.status in('CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=0;end if;
 if k.status not in('WAITING','CALLED','ARRIVED','ADMITTED','SERVING') then v_ahead:=null;end if;
 return jsonb_build_object('tenant_id',t.id,'shop_name',t.name,'current',v_current,'waiting',v_waiting,
   'serving',v_serving,'updated_at',now(),
   'unit_name',(select name from public.so_booking_resources where id=s.unit_id),
   'session_name',s.name,
   'mine',jsonb_build_object('id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
     'status',k.status,'party',k.party_size,'ahead',v_ahead,'created_at',k.created_at));
end $function$
;

CREATE OR REPLACE FUNCTION public.so_unit_public_board(p_slug text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE' and modules->>'calling'='true';
 if not found then raise exception '找不到商家';end if;
 return jsonb_build_object('shop',t.name,'logo_url',t.logo_url,'accent',t.accent,'multi',t.multi_unit_enabled,
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
      'unit_id',s.unit_id,'unit',u.name,'group',u.group_label,'date',s.session_date,'start',to_char(s.start_time,'HH24:MI'),
      'end',to_char(s.end_time,'HH24:MI'),
      'current',private.so_queue_current_number(t.id,s.id),
      'waiting',(select count(*) from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null and k.status='WAITING'),
      'next',(select coalesce(jsonb_agg(coalesce(k.number_prefix,'')||k.ticket_no::text order by k.queue_joined_at,k.ticket_no),'[]'::jsonb)
        from (select * from public.so_tickets k2 where k2.service_session_id=s.id
          and k2.deleted_at is null and k2.status='WAITING' order by k2.queue_joined_at,k2.ticket_no limit 5) k))
    order by s.start_time,u.sort_order,u.name) from public.so_service_sessions s
    join public.so_booking_resources u on u.id=s.unit_id and u.tenant_id=t.id and u.active
    where s.tenant_id=t.id and s.active and s.deleted_at is null
      and (s.session_date=(now() at time zone 'Asia/Taipei')::date
        or (s.session_date=(now() at time zone 'Asia/Taipei')::date-1
          and exists(select 1 from public.so_tickets k where k.tenant_id=t.id and k.service_session_id=s.id
            and k.deleted_at is null and k.status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING'))))
      and (p_session_id is null or s.id=p_session_id)),'[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.so_customer_edit_session_booking(
 p_slug text,p_booking_id uuid,p_session_id uuid,p_party integer,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 t public.so_tenants;
 r public.so_reservations;
 s public.so_service_sessions;
 v_items jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_booked integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
 SELECT * INTO t FROM public.so_tenants
 WHERE slug=p_slug AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR NOT t.multi_unit_enabled OR t.modules->>'reservation'<>'true' THEN
   RAISE EXCEPTION '此門市尚未開放場次預約';
 END IF;
 SELECT * INTO r FROM public.so_reservations
 WHERE id=p_booking_id AND tenant_id=t.id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR r.service_session_id IS NULL THEN RAISE EXCEPTION '找不到場次預約資料'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.so_line_links active_link
   JOIN public.so_line_links linked ON linked.tenant_id=active_link.tenant_id
      AND linked.line_sub=active_link.line_sub
   WHERE active_link.user_id=auth.uid() AND active_link.tenant_id=t.id
     AND linked.user_id=r.user_id
 ) THEN RAISE EXCEPTION '沒有修改此預約的權限' USING ERRCODE='42501'; END IF;
 IF r.status<>'CONFIRMED' THEN RAISE EXCEPTION '僅能修改尚未報到的有效預約'; END IF;
 IF p_party IS NULL OR p_party<1 OR p_party>20 THEN RAISE EXCEPTION '預約人數需在 1 至 20 人之間'; END IF;
 SELECT * INTO s FROM public.so_service_sessions
 WHERE id=p_session_id AND tenant_id=t.id AND active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(
    SELECT 1 FROM public.so_booking_resources u
    WHERE u.id=s.unit_id AND u.tenant_id=t.id AND u.active
 ) THEN RAISE EXCEPTION '所選場次已停用或不存在'; END IF;
 IF s.session_date<v_today OR s.session_date>v_today+90
    OR (s.session_date+s.start_time)::timestamp<=(now() at time zone 'Asia/Taipei') THEN
   RAISE EXCEPTION '請選擇未開始且在 90 天內的場次';
 END IF;
 v_items:=private.so_menu_validate_items(t.id,'BOOKING',coalesce(
  p_items,(SELECT coalesce(jsonb_agg(elem->'id'),'[]'::jsonb)
    FROM jsonb_array_elements(r.selected_items) elem)
 ));
 IF r.service_session_id=s.id AND r.party_size=p_party AND r.selected_items=v_items THEN
   RETURN jsonb_build_object('id',r.id,'changed',false,'status',r.status,
      'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),'party',r.party_size);
 END IF;
 SELECT coalesce(sum(party_size),0)::integer INTO v_booked FROM public.so_reservations
 WHERE tenant_id=t.id AND service_session_id=s.id AND id<>r.id
   AND deleted_at IS NULL AND status IN('CONFIRMED','CHECKED_IN');
 IF v_booked+p_party>s.capacity THEN RAISE EXCEPTION '此場次名額不足，請選擇其他場次或減少人數'; END IF;
 UPDATE public.so_reservations
 SET service_session_id=s.id,service_unit_id=s.unit_id,booking_date=s.session_date,
   booking_time=s.start_time,party_size=p_party,selected_items=v_items,updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.so_audit(tenant_id,actor,action,info)
 VALUES(t.id,auth.uid(),'customer_edit_booking',
   jsonb_build_object('reservation',r.id,'session',s.id,'date',r.booking_date,
                      'time',r.booking_time,'party',r.party_size));
 RETURN jsonb_build_object('id',r.id,'changed',true,'status',r.status,
    'date',r.booking_date,'time',to_char(r.booking_time,'HH24:MI'),
    'party',r.party_size,'event_id',r.line_update_event_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.so_customer_edit_session_booking(text,uuid,uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.so_customer_edit_session_booking(text,uuid,uuid,integer,jsonb) TO authenticated;

-- Enforce session capacity when a booking changes session without changing its clock time.
DROP TRIGGER IF EXISTS so_booking_resource_guard ON public.so_reservations;
CREATE TRIGGER so_booking_resource_guard
BEFORE INSERT OR UPDATE OF booking_date,booking_time,party_size,selected_items,status,deleted_at,service_session_id,service_unit_id
ON public.so_reservations FOR EACH ROW EXECUTE FUNCTION private.so_check_booking_resource();
