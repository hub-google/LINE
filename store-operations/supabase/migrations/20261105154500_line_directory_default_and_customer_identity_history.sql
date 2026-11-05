-- New stores are discoverable by default, without overriding existing merchant opt-outs.
alter table public.so_tenants alter column directory_enabled set default true;

-- Merchant approval must follow the same default (it previously forced false explicitly).
create or replace function public.so_review_merchant_request(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare r public.so_merchant_requests%rowtype;
        declare_tenant public.so_tenants%rowtype;
begin
 if auth.uid() is null or not private.so_platform() then
   raise exception '只有平台管理員可以審核' using errcode='42501';
 end if;
 select * into r from public.so_merchant_requests where id=p_id for update;
 if not found or r.status<>'PENDING' then raise exception '申請不存在或已處理'; end if;
 if p_approve then
   if exists(select 1 from public.so_tenants where slug=r.slug) then
     raise exception '店家代碼已被使用，請聯絡申請者更換';
   end if;
   insert into public.so_tenants(name,slug,phone,address,modules,created_by,oa_mode,directory_enabled)
   values(r.name,r.slug,r.phone,r.address,
     '{"reservation":true,"queue":true,"calling":true,"line_notice":true}'::jsonb,
     r.user_id,'PLATFORM',true)
   returning * into declare_tenant;
   insert into public.so_members(tenant_id,user_id,role)
   values(declare_tenant.id,r.user_id,'OWNER');
 end if;
 update public.so_merchant_requests
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
     reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_id;
 return jsonb_build_object('status',case when p_approve then 'APPROVED' else 'REJECTED' end,'slug',r.slug);
end;
$fn$;

-- A customer is identified by verified tenant+LINE login channel+LINE user ID;
-- fallback to Supabase auth UUID when there is no verified LINE mapping.
-- Names are display-only and never identity keys.
create or replace function public.so_staff_customer_book(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_tenant uuid;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
 select id into v_tenant from public.so_tenants where slug=p_slug;
 if v_tenant is null or
   (private.so_role(v_tenant) is null and not private.so_platform())
 then raise exception '沒有查看顧客簿的權限' using errcode='42501'; end if;
 return coalesce((
   with identified as (
     select r.id, r.user_id, r.customer_name, r.status, r.created_at,
       case when ll.line_sub is not null
         then concat('LINE:',coalesce(ll.login_channel_id,'legacy'),':',ll.line_sub)
         else 'AUTH:'||r.user_id::text end as identity_key
     from public.so_reservations r
     left join public.so_line_links ll
       on ll.tenant_id=r.tenant_id and ll.user_id=r.user_id
     where r.tenant_id=v_tenant and r.user_id is not null
   ), grouped as (
     select identity_key,
       (array_agg(user_id order by created_at asc,id asc))[1] as id,
       (array_agg(customer_name order by created_at desc,id desc))[1] as name,
       count(*)::integer as bookings,
       count(*) filter(where status='NO_SHOW')::integer as no_shows,
       max(created_at) as last_booking
     from identified group by identity_key
     order by max(created_at) desc limit 250
   ), flags_by_identity as (
     select x.identity_key,
       coalesce((array_agg(f.tags order by f.updated_at desc nulls last)
         filter(where f.user_id is not null))[1], '{}'::text[]) as tags,
       coalesce((array_agg(f.notes order by f.updated_at desc nulls last)
         filter(where f.user_id is not null))[1], '') as notes,
       bool_or(coalesce(f.blacklisted,false)) as blacklisted,
       bool_or(coalesce(f.block_new_bookings,false)) as block_new_bookings
     from (select distinct identity_key,user_id from identified) x
     left join public.so_customer_flags f
       on f.tenant_id=v_tenant and f.user_id=x.user_id
     group by x.identity_key
   )
   select jsonb_agg(to_jsonb(output) order by output.last_booking desc)
   from (
     select g.id,g.name,g.bookings,g.no_shows,g.last_booking,
       coalesce(f.tags,'{}'::text[]) as tags,
       coalesce(f.notes,'') as notes,
       coalesce(f.blacklisted,false) as blacklisted,
       coalesce(f.block_new_bookings,false) as block_new_bookings
     from grouped g left join flags_by_identity f using(identity_key)
   ) output
 ), '[]'::jsonb);
end;
$fn$;

-- Detail lookup uses a verified stable ID, never a name or an untrusted client-side
-- list. It remains tenant-scoped and authenticated, including records of another
-- auth UUID only when it has the exact same verified LINE identity.
create or replace function public.so_staff_customer_reservation_history(
 p_slug text,p_customer_user_id uuid,p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare
 v_tenant uuid;v_line_sub text;v_channel text;
 v_page integer:=coalesce(p_page,1);v_size integer:=coalesce(p_page_size,25);
 v_offset bigint;v_total bigint;v_rows jsonb;
begin
 if auth.uid() is null then raise exception '請先登入' using errcode='28000';end if;
 select id into v_tenant from public.so_tenants where slug=p_slug and status='ACTIVE';
 if v_tenant is null or (private.so_role(v_tenant) is null and not private.so_platform())
 then raise exception '沒有門市顧客資料查詢權限' using errcode='42501';end if;
 if p_customer_user_id is null or v_page<1 or v_page>100000 or v_size<1 or v_size>100
 then raise exception '顧客或分頁參數不正確' using errcode='22023';end if;
 if not exists(select 1 from public.so_reservations r
    where r.tenant_id=v_tenant and r.user_id=p_customer_user_id)
 then raise exception '找不到本店這位顧客的預約紀錄' using errcode='22023';end if;
 select ll.line_sub,ll.login_channel_id into v_line_sub,v_channel
 from public.so_line_links ll
 where ll.tenant_id=v_tenant and ll.user_id=p_customer_user_id;
 v_offset:=(v_page::bigint-1)*v_size;
 with filtered as (
   select r.id,r.booking_date,r.booking_time,r.booking_prefix,r.booking_no,r.booking_round,
     r.customer_name,r.party_size,r.status,r.created_at,r.updated_at,r.deleted_at,
     r.selected_items,r.reference_code
   from public.so_reservations r
   where r.tenant_id=v_tenant and (
       r.user_id=p_customer_user_id
       or (v_line_sub is not null and exists(
         select 1 from public.so_line_links ll
         where ll.tenant_id=v_tenant and ll.user_id=r.user_id
           and ll.line_sub=v_line_sub
           and ll.login_channel_id is not distinct from v_channel
       ))
   )
 ), page_rows as (
   select * from filtered
   order by booking_date desc, booking_time desc, created_at desc, id desc
   limit v_size offset v_offset
 )
 select
   (select count(*) from filtered),
   (select coalesce(jsonb_agg(jsonb_build_object(
     'id',p.id,
     'number',coalesce(p.booking_prefix,'')||p.booking_no::text,
     'round',p.booking_round,
     'reference_code',p.reference_code,
     'name',p.customer_name,
     'party',p.party_size,
     'day',to_char(p.booking_date,'YYYY-MM-DD'),
     'time',to_char(p.booking_time,'HH24:MI'),
     'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,
     'deleted_at',p.deleted_at,'selected_items',p.selected_items
   ) order by p.booking_date desc,p.booking_time desc,p.created_at desc,p.id desc),'[]'::jsonb)
    from page_rows p)
 into v_total,v_rows;
 return jsonb_build_object('items',v_rows,'total',v_total,'page',v_page,
    'page_size',v_size,'has_more',v_offset+v_size<v_total);
end;
$fn$;

revoke all on function public.so_staff_customer_book(text) from public,anon;
grant execute on function public.so_staff_customer_book(text) to authenticated;
revoke all on function public.so_staff_customer_reservation_history(text,uuid,integer,integer) from public,anon;
grant execute on function public.so_staff_customer_reservation_history(text,uuid,integer,integer) to authenticated;

comment on function public.so_staff_customer_reservation_history(text,uuid,integer,integer)
is 'Manager/staff tenant-scoped reservation history filtered by verified LINE identity or auth UUID, never customer display name.';
