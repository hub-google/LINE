-- Parent business groups over existing isolated tenant/branch stores.
create table if not exists public.so_business_groups(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 100),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.so_business_group_branches(
 group_id uuid not null references public.so_business_groups(id) on delete cascade,
 tenant_id uuid not null unique references public.so_tenants(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(group_id,tenant_id)
);
create index if not exists so_business_groups_owner_idx on public.so_business_groups(owner_user_id);
alter table public.so_business_groups enable row level security;
alter table public.so_business_group_branches enable row level security;
revoke all on public.so_business_groups,public.so_business_group_branches from public,anon,authenticated;

create or replace function public.so_create_business_group(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 if length(btrim(p_name)) not between 2 and 100 then raise exception '總店名稱需為 2 至 100 字';end if;
 insert into public.so_business_groups(name,owner_user_id)
 values(btrim(p_name),auth.uid()) returning id into new_id;
 return new_id;
end;
$$;
revoke all on function public.so_create_business_group(text) from public,anon;
grant execute on function public.so_create_business_group(text) to authenticated;

create or replace function public.so_attach_business_branch(p_group_id uuid,p_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.so_business_groups;t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into g from public.so_business_groups where id=p_group_id and owner_user_id=auth.uid();
 if not found then raise exception '找不到你的總店群組';end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到此門市';end if;
 if not exists(select 1 from public.so_members where tenant_id=t.id and user_id=auth.uid() and role='OWNER') then
   raise exception '只有門市負責人可以把門市加入總店' using errcode='42501';end if;
 insert into public.so_business_group_branches(group_id,tenant_id) values(g.id,t.id)
 on conflict(tenant_id) do nothing;
 if not exists(select 1 from public.so_business_group_branches where group_id=g.id and tenant_id=t.id) then
   raise exception '此門市已屬於其他總店';end if;
 return jsonb_build_object('group_id',g.id,'slug',t.slug,'name',t.name);
end;
$$;
revoke all on function public.so_attach_business_branch(uuid,text) from public,anon;
grant execute on function public.so_attach_business_branch(uuid,text) to authenticated;

create or replace function public.so_detach_business_branch(p_group_id uuid,p_slug text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.so_business_groups;t public.so_tenants;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select * into g from public.so_business_groups where id=p_group_id and owner_user_id=auth.uid();
 if not found then raise exception '沒有管理總店的權限';end if;
 select * into t from public.so_tenants where slug=p_slug;
 if not found then raise exception '找不到門市';end if;
 delete from public.so_business_group_branches where group_id=g.id and tenant_id=t.id;
 return found;
end;
$$;
revoke all on function public.so_detach_business_branch(uuid,text) from public,anon;
grant execute on function public.so_detach_business_branch(uuid,text) to authenticated;

create or replace function public.so_my_business_groups()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'Asia/Taipei')::date;v_groups jsonb;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'name',g.name,
   'branches',coalesce((
     select jsonb_agg(jsonb_build_object(
       'slug',t.slug,'name',t.name,'status',t.status,
       'today_reservations',(select count(*) from public.so_reservations r
         where r.tenant_id=t.id and r.deleted_at is null and r.booking_date=v_today),
       'waiting',(select count(*) from public.so_tickets k where k.tenant_id=t.id
         and k.deleted_at is null and k.status='WAITING')
     ) order by t.name)
     from public.so_business_group_branches b join public.so_tenants t on t.id=b.tenant_id
     where b.group_id=g.id),'[]'::jsonb)
   ) order by g.created_at),'[]'::jsonb) into v_groups
 from public.so_business_groups g where g.owner_user_id=auth.uid();
 return v_groups;
end;
$$;
revoke all on function public.so_my_business_groups() from public,anon;
grant execute on function public.so_my_business_groups() to authenticated;
