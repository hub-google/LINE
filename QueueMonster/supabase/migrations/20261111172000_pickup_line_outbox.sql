-- Durable LINE pickup notifications use the existing outbox worker, OA reachability and push deduplication.
create table if not exists public.so_pickup_notice_events(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 order_id uuid not null references public.so_pickup_orders(id) on delete cascade,
 status text not null,
 previous_status text,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists so_pickup_notice_order_latest on public.so_pickup_notice_events(tenant_id,order_id,created_at desc);
alter table public.so_pickup_notice_events enable row level security;
revoke all on public.so_pickup_notice_events from public,anon,authenticated;
alter table public.so_line_notice_outbox drop constraint if exists so_line_notice_outbox_event_kind_check;
alter table public.so_line_notice_outbox add constraint so_line_notice_outbox_event_kind_check
 check(event_kind in ('CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED','TICKET_RESTORED','RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR','RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H','PICKUP_EVENT'));
alter table public.so_line_push_log drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log add constraint so_line_push_log_event_kind_check
 check(event_kind in ('CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED','TICKET_RESTORED','RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED','QUEUE_NEAR','RESERVATION_REMINDER_24H','RESERVATION_REMINDER_2H','PICKUP_EVENT'));
create or replace function private.so_pickup_enqueue_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event_id uuid;
begin
 if tg_op='UPDATE' and old.status is not distinct from new.status then return new;end if;
 insert into public.so_pickup_notice_events(tenant_id,order_id,status,previous_status)
 values(new.tenant_id,new.id,new.status,case when tg_op='UPDATE' then old.status else null end)
 returning id into v_event_id;
 insert into public.so_line_notice_outbox(tenant_id,event_kind,reference_id)
 values(new.tenant_id,'PICKUP_EVENT',v_event_id)
 on conflict(tenant_id,event_kind,reference_id) do nothing;
 return new;
end $$;
revoke all on function private.so_pickup_enqueue_notice() from public,anon,authenticated;
drop trigger if exists so_pickup_enqueue_notice on public.so_pickup_orders;
create trigger so_pickup_enqueue_notice after insert or update of status on public.so_pickup_orders
 for each row execute function private.so_pickup_enqueue_notice();
