-- Align the reset operation's outstanding-ticket count with the deployed reset preview.
create or replace function public.so_reset_queue_number(p_slug text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare t public.so_tenants; v_day date:=(now() at time zone 'Asia/Taipei')::date;
 v_round int; v_open bigint;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到門市'; end if;
 if coalesce(private.so_role(t.id),'') not in ('OWNER','MANAGER') and not private.so_platform() then
   raise exception '只有企業管理者可重置號碼' using errcode='42501'; end if;
 v_round:=t.queue_round+1;
 select count(*) into v_open from public.so_tickets where tenant_id=t.id
   and deleted_at is null and status in ('WAITING','HOLD','CALLED','ARRIVED','ADMITTED','SERVING','PASSED');
 update public.so_tenants set queue_current_day=v_day,queue_round=v_round,queue_last_number=0 where id=t.id;
 insert into public.so_audit(tenant_id,actor,action,info) values
   (t.id,auth.uid(),'queue_number_reset',jsonb_build_object('business_date',v_day,'round',v_round,'still_open',v_open));
 return jsonb_build_object('next_number',1,'round',v_round,'prefix',t.queue_prefix,'still_open',v_open);
end $function$;