-- P0 / UX-26: retries of one customer submission are idempotent.
-- Additive only. No user/merchant/reservation/ticket records are removed or renumbered.
-- Existing public.so_book_with_items stays untouched for compatibility with old clients.
alter table public.so_reservations
  add column if not exists client_request_id uuid;

comment on column public.so_reservations.client_request_id
  is 'One browser submission ID. Nullable for all historical and staff-created bookings.';

create unique index if not exists so_reservation_customer_request_once
  on public.so_reservations (tenant_id,user_id,client_request_id)
  where client_request_id is not null;

create or replace function public.so_book_with_items_once(
  p_slug text,
  p_date date,
  p_time text,
  p_name text,
  p_party integer,
  p_items jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_existing public.so_reservations;
  v_result jsonb;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '請先完成 LINE 身分驗證' using errcode='28000';
  end if;
  if p_request_id is null then
    raise exception '預約請求識別碼不可為空' using errcode='22023';
  end if;

  -- The original booking RPC already holds this tenant lock for capacity.
  -- Acquiring the same row lock before the replay check serializes retries.
  select t.id into v_tenant_id
    from public.so_tenants t
   where t.slug=p_slug and t.status='ACTIVE'
   for update;
  if v_tenant_id is null then
    raise exception '未開放此門市預約';
  end if;

  select * into v_existing
    from public.so_reservations r
   where r.tenant_id=v_tenant_id
     and r.user_id=v_user
     and r.client_request_id=p_request_id;

  if found then
    -- A request ID must never silently become a different reservation.
    if v_existing.booking_date is distinct from p_date
      or to_char(v_existing.booking_time,'HH24:MI') is distinct from p_time
      or v_existing.party_size is distinct from p_party then
      raise exception '這次請求的預約內容已變更，請重新提交' using errcode='22023';
    end if;
    return jsonb_build_object(
      'id',v_existing.id,
      'status',v_existing.status,
      'replayed',true
    );
  end if;

  -- All existing verified LINE identity, branch capacity, service validation,
  -- merchant checks, notice outbox and numbering rules are preserved.
  v_result := public.so_book_with_items(
    p_slug,p_date,p_time,p_name,p_party,p_items
  );

  update public.so_reservations r
     set client_request_id=p_request_id
   where r.id=(v_result->>'id')::uuid
     and r.tenant_id=v_tenant_id and r.user_id=v_user
     and r.client_request_id is null;
  if not found then
    raise exception '預約請求識別碼儲存失敗，請稍後重試';
  end if;

  return v_result || jsonb_build_object('replayed',false);
end;
$function$;

-- This function must never be callable by unauthenticated browser clients.
revoke all on function public.so_book_with_items_once(
  text,date,text,text,integer,jsonb,uuid
) from public,anon;
grant execute on function public.so_book_with_items_once(
  text,date,text,text,integer,jsonb,uuid
) to authenticated;
