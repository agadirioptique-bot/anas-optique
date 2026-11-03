-- OPTICOR — Row Level Security for every table (SPEC §7).
-- Default deny; anon gets nothing. Helpers are wrapped in (select …) so they run
-- once per statement. Ledger tables have no write policy at all: they are
-- written only by the security definer RPCs (also for the super admin), so stock
-- and balances cannot be edited around the rules.
-- profiles / stores select policies: see the auth migration.

-- Defence in depth: no table privileges for anon, no TRUNCATE (not covered by RLS).
revoke all on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
create policy stores_insert on public.stores
  for insert to authenticated with check ((select public.is_super_admin()));
create policy stores_update on public.stores
  for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- Reference data: every active user reads, super admin writes.
do $$
declare
  t text;
begin
  foreach t in array array[
    'role_permissions', 'app_settings', 'settings_list_items', 'custom_fields',
    'product_types', 'product_categories'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using ((select public.auth_role()) is not null)', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check ((select public.is_super_admin()))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using ((select public.is_super_admin())) with check ((select public.is_super_admin()))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using ((select public.is_super_admin()))', t);
  end loop;
end;
$$;

-- Thresholds: secretary reads her store's, super admin writes.
create policy category_thresholds_select on public.category_thresholds
  for select to authenticated
  using ((select public.is_super_admin()) or store_id = (select public.auth_store_id()));
create policy category_thresholds_insert on public.category_thresholds
  for insert to authenticated with check ((select public.is_super_admin()));
create policy category_thresholds_update on public.category_thresholds
  for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy category_thresholds_delete on public.category_thresholds
  for delete to authenticated using ((select public.is_super_admin()));

-- Super admin only (secretaries never see costs, suppliers, charges).
do $$
declare
  t text;
begin
  foreach t in array array['charge_locations', 'suppliers', 'recurring_charges'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using ((select public.is_super_admin()))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check ((select public.is_super_admin()))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using ((select public.is_super_admin())) with check ((select public.is_super_admin()))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using ((select public.is_super_admin()))', t);
  end loop;
end;
$$;

-- Charges: soft delete only (no delete policy). Supplier-payment rows are
-- read-only (trigger in the triggers migration).
create policy charges_select on public.charges
  for select to authenticated using ((select public.is_super_admin()));
create policy charges_insert on public.charges
  for insert to authenticated with check ((select public.is_super_admin()));
create policy charges_update on public.charges
  for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Clients: shared by all stores. Secretaries create clients and edit contact
-- fields only; discount and loyalty columns change through RPCs / triggers.
-- ---------------------------------------------------------------------------
revoke insert, update on public.clients from authenticated;
grant insert (full_name, phone_e164, has_whatsapp, notes) on public.clients to authenticated;
grant update (full_name, phone_e164, has_whatsapp, notes) on public.clients to authenticated;

create policy clients_select on public.clients
  for select to authenticated using ((select public.auth_role()) is not null);
create policy clients_insert on public.clients
  for insert to authenticated with check ((select public.auth_role()) is not null);
create policy clients_update on public.clients
  for update to authenticated
  using ((select public.auth_role()) is not null) with check ((select public.auth_role()) is not null);

-- ---------------------------------------------------------------------------
-- Ledgers: read only (writes through RPCs).
-- ---------------------------------------------------------------------------
create policy orders_select on public.orders
  for select to authenticated
  using ((select public.is_super_admin()) or store_id = (select public.auth_store_id()));

create policy payments_select on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = payments.order_id));

create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));

create policy order_treatments_select on public.order_treatments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_treatments.order_id));

create policy order_status_history_select on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using ((select public.is_super_admin()) or store_id = (select public.auth_store_id()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'transfers', 'transfer_lines', 'purchases', 'purchase_lines', 'supplier_payments', 'audit_log'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using ((select public.is_super_admin()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: own rows; the user can only mark them read.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
