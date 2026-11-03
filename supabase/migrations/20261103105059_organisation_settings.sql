-- OPTICOR — organisation & settings (SPEC §5.1).
-- RLS is enabled on every table with no policy (deny all); policies come in phase 4.

-- Stores and the lab. Deactivate, never delete.
-- Prefix lock once orders exist + charge location auto-create: triggers in phase 4.
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  kind public.store_kind not null default 'store',
  prefix text not null unique check (prefix ~ '^[A-Z]{2,5}$'),
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.stores enable row level security;

-- 1:1 with auth.users. A secretary belongs to exactly one store (kind = 'store',
-- checked by trigger in phase 4).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.app_role not null default 'secretary',
  store_id uuid references public.stores (id),
  is_active boolean not null default true,
  locale public.app_locale not null default 'fr',
  created_at timestamptz not null default now(),
  constraint profiles_secretary_has_store check (role <> 'secretary' or store_id is not null)
);
alter table public.profiles enable row level security;

-- Permission matrix. `role` stays text so custom roles can be added later.
create table public.role_permissions (
  role text not null,
  permission text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  primary key (role, permission)
);
alter table public.role_permissions enable row level security;

create table public.app_settings (
  key text primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;

-- Every editable dropdown. Archived items stay referenced by old rows.
-- `code` is a stable, label-independent key (used by triggers and future imports).
create table public.settings_list_items (
  id uuid primary key default gen_random_uuid(),
  list_key text not null check (list_key in (
    'lens_types', 'treatments', 'payment_methods', 'charge_categories',
    'cancel_reasons', 'adjustment_reasons', 'vision_types'
  )),
  code text check (code ~ '^[a-z0-9_]+$'),
  label_fr text not null check (btrim(label_fr) <> ''),
  label_en text not null check (btrim(label_en) <> ''),
  sort int not null default 0,
  is_archived boolean not null default false,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint settings_list_items_code_key unique (list_key, code)
);
alter table public.settings_list_items enable row level security;

-- Custom order fields + visibility of the built-in measurement fields.
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label_fr text not null,
  label_en text not null,
  field_type public.custom_field_type not null default 'text',
  options jsonb not null default '[]',
  visibility public.field_visibility not null default 'optional',
  applies_to text not null default 'order' check (applies_to = 'order'),
  is_builtin boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.custom_fields enable row level security;

-- Charge locations: one per store/lab (auto-created in phase 4) + 'Général'.
create table public.charge_locations (
  id uuid primary key default gen_random_uuid(),
  label_fr text not null,
  label_en text not null,
  store_id uuid unique references public.stores (id),
  is_general boolean not null default false,
  is_archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint charge_locations_general_has_no_store check (not (is_general and store_id is not null))
);
alter table public.charge_locations enable row level security;

create unique index charge_locations_single_general on public.charge_locations (is_general)
  where is_general;
