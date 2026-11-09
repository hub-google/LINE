-- Queue Monster: merchants choose reservation and/or queue without platform-admin help.
-- Other modules (billing, ordering, notifications) must never be writable through this RPC.
create or replace function public.so_set_merchant_services(
  p_slug text,
  p_reservation boolean,
  p_queue boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_t public.so_tenants%rowtype;
  v_modules jsonb;
  v_calling boolean;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '請先登入正式店家帳號' using errcode='28000';
  end if;
  if p_reservation is null or p_queue is null then
    raise exception '請明確選擇預約及取號開關' using errcode='22023';
  end if;
  select * into v_t from public.so_tenants where slug=p_slug for update;
  if not found then
    raise exception '找不到店家' using errcode='P0002';
  end if;
  if not private.so_platform() and coalesce(private.so_role(v_t.id),'') not in ('OWNER','MANAGER') then
    raise exception '只有店家負責人或管理員可調整服務' using errcode='42501';
  end if;
  -- Continue calling already issued numbers even if new queue tickets are disabled.
  v_calling := p_queue or exists (
    select 1 from public.so_tickets k
    where k.tenant_id=v_t.id and k.deleted_at is null
      and k.status in ('WAITING','CALLED','ARRIVED','ADMITTED','SERVING','HOLD','PASSED')
  );
  v_modules:=coalesce(v_t.modules,'{}'::jsonb)
    || jsonb_build_object('reservation',p_reservation,'queue',p_queue,'calling',v_calling);
  update public.so_tenants set modules=v_modules,updated_at=now() where id=v_t.id;
  insert into public.so_audit(tenant_id,actor,action,info)
  values(v_t.id,auth.uid(),'merchant_service_modes_changed',
    jsonb_build_object('reservation',p_reservation,'queue',p_queue,'calling',v_calling));
  return jsonb_build_object('slug',p_slug,'modules',v_modules);
end
$function$;
revoke all on function public.so_set_merchant_services(text,boolean,boolean) from PUBLIC,anon;
grant execute on function public.so_set_merchant_services(text,boolean,boolean) to authenticated;
