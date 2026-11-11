-- Keep currently called number stable while many ARRIVED / ADMITTED / SERVING tickets coexist.
-- Timestamp every staff call, including manual status transition to CALLED, and sort public boards by call time.

DO $verify_concurrent$
BEGIN
  if md5(pg_get_functiondef('public.so_staff_action(text,text,uuid,uuid)'::regprocedure)) <> '68d231bce9cd47bece17f085a1262b08' then raise exception 'Concurrent change: so_staff_action'; end if;
  if md5(pg_get_functiondef('public.so_staff_call_selected(text,uuid,text)'::regprocedure)) <> '043ef913c146f619b95f68d0b8027912' then raise exception 'Concurrent change: so_staff_call_selected'; end if;
  if md5(pg_get_functiondef('public.so_staff_set_ticket_status(text,uuid,text,text)'::regprocedure)) <> '7668a1901a95b0bf1b6b90efbf483954' then raise exception 'Concurrent change: so_staff_set_ticket_status'; end if;
  if md5(pg_get_functiondef('public.so_unit_set_ticket_status(text,uuid,text,text)'::regprocedure)) <> '26428b49978a79f5b838357c294ed995' then raise exception 'Concurrent change: so_unit_set_ticket_status'; end if;
  if md5(pg_get_functiondef('public.so_public_board(text,integer)'::regprocedure)) <> '486b8c2a4020c6cc784f2aa70372e8b5' then raise exception 'Concurrent change: so_public_board'; end if;
  if md5(pg_get_functiondef('public.so_unit_public_board(text,uuid)'::regprocedure)) <> 'aa56121238f65c5659725f002ddd0d76' then raise exception 'Concurrent change: so_unit_public_board'; end if;
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
  update public.so_tickets set status='CALLED',updated_at=now(),last_called_at=now(),line_call_event_id=gen_random_uuid() where id=k.id returning * into k;
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
 update public.so_tickets set status='CALLED',updated_at=now(),last_called_at=now(),line_call_event_id=gen_random_uuid()
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
     last_called_at=case when p_status='CALLED' then now() else k.last_called_at end,
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
    last_called_at=case when p_status='CALLED' then now() else last_called_at end,
    line_call_event_id=case when p_status='CALLED' then gen_random_uuid() else line_call_event_id end,
    line_restore_event_id=case when v_old='CANCELLED' and p_status in('WAITING','HOLD')
       then gen_random_uuid() else line_restore_event_id end
   where id=k.id returning * into k;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'unit_ticket_status',jsonb_build_object('ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'number',coalesce(k.number_prefix,'')||k.ticket_no::text,
   'ticket_id',k.id,'line_call_event_id',k.line_call_event_id,'line_restore_event_id',k.line_restore_event_id);
end $function$;

CREATE OR REPLACE FUNCTION public.so_public_board(p_slug text, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.so_tenants;
  v_current text;
  v_upcoming jsonb := '[]'::jsonb;
  v_updated_at timestamptz;
begin
  if p_slug is null or length(p_slug)>40 or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception '門市代碼格式不正確' using errcode='22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception '顯示筆數需介於 1 至 10' using errcode='22023';
  end if;
  select * into v_shop
    from public.so_tenants t
    where t.slug=p_slug and t.status='ACTIVE'
      and coalesce((t.modules->>'calling')::boolean,false);
  if not found then
    raise exception '找不到已開放公開叫號看板的門市' using errcode='P0002';
  end if;

  select coalesce(k.number_prefix,'') || k.ticket_no::text
    into v_current
    from public.so_tickets k
   where k.tenant_id=v_shop.id and k.deleted_at is null
     and k.status in ('CALLED','ARRIVED','ADMITTED','SERVING')
   order by k.last_called_at desc nulls last,k.updated_at desc,k.id desc
   limit 1;

  select coalesce(jsonb_agg(x.display_no order by x.business_date,x.queue_joined_at,x.ticket_no,x.id),'[]'::jsonb)
    into v_upcoming
    from (
      select k.id,k.business_date,k.queue_joined_at,k.ticket_no,
             coalesce(k.number_prefix,'') || k.ticket_no::text as display_no
        from public.so_tickets k
       where k.tenant_id=v_shop.id and k.deleted_at is null and k.status='WAITING'
       order by k.business_date,k.queue_joined_at,k.ticket_no,k.id
       limit p_limit
    ) x;

  select d.updated_at into v_updated_at from public.so_queue_displays d where d.tenant_id=v_shop.id;

  -- Deliberately return only store label and queue numbers: no LINE ID, names,
  -- phone, tickets' UUIDs, booking records or private configuration.
  return jsonb_build_object(
    'shop_name',v_shop.name,
    'current',v_current,
    'upcoming',v_upcoming,
    'updated_at',v_updated_at
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.so_unit_public_board(p_slug text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;
begin
 select * into t from public.so_tenants where slug=p_slug and status='ACTIVE';
 if not found then raise exception '找不到商家';end if;
 return jsonb_build_object('shop',t.name,'logo_url',t.logo_url,'accent',t.accent,'multi',t.multi_unit_enabled,
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
      'unit_id',s.unit_id,'unit',u.name,'group',u.group_label,'start',to_char(s.start_time,'HH24:MI'),
      'end',to_char(s.end_time,'HH24:MI'),
      'current',(select coalesce(k.number_prefix,'')||k.ticket_no::text from public.so_tickets k
        where k.tenant_id=t.id and k.service_session_id=s.id and k.deleted_at is null
         and k.status in('CALLED','ARRIVED','ADMITTED','SERVING') order by k.last_called_at desc nulls last,k.updated_at desc limit 1),
      'waiting',(select count(*) from public.so_tickets k where k.service_session_id=s.id and k.deleted_at is null and k.status='WAITING'),
      'next',(select coalesce(jsonb_agg(coalesce(k.number_prefix,'')||k.ticket_no::text order by k.queue_joined_at,k.ticket_no),'[]'::jsonb)
        from (select * from public.so_tickets k2 where k2.service_session_id=s.id
          and k2.deleted_at is null and k2.status='WAITING' order by k2.queue_joined_at,k2.ticket_no limit 5) k))
    order by s.start_time,u.sort_order,u.name) from public.so_service_sessions s
    join public.so_booking_resources u on u.id=s.unit_id and u.tenant_id=t.id and u.active
    where s.tenant_id=t.id and s.active and s.session_date=(now() at time zone 'Asia/Taipei')::date
      and (p_session_id is null or s.id=p_session_id)),'[]'::jsonb));
end $function$;

