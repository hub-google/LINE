-- Isolated LINE identity mappings for the existing store-operations service.
-- Live DB migration: line_verified_identity_link_table (2026-11-03).
create table if not exists public.so_line_links (
 tenant_id uuid not null references public.so_tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 line_sub text not null check (length(line_sub) between 20 and 128),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (tenant_id, user_id)
);
create index if not exists so_line_links_lookup on public.so_line_links (tenant_id, line_sub);
alter table public.so_line_links enable row level security;
revoke all on public.so_line_links from public, anon, authenticated;
comment on table public.so_line_links is 'Verified LINE ID token subjects mapped to authenticated Supabase users; server-side access only.';
