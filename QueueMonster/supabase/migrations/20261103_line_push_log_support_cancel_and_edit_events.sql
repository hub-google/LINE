alter table public.so_line_push_log
  drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log
  add constraint so_line_push_log_event_kind_check
  check (event_kind in (
    'CALLED','RESERVED','TICKET_CREATED',
    'TICKET_CANCELLED','RESERVATION_CANCELLED','RESERVATION_UPDATED'
  ));
