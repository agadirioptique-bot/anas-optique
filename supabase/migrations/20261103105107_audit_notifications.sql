-- OPTICOR — audit log & notifications (SPEC §5.5, §10).
-- Audit triggers and notification fan-out helpers come in phase 4.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action public.audit_action not null,
  old jsonb,
  new jsonb,
  actor uuid default auth.uid() references public.profiles (id),
  at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

-- One row per recipient. dedupe_key makes "notify once" idempotent
-- (e.g. 'order_stuck:<order_id>:<status>').
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind ~ '^[a-z_]+$'),
  title_key text not null,
  params jsonb not null default '{}',
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe_key unique (user_id, dedupe_key)
);
alter table public.notifications enable row level security;
