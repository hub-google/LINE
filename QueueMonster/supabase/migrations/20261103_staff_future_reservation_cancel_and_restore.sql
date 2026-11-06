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
 v_no integer;
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
 select * into r from public.so_reservations where id=p_reservation_id and tenant_id=t.id and booking_date>=v_day for update;
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
 if p_status in ('CONFIRMED','CHECKED_IN') and v_old not in ('CONFIRMED','CHECKED_IN') then
   select coalesce(sum(party_size),0) into v_booked from public.so_reservations
    where tenant_id=t.id and booking_date=r.booking_date and booking_time=r.booking_time and id<>r.id
      and status in ('CONFIRMED','CHECKED_IN');
   if v_booked+r.party_size>t.slot_capacity then
     raise exception '此時段已額滿，無法恢復預約，請先調整名額或其他預約';
   end if;
 end if;
 select * into k from public.so_tickets where reservation_id=r.id for update;
 if p_status='CHECKED_IN' then
   if k.id is null or k.status not in ('WAITING','CALLED','SERVING','PASSED') then
     if exists(select 1 from public.so_tickets x where x.tenant_id=t.id and x.business_date=v_day and x.user_id=r.user_id
        and x.status in ('WAITING','CALLED','SERVING') and x.id is distinct from k.id) then
       raise exception '此顧客已有有效號碼，請先處理重複候位';
     end if;
   end if;
   if k.id is null then
     select coalesce(max(ticket_no),0)+1 into v_no from public.so_tickets where tenant_id=t.id and business_date=v_day;
     insert into public.so_tickets(tenant_id,user_id,customer_name,reservation_id,business_date,ticket_no,source,status)
      values(t.id,r.user_id,r.customer_name,r.id,v_day,v_no,'RESERVATION','WAITING') returning * into k;
   elsif k.status not in ('WAITING','CALLED','SERVING','PASSED') then
     update public.so_tickets set status='WAITING',updated_at=now() where id=k.id;
   end if;
 elsif k.id is not null then
   update public.so_tickets set status=case when p_status='COMPLETED' then 'COMPLETED' else 'CANCELLED' end,
     updated_at=now() where id=k.id;
 end if;
 update public.so_reservations set status=p_status,updated_at=now() where id=r.id;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(t.id,auth.uid(),'set_reservation_status',jsonb_build_object('reservation',r.id,'ticket',k.id,'from',v_old,'to',p_status));
 return jsonb_build_object('changed',true,'reservation_id',r.id,'ticket_id',k.id,'previous_status',v_old,'status',p_status);
end $function$
