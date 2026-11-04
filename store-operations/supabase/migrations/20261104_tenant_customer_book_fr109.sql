-- FR-108/109 and DoYouBook C32-C35: tenant-scoped customer ledger and block list.
-- This migration is additive; no existing customer, reservation or QA record is removed.
create table if not exists public.so_customer_flags (
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 user_id uuid not null,
 tags text[] not null default '{}'::text[],
 notes text not null default '' check(length(notes)<=2000),
 blacklisted boolean not null default false,
 block_new_bookings boolean not null default false,
 updated_by uuid,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id),
 constraint so_customer_flags_tags_limit check(cardinality(tags)<=10)
);
create index if not exists so_customer_flags_block_idx
 on public.so_customer_flags(tenant_id,user_id) where block_new_bookings=true;
alter table public.so_customer_flags enable row level security;
revoke all on public.so_customer_flags from public,anon,authenticated;

create or replace function public.so_staff_customer_book(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tenant uuid;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null or
   (private.so_role(v_tenant) is null and not private.so_platform())
 then raise exception '沒有查看顧客簿的權限' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.last_booking desc)
 from (select r.user_id as id,max(r.customer_name) as name,
  count(*)::integer as bookings,
  count(*) filter(where r.status='NO_SHOW')::integer as no_shows,
  max(r.created_at) as last_booking,
  coalesce(f.tags,'{}'::text[]) as tags,
  coalesce(f.notes,'') as notes,
  coalesce(f.blacklisted,false) as blacklisted,
  coalesce(f.block_new_bookings,false) as block_new_bookings
 from public.so_reservations r
 left join public.so_customer_flags f on f.tenant_id=r.tenant_id and f.user_id=r.user_id
 where r.tenant_id=v_tenant and r.user_id is not null
 group by r.user_id,f.tags,f.notes,f.blacklisted,f.block_new_bookings
 order by max(r.created_at) desc limit 250) x),'[]'::jsonb);
end $$;
revoke all on function public.so_staff_customer_book(text) from public,anon;
grant execute on function public.so_staff_customer_book(text) to authenticated;

create or replace function public.so_staff_set_customer_flag(
 p_slug text,p_user_id uuid,p_notes text,p_tags text[],
 p_blacklisted boolean,p_block_new_bookings boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_tenant uuid;v_tag text;
begin
 if auth.uid() is null then raise exception '請先登入';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null or
  (private.so_role(v_tenant) not in ('OWNER','MANAGER') and not private.so_platform())
 then raise exception '只有管理者可以編輯顧客簿與黑名單' using errcode='42501';end if;
 if p_user_id is null or not exists(
    select 1 from public.so_reservations where tenant_id=v_tenant and user_id=p_user_id
  ) then raise exception '找不到本店顧客';end if;
 if length(coalesce(p_notes,''))>2000 or cardinality(coalesce(p_tags,'{}'::text[]))>10
  or p_blacklisted is null or p_block_new_bookings is null then
    raise exception '備註、標籤或黑名單設定格式不正確';end if;
 foreach v_tag in array coalesce(p_tags,'{}'::text[]) loop
   if v_tag is null or length(trim(v_tag)) not between 1 and 30 then
      raise exception '每個標籤必須是 1～30 個字元';end if;
 end loop;
 insert into public.so_customer_flags(tenant_id,user_id,tags,notes,blacklisted,block_new_bookings,updated_by,updated_at)
 values(v_tenant,p_user_id,coalesce(p_tags,'{}'::text[]),coalesce(p_notes,''),p_blacklisted,p_block_new_bookings,auth.uid(),now())
 on conflict(tenant_id,user_id) do update
  set tags=excluded.tags,notes=excluded.notes,blacklisted=excluded.blacklisted,
      block_new_bookings=excluded.block_new_bookings,updated_by=excluded.updated_by,updated_at=now();
 insert into public.so_audit(tenant_id,actor,action,info)
 values(v_tenant,auth.uid(),'customer_flags_changed',
   jsonb_build_object('customer_id',p_user_id,'blacklisted',p_blacklisted,
    'block_new_bookings',p_block_new_bookings,'tags_count',cardinality(coalesce(p_tags,'{}'::text[]))));
 return jsonb_build_object('customer_id',p_user_id,'saved',true);
end $$;
revoke all on function public.so_staff_set_customer_flag(text,uuid,text,text[],boolean,boolean) from public,anon;
grant execute on function public.so_staff_set_customer_flag(text,uuid,text,text[],boolean,boolean) to authenticated;

-- Reject NEW reservations for a customer blocked by this particular shop.
-- Linked identities are matched only inside the same verified tenant; never
-- merge unrelated people by name or unverified phone number.
create or replace function public.so_reject_blocklisted_booking()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is null then return new; end if;
 if exists(
   select 1 from public.so_customer_flags f
   where f.tenant_id=new.tenant_id and f.block_new_bookings=true
     and (
       f.user_id=new.user_id
       or exists(
         select 1 from public.so_line_links linked_viewer
         join public.so_line_links linked_flag
            on linked_flag.tenant_id=linked_viewer.tenant_id
            and linked_flag.line_sub=linked_viewer.line_sub
         where linked_viewer.tenant_id=new.tenant_id
           and linked_viewer.user_id=new.user_id
           and linked_flag.user_id=f.user_id
       )
     )
 ) then
  raise exception '此 LINE 帳號目前無法在本店新建預約，請聯絡店家'
    using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.so_reject_blocklisted_booking() from public,anon,authenticated;
drop trigger if exists so_blocklisted_booking_guard on public.so_reservations;
create trigger so_blocklisted_booking_guard before insert on public.so_reservations
 for each row execute function public.so_reject_blocklisted_booking();
