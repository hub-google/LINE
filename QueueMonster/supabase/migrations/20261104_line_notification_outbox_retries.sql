-- LINE notification outbox: database-triggered events + cron-driven retries.
-- No changes to historical booking, ticket, or tenant records.
create table if not exists public.so_line_notice_outbox (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.so_tenants(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
    'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED'
  )),
  reference_id uuid not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','RETRY','SENT','SKIPPED','FAILED')),
  attempts integer not null default 0,
  processing_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, event_kind, reference_id)
);
create index if not exists so_line_notice_due_idx on public.so_line_notice_outbox(next_attempt_at,created_at)
  where status in ('PENDING','RETRY');
create index if not exists so_line_notice_tenant_idx on public.so_line_notice_outbox(tenant_id,created_at desc);
alter table public.so_line_notice_outbox enable row level security;
revoke all on public.so_line_notice_outbox from public, anon, authenticated;

-- Only a service-role Edge Function and the privileged Cron SQL can access this secret.
create table if not exists public.so_line_worker_keys (
  name text primary key,
  secret text not null check (length(secret) >= 48),
  created_at timestamptz not null default now()
);
alter table public.so_line_worker_keys enable row level security;
revoke all on public.so_line_worker_keys from public, anon, authenticated;
insert into public.so_line_worker_keys(name,secret)
values ('notices', encode(gen_random_bytes(32),'hex'))
on conflict (name) do nothing;

create or replace function public.so_enqueue_line_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_ref uuid;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_table_name = 'so_tickets' then
    if tg_op = 'INSERT' then
      if new.status='WAITING' then
        v_kind:='TICKET_CREATED'; v_ref:=new.id;
      end if;
    elsif tg_op='UPDATE' then
      if new.status='CALLED' and new.line_call_event_id is not null
        and (old.line_call_event_id is distinct from new.line_call_event_id) then
        v_kind:='CALLED'; v_ref:=new.line_call_event_id;
      elsif new.status='CANCELLED' and new.line_cancel_event_id is not null
        and (old.line_cancel_event_id is distinct from new.line_cancel_event_id) then
        v_kind:='TICKET_CANCELLED'; v_ref:=new.line_cancel_event_id;
      end if;
    end if;
  elsif tg_table_name='so_reservations' then
    if tg_op='INSERT' then
      if new.status='CONFIRMED' then
        v_kind:='RESERVED'; v_ref:=new.id;
      end if;
    elsif tg_op='UPDATE' then
      if new.status='CANCELLED' and new.line_cancel_event_id is not null
        and (old.line_cancel_event_id is distinct from new.line_cancel_event_id) then
        v_kind:='RESERVATION_CANCELLED'; v_ref:=new.line_cancel_event_id;
      elsif new.status='CONFIRMED' and old.status='CANCELLED' and new.line_restore_event_id is not null
        and (old.line_restore_event_id is distinct from new.line_restore_event_id) then
        v_kind:='RESERVATION_RESTORED'; v_ref:=new.line_restore_event_id;
      elsif new.status='CONFIRMED' and new.line_update_event_id is not null
        and (old.line_update_event_id is distinct from new.line_update_event_id) then
        v_kind:='RESERVATION_UPDATED'; v_ref:=new.line_update_event_id;
      end if;
    end if;
  end if;
  if v_kind is not null and v_ref is not null then
    insert into public.so_line_notice_outbox(tenant_id,event_kind,reference_id)
    values(new.tenant_id,v_kind,v_ref) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.so_enqueue_line_notice() from public, anon, authenticated;
drop trigger if exists so_ticket_notice_outbox on public.so_tickets;
create trigger so_ticket_notice_outbox after insert or update of status,line_call_event_id,line_cancel_event_id
on public.so_tickets for each row execute function public.so_enqueue_line_notice();
drop trigger if exists so_booking_notice_outbox on public.so_reservations;
create trigger so_booking_notice_outbox after insert or update of status,line_cancel_event_id,line_update_event_id,line_restore_event_id
on public.so_reservations for each row execute function public.so_enqueue_line_notice();

-- Scheduler stores no literal token; it reads the service-only row on each run.
create or replace function public.so_line_dispatch_due()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_token text; v_request bigint;
begin
  update public.so_line_notice_outbox
  set status='RETRY',processing_at=null,last_error='WORKER_INTERRUPTED',next_attempt_at=now()
  where status='PROCESSING' and processing_at < now()-interval '10 minutes';
  select secret into v_token from public.so_line_worker_keys where name='notices';
  if v_token is null then raise exception 'LINE worker credential missing'; end if;
  select net.http_post(
    url:='https://unapiwajmgqqtdkixaab.supabase.co/functions/v1/line-bridge?action=dispatch-pending',
    headers:=jsonb_build_object('Content-Type','application/json','x-line-worker-key',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=9000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.so_line_dispatch_due() from public, anon, authenticated;
select cron.schedule(
  'line-saas-notification-outbox',
  '* * * * *',
  'select public.so_line_dispatch_due()'
);
