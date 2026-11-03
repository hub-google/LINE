-- Customer-facing so_take_number continues enforcing one active ticket
-- under a serialized tenant row lock. Staff overrides must not be blocked
-- by a unique partial index shared with the customer flow.
drop index if exists public.so_one_active_ticket_per_customer;
create index if not exists so_active_tickets_customer_lookup
 on public.so_tickets(tenant_id,business_date,user_id)
 where status in ('WAITING','CALLED','SERVING');
