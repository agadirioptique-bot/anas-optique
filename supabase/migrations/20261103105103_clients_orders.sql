-- OPTICOR — clients & orders (SPEC §5.3).

-- A prescription value in diopters: −30..+30, steps of 0.25 (null allowed).
create function public.is_valid_diopter(value numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null or (value between -30 and 30 and mod(value * 4, 1) = 0);
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  has_whatsapp boolean not null default true,
  first_store_id uuid references public.stores (id),
  notes text,
  is_loyal boolean not null default false,
  loyal_since timestamptz,
  -- discount pre-approved by a super admin, consumed by the next order
  pending_discount_type public.discount_type,
  pending_discount_value numeric(12,2),
  pending_discount_note text,
  pending_discount_set_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint clients_loyal_since check (is_loyal = (loyal_since is not null)),
  constraint clients_pending_discount check (
    (pending_discount_type is null and pending_discount_value is null)
    or (
      pending_discount_type is not null
      and pending_discount_value > 0
      and (pending_discount_type <> 'percent' or pending_discount_value <= 100)
    )
  )
);
alter table public.clients enable row level security;

-- store_id must be a kind = 'store' row (trigger in phase 4).
-- Display number comes from view order_numbers, never stored.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  client_id uuid not null references public.clients (id),
  booklet text not null default '' check (booklet ~ '^([A-Z]{1,2})?$'),
  slip_number int not null check (slip_number > 0),
  status public.order_status not null default 'confirmed',
  source public.order_source not null default 'app',

  -- prescription
  re_sph numeric(5,2) check (public.is_valid_diopter(re_sph)),
  re_cyl numeric(5,2) check (public.is_valid_diopter(re_cyl)),
  re_axis int check (re_axis between 0 and 180),
  re_add numeric(5,2) check (public.is_valid_diopter(re_add)),
  le_sph numeric(5,2) check (public.is_valid_diopter(le_sph)),
  le_cyl numeric(5,2) check (public.is_valid_diopter(le_cyl)),
  le_axis int check (le_axis between 0 and 180),
  le_add numeric(5,2) check (public.is_valid_diopter(le_add)),
  ep_re numeric(4,1) check (ep_re > 0),
  ep_le numeric(4,1) check (ep_le > 0),
  fitting_height numeric(4,1) check (fitting_height > 0),
  vision_type_id uuid references public.settings_list_items (id),
  doctor_name text,
  prescription_date date,
  prescription_photo_path text,
  custom_values jsonb not null default '{}' check (jsonb_typeof(custom_values) = 'object'),

  -- lenses: instructions only, no price
  lens_type_id uuid references public.settings_list_items (id),
  lens_details text,

  -- money
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  discount_source public.discount_source not null default 'none',
  total numeric(12,2) generated always as (subtotal - discount_amount) stored,
  frame_revenue numeric(12,2) not null default 0 check (frame_revenue >= 0),
  lens_revenue numeric(12,2) generated always as (subtotal - discount_amount - frame_revenue) stored,
  client_own_frame boolean not null default false,

  -- lifecycle
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancel_reason_id uuid references public.settings_list_items (id),
  cancel_note text,
  delivered_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint orders_slip_key unique (store_id, booklet, slip_number),
  -- a discount never brings the total below the frame/items price (OPTICOR:DISCOUNT_TOO_HIGH)
  constraint orders_lens_revenue_non_negative check (subtotal - discount_amount - frame_revenue >= 0),
  constraint orders_discount_source check ((discount_source = 'none') = (discount_amount = 0)),
  -- axis required when cylinder ≠ 0, otherwise null
  constraint orders_re_axis check ((coalesce(re_cyl, 0) = 0) = (re_axis is null)),
  constraint orders_le_axis check ((coalesce(le_cyl, 0) = 0) = (le_axis is null)),
  constraint orders_cancelled check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint orders_delivered check (status <> 'delivered' or delivered_at is not null)
);
alter table public.orders enable row level security;

-- Frame (max 1 item of a frame type — phase-4 trigger/RPC), contact lenses, accessories.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  category_id uuid not null references public.product_categories (id),
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_category_key unique (order_id, category_id)
);
alter table public.order_items enable row level security;

create table public.order_treatments (
  order_id uuid not null references public.orders (id),
  treatment_id uuid not null references public.settings_list_items (id),
  primary key (order_id, treatment_id)
);
alter table public.order_treatments enable row level security;

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid default auth.uid() references public.profiles (id),
  changed_at timestamptz not null default now(),
  constraint order_status_history_changed check (from_status is distinct from to_status)
);
alter table public.order_status_history enable row level security;

-- Negative amount = refund.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  amount numeric(12,2) not null,
  method_id uuid not null references public.settings_list_items (id),
  kind public.payment_kind not null,
  received_at timestamptz not null default now(),
  received_by uuid default auth.uid() references public.profiles (id),
  constraint payments_sign check (case kind when 'refund' then amount < 0 else amount > 0 end)
);
alter table public.payments enable row level security;
