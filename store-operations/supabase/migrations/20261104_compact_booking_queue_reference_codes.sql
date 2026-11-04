-- Stable compact public reference codes for bookings and queue tickets.
-- Keep UUID primary keys and foreign keys untouched. Serial resets never change these codes.
-- Format: Asia/Taipei YYYYMMDDHH24MISSMS (17 chars) + 4 base36 chars (21 total).

create sequence if not exists private.so_short_reference_seq;

create or replace function private.so_short_reference(p_created_at timestamptz default null)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint := nextval('private.so_short_reference_seq'::regclass) % 1679616;
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  suffix text := '';
  i integer;
begin
  for i in 1..4 loop
    suffix := substr(alphabet, (n % 36)::integer + 1, 1) || suffix;
    n := n / 36;
  end loop;
  return to_char(coalesce(p_created_at, clock_timestamp()) at time zone 'Asia/Taipei', 'YYYYMMDDHH24MISSMS') || suffix;
end;
$$;

alter table public.so_reservations add column if not exists reference_code text;
alter table public.so_tickets add column if not exists reference_code text;

-- Preserve existing IDs; populate only records that don't have a reference code.
update public.so_reservations
set reference_code = private.so_short_reference(created_at)
where reference_code is null;

update public.so_tickets
set reference_code = private.so_short_reference(created_at)
where reference_code is null;

create or replace function private.so_assign_short_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reference_code is null then
    new.reference_code := private.so_short_reference(new.created_at);
  end if;
  return new;
end;
$$;

drop trigger if exists so_reservations_assign_short_reference on public.so_reservations;
create trigger so_reservations_assign_short_reference
before insert on public.so_reservations
for each row execute function private.so_assign_short_reference();

drop trigger if exists so_tickets_assign_short_reference on public.so_tickets;
create trigger so_tickets_assign_short_reference
before insert on public.so_tickets
for each row execute function private.so_assign_short_reference();

alter table public.so_reservations alter column reference_code set not null;
alter table public.so_tickets alter column reference_code set not null;

create unique index if not exists so_reservations_reference_code_key
on public.so_reservations(reference_code);
create unique index if not exists so_tickets_reference_code_key
on public.so_tickets(reference_code);

comment on column public.so_reservations.reference_code is 'Permanent 21-character reference (Taipei timestamp to milliseconds + 4-char base36 suffix); UUID remains primary key.';
comment on column public.so_tickets.reference_code is 'Permanent 21-character reference (Taipei timestamp to milliseconds + 4-char base36 suffix); UUID remains primary key.';
