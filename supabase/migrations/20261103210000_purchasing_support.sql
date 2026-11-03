-- OPTICOR — Purchasing page support (SPEC §5.4, §8, phase 8).
-- security_invoker: purchases / suppliers RLS keeps both views super-admin only.

-- ---------------------------------------------------------------------------
-- One row per purchase for the list and the detail header. Money summed in SQL
-- (purchase_balances).
-- ---------------------------------------------------------------------------
create view public.purchase_overview
with (security_invoker = true)
as
select
  p.id,
  p.purchase_date,
  p.created_at,
  p.created_by,
  p.supplier_id,
  su.name as supplier_name,
  p.receive_store_id,
  st.name as receive_store_name,
  st.kind as receive_store_kind,
  p.supplier_ref,
  p.note,
  b.total,
  b.paid,
  b.remaining,
  coalesce(l.line_count, 0)::int as line_count,
  coalesce(l.stock_qty, 0)::int as stock_qty
from public.purchases p
join public.suppliers su on su.id = p.supplier_id
join public.stores st on st.id = p.receive_store_id
join public.purchase_balances b on b.purchase_id = p.id
left join (
  select
    purchase_id,
    count(*) as line_count,
    sum(qty) filter (where line_kind = 'stock') as stock_qty
  from public.purchase_lines
  group by purchase_id
) l on l.purchase_id = p.id;

-- ---------------------------------------------------------------------------
-- Balance owed per supplier (archived suppliers included: they may still be owed).
-- ---------------------------------------------------------------------------
create view public.supplier_balances
with (security_invoker = true)
as
select
  s.id as supplier_id,
  count(b.purchase_id)::int as purchases_count,
  coalesce(sum(b.total), 0)::numeric(12,2) as total_bought,
  coalesce(sum(b.paid), 0)::numeric(12,2) as paid,
  coalesce(sum(b.remaining), 0)::numeric(12,2) as owed,
  max(p.purchase_date) as last_purchase_date
from public.suppliers s
left join public.purchases p on p.supplier_id = s.id
left join public.purchase_balances b on b.purchase_id = p.id
group by s.id;

revoke all on public.purchase_overview, public.supplier_balances from anon, authenticated;
grant select on public.purchase_overview, public.supplier_balances to authenticated;

-- Two active suppliers can't share a name (case and spaces ignored); archived ones can.
create unique index suppliers_name_active_key on public.suppliers (lower(btrim(name))) where not is_archived;
