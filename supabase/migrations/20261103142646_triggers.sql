-- OPTICOR — triggers (SPEC §6 "Triggers", §5.5 audit, §10 notifications).
-- Trigger functions live in `private` and are security definer: they write
-- tables the calling user has no write policy on (audit_log, notifications…).

-- ---------------------------------------------------------------------------
-- Stores: prefix immutable once used; one charge location per store/lab.
-- ---------------------------------------------------------------------------
create function private.stores_prefix_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prefix is distinct from old.prefix
     and exists (select 1 from public.orders where store_id = old.id) then
    raise exception 'OPTICOR:PREFIX_LOCKED';
  end if;
  return new;
end;
$$;

create trigger stores_prefix_lock
  before update of prefix on public.stores
  for each row execute function private.stores_prefix_lock();

create function private.stores_create_charge_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.charge_locations (label_fr, label_en, store_id, sort)
  values (new.name, new.name, new.id, (select coalesce(max(sort), 0) + 1 from public.charge_locations))
  on conflict (store_id) do nothing;
  return null;
end;
$$;

create trigger stores_create_charge_location
  after insert on public.stores
  for each row execute function private.stores_create_charge_location();

-- Stores created before this trigger existed.
insert into public.charge_locations (label_fr, label_en, store_id, sort)
select s.name, s.name, s.id, row_number() over (order by s.kind, s.name)
  from public.stores s
on conflict (store_id) do nothing;

-- ---------------------------------------------------------------------------
-- Orders belong to an active store, never the lab.
-- ---------------------------------------------------------------------------
create function private.orders_check_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.stores where id = new.store_id and kind = 'store' and is_active
  ) then
    raise exception 'OPTICOR:ORDER_STORE_INVALID';
  end if;
  return new;
end;
$$;

create trigger orders_check_store
  before insert or update of store_id on public.orders
  for each row execute function private.orders_check_store();

-- ---------------------------------------------------------------------------
-- At most one frame per order (qty 1), none when the client brings their own.
-- ---------------------------------------------------------------------------
create function private.order_items_frame_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.product_categories c
      join public.product_types t on t.id = c.product_type_id
     where c.id = new.category_id and t.is_frame
  ) then
    if new.qty <> 1
       or (select client_own_frame from public.orders where id = new.order_id)
       or exists (
         select 1
           from public.order_items i
           join public.product_categories c on c.id = i.category_id
           join public.product_types t on t.id = c.product_type_id
          where i.order_id = new.order_id and t.is_frame and i.id <> new.id
       ) then
      raise exception 'OPTICOR:FRAME_RULE';
    end if;
  end if;
  return new;
end;
$$;

create trigger order_items_frame_rule
  before insert or update of category_id, qty on public.order_items
  for each row execute function private.order_items_frame_rule();

-- ---------------------------------------------------------------------------
-- Loyalty: when an order is delivered, count the client's delivered orders
-- across all stores; at the threshold the client becomes loyal (once).
-- ---------------------------------------------------------------------------
create function private.orders_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold int := coalesce((private.setting('loyalty_threshold') ->> 'orders')::int, 5);
  v_count int;
  v_name text;
begin
  select count(*) into v_count
    from public.orders
   where client_id = new.client_id and status = 'delivered';

  if v_count >= v_threshold then
    update public.clients
       set is_loyal = true, loyal_since = now()
     where id = new.client_id and not is_loyal
    returning full_name into v_name;

    if v_name is not null then
      perform private.notify_users(
        private.super_admin_ids() || private.store_user_ids(new.store_id),
        'client_became_loyal',
        'client_became_loyal',
        jsonb_build_object('client_id', new.client_id, 'client_name', v_name, 'orders', v_count),
        '/clients/' || new.client_id,
        'client_became_loyal:' || new.client_id
      );
    end if;
  end if;
  return null;
end;
$$;

create trigger orders_loyalty
  after update of status on public.orders
  for each row
  when (new.status = 'delivered' and old.status is distinct from 'delivered')
  execute function private.orders_loyalty();

