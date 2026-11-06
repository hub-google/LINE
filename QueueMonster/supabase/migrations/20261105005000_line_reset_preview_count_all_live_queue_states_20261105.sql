-- FR-002: count all outstanding queue states when previewing a numbering reset.
create or replace function public.so_number_reset_preview(p_slug text, p_kind text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_tenant public.so_tenants; v_open bigint;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('booking','queue') then raise exception '無效的編號類型'; end if;
 select * into v_tenant from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市'; end if;
 if coalesce(private.so_role(v_tenant.id),'') not in ('OWNER','MANAGER') and not private.so_platform()
 then raise exception '只有企業管理者可預覽編號重置' using errcode='42501'; end if;
 if p_kind='booking' then
   select count(*) into v_open from public.so_reservations
   where tenant_id=v_tenant.id and deleted_at is null and status in ('CONFIRMED','CHECKED_IN');
   return jsonb_build_object('kind',p_kind,'still_open',v_open,'next_round',v_tenant.booking_round+1,'prefix',v_tenant.booking_prefix);
 end if;
 select count(*) into v_open from public.so_tickets
 where tenant_id=v_tenant.id and deleted_at is null
 and status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED');
 return jsonb_build_object('kind',p_kind,'still_open',v_open,'next_round',v_tenant.queue_round+1,'prefix',v_tenant.queue_prefix);
end;
$function$;