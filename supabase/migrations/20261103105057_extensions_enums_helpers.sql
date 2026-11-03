-- OPTICOR — extensions, enums and generic helpers (SPEC §2, §5).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.store_kind as enum ('store', 'lab');
create type public.app_role as enum ('super_admin', 'secretary');
create type public.app_locale as enum ('fr', 'en');

create type public.order_status as enum (
  'confirmed', 'in_workshop', 'prepared', 'in_store', 'delivered', 'cancelled'
);
create type public.order_source as enum ('app', 'legacy');
create type public.discount_type as enum ('percent', 'amount');
create type public.discount_source as enum ('none', 'client_pending', 'admin_free');

create type public.stock_movement_kind as enum (
  'purchase', 'sale', 'sale_cancel', 'transfer_out', 'transfer_in', 'damage', 'adjustment'
);
create type public.payment_kind as enum ('deposit', 'balance', 'refund');
create type public.purchase_line_kind as enum ('stock', 'lens');
create type public.charge_status as enum ('approved', 'pending');

create type public.custom_field_type as enum ('text', 'number', 'select', 'date');
create type public.field_visibility as enum ('hidden', 'optional', 'required');
create type public.audit_action as enum ('insert', 'update', 'delete');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Generic "touch updated_at" trigger.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Business day = calendar date in Africa/Casablanca.
create function public.business_date(ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (ts at time zone 'Africa/Casablanca')::date;
$$;

-- Display number of an order slip: 'CNT-00832', 'CNT-B-00001'.
-- Never truncates a slip number longer than the padding.
create function public.format_order_number(
  prefix text,
  booklet text,
  slip_number int,
  digits int
)
returns text
language sql
immutable
set search_path = ''
as $$
  select prefix || '-'
    || case when coalesce(booklet, '') <> '' then booklet || '-' else '' end
    || case
         when length(slip_number::text) >= digits then slip_number::text
         else lpad(slip_number::text, digits, '0')
       end;
$$;