-- ---------------------------------------------------------------------------
-- Low stock: notify when a movement takes the level down to ≤ low_stock_min.
-- No threshold row = no alert.
-- ---------------------------------------------------------------------------
create function private.stock_movements_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min int;
  v_after int;
begin
  select low_stock_min into v_min
    from public.category_thresholds
   where store_id = new.store_id and category_id = new.category_id;
  if v_min is null then
    return null;
  end if;

  v_after := private.stock_qty(new.store_id, new.category_id);
  if v_after - new.qty_delta > v_min and v_after <= v_min then
    perform private.notify_users(
      private.super_admin_ids() || private.store_user_ids(new.store_id),
      'low_stock',
      'low_stock',
      jsonb_build_object(
        'store_id', new.store_id,
        'store_name', (select name from public.stores where id = new.store_id),
        'category_id', new.category_id,
        'category_name', (select name from public.product_categories where id = new.category_id),
        'quantity', v_after,
        'min', v_min
      ),
      '/stock',
      'low_stock:' || new.id
    );
  end if;
  return null;
end;
$$;

create trigger stock_movements_low_stock
  after insert on public.stock_movements
  for each row
  when (new.qty_delta < 0)
  execute function private.stock_movements_low_stock();

-- ---------------------------------------------------------------------------
-- Supplier payment → exactly one approved charge (read-only on the Charges page).
-- ---------------------------------------------------------------------------
create function private.supplier_payments_create_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_supplier text;
  v_category_id uuid;
  v_location_id uuid;
begin
  select p.receive_store_id, s.name
    into v_store_id, v_supplier
    from public.purchases p
    join public.suppliers s on s.id = p.supplier_id
   where p.id = new.purchase_id;

  select id into v_category_id
    from public.settings_list_items
   where list_key = 'charge_categories' and code = 'supplier_purchase';
  select id into v_location_id from public.charge_locations where store_id = v_store_id;

  if v_category_id is null or v_location_id is null then
    raise exception 'OPTICOR:CONFIG_MISSING';
  end if;

  insert into public.charges (
    amount, charge_date, category_id, location_id, reason, status,
    approved_by, approved_at, supplier_payment_id, created_by
  ) values (
    new.amount, new.paid_at, v_category_id, v_location_id, 'Paiement fournisseur — ' || v_supplier, 'approved',
    new.created_by, now(), new.id, new.created_by
  );
  return null;
end;
$$;

create trigger supplier_payments_create_charge
  after insert on public.supplier_payments
  for each row execute function private.supplier_payments_create_charge();

create function private.charges_supplier_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'OPTICOR:CHARGE_READ_ONLY';
end;
$$;

create trigger charges_supplier_read_only
  before update or delete on public.charges
  for each row
  when (old.supplier_payment_id is not null)
  execute function private.charges_supplier_read_only();

-- ---------------------------------------------------------------------------
-- Audit log (SPEC §5.5)
-- ---------------------------------------------------------------------------
create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;
  insert into public.audit_log (table_name, row_id, action, old, new, actor)
  values (
    tg_table_name,
    (coalesce(v_new, v_old) ->> 'id')::uuid,
    lower(tg_op)::public.audit_action,
    v_old,
    v_new,
    auth.uid()
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'orders', 'payments', 'charges', 'purchases', 'purchase_lines', 'supplier_payments', 'stock_movements'
  ] loop
    execute format(
      'create trigger %1$s_audit after insert or update or delete on public.%1$I
         for each row execute function private.audit_row()', t);
  end loop;
end;
$$;

create trigger product_categories_price_audit
  after update on public.product_categories
  for each row
  when (old.sale_price is distinct from new.sale_price)
  execute function private.audit_row();

create trigger clients_discount_audit
  after update on public.clients
  for each row
  when (
    old.pending_discount_type is distinct from new.pending_discount_type
    or old.pending_discount_value is distinct from new.pending_discount_value
    or old.pending_discount_note is distinct from new.pending_discount_note
    or old.is_loyal is distinct from new.is_loyal
  )
  execute function private.audit_row();

revoke execute on all functions in schema private from public, anon, authenticated;
