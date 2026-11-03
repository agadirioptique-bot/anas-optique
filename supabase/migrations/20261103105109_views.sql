-- OPTICOR — read views. All security_invoker so the caller's RLS on base tables applies.

-- Stock quantity per location and category = sum of movements.
create view public.stock_levels
with (security_invoker = true)
as
select
  m.store_id,
  m.category_id,
  sum(m.qty_delta)::int as quantity
from public.stock_movements m
group by m.store_id, m.category_id;

-- Supplier balance per purchase.
create view public.purchase_balances
with (security_invoker = true)
as
select
  p.id as purchase_id,
  p.supplier_id,
  coalesce(l.total, 0)::numeric(12,2) as total,
  coalesce(sp.paid, 0)::numeric(12,2) as paid,
  (coalesce(l.total, 0) - coalesce(sp.paid, 0))::numeric(12,2) as remaining
from public.purchases p
left join (
  select purchase_id, sum(line_total) as total
  from public.purchase_lines
  group by purchase_id
) l on l.purchase_id = p.id
left join (
  select purchase_id, sum(amount) as paid
  from public.supplier_payments
  group by purchase_id
) sp on sp.purchase_id = p.id;

-- Display number 'CNT-00832' / 'CNT-B-00001' (padding from app_settings, default 5).
create view public.order_numbers
with (security_invoker = true)
as
select
  o.id as order_id,
  o.store_id,
  public.format_order_number(s.prefix, o.booklet, o.slip_number, pad.digits) as display_number
from public.orders o
join public.stores s on s.id = o.store_id
cross join (
  select coalesce(
    (select (a.value ->> 'digits')::int from public.app_settings a where a.key = 'slip_number_padding'),
    5
  ) as digits
) pad;

-- Amount paid and remaining balance per order (refunds are negative payments).
create view public.order_balances
with (security_invoker = true)
as
select
  o.id as order_id,
  o.store_id,
  o.status,
  o.total,
  coalesce(p.paid, 0)::numeric(12,2) as paid,
  (o.total - coalesce(p.paid, 0))::numeric(12,2) as balance
from public.orders o
left join (
  select order_id, sum(amount) as paid
  from public.payments
  group by order_id
) p on p.order_id = o.id;
