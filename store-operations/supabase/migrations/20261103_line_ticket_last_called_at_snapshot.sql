alter table public.so_tickets add column if not exists last_called_at timestamptz;
create or replace function public.so_ticket_call_progress_stamp()
returns trigger language plpgsql set search_path = ''
as $body$
begin
 if new.status='CALLED' and (
     new.status is distinct from old.status
     or new.line_call_event_id is distinct from old.line_call_event_id
   ) then
   new.last_called_at:=now();
 end if;
 return new;
end $body$;
drop trigger if exists so_ticket_call_progress_stamp on public.so_tickets;
create trigger so_ticket_call_progress_stamp
before update on public.so_tickets for each row
execute function public.so_ticket_call_progress_stamp();
update public.so_tickets
set last_called_at=updated_at
where last_called_at is null and status in ('CALLED','SERVING') and line_call_event_id is not null;
