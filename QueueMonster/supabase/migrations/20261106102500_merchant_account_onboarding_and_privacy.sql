-- Queue Monster: merchant account onboarding and public directory hardening.
-- The corresponding operations were applied to the connected production Supabase project.
-- Idempotent for environments where an earlier version was already applied.
alter table public.so_tenants add column if not exists onboarding_complete boolean not null default true;
create table if not exists public.so_merchant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check(username ~ '^[a-z][a-z0-9_-]{2,29}$'),
  created_at timestamptz not null default now()
);
alter table public.so_merchant_profiles enable row level security;
revoke all on public.so_merchant_profiles from anon, authenticated;

create or replace function public.so_start_merchant(p_username text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid();v_username text;v_t public.so_tenants%rowtype;
begin
 if v_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 then raise exception '請先使用電子郵件帳號登入' using errcode='28000';end if;
 if not exists(select 1 from auth.users where id=v_id and email_confirmed_at is not null)
 then raise exception '請先驗證電子郵件';end if;
 perform pg_advisory_xact_lock(hashtextextended('so_merchant:'||v_id::text,0));
 select t.* into v_t from public.so_members m join public.so_tenants t on t.id=m.tenant_id
 where m.user_id=v_id and t.slug not like 'qa-%'
 order by case when m.role='OWNER' then 0 else 1 end,t.created_at limit 1;
 if found then return jsonb_build_object('slug',v_t.slug,'onboarding_complete',v_t.onboarding_complete);end if;
 v_username:=lower(btrim(coalesce(p_username,'')));
 if v_username='' then
  select lower(btrim(coalesce(raw_user_meta_data->>'username',''))) into v_username from auth.users where id=v_id;
 end if;
 if v_username !~ '^[a-z][a-z0-9_-]{2,29}$'
 then raise exception '帳號需為 3 至 30 字英文字母、數字、底線或連字號';end if;
 insert into public.so_merchant_profiles(user_id,username) values(v_id,v_username)
 on conflict(user_id) do nothing;
 insert into public.so_tenants(slug,name,description,phone,address,logo_url,created_by,oa_mode,directory_enabled,onboarding_complete)
 values('shop-'||replace(gen_random_uuid()::text,'-',''),'尚未設定店名','','','','',v_id,'PLATFORM',false,false)
 returning * into v_t;
 insert into public.so_members(tenant_id,user_id,role) values(v_t.id,v_id,'OWNER');
 return jsonb_build_object('slug',v_t.slug,'onboarding_complete',false);
 exception when unique_violation then raise exception '帳號名稱已被使用，請更換';
end $$;
revoke all on function public.so_start_merchant(text) from PUBLIC, anon;
grant execute on function public.so_start_merchant(text) to authenticated;

create or replace function public.so_complete_merchant_onboarding(
 p_slug text,p_name text,p_phone text,p_address text,p_category text default '其他'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants%rowtype;
begin
 select * into t from public.so_tenants where slug=p_slug for update;
 if not found then raise exception '找不到店家';end if;
 if auth.uid() is null or not exists(
  select 1 from public.so_members where tenant_id=t.id and user_id=auth.uid() and role='OWNER'
 ) then raise exception '只有店家負責人可完成開店設定' using errcode='42501';end if;
 if t.onboarding_complete then return jsonb_build_object('slug',t.slug,'published',t.directory_enabled);end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100
 or char_length(btrim(coalesce(p_phone,'')))<6
 or char_length(btrim(coalesce(p_address,'')))<5
 or char_length(btrim(coalesce(p_category,''))) not between 1 and 30
 then raise exception '請先填妥店名、電話、地址與分類，再公開店家';end if;
 update public.so_tenants set name=btrim(p_name),phone=left(btrim(p_phone),40),
 address=left(btrim(p_address),200),directory_category=left(btrim(p_category),30),
 directory_enabled=true,onboarding_complete=true,updated_at=now() where id=t.id;
 insert into public.so_audit(tenant_id,actor,action) values(t.id,auth.uid(),'onboarding_complete');
 return jsonb_build_object('slug',t.slug,'published',true);
end $$;
revoke all on function public.so_complete_merchant_onboarding(text,text,text,text,text) from PUBLIC, anon;
grant execute on function public.so_complete_merchant_onboarding(text,text,text,text,text) to authenticated;

create or replace function public.so_claim_verified_platform_owner()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_email text;v_confirmed timestamptz;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 then raise exception '請先登入正式帳號' using errcode='28000';end if;
 select lower(email),email_confirmed_at into v_email,v_confirmed from auth.users where id=auth.uid();
 if v_email <> 'cit5055@gmail.com' or v_confirmed is null
 then raise exception '此帳號沒有平台管理權限' using errcode='42501';end if;
 insert into public.so_platform_admins(user_id) values(auth.uid()) on conflict do nothing;
 return true;
end $$;
revoke all on function public.so_claim_verified_platform_owner() from PUBLIC, anon;
grant execute on function public.so_claim_verified_platform_owner() to authenticated;

-- Deny public QA-only RPCs; preserve historical records rather than deleting them.
revoke all on function public.so_test_login(text) from PUBLIC, anon, authenticated;
revoke all on function public.so_test_pending_merchant_requests() from PUBLIC, anon, authenticated;
revoke all on function public.so_test_review_merchant_request(uuid,boolean) from PUBLIC, anon, authenticated;
revoke all on function public.so_test_submit_merchant_request(text) from PUBLIC, anon, authenticated;
create or replace function public.so_public_explore_demo()
returns jsonb language sql stable security definer set search_path='' as $$select '[]'::jsonb$$;

-- Public search and top-ranking queries must enforce completion in the database.
do $body$
declare v_name text; v_source text;
begin
 foreach v_name in array array['so_public_directory','so_public_popular_stores','so_public_store_search'] loop
  select pg_get_functiondef(p.oid) into v_source
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=v_name;
  if v_source is null then raise exception 'Missing directory function %',v_name;end if;
  v_source:=replace(v_source,'t.directory_enabled = true','t.directory_enabled = true and t.onboarding_complete = true');
  v_source:=replace(v_source,'t.directory_enabled=true','t.directory_enabled=true and t.onboarding_complete=true');
  execute v_source;
 end loop;
end $body$;
update public.so_tenants set directory_enabled=false,updated_at=now()
where (slug like 'qa-%' or slug in('greenfield-salon','demo-clinic')) and directory_enabled;
