-- Queue Monster merchant onboarding: email is the sole login identifier.
-- Backwards compatibility: the optional p_username RPC argument is ignored.
-- Preserve merchant data, permissions, existing tenant slugs, and directory visibility.

alter table public.so_merchant_profiles
  rename column username to internal_code;

alter table public.so_merchant_profiles
  rename constraint so_merchant_profiles_username_key to so_merchant_profiles_internal_code_key;

create or replace function public.so_start_merchant(p_username text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := auth.uid();
  v_internal_code text;
  v_t public.so_tenants%rowtype;
begin
  if v_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  then raise exception '請先使用電子郵件帳號登入' using errcode='28000'; end if;

  if not exists (select 1 from auth.users where id=v_id and email_confirmed_at is not null)
  then raise exception '請先驗證電子郵件' using errcode='28000'; end if;

  perform pg_advisory_xact_lock(hashtextextended('so_merchant:'||v_id::text,0));

  select t.* into v_t
  from public.so_members m
  join public.so_tenants t on t.id=m.tenant_id
  where m.user_id=v_id and not t.is_test_tenant
  order by case when m.role='OWNER' then 0 else 1 end, t.created_at
  limit 1;
  if found then
    return jsonb_build_object('slug',v_t.slug,'onboarding_complete',v_t.onboarding_complete);
  end if;

  -- Internal code is server-generated from the authenticated user ID, not supplied by merchants.
  v_internal_code := 'm' || left(replace(v_id::text,'-',''),29);
  insert into public.so_merchant_profiles(user_id,internal_code)
  values(v_id,v_internal_code)
  on conflict (user_id) do nothing;

  insert into public.so_tenants(slug,name,description,phone,address,logo_url,created_by,oa_mode,directory_enabled,onboarding_complete)
  values('shop-'||replace(gen_random_uuid()::text,'-',''),'尚未設定店名','','','','',v_id,'PLATFORM',false,false)
  returning * into v_t;
  insert into public.so_members(tenant_id,user_id,role) values(v_t.id,v_id,'OWNER');

  return jsonb_build_object('slug',v_t.slug,'onboarding_complete',false);
end $$;

revoke all on function public.so_start_merchant(text) from public, anon;
grant execute on function public.so_start_merchant(text) to authenticated;
