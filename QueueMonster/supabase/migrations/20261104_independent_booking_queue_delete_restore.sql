-- Soft delete and restore either record independently, including legacy linked records.
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
   if not p_deleted and r.status in ('CONFIRMED','CHECKED_IN') then
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
   if not p_deleted and k.status in ('CALLED','SERVING') and exists(
     select 1 from public.so_tickets x where x.tenant_id=t.id and x.id<>k.id and x.deleted_at is null and x.status in ('CALLED','SERVING'))
     then raise exception '已有叫號中號碼，請先完成目前服務';end if;
   update public.so_tickets set deleted_at=case when p_deleted then now() else null end,
     deleted_by=case when p_deleted then auth.uid() else null end,hidden_via_reservation=false where id=k.id;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info) values(t.id,auth.uid(),
   case when p_deleted then 'staff_delete' else 'staff_restore' end,
   jsonb_build_object('kind',p_kind,'id',p_id,'linked_tickets',v_linked,'line_notified',false));
 return jsonb_build_object('changed',true,'deleted',p_deleted,'id',p_id,'line_notified',false);
end $function$;
