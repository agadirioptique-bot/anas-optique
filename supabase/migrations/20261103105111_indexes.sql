-- OPTICOR — indexes on every foreign key not already led by a PK/unique index,
-- plus the columns used by filters, KPIs and search.

-- organisation & settings
create index profiles_store_id_idx on public.profiles (store_id);
create index settings_list_items_list_sort_idx on public.settings_list_items (list_key, sort);

-- products & stock
create index category_thresholds_category_id_idx on public.category_thresholds (category_id);
create index stock_movements_store_category_idx on public.stock_movements (store_id, category_id);
create index stock_movements_category_id_idx on public.stock_movements (category_id);
create index stock_movements_reason_id_idx on public.stock_movements (reason_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);
create index stock_movements_kind_created_at_idx on public.stock_movements (kind, created_at);
create index transfers_from_store_id_idx on public.transfers (from_store_id);
create index transfers_to_store_id_idx on public.transfers (to_store_id);
create index transfers_created_by_idx on public.transfers (created_by);
create index transfer_lines_category_id_idx on public.transfer_lines (category_id);

-- clients
create index clients_first_store_id_idx on public.clients (first_store_id);
create index clients_pending_discount_set_by_idx on public.clients (pending_discount_set_by);
create index clients_created_by_idx on public.clients (created_by);
create index clients_full_name_trgm_idx on public.clients using gin (full_name extensions.gin_trgm_ops);
create index clients_phone_trgm_idx on public.clients using gin (phone_e164 extensions.gin_trgm_ops);

-- orders (store_id is led by orders_slip_key)
create index orders_client_id_idx on public.orders (client_id);
create index orders_store_status_idx on public.orders (store_id, status);
create index orders_status_idx on public.orders (status);
create index orders_created_at_idx on public.orders (created_at);
create index orders_store_created_at_idx on public.orders (store_id, created_at);
create index orders_vision_type_id_idx on public.orders (vision_type_id);
create index orders_lens_type_id_idx on public.orders (lens_type_id);
create index orders_cancelled_by_idx on public.orders (cancelled_by);
create index orders_cancel_reason_id_idx on public.orders (cancel_reason_id);
create index orders_created_by_idx on public.orders (created_by);
create index orders_slip_number_idx on public.orders (slip_number);
create index order_items_category_id_idx on public.order_items (category_id);
create index order_treatments_treatment_id_idx on public.order_treatments (treatment_id);
create index order_status_history_order_changed_idx on public.order_status_history (order_id, changed_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index payments_order_id_idx on public.payments (order_id);
create index payments_method_id_idx on public.payments (method_id);
create index payments_received_by_idx on public.payments (received_by);
create index payments_received_at_idx on public.payments (received_at);

-- purchasing & charges
create index suppliers_created_by_idx on public.suppliers (created_by);
create index purchases_supplier_id_idx on public.purchases (supplier_id);
create index purchases_receive_store_id_idx on public.purchases (receive_store_id);
create index purchases_created_by_idx on public.purchases (created_by);
create index purchases_purchase_date_idx on public.purchases (purchase_date);
create index purchase_lines_purchase_id_idx on public.purchase_lines (purchase_id);
create index purchase_lines_category_id_idx on public.purchase_lines (category_id);
create index supplier_payments_purchase_id_idx on public.supplier_payments (purchase_id);
create index supplier_payments_method_id_idx on public.supplier_payments (method_id);
create index supplier_payments_created_by_idx on public.supplier_payments (created_by);
create index recurring_charges_category_id_idx on public.recurring_charges (category_id);
create index recurring_charges_location_id_idx on public.recurring_charges (location_id);
create index recurring_charges_created_by_idx on public.recurring_charges (created_by);
create index charges_category_id_idx on public.charges (category_id);
create index charges_location_id_idx on public.charges (location_id);
create index charges_order_id_idx on public.charges (order_id);
create index charges_recurring_charge_id_idx on public.charges (recurring_charge_id);
create index charges_approved_by_idx on public.charges (approved_by);
create index charges_deleted_by_idx on public.charges (deleted_by);
create index charges_created_by_idx on public.charges (created_by);
create index charges_charge_date_idx on public.charges (charge_date);
create index charges_pending_idx on public.charges (status) where status = 'pending';

-- audit & notifications (notifications.user_id is led by notifications_dedupe_key)
create index audit_log_row_idx on public.audit_log (table_name, row_id);
create index audit_log_actor_idx on public.audit_log (actor);
create index audit_log_at_idx on public.audit_log (at);
create index notifications_user_created_at_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
