-- Existing PRD FR-104 / NR-14: durable 24-hour and 2-hour booking reminders.
-- Idempotent, event-versioned, scoped to merchant and booking. Non-destructive.
alter table public.so_line_notice_outbox drop constraint if exists so_line_notice_outbox_event_kind_check;
alter table public.so_line_notice_outbox add constraint so_line_notice_outbox_event_kind_check
 check (event_kind in (
  'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
  'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR',
  'RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H'
 ));
alter table public.so_line_push_log drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log add constraint so_line_push_log_event_kind_check
 check (event_kind in (
  'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
  'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR',
  'RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H'
 ));

create table if not exists public.so_booking_reminder_jobs(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.so_tenants(id) on delete restrict,
 booking_id uuid not null references public.so_reservations(id) on delete restrict,
 reminder_kind text not null check(reminder_kind in ('24H','2H')),
 booking_start_at timestamptz not null,
 due_at timestamptz not null,
 status text not null default 'SCHEDULED' check(status in ('SCHEDULED','QUEUED','EXPIRED','CANCELLED')),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(booking_id,reminder_kind)
);
alter table public.so_booking_reminder_jobs enable row level security;
revoke all on public.so_booking_reminder_jobs from public,anon,authenticated;
create index if not exists so_booking_reminders_due on public.so_booking_reminder_jobs(due_at,id)
 where status='SCHEDULED';

create or replace function private.so_booking_reminder_sync()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;v_prev uuid;v_kind text;v_due timestamptz;
begin
 if tg_op='UPDATE' and new.booking_date is not distinct from old.booking_date
    and new.booking_time is not distinct from old.booking_time
    and new.status is not distinct from old.status
    and new.deleted_at is not distinct from old.deleted_at then return new;end if;
 -- Outbox may contain a reminder for a now-invalid schedule: disable before new one.
 for v_prev in select j.id from public.so_booking_reminder_jobs j where j.booking_id=new.id loop
  update public.so_line_notice_outbox set status='SKIPPED',
     last_error='BOOKING_SCHEDULE_CHANGED',processing_at=null
   where reference_id=v_prev and tenant_id=new.tenant_id
     and event_kind in ('RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H')
     and status in ('PENDING','RETRY');
 end loop;
 if new.deleted_at is not null or new.status <> 'CONFIRMED' then
  update public.so_booking_reminder_jobs set status='CANCELLED',updated_at=now()
    where booking_id=new.id and status<>'CANCELLED';
  return new;
 end if;
 v_start:=(new.booking_date+new.booking_time) at time zone 'Asia/Taipei';
 foreach v_kind in array array['24H','2H'] loop
  v_due:=v_start-case when v_kind='24H' then interval '24 hours' else interval '2 hours' end;
  insert into public.so_booking_reminder_jobs(tenant_id,booking_id,reminder_kind,booking_start_at,due_at,status)
    values(new.tenant_id,new.id,v_kind,v_start,v_due,'SCHEDULED')
  on conflict(booking_id,reminder_kind) do update set
    id=gen_random_uuid(),booking_start_at=excluded.booking_start_at,due_at=excluded.due_at,
    status='SCHEDULED',updated_at=now();
 end loop;
 return new;
end $$;
drop trigger if exists so_booking_reminder_sync on public.so_reservations;
create trigger so_booking_reminder_sync
 after insert or update of booking_date,booking_time,status,deleted_at on public.so_reservations
 for each row execute function private.so_booking_reminder_sync();

-- Seed existing confirmed future bookings without changing booking identity.
insert into public.so_booking_reminder_jobs(tenant_id,booking_id,reminder_kind,booking_start_at,due_at,status)
select r.tenant_id,r.id,mode.kind,
 (r.booking_date+r.booking_time) at time zone 'Asia/Taipei',
 (r.booking_date+r.booking_time) at time zone 'Asia/Taipei'
   -case when mode.kind='24H' then interval '24 hours' else interval '2 hours' end,
 'SCHEDULED'
from public.so_reservations r cross join(values('24H'),('2H')) mode(kind)
where r.deleted_at is null and r.status='CONFIRMED'
 and (r.booking_date+r.booking_time) at time zone 'Asia/Taipei'>now()
on conflict(booking_id,reminder_kind) do nothing;

create or replace function public.so_booking_enqueue_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare v_job public.so_booking_reminder_jobs; v_n integer:=0;v_kind text;
begin
 -- Missed windows are intentionally not sent hours late.
 update public.so_booking_reminder_jobs set status='EXPIRED',updated_at=now()
 where status='SCHEDULED' and due_at<now()-interval '15 minutes';
 for v_job in
  select j.* from public.so_booking_reminder_jobs j
  join public.so_reservations r on r.id=j.booking_id and r.tenant_id=j.tenant_id
  join public.so_tenants t on t.id=j.tenant_id and t.status='ACTIVE'
  where j.status='SCHEDULED' and j.due_at<=now()
    and j.due_at>=now()-interval '15 minutes'
    and j.booking_start_at>now()
    and r.status='CONFIRMED' and r.deleted_at is null
    and (r.booking_date+r.booking_time) at time zone 'Asia/Taipei'=j.booking_start_at
  order by j.due_at,j.id limit 300 for update of j skip locked
 loop
  v_kind:=case when v_job.reminder_kind='24H' then 'RESERVATION_REMINDER_24H'
    else 'RESERVATION_REMINDER_2H' end;
  insert into public.so_line_notice_outbox(tenant_id,event_kind,reference_id)
   values(v_job.tenant_id,v_kind,v_job.id)
   on conflict(tenant_id,event_kind,reference_id) do nothing;
  update public.so_booking_reminder_jobs set status='QUEUED',updated_at=now()
   where id=v_job.id and status='SCHEDULED';
  v_n:=v_n+1;
 end loop;
 return v_n;
end $$;
revoke all on function public.so_booking_enqueue_reminders() from public,anon,authenticated;
grant execute on function public.so_booking_enqueue_reminders() to postgres;

-- Integrate with existing minute-based pg_cron + outbox worker, not a second dispatcher.
select cron.schedule('line-saas-booking-reminders','* * * * *',
 'select public.so_booking_enqueue_reminders()');
