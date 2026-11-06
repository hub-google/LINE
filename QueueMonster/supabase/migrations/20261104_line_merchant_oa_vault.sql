-- Isolated merchant OA tokens. HQ OA remains the default for all existing shops.
-- Encrypted LINE secrets are never returned to authenticated browser users.
create table if not exists public.so_line_merchant_oas(
 tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
 liff_id text not null check(liff_id ~ '^[0-9]{8,}-[A-Za-z0-9]+$'),
 login_channel_id text not null,
 bot_user_id text not null,
 bot_basic_id text,
 bot_display_name text,
 access_token_secret_id uuid not null,
 channel_secret_secret_id uuid not null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
 connected_by uuid,
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.so_line_merchant_oas enable row level security;
revoke all on public.so_line_merchant_oas from public, anon, authenticated;

create or replace function public.so_merchant_oa_save_secret(
  p_tenant_id uuid,p_liff_id text,p_bot_user_id text,p_basic_id text,
  p_display_name text,p_token text,p_channel_secret text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare old_config public.so_line_merchant_oas; v_token_id uuid; v_secret_id uuid;v_channel text;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then
   raise exception 'SERVICE_ROLE_ONLY' using errcode='42501';end if;
 if p_liff_id !~ '^[0-9]{8,}-[A-Za-z0-9]+$' or p_bot_user_id !~ '^U[0-9a-f]{32}$'
   or p_token is null or length(p_token)<32 or length(p_token)>4096
   or p_channel_secret !~ '^[0-9a-fA-F]{32}$' then raise exception 'INVALID_LINE_CHANNEL';end if;
 if not exists(select 1 from public.so_tenants where id=p_tenant_id and status='ACTIVE') then
   raise exception 'TENANT_NOT_FOUND';end if;
 v_channel:=split_part(p_liff_id,'-',1);
 select * into old_config from public.so_line_merchant_oas where tenant_id=p_tenant_id for update;
 if found then
   delete from vault.secrets where id in(old_config.access_token_secret_id,old_config.channel_secret_secret_id);
 end if;
 select vault.create_secret(p_token,'line_merchant_token_'||replace(p_tenant_id::text,'-',''),'Merchant Messaging API token') into v_token_id;
 select vault.create_secret(p_channel_secret,'line_merchant_secret_'||replace(p_tenant_id::text,'-',''),'Merchant Messaging API webhook secret') into v_secret_id;
 insert into public.so_line_merchant_oas(tenant_id,liff_id,login_channel_id,bot_user_id,
  bot_basic_id,bot_display_name,access_token_secret_id,channel_secret_secret_id,status,connected_by)
 values(p_tenant_id,p_liff_id,v_channel,p_bot_user_id,left(p_basic_id,100),
  left(p_display_name,120),v_token_id,v_secret_id,'ACTIVE',p_actor)
 on conflict(tenant_id) do update set liff_id=excluded.liff_id,login_channel_id=excluded.login_channel_id,
   bot_user_id=excluded.bot_user_id,bot_basic_id=excluded.bot_basic_id,
   bot_display_name=excluded.bot_display_name,
   access_token_secret_id=excluded.access_token_secret_id,
   channel_secret_secret_id=excluded.channel_secret_secret_id,
   status='ACTIVE',connected_by=excluded.connected_by,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(p_tenant_id,p_actor,'merchant_line_oa_connected',
   jsonb_build_object('liff_id',p_liff_id,'bot_basic_id',p_basic_id));
 return true;
end;
$$;
revoke all on function public.so_merchant_oa_save_secret(uuid,text,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.so_merchant_oa_save_secret(uuid,text,text,text,text,text,text,uuid) to service_role;

create or replace function public.so_merchant_oa_read_secret(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.so_line_merchant_oas;v_token text;v_secret text;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then
   raise exception 'SERVICE_ROLE_ONLY' using errcode='42501';end if;
 select * into c from public.so_line_merchant_oas
 where tenant_id=p_tenant_id and status='ACTIVE';
 if not found then return null;end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where id=c.access_token_secret_id;
 select decrypted_secret into v_secret from vault.decrypted_secrets where id=c.channel_secret_secret_id;
 if v_token is null or v_secret is null then raise exception 'MERCHANT_OA_SECRET_MISSING';end if;
 return jsonb_build_object('liffId',c.liff_id,'channelId',c.login_channel_id,
   'token',v_token,'channelSecret',v_secret,'botUserId',c.bot_user_id,
   'basicId',c.bot_basic_id,'displayName',c.bot_display_name);
end;
$$;
revoke all on function public.so_merchant_oa_read_secret(uuid) from public,anon,authenticated;
grant execute on function public.so_merchant_oa_read_secret(uuid) to service_role;

create or replace function public.so_merchant_oa_disconnect(p_tenant_id uuid,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.so_line_merchant_oas;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then
   raise exception 'SERVICE_ROLE_ONLY' using errcode='42501';end if;
 select * into c from public.so_line_merchant_oas where tenant_id=p_tenant_id for update;
 if not found then return false;end if;
 delete from public.so_line_merchant_oas where tenant_id=p_tenant_id;
 delete from vault.secrets where id in(c.access_token_secret_id,c.channel_secret_secret_id);
 insert into public.so_audit(tenant_id,actor,action,info) values(p_tenant_id,p_actor,'merchant_line_oa_disconnected','{}'::jsonb);
 return true;
end;
$$;
revoke all on function public.so_merchant_oa_disconnect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.so_merchant_oa_disconnect(uuid,uuid) to service_role;
