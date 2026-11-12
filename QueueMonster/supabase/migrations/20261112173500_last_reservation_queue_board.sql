-- Only a verified LINE user may resolve the public queue board of the store
-- where they most recently created a non-cancelled reservation.
create or replace function public.so_my_last_booking_board()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_shop record;
begin
  if v_user_id is null then
    return jsonb_build_object('status','LOGIN_REQUIRED');
  end if;
  if not exists (
    select 1 from public.qm_platform_line_identities p
    where p.user_id=v_user_id
      and p.updated_at between now()-interval '30 days' and now()+interval '1 minute'
      and p.login_channel_id ~ '^[0-9]{8,}$'
  ) and not exists (
    select 1 from public.qm_line_links own
    where own.user_id=v_user_id
      and own.updated_at between now()-interval '30 days' and now()+interval '1 minute'
      and own.login_channel_id ~ '^[0-9]{8,}$'
  ) then
    return jsonb_build_object('status','LOGIN_REQUIRED');
  end if;
  select t.slug,t.name,t.modules into v_shop
  from public.qm_reservations r
  join public.qm_tenants t on t.id=r.tenant_id
  where t.status='ACTIVE'
    and r.deleted_at is null
    and r.status not in ('CANCELLED','CANCELED','DELETED')
    and (
      r.user_id=v_user_id
      or exists (
        select 1 from public.qm_line_links linked
        where linked.tenant_id=r.tenant_id
          and linked.user_id=r.user_id
          and linked.line_sub in (
            select p.line_sub
            from public.qm_platform_line_identities p
            where p.user_id=v_user_id
              and p.updated_at between now()-interval '30 days' and now()+interval '1 minute'
              and p.login_channel_id ~ '^[0-9]{8,}$'
            union
            select own.line_sub
            from public.qm_line_links own
            where own.user_id=v_user_id
              and own.updated_at between now()-interval '30 days' and now()+interval '1 minute'
              and own.login_channel_id ~ '^[0-9]{8,}$'
          )
      )
    )
  order by r.created_at desc,r.id desc
  limit 1;
  if not found then
    return jsonb_build_object('status','NO_BOOKING');
  end if;
  if coalesce((v_shop.modules->>'queue')::boolean,false)
    and coalesce((v_shop.modules->>'calling')::boolean,false)
  then
    return jsonb_build_object('status','FOUND','slug',v_shop.slug,'name',v_shop.name);
  end if;
  return jsonb_build_object('status','BOARD_UNAVAILABLE','name',v_shop.name);
end;
$fn$;

revoke all on function public.so_my_last_booking_board() from public,anon,authenticated;
grant execute on function public.so_my_last_booking_board() to authenticated;

comment on function public.so_my_last_booking_board()
is 'Authenticated verified LINE user only: last non-cancelled booking store public queue board, without exposing reservation/customer data.';
