-- One privacy-safe Realtime topic for public board, customer and merchant operations.
-- Ticket changes already publish "invalidate" to queue-board:<slug>.
-- Reservations were missing, so a newly booked/cancelled/edited appointment
-- did not cause the merchant's list or other customers' availability to refresh.
create or replace function private.so_notify_reservation_live_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid;
  v_previous_tenant uuid;
  v_slug text;
begin
  if tg_op = 'UPDATE' then
    -- Ignore reminder/LINE delivery stamps and updated_at-only updates.
    if row(new.tenant_id,new.user_id,new.customer_name,new.customer_phone,
           new.party_size,new.booking_date,new.booking_time,new.status,
           new.deleted_at,new.selected_items,new.booking_no,new.booking_prefix,
           new.service_duration_minutes,new.service_buffer_minutes,
           new.assigned_resource_id,new.service_unit_id,new.service_session_id)
       is not distinct from
       row(old.tenant_id,old.user_id,old.customer_name,old.customer_phone,
           old.party_size,old.booking_date,old.booking_time,old.status,
           old.deleted_at,old.selected_items,old.booking_no,old.booking_prefix,
           old.service_duration_minutes,old.service_buffer_minutes,
           old.assigned_resource_id,old.service_unit_id,old.service_session_id) then
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
    select distinct t.slug from public.so_tenants t
     where t.id = any(array[v_tenant,v_previous_tenant])
       and t.status = 'ACTIVE'
  loop
    -- Only an invalidation signal; NO booking rows, customer names or phone.
    perform realtime.send(
      jsonb_build_object('changed',true,'kind','reservation'),
      'invalidate', 'queue-board:' || v_slug, false
    );
  end loop;
  return null;
end;
$$;

revoke all on function private.so_notify_reservation_live_change()
from public, anon, authenticated;

drop trigger if exists so_reservation_live_invalidate on public.so_reservations;
create trigger so_reservation_live_invalidate
after insert or update or delete on public.so_reservations
for each row execute function private.so_notify_reservation_live_change();

comment on function private.so_notify_reservation_live_change() is
  'Booking invalidation only; shared Realtime topic has no private booking data.';
