-- Leave old tenants with a compact customer homepage: no forced marketing panel.
-- Managers can explicitly enable the custom introduction through their own settings.
alter table public.so_customer_homepage alter column show_intro set default false;

create or replace function public.so_get_customer_homepage(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.so_tenants%rowtype;
  h public.so_customer_homepage%rowtype;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '28000';
  end if;
  select * into t from public.so_tenants where slug = p_slug;
  if not found then raise exception '找不到門市'; end if;
  if t.status <> 'ACTIVE' and not private.so_platform() and private.so_role(t.id) is null then
    raise exception '門市尚未開放' using errcode = '42501';
  end if;
  select * into h from public.so_customer_homepage where tenant_id = t.id;
  return jsonb_build_object(
    'title', case when h.tenant_id is not null then h.title else t.name end,
    'subtitle', case when h.tenant_id is not null then h.subtitle else coalesce(t.description,'') end,
    'label', case when h.tenant_id is not null then h.label else '' end,
    'show_label', coalesce(h.show_label,false),
    'show_intro', coalesce(h.show_intro,false)
  );
end
$$;
revoke all on function public.so_get_customer_homepage(text) from public, anon;
grant execute on function public.so_get_customer_homepage(text) to authenticated;
