-- Public in-store queue display: expose ONLY the next display numbers, never customer records.
-- Align with so_staff_action(call) ordering and queue_joined_at for restored passed tickets.
create or replace function public.so_public_queue_order(p_slug text, p_limit integer default 5)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  t public.so_tenants;
begin
  if auth.uid() is null then
    raise exception '請先完成登入' using errcode='28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception '顯示筆數必須介於 1 到 20';
  end if;
  select * into t from public.so_tenants
  where slug=p_slug and status='ACTIVE';
  if not found then raise exception '找不到門市'; end if;
  if t.modules->>'queue'='false' or t.modules->>'calling'='false' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(q.display_no order by q.business_date,q.queue_joined_at,q.ticket_no,q.id)
    from (
      select k.business_date,k.queue_joined_at,k.ticket_no,k.id,
             coalesce(k.number_prefix,'')||k.ticket_no::text as display_no
      from public.so_tickets k
      where k.tenant_id=t.id and k.deleted_at is null and k.status='WAITING'
      order by k.business_date,k.queue_joined_at,k.ticket_no,k.id
      limit p_limit
    ) q
  ),'[]'::jsonb);
end
$function$;
revoke all on function public.so_public_queue_order(text,integer) from public,anon;
grant execute on function public.so_public_queue_order(text,integer) to authenticated;
