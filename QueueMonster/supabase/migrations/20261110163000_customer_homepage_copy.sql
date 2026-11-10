-- Queue Monster: independently editable customer homepage headings.
-- Store only presentation copy; no changes to booking, queueing or existing tenant metadata.
create table if not exists public.so_customer_homepage (
  tenant_id uuid primary key references public.so_tenants(id) on delete cascade,
  title text not null default '',
  subtitle text not null default '',
  label text not null default '',
  show_label boolean not null default false,
  show_intro boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint so_homepage_title_length check (char_length(title) <= 60),
  constraint so_homepage_subtitle_length check (char_length(subtitle) <= 180),
  constraint so_homepage_label_length check (char_length(label) <= 32)
);
alter table public.so_customer_homepage enable row level security;
revoke all on table public.so_customer_homepage from public, anon, authenticated;

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
    'show_intro', coalesce(h.show_intro,true)
  );
end
$$;

create or replace function public.so_set_customer_homepage(
  p_slug text,
  p_title text,
  p_subtitle text,
  p_label text,
  p_show_label boolean,
  p_show_intro boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t public.so_tenants%rowtype;
  v_title text := btrim(coalesce(p_title,''));
  v_subtitle text := btrim(coalesce(p_subtitle,''));
  v_label text := btrim(coalesce(p_label,''));
begin
  if auth.uid() is null then raise exception '請先登入' using errcode = '28000'; end if;
  select * into t from public.so_tenants where slug = p_slug;
  if not found then raise exception '找不到門市'; end if;
  if not private.so_platform() and private.so_role(t.id) not in ('OWNER','MANAGER') then
    raise exception '只有店家管理者可以修改首頁' using errcode = '42501';
  end if;
  if char_length(v_title) > 60 or char_length(v_subtitle) > 180 or char_length(v_label) > 32 then
    raise exception '首頁文案超過長度限制';
  end if;
  if v_title ~ '[[:cntrl:]]' or v_subtitle ~ '[[:cntrl:]]' or v_label ~ '[[:cntrl:]]' then
    raise exception '首頁文案含有不支援的控制字元';
  end if;
  insert into public.so_customer_homepage(tenant_id,title,subtitle,label,show_label,show_intro,updated_at)
  values (t.id,v_title,v_subtitle,v_label,coalesce(p_show_label,false),coalesce(p_show_intro,true),now())
  on conflict (tenant_id) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    label = excluded.label,
    show_label = excluded.show_label,
    show_intro = excluded.show_intro,
    updated_at = now();
  return jsonb_build_object('saved',true);
end
$$;

revoke all on function public.so_get_customer_homepage(text) from public, anon;
revoke all on function public.so_set_customer_homepage(text,text,text,text,boolean,boolean) from public, anon;
grant execute on function public.so_get_customer_homepage(text) to authenticated;
grant execute on function public.so_set_customer_homepage(text,text,text,text,boolean,boolean) to authenticated;
