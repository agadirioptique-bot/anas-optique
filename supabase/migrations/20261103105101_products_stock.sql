-- OPTICOR — products & stock, by category (SPEC §5.2).
-- Lenses (verres) are not a product type: never stocked.

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label_fr text not null,
  label_en text not null,
  is_frame boolean not null default false,
  sort int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.product_types enable row level security;

-- Orders snapshot the sale price, so changing it only affects new orders.
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.product_types (id),
  name text not null check (btrim(name) <> ''),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  sort int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_categories_name_key unique (product_type_id, name)
);
alter table public.product_categories enable row level security;

-- No row = no low-stock alert.
create table public.category_thresholds (
  store_id uuid not null references public.stores (id),
  category_id uuid not null references public.product_categories (id),
  low_stock_min int not null default 0 check (low_stock_min >= 0),
  primary key (store_id, category_id)
);
alter table public.category_thresholds enable row level security;

-- The only source of stock quantities (see view stock_levels).
-- "Never negative" is enforced with row locks inside the phase-4 RPCs.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  category_id uuid not null references public.product_categories (id),
  qty_delta int not null check (qty_delta <> 0),
  kind public.stock_movement_kind not null,
  ref_table text,
  ref_id uuid,
  reason text,
  reason_id uuid references public.settings_list_items (id),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint stock_movements_sign check (
    case kind
      when 'purchase' then qty_delta > 0
      when 'sale_cancel' then qty_delta > 0
      when 'transfer_in' then qty_delta > 0
      when 'sale' then qty_delta < 0
      when 'transfer_out' then qty_delta < 0
      when 'damage' then qty_delta < 0
      else true -- adjustment: either direction
    end
  ),
  constraint stock_movements_ref check ((ref_table is null) = (ref_id is null))
);
alter table public.stock_movements enable row level security;

-- One-step transfers: stock leaves the source and arrives at the destination immediately.
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  from_store_id uuid not null references public.stores (id),
  to_store_id uuid not null references public.stores (id),
  note text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint transfers_distinct_stores check (from_store_id <> to_store_id)
);
alter table public.transfers enable row level security;

create table public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers (id),
  category_id uuid not null references public.product_categories (id),
  qty int not null check (qty > 0),
  created_at timestamptz not null default now(),
  constraint transfer_lines_category_key unique (transfer_id, category_id)
);
alter table public.transfer_lines enable row level security;
