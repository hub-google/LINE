-- A merchant can connect Messaging API without creating a LINE Login/LIFF app.
-- Preserve the existing LIFF-based configuration and encrypted-vault protections.
alter table public.so_line_merchant_oas
  drop constraint if exists so_line_merchant_oas_liff_id_check;
alter table public.so_line_merchant_oas
  add constraint so_line_merchant_oas_liff_id_check
  check (liff_id = '' or liff_id ~ '^[0-9]{8,}-[A-Za-z0-9]+$');
alter table public.so_line_merchant_oas
  add column if not exists messaging_channel_id text;
alter table public.so_line_merchant_oas
  add constraint so_line_merchant_oas_messaging_channel_id_check
  check (messaging_channel_id is null or messaging_channel_id ~ '^[0-9]{8,}$');

-- The service-role-only entry point is separate from the original
-- LIFF-required function to avoid breaking any earlier callers.
create or replace function public.so_merchant_oa_save_messaging_secret(
  p_tenant_id uuid,
  p_messaging_channel_id text,
  p_liff_id text,
  p_bot_user_id text,
  p_basic_id text,
  p_display_name text,
  p_token text,
  p_channel_secret text,
  p_actor uuid
)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  old_config public.so_line_merchant_oas;
  v_token_id uuid;
  v_secret_id uuid;
  v_login_channel text;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode='42501';
  end if;
  if p_messaging_channel_id !~ '^[0-9]{8,}$'
     or coalesce(p_liff_id,'') !~ '^([0-9]{8,}-[A-Za-z0-9]+)?$'
     or p_bot_user_id !~ '^U[0-9a-fA-F]{32}$'
     or p_token is null or length(p_token)<32 or length(p_token)>4096
     or p_channel_secret !~ '^[0-9a-fA-F]{32}$' then
     raise exception 'INVALID_LINE_CHANNEL';
  end if;
  if not exists(select 1 from public.so_tenants where id=p_tenant_id and status='ACTIVE') then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  v_login_channel := case when coalesce(p_liff_id,'') = '' then '' else split_part(p_liff_id,'-',1) end;
  select * into old_config from public.so_line_merchant_oas where tenant_id=p_tenant_id for update;
  if found then
    delete from vault.secrets where id in (old_config.access_token_secret_id,old_config.channel_secret_secret_id);
  end if;
  select vault.create_secret(p_token,'line_merchant_token_'||replace(p_tenant_id::text,'-',''),'Merchant Messaging API token')
    into v_token_id;
  select vault.create_secret(p_channel_secret,'line_merchant_secret_'||replace(p_tenant_id::text,'-',''),'Merchant Messaging API webhook secret')
    into v_secret_id;
  insert into public.so_line_merchant_oas(
    tenant_id,messaging_channel_id,liff_id,login_channel_id,bot_user_id,
    bot_basic_id,bot_display_name,access_token_secret_id,channel_secret_secret_id,status,connected_by
  )
  values(
    p_tenant_id,p_messaging_channel_id,coalesce(p_liff_id,''),v_login_channel,p_bot_user_id,
    left(p_basic_id,100),left(p_display_name,120),v_token_id,v_secret_id,'ACTIVE',p_actor
  )
  on conflict(tenant_id) do update set
    messaging_channel_id=excluded.messaging_channel_id,
    liff_id=excluded.liff_id,
    login_channel_id=excluded.login_channel_id,
    bot_user_id=excluded.bot_user_id,
    bot_basic_id=excluded.bot_basic_id,
    bot_display_name=excluded.bot_display_name,
    access_token_secret_id=excluded.access_token_secret_id,
    channel_secret_secret_id=excluded.channel_secret_secret_id,
    status='ACTIVE',
    connected_by=excluded.connected_by,
    updated_at=now();
  insert into public.so_audit(tenant_id,actor,action,info)
  values(p_tenant_id,p_actor,'merchant_line_oa_connected',
    jsonb_build_object('messaging_channel_id',p_messaging_channel_id,'liff_enabled',coalesce(p_liff_id,'')<>'','bot_basic_id',p_basic_id));
  return true;
end;
$$;
revoke all on function public.so_merchant_oa_save_messaging_secret(uuid,text,text,text,text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.so_merchant_oa_save_messaging_secret(uuid,text,text,text,text,text,text,text,uuid)
  to service_role;
