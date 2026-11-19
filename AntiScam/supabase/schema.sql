-- AntiScam backend-only tables, isolated via as_ prefix.
create table if not exists public.as_communities (
  id text primary key, name text not null, mode text not null default 'monitor'
    check (mode in ('monitor','assist','auto')),
  automation_approved boolean not null default false,
  blocked_domains text[] not null default '{}', allowed_member_keys text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.as_members (
  community_id text not null references public.as_communities(id) on delete cascade,
  member_key text not null, joined_at timestamptz,
  first_observed_at timestamptz not null default now(), join_verified boolean not null default false,
  primary key (community_id, member_key)
);
create table if not exists public.as_events (
  id uuid primary key, source_key text not null unique,
  community_id text not null references public.as_communities(id) on delete cascade,
  member_key text not null, encrypted_member_id text,
  message_id text not null, preview text not null, fingerprint text not null,
  score integer not null check(score between 0 and 100),
  level text not null check (level in ('low','medium','high','critical')),
  categories jsonb not null default '[]'::jsonb, reasons jsonb not null default '[]'::jsonb, ai jsonb,
  auto_eligible boolean not null default false, is_privileged boolean not null default false,
  member_recent boolean not null default false, status text not null default 'assessed',
  happened_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists as_events_group_time on public.as_events(community_id,created_at desc);
create index if not exists as_events_member_time on public.as_events(community_id,member_key,happened_at desc);
create table if not exists public.as_actions (
  id uuid primary key, action_key text not null unique,
  event_id uuid not null references public.as_events(id) on delete cascade,
  community_id text not null references public.as_communities(id) on delete cascade,
  type text not null, status text not null, actor text not null,
  detail text, confirmation_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists as_actions_event on public.as_actions(event_id);
create table if not exists public.as_audit_logs (
  id uuid primary key, actor text not null, operation text not null,
  event_id uuid, community_id text, result text,
  created_at timestamptz not null default now()
);
alter table public.as_communities enable row level security;
alter table public.as_members enable row level security;
alter table public.as_events enable row level security;
alter table public.as_actions enable row level security;
alter table public.as_audit_logs enable row level security;
-- Only trusted backend service-role access. Never expose the service-role key to browsers.
revoke all on public.as_communities, public.as_members, public.as_events,
  public.as_actions, public.as_audit_logs from anon, authenticated;
