-- Persist a distinct LINE event for each CANCELLED -> CONFIRMED correction.
-- This is idempotent with already-upgraded production databases.
alter table public.so_reservations
  add column if not exists line_restore_event_id uuid;

create or replace function public.so_booking_notification_stamp()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.status = 'CANCELLED' and old.status is distinct from new.status then
    new.line_cancel_event_id := gen_random_uuid();
  end if;
  if new.booking_date is distinct from old.booking_date
     or new.booking_time is distinct from old.booking_time
     or new.party_size is distinct from old.party_size
     or new.selected_items is distinct from old.selected_items then
    new.line_update_event_id := gen_random_uuid();
  end if;
  if new.status = 'CONFIRMED' and old.status = 'CANCELLED' then
    new.line_restore_event_id := gen_random_uuid();
  end if;
  return new;
end $function$;

-- New restore events must be claimable independently from the original booking.
alter table public.so_line_push_log
  drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log
  add constraint so_line_push_log_event_kind_check
  check (event_kind in (
    'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
    'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED'
  ));
