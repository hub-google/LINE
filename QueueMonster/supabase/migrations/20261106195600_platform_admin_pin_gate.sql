-- Queue Monster platform owner PIN throttle. The PIN hash must be provisioned privately.
-- This file intentionally does not include any administrator credential.
create table if not exists public.qm_admin_pin_guard (
 id boolean primary key default true check (id),
 pin_hash text not null,
 failed_count integer not null default 0,
 locked_until timestamptz not null default '-infinity',
 updated_at timestamptz not null default now()
);
alter table public.qm_admin_pin_guard enable row level security;
revoke all on public.qm_admin_pin_guard from public, anon, authenticated;
create or replace function public.qm_admin_pin_check(p_pin text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v public.qm_admin_pin_guard%rowtype;
begin
 if length(coalesce(p_pin,''))<>1 then return false; end if;
 select * into v from public.qm_admin_pin_guard where id=true for update;
 if not found then return false; end if;
 if v.locked_until>now() then return false; end if;
 if extensions.crypt(p_pin,v.pin_hash)=v.pin_hash then
  update public.qm_admin_pin_guard
   set failed_count=0, locked_until='-infinity', updated_at=now()
   where id=true;
  return true;
 end if;
 update public.qm_admin_pin_guard
   set failed_count=v.failed_count+1, locked_until=now()+interval '24 hours', updated_at=now()
   where id=true;
 return false;
end $$;
revoke all on function public.qm_admin_pin_check(text) from public, anon, authenticated;
grant execute on function public.qm_admin_pin_check(text) to service_role;
