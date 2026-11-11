-- Public queue-board invalidation events (no ticket or customer payload).
-- A lightweight broadcast is sent only when a queue-visible ticket field changes.
-- This avoids publishing so_tickets (which contains customer names) via Realtime.
create or replace function private.so_notify_queue_board_realtime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_previous_tenant uuid;
  v_slug text;
begin
  if tg_op = 'UPDATE' then
    -- Ignore notification stamps, selected-items edits and other private fields:
    -- they do not change the public board's call number or waiting order.
    if row(new.tenant_id,new.status,new.deleted_at,new.ticket_no,
           new.number_prefix,new.business_date,new.queue_joined_at,
           new.last_called_at,new.service_session_id,new.service_unit_id,
           new.queue_session_code)
       is not distinct from
       row(old.tenant_id,old.status,old.deleted_at,old.ticket_no,
           old.number_prefix,old.business_date,old.queue_joined_at,
           old.last_called_at,old.service_session_id,old.service_unit_id,
           old.queue_session_code) then
      return null;
    end if;
    v_tenant := new.tenant_id;
    if new.tenant_id is distinct from old.tenant_id then
      v_previous_tenant := old.tenant_id;
    end if;
  elsif tg_op = 'DELETE' then
    v_tenant := old.tenant_id;
  else
    v_tenant := new.tenant_id;
  end if;

  for v_slug in
    select distinct t.slug
    from public.so_tenants t
    where t.id = any(array[v_tenant,v_previous_tenant])
      and t.status = 'ACTIVE'
  loop
    -- Public channel: the *only* payload is a boolean change marker.
    -- The board then calls existing privacy-filtered public board RPCs.
    perform realtime.send(
      jsonb_build_object('changed',true),
      'invalidate',
      'queue-board:' || v_slug,
      false
    );
  end loop;
  return null;
end;
$$;

revoke all on function private.so_notify_queue_board_realtime()
from public, anon, authenticated;

drop trigger if exists so_queue_board_realtime_change on public.so_tickets;
create trigger so_queue_board_realtime_change
after insert or update or delete on public.so_tickets
for each row execute function private.so_notify_queue_board_realtime();

comment on function private.so_notify_queue_board_realtime() is
  'Broadcasts only an anonymous, store-scoped queue invalidation marker; never publishes customer ticket data.';
