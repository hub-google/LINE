CREATE OR REPLACE FUNCTION public.so_staff_action(p_slug text, p_action text, p_ticket_id uuid DEFAULT NULL::uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.so_tenants;k public.so_tickets;r public.so_reservations;v_day date:=(now() at time zone 'Asia/Taipei')::date;v_number int;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到企業';end if;
 if private.so_role(t.id) is null and not private.so_platform() then raise exception '沒有叫號權限' using errcode='42501';end if;
 if p_action='checkin' then
  if t.modules->>'reservation'<>'true' then raise exception '未開通預約';end if;
  select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id and booking_date=v_day and status='CONFIRMED' for update;
  if not found then raise exception '預約不存在、非今日或已報到';end if;
  -- Staff check-in is not blocked by another ticket of the same customer.
  select coalesce(max(ticket_no),0)+1 into v_number from public.so_tickets where tenant_id=t.id and business_date=v_day;
  insert into public.so_tickets(tenant_id,user_id,customer_name,reservation_id,business_date,ticket_no,source)
  values(t.id,r.user_id,r.customer_name,r.id,v_day,v_number,'RESERVATION') returning * into k;
  update public.so_reservations set status='CHECKED_IN',updated_at=now() where id=r.id;
 elsif p_action='call' then
  if t.modules->>'calling'<>'true' then raise exception '未開通叫號';end if;
  if exists(select 1 from public.so_tickets where tenant_id=t.id and status in('CALLED','SERVING')) then raise exception '請先完成目前服務';end if;
  select * into k from public.so_tickets where tenant_id=t.id and status='WAITING' order by business_date,ticket_no limit 1 for update;
  if not found then raise exception '目前沒有等候中的號碼';end if;
  update public.so_tickets set status='CALLED',updated_at=now() where id=k.id;
 elsif p_action in('recall','start','complete','pass','return','cancel') then
  select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id for update;
  if not found then raise exception '找不到今日號碼';end if;
  if p_action='recall' then
    if k.status<>'CALLED' then raise exception '僅能重叫已叫號票券';end if;
  elsif p_action='start' then
    if k.status<>'CALLED' then raise exception '請先叫號';end if;
    update public.so_tickets set status='SERVING',updated_at=now() where id=k.id;
  elsif p_action='complete' then
    if k.status not in('CALLED','SERVING') then raise exception '目前無法完成服務';end if;
    update public.so_tickets set status='COMPLETED',updated_at=now() where id=k.id;
    update public.so_reservations set status='COMPLETED',updated_at=now() where id=k.reservation_id and status='CHECKED_IN';
  elsif p_action='pass' then
    if k.status<>'CALLED' then raise exception '僅能標記已叫號為過號';end if;
    update public.so_tickets set status='PASSED',updated_at=now() where id=k.id;
  elsif p_action='return' then
    if k.status<>'PASSED' then raise exception '只有過號可以回復';end if;
    update public.so_tickets set status='WAITING',updated_at=now() where id=k.id;
  elsif p_action='cancel' then
    if k.status not in('WAITING','PASSED') then raise exception '無法取消此號碼';end if;
    update public.so_tickets set status='CANCELLED',updated_at=now() where id=k.id;
  end if;
 elsif p_action in('cancel_booking','no_show') then
  update public.so_reservations set status=case when p_action='no_show' then 'NO_SHOW' else 'CANCELLED' end,updated_at=now()
  where id=p_reservation_id and tenant_id=t.id and booking_date=v_day and status='CONFIRMED' returning * into r;
  if not found then raise exception '不可修改此預約';end if;
 else raise exception '不支援的操作';
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),p_action,jsonb_build_object('ticket',p_ticket_id,'reservation',p_reservation_id));
 return jsonb_build_object('success',true,'number',case when k.id is null then null else 'A'||lpad(k.ticket_no::text,3,'0') end);
end$function$
