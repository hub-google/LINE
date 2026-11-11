-- Separate unacknowledged queue calls from ongoing service: a queue may have many ARRIVED, ADMITTED or SERVING tickets.
-- Preserve the invariant of one outstanding CALLED ticket per ordinary queue or service session.
-- Maintains tenant locks, staff permissions, optimistic concurrency checks and LINE event identifiers.

DO $verify_concurrent$
BEGIN
  if md5(pg_get_functiondef('public.so_staff_action(text,text,uuid,uuid)'::regprocedure)) <> 'b02ba006fce72b53fb9e86250d77b87b' then raise exception 'Function so_staff_action changed concurrently; stop migration'; end if;
  if md5(pg_get_functiondef('public.so_unit_call(text,uuid,text,uuid)'::regprocedure)) <> '22b0c473bc70047c4332aba049086d45' then raise exception 'Function so_unit_call changed concurrently; stop migration'; end if;
  if md5(pg_get_functiondef('public.so_staff_call_selected(text,uuid,text)'::regprocedure)) <> '9f0001f94bff50aa98c5927ae70a853e' then raise exception 'Function so_staff_call_selected changed concurrently; stop migration'; end if;
  if md5(pg_get_functiondef('public.so_staff_set_ticket_status(text,uuid,text,text)'::regprocedure)) <> '1f788eb39ca61687e0f97ea40dfcfcdf' then raise exception 'Function so_staff_set_ticket_status changed concurrently; stop migration'; end if;
  if md5(pg_get_functiondef('public.so_unit_set_ticket_status(text,uuid,text,text)'::regprocedure)) <> '7c02647f343cc22b3013e5015b648ee8' then raise exception 'Function so_unit_set_ticket_status changed concurrently; stop migration'; end if;
END
$verify_concurrent$;

