-- Public TV queue read; no LINE authorization and no customer information.
-- Only active shops with both queue and calling modules enabled can be queried.
create or replace function public.so_public_board(p_slug text,p_limit integer default 5)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $fn$
declare
  v_shop public.so_tenants;
  v_current text;
  v_upcoming jsonb := '[]'::jsonb;
  v_updated_at timestamptz;
begin
  if p_slug is null or length(p_slug)>40 or p_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception '門市代碼格式不正確' using errcode='22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception '顯示筆數需介於 1 至 10' using errcode='22023';
  end if;
  select * into v_shop
    from public.so_tenants t
    where t.slug=p_slug and t.status='ACTIVE'
      and coalesce((t.modules->>'queue')::boolean,false)
      and coalesce((t.modules->>'calling')::boolean,false);
  if not found then
    raise exception '找不到已開放公開叫號看板的門市' using errcode='P0002';
  end if;

  select coalesce(k.number_prefix,'') || k.ticket_no::text
    into v_current
    from public.so_tickets k
   where k.tenant_id=v_shop.id and k.deleted_at is null
     and k.status in ('CALLED','ARRIVED','ADMITTED','SERVING')
   order by k.updated_at desc,k.id desc
   limit 1;

  select coalesce(jsonb_agg(x.display_no order by x.business_date,x.queue_joined_at,x.ticket_no,x.id),'[]'::jsonb)
    into v_upcoming
    from (
      select k.id,k.business_date,k.queue_joined_at,k.ticket_no,
             coalesce(k.number_prefix,'') || k.ticket_no::text as display_no
        from public.so_tickets k
       where k.tenant_id=v_shop.id and k.deleted_at is null and k.status='WAITING'
       order by k.business_date,k.queue_joined_at,k.ticket_no,k.id
       limit p_limit
    ) x;

  select d.updated_at into v_updated_at from public.so_queue_displays d where d.tenant_id=v_shop.id;

  -- Deliberately return only store label and queue numbers: no LINE ID, names,
  -- phone, tickets' UUIDs, booking records or private configuration.
  return jsonb_build_object(
    'shop_name',v_shop.name,
    'current',v_current,
    'upcoming',v_upcoming,
    'updated_at',v_updated_at
  );
end
$fn$;

revoke all on function public.so_public_board(text,integer) from public,anon,authenticated;
grant execute on function public.so_public_board(text,integer) to anon,authenticated;
