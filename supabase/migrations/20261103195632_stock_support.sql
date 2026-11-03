-- OPTICOR — Stock page support (SPEC §8, phase 7). Quantities only, never money.

-- ---------------------------------------------------------------------------
-- One row per (location, category) for the Stock table: every active category
-- of an active type (0 included, so a first count can be entered), plus
-- archived ones while they still hold stock. Secretaries: their store only.
-- security_invoker: stock_movements / thresholds RLS apply on top.
-- ---------------------------------------------------------------------------
create view public.stock_overview
with (security_invoker = true)
as
select
  s.id as store_id,
  c.id as category_id,
  c.name as category_name,
  c.sort as category_sort,
  t.id as type_id,
  t.key as type_key,
  t.label_fr as type_label_fr,
  t.label_en as type_label_en,
  t.is_frame,
  t.sort as type_sort,
  coalesce(l.quantity, 0) as quantity,
  th.low_stock_min,
  (c.is_archived or t.is_archived) as is_archived
from public.stores s
cross join public.product_categories c
join public.product_types t on t.id = c.product_type_id
left join public.stock_levels l on l.store_id = s.id and l.category_id = c.id
left join public.category_thresholds th on th.store_id = s.id and th.category_id = c.id
where s.is_active
  and ((select public.is_super_admin()) or s.id = (select public.auth_store_id()))
  and ((not c.is_archived and not t.is_archived) or coalesce(l.quantity, 0) <> 0);

-- ---------------------------------------------------------------------------
-- Movement history with the running balance after each movement. Filter on
-- (store_id, category_id): both are partition keys, so the filter is applied
-- before the window. Transfer counterpart: super admin only (transfers RLS).
-- ---------------------------------------------------------------------------
create view public.stock_movement_history
with (security_invoker = true)
as
select
  m.id,
  m.store_id,
  m.category_id,
  m.qty_delta,
  m.kind,
  m.ref_table,
  m.ref_id,
  m.reason,
  m.reason_id,
  r.label_fr as reason_label_fr,
  r.label_en as reason_label_en,
  m.created_by,
  m.created_at,
  sum(m.qty_delta) over (
    partition by m.store_id, m.category_id order by m.created_at, m.id
  )::int as balance_after,
  n.display_number as order_display_number,
  ts.name as transfer_store_name
from public.stock_movements m
left join public.settings_list_items r on r.id = m.reason_id
left join public.order_numbers n on m.ref_table = 'orders' and n.order_id = m.ref_id
left join public.transfers tr on m.ref_table = 'transfers' and tr.id = m.ref_id
left join public.stores ts on ts.id = case
  when m.kind = 'transfer_out' then tr.to_store_id
  when m.kind = 'transfer_in' then tr.from_store_id
end;

revoke all on public.stock_overview, public.stock_movement_history from anon, authenticated;
grant select on public.stock_overview, public.stock_movement_history to authenticated;

-- ---------------------------------------------------------------------------
-- Defence in depth: whatever function inserts a movement, a level can never
-- end below zero. The RPCs already lock (store, category) and check first.
-- ---------------------------------------------------------------------------
create function private.stock_movements_not_negative()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.stock_qty(new.store_id, new.category_id) < 0 then
    raise exception 'OPTICOR:NO_STOCK';
  end if;
  return null;
end;
$$;

revoke execute on function private.stock_movements_not_negative() from public, anon, authenticated;

create trigger stock_movements_not_negative
  after insert on public.stock_movements
  for each row
  when (new.qty_delta < 0)
  execute function private.stock_movements_not_negative();
