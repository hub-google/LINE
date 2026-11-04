-- OSS-N03: per-ticket customer opt-in for one LINE "near your turn" message.
-- Additive only: do not touch existing UUIDs, serial numbers or QA merchants.
alter table public.so_tickets
  add column if not exists queue_near_alert_threshold smallint not null default 0;
alter table public.so_tickets
  drop constraint if exists so_tickets_queue_near_alert_threshold_check;
alter table public.so_tickets
  add constraint so_tickets_queue_near_alert_threshold_check
  check (queue_near_alert_threshold in (0,3,5));
create index if not exists so_tickets_queue_near_optin_idx
  on public.so_tickets (tenant_id,business_date,queue_joined_at,ticket_no,id)
  where status='WAITING' and deleted_at is null and queue_near_alert_threshold>0;

-- The existing server-only outbox and push log must accept this NEW event type.
alter table public.so_line_notice_outbox
  drop constraint if exists so_line_notice_outbox_event_kind_check;
alter table public.so_line_notice_outbox
  add constraint so_line_notice_outbox_event_kind_check
  check (event_kind in (
    'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
    'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED',
    'QUEUE_NEAR'
  ));
alter table public.so_line_push_log
  drop constraint if exists so_line_push_log_event_kind_check;
alter table public.so_line_push_log
  add constraint so_line_push_log_event_kind_check
  check (event_kind in (
    'CALLED','RESERVED','TICKET_CREATED','TICKET_CANCELLED',
    'RESERVATION_CANCELLED','RESERVATION_UPDATED','RESERVATION_RESTORED',
    'QUEUE_NEAR'
  ));

-- Do not expose ticket preferences through unrestricted table SELECT.
create or replace function public.so_customer_get_queue_near_alert(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare k public.so_tickets;
begin
  if auth.uid() is null then raise exception '請先使用 LINE 登入'; end if;
  select * into k from public.so_tickets where id=p_ticket_id and deleted_at is null;
  if not found then raise exception '找不到號碼'; end if;
  if not exists (
    select 1 from public.so_line_links viewer
    join public.so_line_links linked
      on linked.tenant_id=viewer.tenant_id and linked.line_sub=viewer.line_sub
    where viewer.tenant_id=k.tenant_id and viewer.user_id=auth.uid()
      and linked.user_id=k.user_id
  ) then raise exception '無法查詢他人號碼' using errcode='42501'; end if;
  return jsonb_build_object('ticket_id',k.id,'threshold',k.queue_near_alert_threshold,'status',k.status);
end $$;
revoke all on function public.so_customer_get_queue_near_alert(uuid) from public,anon;
grant execute on function public.so_customer_get_queue_near_alert(uuid) to authenticated;

create or replace function public.so_customer_set_queue_near_alert(p_ticket_id uuid,p_threshold integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.so_tenants;k public.so_tickets;
begin
  if auth.uid() is null then raise exception '請先使用 LINE 登入'; end if;
  if p_threshold is null or p_threshold not in (0,3,5) then
    raise exception '提醒設定只能是關閉、3 組或 5 組';
  end if;
  select tenant.* into t from public.so_tenants tenant
  join public.so_tickets ticket on ticket.tenant_id=tenant.id
  where ticket.id=p_ticket_id and tenant.status='ACTIVE' for update of tenant;
  if not found then raise exception '找不到有效門市或號碼'; end if;
  select * into k from public.so_tickets
    where id=p_ticket_id and tenant_id=t.id and deleted_at is null for update;
  if not found or k.status <> 'WAITING' then
    raise exception '只有候位中的有效號碼可以設定提醒';
  end if;
  if not exists (
    select 1 from public.so_line_links viewer
    join public.so_line_links linked
      on linked.tenant_id=viewer.tenant_id and linked.line_sub=viewer.line_sub
    where viewer.tenant_id=t.id and viewer.user_id=auth.uid()
      and linked.user_id=k.user_id
  ) then raise exception '無法修改他人號碼' using errcode='42501'; end if;

  update public.so_tickets set queue_near_alert_threshold=p_threshold
    where id=k.id;
  if p_threshold=0 then
    -- A worker already PROCESSING a notice may have begun its HTTP request;
    -- its handler still rechecks ticket state and preference just before push.
    update public.so_line_notice_outbox set status='SKIPPED',
      last_error='CUSTOMER_DISABLED',processing_at=null
      where tenant_id=t.id and event_kind='QUEUE_NEAR' and reference_id=k.id
        and status in ('PENDING','RETRY');
  end if;
  insert into public.so_audit(tenant_id,actor,action,info)
    values(t.id,auth.uid(),'queue_near_alert_preference',
      jsonb_build_object('ticket',k.id,'threshold',p_threshold));
  return jsonb_build_object('ticket_id',k.id,'threshold',p_threshold);
end $$;
revoke all on function public.so_customer_set_queue_near_alert(uuid,integer) from public,anon;
grant execute on function public.so_customer_set_queue_near_alert(uuid,integer) to authenticated;

-- A tiny per-minute scan of opted-in WAITING tickets, not one API call per
-- queue change. Only rows reaching the selected threshold are queued.
create or replace function public.so_queue_enqueue_near_alerts()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with eligible as (
    select k.tenant_id,k.id
    from public.so_tickets k
    join public.so_tenants t on t.id=k.tenant_id and t.status='ACTIVE'
    where k.deleted_at is null and k.status='WAITING'
      and k.queue_near_alert_threshold in (3,5)
      and (
        select count(*)
        from public.so_tickets ahead
        where ahead.tenant_id=k.tenant_id and ahead.status='WAITING'
          and ahead.deleted_at is null
          and (ahead.business_date,ahead.queue_joined_at,ahead.ticket_no,ahead.id)
            < (k.business_date,k.queue_joined_at,k.ticket_no,k.id)
      ) <= k.queue_near_alert_threshold
    order by k.created_at
    limit 500
  ), enqueued as (
    insert into public.so_line_notice_outbox(tenant_id,event_kind,reference_id)
      select e.tenant_id,'QUEUE_NEAR',e.id from eligible e
    on conflict (tenant_id,event_kind,reference_id) do update
      set status='PENDING',attempts=0,processing_at=null,
          last_error=null,next_attempt_at=now()
      where so_line_notice_outbox.status='SKIPPED'
    returning id
  ) select count(*) into v_count from enqueued;
  return v_count;
end $$;
revoke all on function public.so_queue_enqueue_near_alerts() from public,anon,authenticated;

-- The existing notification outbox dispatcher remains unchanged. This
-- additional SQL cron only enqueues; its LINE network send uses the existing
-- protected dispatch-pending worker and retry policy.
select cron.schedule(
  'line-saas-queue-near-alert',
  '* * * * *',
  'select public.so_queue_enqueue_near_alerts()'
);
