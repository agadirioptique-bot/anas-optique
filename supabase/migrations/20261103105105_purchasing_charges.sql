-- OPTICOR — purchasing, suppliers, charges (SPEC §5.4).
-- Secretaries never see any of these tables (policies in phase 4).

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  phone text,
  note text,
  is_archived boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.suppliers enable row level security;

-- Saving a purchase = goods received (no draft/ordered statuses in v1).
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  receive_store_id uuid not null references public.stores (id),
  supplier_ref text,
  purchase_date date not null default public.business_date(now()),
  note text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id),
  line_kind public.purchase_line_kind not null,
  category_id uuid references public.product_categories (id),
  description text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  qty int not null default 1 check (qty > 0),
  line_total numeric(12,2) generated always as (unit_price * qty) stored,
  created_at timestamptz not null default now(),
  constraint purchase_lines_kind_fields check (
    case line_kind
      when 'stock' then category_id is not null
      else category_id is null and btrim(coalesce(description, '')) <> ''
    end
  )
);
alter table public.purchase_lines enable row level security;

-- Each insert creates exactly one approved charge (trigger in phase 4).
-- "≤ remaining balance" is checked in add_supplier_payment / create_purchase.
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default public.business_date(now()),
  method_id uuid not null references public.settings_list_items (id),
  note text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.supplier_payments enable row level security;

create table public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  label text not null check (btrim(label) <> ''),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.settings_list_items (id),
  location_id uuid not null references public.charge_locations (id),
  day_of_month int not null check (day_of_month between 1 and 28),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
alter table public.recurring_charges enable row level security;

-- Only approved, non-deleted charges count in NET. Soft delete only.
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  charge_date date not null default public.business_date(now()),
  category_id uuid not null references public.settings_list_items (id),
  location_id uuid not null references public.charge_locations (id),
  reason text not null check (btrim(reason) <> ''),
  order_id uuid references public.orders (id),
  status public.charge_status not null default 'approved',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  supplier_payment_id uuid unique references public.supplier_payments (id),
  recurring_charge_id uuid references public.recurring_charges (id),
  is_deleted boolean not null default false,
  deleted_by uuid references public.profiles (id),
  deleted_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charges_deleted check (is_deleted = (deleted_at is not null)),
  constraint charges_single_source check (supplier_payment_id is null or recurring_charge_id is null)
);
alter table public.charges enable row level security;

create trigger charges_set_updated_at
  before update on public.charges
  for each row execute function public.set_updated_at();

-- generate_recurring_charges() is idempotent: one charge per recurring charge and month.
create unique index charges_recurring_month_key
  on public.charges (recurring_charge_id, date_trunc('month', charge_date::timestamp))
  where recurring_charge_id is not null;
