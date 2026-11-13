-- Allow owners to cancel PASSED/returnable tickets so they can take a new number.
-- Identity checks remain unchanged. No existing rows modified.
CREATE OR REPLACE FUNCTION public.so_cancel_number(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k public.qm_tickets;
begin
 update public.qm_tickets as ticket set status='CANCELLED',updated_at=now() where id=p_id and exists(select 1 from public.qm_line_links active_link join public.qm_line_links linked on linked.tenant_id=active_link.tenant_id and linked.line_sub=active_link.line_sub where active_link.user_id=auth.uid() and active_link.tenant_id=ticket.tenant_id and linked.user_id=ticket.user_id) and deleted_at is null and status in ('WAITING','HOLD','PASSED') returning * into k;
 if not found then raise exception '不能取消此號碼';end if;
 return jsonb_build_object('id',k.id,'status',k.status);
end$function$
;
