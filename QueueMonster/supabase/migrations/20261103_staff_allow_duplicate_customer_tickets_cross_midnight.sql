CREATE OR REPLACE FUNCTION public.so_staff_set_ticket_status(p_slug text, p_ticket_id uuid, p_status text, p_expected_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 t public.so_tenants;
 k public.so_tickets;
 v_old text;
 v_day date := (now() at time zone 'Asia/Taipei')::date;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if private.so_role(t.id) is null and not private.so_platform() then
   raise exception '沒有門市操作權限' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('WAITING','CALLED','SERVING','COMPLETED','PASSED','CANCELLED') then
   raise exception '不支援的叫號狀態';
 end if;
 select * into k from public.so_tickets where id=p_ticket_id and tenant_id=t.id for update;
 if not found then raise exception '找不到今日號碼牌'; end if;
 v_old:=k.status;
 if p_expected_status is distinct from v_old then
   raise exception '此號碼已由其他店員更新，請重新整理後重試';
 end if;
 if v_old=p_status then
   return jsonb_build_object('changed',false,'ticket_id',k.id,'previous_status',v_old,'status',v_old,'number','A'||lpad(k.ticket_no::text,3,'0'));
 end if;
 if p_status in ('CALLED','SERVING') and t.modules->>'calling' <> 'true' then
   raise exception '門市尚未啟用叫號功能';
 end if;
 if p_status in ('CALLED','SERVING') and exists (
  select 1 from public.so_tickets v where v.tenant_id=t.id and v.id<>k.id and v.status in ('CALLED','SERVING')
 ) then raise exception '目前已有服務中的號碼，請先結束或修改該號碼'; end if;
 -- Staff may correct or restore multiple tickets for the same customer.
 update public.so_tickets set status=p_status,updated_at=now() where id=k.id;
 if k.reservation_id is not null then
   update public.so_reservations set
     status=case when p_status='COMPLETED' then 'COMPLETED'
                 when p_status='CANCELLED' then 'CANCELLED'
                 else 'CHECKED_IN' end,
     updated_at=now()
   where id=k.reservation_id and tenant_id=t.id;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_ticket_status',jsonb_build_object('ticket',k.id,'reservation',k.reservation_id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'ticket_id',k.id,'previous_status',v_old,'status',p_status,'number','A'||lpad(k.ticket_no::text,3,'0'));
end $function$
