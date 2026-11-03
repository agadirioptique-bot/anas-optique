-- OPTICOR — Charges page support (SPEC §5.4, §8, phase 9).

-- ---------------------------------------------------------------------------
-- Write rules. The super admin writes charges directly (config-like table),
-- but only the business columns: status / approval come from approve_charge,
-- source columns from the supplier-payment trigger and the recurring job,
-- audit columns from the trigger below.
-- ---------------------------------------------------------------------------
revoke insert, update on public.charges from authenticated;
grant insert (amount, charge_date, category_id, location_id, reason, order_id) on public.charges to authenticated;
grant update (amount, charge_date, category_id, location_id, reason, order_id, is_deleted) on public.charges to authenticated;

revoke insert, update on public.recurring_charges from authenticated;
grant insert (label, amount, category_id, location_id, day_of_month, is_active) on public.recurring_charges to authenticated;
grant update (label, amount, category_id, location_id, day_of_month, is_active) on public.recurring_charges to authenticated;

-- An active charge category (never the supplier one, reserved for supplier
-- payments) and an active charge location, else OPTICOR:INVALID_INPUT.
create function private.check_charge_target(p_category_id uuid, p_location_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.check_list_item(p_category_id, 'charge_categories');
  if exists (select 1 from public.settings_list_items where id = p_category_id and code = 'supplier_purchase')
     or not exists (select 1 from public.charge_locations where id = p_location_id and not is_archived) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
end;
$$;

revoke execute on function private.check_charge_target(uuid, uuid) from public, anon, authenticated;

create function private.charges_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Manual charges only: supplier and recurring rows come from trusted code
    -- (a category archived later must not stop the monthly job).
    if new.supplier_payment_id is null and new.recurring_charge_id is null then
      perform private.check_charge_target(new.category_id, new.location_id);
    end if;
    if new.status = 'approved' and new.approved_by is null then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  else
    if new.category_id is distinct from old.category_id or new.location_id is distinct from old.location_id then
      perform private.check_charge_target(new.category_id, new.location_id);
    end if;
    if new.is_deleted and not old.is_deleted then
      new.deleted_by := auth.uid();
      new.deleted_at := now();
    elsif not new.is_deleted and old.is_deleted then
      new.deleted_by := null;
      new.deleted_at := null;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger charges_before_write
  before insert or update on public.charges
  for each row execute function private.charges_before_write();

create function private.recurring_charges_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id or new.location_id is distinct from old.location_id then
    perform private.check_charge_target(new.category_id, new.location_id);
  end if;
  return new;
end;
$$;

create trigger recurring_charges_before_write
  before insert or update on public.recurring_charges
  for each row execute function private.recurring_charges_before_write();

revoke execute on function private.charges_before_write(), private.recurring_charges_before_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ledger rows with labels, order number and source (super admin only, RLS).
-- ---------------------------------------------------------------------------
create view public.charge_overview
with (security_invoker = true)
as
select
  c.id,
  c.amount,
  c.charge_date,
  c.category_id,
  cat.label_fr as category_label_fr,
  cat.label_en as category_label_en,
  cat.code as category_code,
  c.location_id,
  loc.label_fr as location_label_fr,
  loc.label_en as location_label_en,
  c.reason,
  c.order_id,
  n.display_number as order_display_number,
  c.status,
  c.approved_by,
  c.approved_at,
  case
    when c.supplier_payment_id is not null then 'supplier'
    when c.recurring_charge_id is not null then 'recurring'
    else 'manual'
  end as source,
  c.supplier_payment_id,
  sp.purchase_id,
  c.recurring_charge_id,
  r.label as recurring_label,
  c.is_deleted,
  c.deleted_by,
  c.deleted_at,
  c.created_by,
  c.created_at,
  c.updated_at
from public.charges c
join public.settings_list_items cat on cat.id = c.category_id
join public.charge_locations loc on loc.id = c.location_id
left join public.order_numbers n on n.order_id = c.order_id
left join public.supplier_payments sp on sp.id = c.supplier_payment_id
left join public.recurring_charges r on r.id = c.recurring_charge_id;

revoke all on public.charge_overview from anon, authenticated;
grant select on public.charge_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Totals for the page filters, summed in SQL. Deleted charges never count;
-- only approved ones count in NET (dashboard).
-- ---------------------------------------------------------------------------
create function public.charge_totals(
  p_from date,
  p_to date,
  p_location_id uuid default null,
  p_category_id uuid default null
)
returns table (approved_total numeric, pending_total numeric, approved_count int, pending_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(c.amount) filter (where c.status = 'approved'), 0)::numeric(12,2),
    coalesce(sum(c.amount) filter (where c.status = 'pending'), 0)::numeric(12,2),
    (count(*) filter (where c.status = 'approved'))::int,
    (count(*) filter (where c.status = 'pending'))::int
  from public.charges c
  where not c.is_deleted
    and c.charge_date between p_from and p_to
    and (p_location_id is null or c.location_id = p_location_id)
    and (p_category_id is null or c.category_id = p_category_id);
$$;

revoke execute on function public.charge_totals(date, date, uuid, uuid) from public, anon;
grant execute on function public.charge_totals(date, date, uuid, uuid) to authenticated;
