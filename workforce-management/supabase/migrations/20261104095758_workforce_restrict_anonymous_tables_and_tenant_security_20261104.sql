
-- Hardening: demo data is served solely by a tightly scoped RPC, never via direct anon table access.
revoke all on public.wm_tenants,public.wm_branches,public.wm_members,public.wm_shifts,
 public.wm_availability,public.wm_punches,public.wm_requests,
 public.wm_request_actions,public.wm_leave_entitlements,public.wm_audit from anon;

-- A real tenant must never be flipped to is_demo (or change ownership) via a client UPDATE.
create or replace function wm_private.prevent_tenant_privilege_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.is_demo is distinct from old.is_demo or new.created_by is distinct from old.created_by then
  raise exception 'Immutable tenant security attributes';
 end if;
 return new;
end $$;
drop trigger if exists wm_tenant_security_immutable on public.wm_tenants;
create trigger wm_tenant_security_immutable before update on public.wm_tenants
 for each row execute function wm_private.prevent_tenant_privilege_change();
revoke all on function wm_private.prevent_tenant_privilege_change() from public;
