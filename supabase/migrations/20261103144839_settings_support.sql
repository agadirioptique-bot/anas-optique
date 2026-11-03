-- OPTICOR — Settings pages support (SPEC §8, phase 5).

-- One lab only (SPEC §1).
create unique index stores_single_lab on public.stores (kind) where kind = 'lab';

-- ---------------------------------------------------------------------------
-- Usage counts (security_invoker: only the super admin sees real numbers).
-- ---------------------------------------------------------------------------

-- How many rows use each list item ("utilisé dans N commandes").
create view public.settings_list_usage
with (security_invoker = true)
as
select
  i.id as item_id,
  (case i.list_key
     when 'lens_types' then (select count(*) from public.orders o where o.lens_type_id = i.id)
     when 'vision_types' then (select count(*) from public.orders o where o.vision_type_id = i.id)
     when 'cancel_reasons' then (select count(*) from public.orders o where o.cancel_reason_id = i.id)
     when 'treatments' then (select count(*) from public.order_treatments t where t.treatment_id = i.id)
     when 'payment_methods' then
       (select count(*) from public.payments p where p.method_id = i.id)
       + (select count(*) from public.supplier_payments s where s.method_id = i.id)
     when 'charge_categories' then
       (select count(*) from public.charges c where c.category_id = i.id)
       + (select count(*) from public.recurring_charges r where r.category_id = i.id)
     when 'adjustment_reasons' then (select count(*) from public.stock_movements m where m.reason_id = i.id)
     else 0
   end)::int as uses
from public.settings_list_items i;

-- Orders that filled each custom field.
create view public.custom_field_usage
with (security_invoker = true)
as
select
  f.id as field_id,
  (select count(*) from public.orders o where o.custom_values ? f.key)::int as orders
from public.custom_fields f;

-- Orders and active secretaries per store/lab (prefix lock badge, deactivate warning).
create view public.store_usage
with (security_invoker = true)
as
select
  s.id as store_id,
  (select count(*) from public.orders o where o.store_id = s.id)::int as orders,
  (select count(*) from public.profiles p where p.store_id = s.id and p.role = 'secretary' and p.is_active)::int as secretaries
from public.stores s;

-- Clients per number of delivered orders (loyalty threshold preview).
create view public.client_delivery_counts
with (security_invoker = true)
as
select d.delivered, count(*)::int as clients
from (
  select c.id, count(o.id)::int as delivered
    from public.clients c
    left join public.orders o on o.client_id = c.id and o.status = 'delivered'
   group by c.id
) d
group by d.delivered;

-- ---------------------------------------------------------------------------
-- Drag-to-sort: sort = position in p_ids, one transaction. Security invoker:
-- the update goes through RLS (super admin only).
-- ---------------------------------------------------------------------------
create function public.reorder_rows(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;
  if p_table not in ('settings_list_items', 'custom_fields', 'product_types', 'product_categories', 'charge_locations') then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  execute format(
    'update public.%I t set sort = x.pos from unnest($1) with ordinality as x(id, pos) where t.id = x.id',
    p_table
  ) using p_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- Loyalty threshold (decided in phase 5): clients who already have enough
-- delivered orders become loyal immediately; one summary notification.
-- ---------------------------------------------------------------------------
create function public.set_loyalty_threshold(p_orders int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform private.require_super_admin();
  if p_orders is null or p_orders < 1 or p_orders > 100 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;

  insert into public.app_settings (key, value)
  values ('loyalty_threshold', jsonb_build_object('orders', p_orders))
  on conflict (key) do update set value = excluded.value;

  update public.clients c
     set is_loyal = true, loyal_since = now()
   where not c.is_loyal
     and (select count(*) from public.orders o where o.client_id = c.id and o.status = 'delivered') >= p_orders;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform private.notify_users(
      private.super_admin_ids(),
      'clients_became_loyal',
      'clients_became_loyal',
      jsonb_build_object('count', v_count, 'threshold', p_orders),
      '/clients'
    );
  end if;
  return v_count;
end;
$$;

revoke execute on function public.reorder_rows(text, uuid[]) from public, anon;
revoke execute on function public.set_loyalty_threshold(int) from public, anon;
grant execute on function public.reorder_rows(text, uuid[]) to authenticated;
grant execute on function public.set_loyalty_threshold(int) to authenticated;