CREATE OR REPLACE FUNCTION public.so_staff_action(p_slug text, p_action text, p_ticket_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;r public.so_reservations;v_day date:=(now() at time zone 'Asia/Taipei')::date;v_seq jsonb;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 if p_action='checkin' then
  if t.modules->>'reservation'<>'true' then raise exception '未開通預約';end if;
  select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id
    and deleted_at is null and booking_date=v_day and status='CONFIRMED' for update;
  if not found then raise exception '預約不存在、非今日或已報到';end if;
  update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;
 elsif p_action='call' then
  -- Every expired hold re-enters before the next call, under the tenant lock.
  update public.so_tickets hold_ticket set status='WAITING',hold_until=null,updated_at=now(),
    queue_joined_at=case when coalesce(h.return_mode,'END')='ORIGINAL' then hold_ticket.queue_joined_at else now() end
  from public.so_queue_hold_policy h
  where h.tenant_id=t.id and hold_ticket.tenant_id=t.id and hold_ticket.status='HOLD'
    and hold_ticket.deleted_at is null and hold_ticket.hold_until<=now();
  update public.so_tickets set status='WAITING',hold_until=null,updated_at=now(),
    queue_joined_at=now()
  where tenant_id=t.id and status='HOLD' and deleted_at is null and hold_until<=now();
  if t.modules->>'calling'<>'true' then raise exception '未開通叫號';end if;
  if exists(select 1 from public.so_tickets where tenant_id=t.id and deleted_at is null and status='CALLED') then raise exception '已有已叫號但尚未確認到場或過號的顧客，請先處理該號碼';end if;
  select * into k from public.so_tickets where tenant_id=t.id and deleted_at is null and status='WAITING' order by business_date,queue_joined_at,ticket_no,id limit 1 for update;
  if not found then raise exception '目前沒有等候中的號碼';end if;
  update public.so_tickets set status='CALLED',updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
 elsif p_action in('recall','start','complete','pass','return','cancel') then
  select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
  if not found then raise exception '找不到今日號碼';end if;
  if p_action='recall' then
    if k.status<>'CALLED' then raise exception '僅能重叫已叫號票券';end if;
    update public.so_tickets set updated_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
  elsif p_action='start' then
    if k.status not in ('CALLED','ARRIVED','ADMITTED') then raise exception '請先叫號並完成到場處理';end if;
    update public.so_tickets set status='SERVING',updated_at=now() where id=k.id;
  elsif p_action='complete' then
    if k.status not in('CALLED','ARRIVED','ADMITTED','SERVING') then raise exception '目前無法完成服務';end if;
    update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id;
    -- Independent queue completion: do not update reservation.
  elsif p_action='pass' then
    if k.status<>'CALLED' then raise exception '僅能標記已叫號為過號';end if;
    update public.so_tickets set status='PASSED',updated_at=now() where id=k.id;
  elsif p_action='return' then
    if k.status<>'PASSED' then raise exception '只有過號可以回復';end if;
    update public.so_tickets set status='WAITING',queue_joined_at=now(),hold_until=null,updated_at=now() where id=k.id;
  elsif p_action='cancel' then
    if k.status not in('WAITING','PASSED') then raise exception '無法取消此號碼';end if;
    update public.so_tickets set status='CANCELLED',updated_at=now() where id=k.id;
  end if;
 elsif p_action in('cancel_booking','no_show') then
  update public.so_reservations set status=case when p_action='no_show' then 'NO_SHOW' else 'CANCELLED' end,updated_at=now()
  where id=p_reservation_id and tenant_id=t.id and deleted_at is null and booking_date=v_day and status='CONFIRMED' returning * into r;
  if not found then raise exception '不可修改此預約';end if;
 else raise exception '不支援的操作';
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),p_action,jsonb_build_object('ticket',p_ticket_id,'reservation',p_reservation_id));
 return jsonb_build_object('success',true,'number',case when k.id is null then null else coalesce(k.number_prefix,'')||k.ticket_no::text end,'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end$function$;

CREATE OR REPLACE FUNCTION public.so_unit_call(p_slug text, p_session_id uuid, p_action text, p_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;s public.so_service_sessions;k public.so_tickets;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found or not t.multi_unit_enabled or t.modules->>'calling'<>'true' then raise exception '此店未啟用多隊列叫號';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 select * into s from public.so_service_sessions where id=p_session_id and tenant_id=t.id;
 if not found then raise exception '指定隊列不存在';end if;
 if p_action='call' then
   if exists(select 1 from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and deleted_at is null and status='CALLED')
     then raise exception '本場次仍有尚未確認的叫號，請先標記已到場或過號';end if;
   select * into k from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and deleted_at is null and status='WAITING' order by queue_joined_at,ticket_no,id limit 1 for update;
   if not found then raise exception '此隊列目前沒有等候號碼';end if;
   update public.so_tickets set status='CALLED',updated_at=now(),last_called_at=now(),
     line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
 elsif p_action in ('recall','start','complete','pass','return','cancel') then
   select * into k from public.so_tickets where tenant_id=t.id and service_session_id=s.id
     and id=p_ticket_id and deleted_at is null for update;
   if not found then raise exception '找不到此隊列的號碼';end if;
   if p_action='recall' then
     if k.status<>'CALLED' then raise exception '此號碼不能重叫';end if;
     update public.so_tickets set line_call_event_id=gen_random_uuid(),updated_at=now() where id=k.id returning * into k;
   elsif p_action='start' then
     if k.status not in('CALLED','ARRIVED','ADMITTED') then raise exception '未叫號不能開始服務';end if;
     update public.so_tickets set status='SERVING',updated_at=now() where id=k.id returning * into k;
   elsif p_action='complete' then
     if k.status not in('CALLED','ARRIVED','ADMITTED','SERVING') then raise exception '此號碼不能結案';end if;
     update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id returning * into k;
   elsif p_action='pass' then
     if k.status<>'CALLED' then raise exception '此號碼不能標記過號';end if;
     update public.so_tickets set status='PASSED',updated_at=now() where id=k.id returning * into k;
   elsif p_action='return' then
     if k.status<>'PASSED' then raise exception '只有過號可以返回候位';end if;
     update public.so_tickets set status='WAITING',queue_joined_at=now(),updated_at=now() where id=k.id returning * into k;
   elsif p_action='cancel' then
     if k.status not in('WAITING','PASSED') then raise exception '此號碼不能取消';end if;
     update public.so_tickets set status='CANCELLED',updated_at=now() where id=k.id returning * into k;
   end if;
 else raise exception '不支援的叫號操作';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'unit_'||p_action,jsonb_build_object('session',s.id,'ticket',k.id));
 return jsonb_build_object('id',k.id,'ticket_id',k.id,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
    'line_call_event_id',k.line_call_event_id,'status',k.status);
end $function$;

CREATE OR REPLACE FUNCTION public.so_staff_call_selected(p_slug text, p_ticket_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants; k public.so_tickets; v_reason text;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '只有企業管理者可以指定叫號' using errcode='42501';
 end if;
 if t.modules->>'calling'<>'true' then raise exception '門市尚未開通叫號'; end if;
 v_reason:=btrim(coalesce(p_reason,''));
 if char_length(v_reason)<2 or char_length(v_reason)>200 or v_reason ~ '[[:cntrl:]]'
 then raise exception '指定叫號原因請輸入 2～200 字且不能包含控制字元'; end if;
 if exists(select 1 from public.so_tickets
    where tenant_id=t.id and deleted_at is null
      and status='CALLED') then
   raise exception '目前還有尚未確認的叫號，請先確認是否到場或過號';
 end if;
 select * into k from public.so_tickets
 where tenant_id=t.id and id=p_ticket_id and deleted_at is null and status='WAITING'
 for update;
 if not found then raise exception '僅能指定同門市、仍在候位中的號碼'; end if;
 update public.so_tickets set status='CALLED',updated_at=now(),line_call_event_id=gen_random_uuid()
 where id=k.id returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'call_selected',jsonb_build_object(
   'ticket',k.id,'reason',v_reason,'ticket_no',k.ticket_no,
   'round',k.number_round,'queue_joined_at',k.queue_joined_at));
 return jsonb_build_object('success',true,
   'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id);
end $function$;

CREATE OR REPLACE FUNCTION public.so_staff_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 k public.so_tickets;
 hp public.so_queue_hold_policy;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','COMPLETED','PASSED','CANCELLED') then
   raise exception '不支援的叫號狀態';
 end if;
 select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
 if not found then raise exception '找不到今日號碼牌'; end if;
 v_old:=k.status;
 select * into hp from public.so_queue_hold_policy where tenant_id=t.id;
 if p_expected_status is distinct from v_old then
   raise exception '此號碼已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
 end if;
 if p_status='HOLD' then
   if v_old not in ('WAITING','CANCELLED') then raise exception '只能保留候位中或已取消的號碼'; end if;
   if k.hold_count>=coalesce(hp.max_holds,2) then raise exception '已達候位保留次數上限'; end if;
 end if;
 if v_old='HOLD' and p_status not in ('WAITING','CANCELLED') then
   raise exception '保留中的號碼只能恢復候位或取消';
 end if;
 if p_status in ('CALLED','ARRIVED','ADMITTED','SERVING') and t.modules->>'calling' <> 'true' then
   raise exception '門市尚未啟用叫號功能';
 end if;
 if p_status='CALLED' and exists (
  select 1 from public.so_tickets v where v.tenant_id=t.id and v.deleted_at is null and v.id<>k.id and v.status='CALLED'
 ) then raise exception '已經有尚未確認的叫號，請先處理該號碼'; end if;
 -- Staff may correct or restore multiple tickets for the same customer.
 update public.so_tickets
 set status=p_status,updated_at=now(),
     hold_count=case when p_status='HOLD' then k.hold_count+1 else k.hold_count end,
     hold_until=case when p_status='HOLD' then now()+make_interval(mins=>coalesce(hp.hold_minutes,20))
                     when v_old='HOLD' then null else k.hold_until end,
     queue_joined_at=case when p_status='WAITING' and v_old in ('HOLD','PASSED')
                             and (v_old='PASSED' or coalesce(hp.return_mode,'END')='END')
                            then now() else k.queue_joined_at end,
     line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else k.line_call_event_id end,
     line_restore_event_id=case when v_old='CANCELLED' and p_status in ('WAITING','HOLD') then gen_random_uuid() else k.line_restore_event_id end
 where id=k.id returning * into k;
 -- No cross-modification of reservation status.
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
end $function$;

CREATE OR REPLACE FUNCTION public.so_unit_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;v_old text;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found or not t.multi_unit_enabled then raise exception '此店未啟用多隊列';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有權限';end if;
 select * into k from public.so_tickets where tenant_id=t.id and id=p_ticket_id and deleted_at is null for update;
 if not found or k.service_session_id is null then raise exception '找不到此隊列的號碼';end if;
 v_old:=k.status;
 if v_old is distinct from p_expected_status then raise exception '狀態已被其他員工更新，請重新整理';end if;
 if p_status not in('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','COMPLETED','PASSED','CANCELLED')
   then raise exception '不支援的狀態';end if;
 if v_old=p_status then return jsonb_build_object('changed',false,'number',coalesce(k.number_prefix,'')||k.ticket_no::text);end if;
 if p_status='CALLED' and exists(
    select 1 from public.so_tickets other where other.tenant_id=t.id
      and other.service_session_id=k.service_session_id and other.id<>k.id and other.deleted_at is null
      and other.status='CALLED')
   then raise exception '此場次已有尚未確認的叫號';end if;
 update public.so_tickets set status=p_status,updated_at=now(),
    queue_joined_at=case when p_status='WAITING' and v_old='PASSED' then now() else queue_joined_at end,
    line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else line_call_event_id end,
    line_restore_event_id=case when v_old='CANCELLED' and p_status in('WAITING','HOLD')
       then gen_random_uuid() else line_restore_event_id end
   where id=k.id returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'unit_ticket_status',jsonb_build_object('ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
end $function$;

