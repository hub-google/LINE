-- UX-14 / NR-26: server-side, tenant-authorized full-history reservation search.
-- Additive only. No existing reservations, member grants or serial numbers change.
-- Existing so_staff_worklist RPC stays intact for operational status actions.

create or replace function public.so_staff_reservation_search(
 p_slug text,
 p_search text default '',
 p_date_from date default null,
 p_date_to date default null,
 p_status text default 'ALL',
 p_deleted text default 'active',
 p_page integer default 1,
 p_page_size integer default 25
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
 v_tenant_id uuid;
 v_term text := trim(coalesce(p_search,''));
 v_status text := upper(coalesce(p_status,'ALL'));
 v_deleted text := lower(coalesce(p_deleted,'active'));
 v_page integer := coalesce(p_page,1);
 v_size integer := coalesce(p_page_size,25);
 v_offset bigint;
 v_total bigint;
 v_rows jsonb;
begin
 if auth.uid() is null then
   raise exception '請先登入' using errcode='28000';
 end if;
 select t.id into v_tenant_id
 from public.so_tenants t where t.slug=p_slug and t.status='ACTIVE';
 if v_tenant_id is null then
   raise exception '找不到可管理的門市' using errcode='42501';
 end if;
 if private.so_role(v_tenant_id) is null and not private.so_platform() then
   raise exception '沒有門市預約資料查詢權限' using errcode='42501';
 end if;
 if length(v_term)>100 then
   raise exception '搜尋文字不得超過 100 字' using errcode='22023';
 end if;
 if v_status not in ('ALL','CONFIRMED','CHECKED_IN','COMPLETED','CANCELLED','NO_SHOW') then
   raise exception '不支援的預約狀態' using errcode='22023';
 end if;
 if v_deleted not in ('active','deleted','all') then
   raise exception '不支援的刪除篩選' using errcode='22023';
 end if;
 if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then
   raise exception '開始日期不得晚於結束日期' using errcode='22023';
 end if;
 if v_page<1 or v_page>100000 or v_size<1 or v_size>100 then
   raise exception '分頁範圍不正確（每頁 1～100 筆）' using errcode='22023';
 end if;
 v_offset := (v_page::bigint-1)*v_size;
 with filtered as (
  select r.id,r.booking_date,r.booking_time,r.booking_prefix,r.booking_no,r.booking_round,
    r.customer_name,r.party_size,r.status,r.created_at,r.updated_at,r.deleted_at,
    r.selected_items,r.reference_code
  from public.so_reservations r
  where r.tenant_id=v_tenant_id
   and (p_date_from is null or r.booking_date>=p_date_from)
   and (p_date_to is null or r.booking_date<=p_date_to)
   and (v_status='ALL' or r.status=v_status)
   and (v_deleted='all' or (v_deleted='active' and r.deleted_at is null)
                        or (v_deleted='deleted' and r.deleted_at is not null))
   and (v_term='' or strpos(lower(concat_ws(' ',
       r.customer_name,coalesce(r.booking_prefix,'')||r.booking_no::text,
       r.reference_code,r.selected_items::text)),lower(v_term))>0)
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
     'status',p.status,
     'created_at',p.created_at,
     'updated_at',p.updated_at,
     'deleted_at',p.deleted_at,
     'selected_items',p.selected_items
   ) order by p.booking_date desc,p.booking_time desc,p.created_at desc,p.id desc),'[]'::jsonb)
   from page_rows p)
 into v_total,v_rows;

 return jsonb_build_object(
  'items',v_rows,'total',v_total,'page',v_page,'page_size',v_size,
  'has_more',v_offset+v_size<v_total
 );
end;
$function$;

-- SECURITY DEFINER functions are executable by PUBLIC by default in PostgreSQL.
-- Keep this RPC authenticated-only; tenant membership is checked inside each call.
revoke all on function public.so_staff_reservation_search(
 text,text,date,date,text,text,integer,integer) from public,anon;
grant execute on function public.so_staff_reservation_search(
 text,text,date,date,text,text,integer,integer) to authenticated;

comment on function public.so_staff_reservation_search(
 text,text,date,date,text,text,integer,integer) is
 'Tenant-authorized server-side paginated reservation history, including optional soft-deleted rows for staff only.';
