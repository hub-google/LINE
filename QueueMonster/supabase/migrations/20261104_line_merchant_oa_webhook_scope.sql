-- Store friendship state per merchant OA rather than across all LINE Providers.
create table if not exists public.so_line_oa_webhook_events(
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 event_id text not null,
 event_type text not null check(event_type in ('follow','unfollow')),
 line_sub text not null,
 occurred_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(tenant_id,event_id)
);
alter table public.so_line_oa_webhook_events enable row level security;
revoke all on public.so_line_oa_webhook_events from public,anon,authenticated;
create or replace function public.so_apply_merchant_oa_friend_event(
 p_tenant_id uuid,p_event_id text,p_event_type text,p_line_sub text,p_occurred_at timestamptz
) returns text language plpgsql security definer set search_path='' as $$
declare affected int;
begin
 if current_setting('request.jwt.claim.role',true)<>'service_role' then
   raise exception 'SERVICE_ROLE_ONLY' using errcode='42501';end if;
 if p_event_type not in ('follow','unfollow') or
   p_event_id !~ '^[A-Za-z0-9_-]{10,100}$' or
   p_line_sub !~ '^U[0-9a-f]{32}$' or p_occurred_at>now()+interval '5 minutes' then
   raise exception 'INVALID_LINE_EVENT';end if;
 insert into public.so_line_oa_webhook_events(tenant_id,event_id,event_type,line_sub,occurred_at)
 values(p_tenant_id,p_event_id,p_event_type,p_line_sub,p_occurred_at)
 on conflict do nothing;
 get diagnostics affected = row_count;
 if affected=0 then return 'DUPLICATE'; end if;
 update public.so_line_links set is_following=(p_event_type='follow'),
   friendship_updated_at=p_occurred_at
 where tenant_id=p_tenant_id and line_sub=p_line_sub
   and (friendship_updated_at is null or friendship_updated_at<=p_occurred_at);
 return 'PROCESSED';
end;
$$;
revoke all on function public.so_apply_merchant_oa_friend_event(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.so_apply_merchant_oa_friend_event(uuid,text,text,text,timestamptz) to service_role;
