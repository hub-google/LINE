-- FR-112: merchant-controlled pre-submit booking confirmation (default ON).
-- Additive: does not modify existing reservations, queue tickets, QA tenants or other policies.
alter table public.so_booking_policy
  add column if not exists require_confirmation boolean not null default true;

create or replace function public.so_get_booking_policy(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.so_tenants; p public.so_booking_policy;
begin
  select * into t from public.so_tenants where slug=p_slug;
  if not found then raise exception '找不到門市'; end if;
  if private.so_role(t.id) is null and not private.so_platform() then
    raise exception '沒有查看設定權限' using errcode='42501';
  end if;
  select * into p from public.so_booking_policy where tenant_id=t.id;
  return jsonb_build_object(
    'closed_weekdays',coalesce(to_jsonb(p.closed_weekdays),'[]'::jsonb),
    'closed_dates',coalesce(to_jsonb(p.closed_dates),'[]'::jsonb),
    'break_start',to_char(p.break_start,'HH24:MI'),
    'break_end',to_char(p.break_end,'HH24:MI'),
    'min_notice_minutes',coalesce(p.min_notice_minutes,0),
    'require_confirmation',coalesce(p.require_confirmation,true)
  );
end $$;
revoke all on function public.so_get_booking_policy(text) from public,anon;
grant execute on function public.so_get_booking_policy(text) to authenticated;

create or replace function public.so_customer_booking_confirmation(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tenant public.so_tenants; v_required boolean;
begin
  if auth.uid() is null then raise exception '請先登入' using errcode='28000'; end if;
  select * into v_tenant from public.so_tenants where slug=p_slug and status='ACTIVE';
  if not found then raise exception '門市未開放' using errcode='P0002'; end if;
  select require_confirmation into v_required from public.so_booking_policy where tenant_id=v_tenant.id;
  return jsonb_build_object('require_confirmation',coalesce(v_required,true));
end $$;
revoke all on function public.so_customer_booking_confirmation(text) from public,anon;
grant execute on function public.so_customer_booking_confirmation(text) to authenticated;

create or replace function public.so_set_booking_confirmation(p_slug text,p_required boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenant public.so_tenants;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select * into v_tenant from public.so_tenants where slug=p_slug;
  if not found then raise exception '找不到門市'; end if;
  if private.so_role(v_tenant.id) not in ('OWNER','MANAGER') and not private.so_platform() then
    raise exception '只有企業管理者可以修改預約確認設定' using errcode='42501';
  end if;
  if p_required is null then raise exception '缺少設定值'; end if;
  insert into public.so_booking_policy(tenant_id,require_confirmation,updated_at)
  values(v_tenant.id,p_required,now())
  on conflict(tenant_id) do update
     set require_confirmation=excluded.require_confirmation,updated_at=now();
  insert into public.so_audit(tenant_id,actor,action,info)
  values(v_tenant.id,auth.uid(),'booking_confirmation_changed',
         jsonb_build_object('required',p_required));
  return jsonb_build_object('required',p_required);
end $$;
revoke all on function public.so_set_booking_confirmation(text,boolean) from public,anon;
grant execute on function public.so_set_booking_confirmation(text,boolean) to authenticated;
