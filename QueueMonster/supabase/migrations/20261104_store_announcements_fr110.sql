-- FR-110 / C39: merchant announcements and swipeable photos.
-- All existing reservations, tenants, queue records and settings remain unchanged.
create table if not exists public.so_store_announcements(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.so_tenants(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 80),
  body text not null default '' check(length(body)<=2000),
  image_urls text[] not null default '{}'::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint so_announcement_images_max check(cardinality(image_urls)<=8)
);
create index if not exists so_store_announcements_by_tenant on public.so_store_announcements(tenant_id,active,created_at desc);
alter table public.so_store_announcements enable row level security;
revoke all on public.so_store_announcements from public,anon,authenticated;

create or replace function public.so_public_announcements(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid;
begin
 if auth.uid() is null then raise exception '請先完成登入' using errcode='28000'; end if;
 select id into v_tenant from public.so_tenants
  where slug=p_slug and status='ACTIVE';
 if v_tenant is null then raise exception '門市未開放'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',a.id,'title',a.title,'body',a.body,'images',to_jsonb(a.image_urls),'created_at',a.created_at)
  order by a.created_at desc)
  from (select * from public.so_store_announcements
   where tenant_id=v_tenant and active=true
   order by created_at desc limit 20) a),'[]'::jsonb);
end $$;
revoke all on function public.so_public_announcements(text) from public,anon;
grant execute on function public.so_public_announcements(text) to authenticated;

create or replace function public.so_staff_announcements(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null then raise exception '門市不存在'; end if;
 if private.so_role(v_tenant) is null and not private.so_platform() then
  raise exception '沒有權限' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',a.id,'title',a.title,'body',a.body,'images',to_jsonb(a.image_urls),
  'active',a.active,'created_at',a.created_at)
  order by a.created_at desc)
  from (select * from public.so_store_announcements
   where tenant_id=v_tenant
   order by created_at desc limit 100) a),'[]'::jsonb);
end $$;
revoke all on function public.so_staff_announcements(text) from public,anon;
grant execute on function public.so_staff_announcements(text) to authenticated;

create or replace function public.so_save_announcement(
 p_slug text,p_id uuid,p_title text,p_body text,p_images text[],p_active boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tenant uuid;v_id uuid;v_url text;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null then raise exception '門市不存在'; end if;
 if private.so_role(v_tenant) not in('OWNER','MANAGER') and not private.so_platform() then
  raise exception '只有管理者可編輯公告' using errcode='42501';
 end if;
 if p_title is null or length(trim(p_title)) not between 1 and 80 or
    length(coalesce(p_body,''))>2000 then raise exception '公告標題或內容格式不正確'; end if;
 if p_active is null or cardinality(coalesce(p_images,'{}'::text[]))>8 then
  raise exception '最多八張照片，請設定有效狀態'; end if;
 foreach v_url in array coalesce(p_images,'{}'::text[]) loop
  if v_url is null or length(v_url)>1200 or v_url !~ '^https://[^[:space:]]+$' then
   raise exception '照片網址必須是 HTTPS，且不得包含空白字元'; end if;
 end loop;
 if p_id is null then
  if (select count(*) from public.so_store_announcements where tenant_id=v_tenant)>=100 then
   raise exception '單店最多一百篇公告';end if;
  insert into public.so_store_announcements(tenant_id,title,body,image_urls,active)
  values(v_tenant,trim(p_title),coalesce(p_body,''),coalesce(p_images,'{}'::text[]),p_active)
  returning id into v_id;
 else
  update public.so_store_announcements set title=trim(p_title),
   body=coalesce(p_body,''),image_urls=coalesce(p_images,'{}'::text[]),
   active=p_active,updated_at=clock_timestamp()
  where id=p_id and tenant_id=v_tenant returning id into v_id;
  if v_id is null then raise exception '找不到本店公告'; end if;
 end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(v_tenant,auth.uid(),'store_announcement_saved',
  jsonb_build_object('announcement_id',v_id,'active',p_active));
 return jsonb_build_object('id',v_id,'active',p_active);
end $$;
revoke all on function public.so_save_announcement(text,uuid,text,text,text[],boolean) from public,anon;
grant execute on function public.so_save_announcement(text,uuid,text,text,text[],boolean) to authenticated;

create or replace function public.so_set_announcement_active(p_slug text,p_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tenant uuid;v_id uuid;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null or
  (private.so_role(v_tenant) not in('OWNER','MANAGER') and not private.so_platform())
 then raise exception '沒有修改本店公告的權限' using errcode='42501';end if;
 update public.so_store_announcements set active=p_active,updated_at=clock_timestamp()
  where id=p_id and tenant_id=v_tenant returning id into v_id;
 if v_id is null then raise exception '找不到本店公告';end if;
 insert into public.so_audit(tenant_id,actor,action,info)
 values(v_tenant,auth.uid(),'store_announcement_visibility',
  jsonb_build_object('announcement_id',v_id,'active',p_active));
 return jsonb_build_object('id',v_id,'active',p_active);
end $$;
revoke all on function public.so_set_announcement_active(text,uuid,boolean) from public,anon;
grant execute on function public.so_set_announcement_active(text,uuid,boolean) to authenticated;
