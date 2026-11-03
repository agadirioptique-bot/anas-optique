-- OPTICOR — stock, purchasing and charges RPCs, scheduled jobs (SPEC §6).

-- ---------------------------------------------------------------------------
-- Stock (super admin). Quantities only change through movements; removing
-- stock takes the (store, category) lock and never goes below zero.
-- ---------------------------------------------------------------------------

-- An active location (store or lab), else OPTICOR:INVALID_INPUT.
create function private.check_location(p_store_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stores where id = p_store_id and is_active) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
end;
$$;

create function private.check_category(p_category_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.product_categories where id = p_category_id) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

-- One-step transfer: stock leaves the source and arrives at the destination now.
-- p_lines: [{ category_id, qty }]
create function public.create_transfer(p_from_store_id uuid, p_to_store_id uuid, p_lines jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid;
  v_line jsonb;
  v_category_id uuid;
  v_qty int;
begin
  perform private.require_super_admin();
  perform private.check_location(p_from_store_id);
  perform private.check_location(p_to_store_id);
  if p_from_store_id = p_to_store_id or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;

  insert into public.transfers (from_store_id, to_store_id, note)
  values (p_from_store_id, p_to_store_id, nullif(btrim(p_note), ''))
  returning id into v_transfer_id;

  for v_line in select value from jsonb_array_elements(p_lines) order by value ->> 'category_id' loop
    v_category_id := (v_line ->> 'category_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    perform private.check_category(v_category_id);
    if coalesce(v_qty, 0) <= 0 then
      raise exception 'OPTICOR:INVALID_INPUT';
    end if;
    begin
      insert into public.transfer_lines (transfer_id, category_id, qty) values (v_transfer_id, v_category_id, v_qty);
    exception when unique_violation then
      raise exception 'OPTICOR:INVALID_INPUT';
    end;
    perform private.move_stock(p_from_store_id, v_category_id, -v_qty, 'transfer_out', 'transfers', v_transfer_id);
    perform private.move_stock(p_to_store_id, v_category_id, v_qty, 'transfer_in', 'transfers', v_transfer_id);
  end loop;
  return v_transfer_id;
end;
$$;

-- Damaged / broken items: reason required, no charge.
create function public.record_damage(p_store_id uuid, p_category_id uuid, p_qty int, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  perform private.check_location(p_store_id);
  perform private.check_category(p_category_id);
  if coalesce(p_qty, 0) <= 0 or nullif(btrim(p_reason), '') is null then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  perform private.move_stock(p_store_id, p_category_id, -p_qty, 'damage', null, null, btrim(p_reason));
end;
$$;

-- Set the quantity to what was counted: one 'adjustment' movement of the difference.
create function public.adjust_stock(
  p_store_id uuid,
  p_category_id uuid,
  p_counted_qty int,
  p_reason_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current int;
begin
  perform private.require_super_admin();
  perform private.check_location(p_store_id);
  perform private.check_category(p_category_id);
  if p_counted_qty is null or p_counted_qty < 0 or p_reason_id is null then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  perform private.check_list_item(p_reason_id, 'adjustment_reasons');

  perform private.lock_stock(p_store_id, p_category_id);
  v_current := private.stock_qty(p_store_id, p_category_id);
  perform private.move_stock(
    p_store_id, p_category_id, p_counted_qty - v_current, 'adjustment', null, null, nullif(btrim(p_note), ''), p_reason_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchasing (super admin). Saving a purchase = goods received.
-- ---------------------------------------------------------------------------

-- Adds a supplier payment after checking it fits in the remaining balance
-- (purchase row locked). The trigger creates the matching charge.
create function private.add_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_method_id uuid,
  p_note text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_remaining numeric;
  v_id uuid;
begin
  perform 1 from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
  if p_amount is null or p_amount <= 0 or p_method_id is null then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  perform private.check_list_item(p_method_id, 'payment_methods');

  select remaining into v_remaining from public.purchase_balances where purchase_id = p_purchase_id;
  if p_amount > v_remaining then
    raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
  end if;

  insert into public.supplier_payments (purchase_id, amount, paid_at, method_id, note)
  values (p_purchase_id, p_amount, coalesce(p_paid_at, public.business_date(now())), p_method_id, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function private.add_supplier_payment(uuid, numeric, date, uuid, text) from public, anon, authenticated;

-- payload: { supplier_id, receive_store_id, purchase_date, supplier_ref, note,
--   lines: [{ kind: 'stock', category_id, unit_price, qty } | { kind: 'lens', description, amount }],
--   payment: { amount, method_id, paid_at } | null }
create function public.create_purchase(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
  v_store_id uuid := (payload ->> 'receive_store_id')::uuid;
  v_lines jsonb := payload -> 'lines';
  v_line jsonb;
  v_payment jsonb := payload -> 'payment';
begin
  perform private.require_super_admin();
  perform private.check_location(v_store_id);
  if not exists (select 1 from public.suppliers where id = (payload ->> 'supplier_id')::uuid and not is_archived)
     or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;

  insert into public.purchases (supplier_id, receive_store_id, supplier_ref, purchase_date, note)
  values (
    (payload ->> 'supplier_id')::uuid, v_store_id, nullif(btrim(payload ->> 'supplier_ref'), ''),
    coalesce((payload ->> 'purchase_date')::date, public.business_date(now())), nullif(btrim(payload ->> 'note'), '')
  )
  returning id into v_purchase_id;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    begin
      if v_line ->> 'kind' = 'stock' then
        perform private.check_category((v_line ->> 'category_id')::uuid);
        insert into public.purchase_lines (purchase_id, line_kind, category_id, unit_price, qty)
        values (v_purchase_id, 'stock', (v_line ->> 'category_id')::uuid, (v_line ->> 'unit_price')::numeric, (v_line ->> 'qty')::int);
        perform private.move_stock(
          v_store_id, (v_line ->> 'category_id')::uuid, (v_line ->> 'qty')::int, 'purchase', 'purchases', v_purchase_id
        );
      elsif v_line ->> 'kind' = 'lens' then
        insert into public.purchase_lines (purchase_id, line_kind, description, unit_price, qty)
        values (v_purchase_id, 'lens', btrim(v_line ->> 'description'), (v_line ->> 'amount')::numeric, 1);
      else
        raise exception 'OPTICOR:INVALID_INPUT';
      end if;
    exception
      when check_violation or not_null_violation then raise exception 'OPTICOR:INVALID_INPUT';
    end;
  end loop;

  if v_payment is not null and coalesce((v_payment ->> 'amount')::numeric, 0) > 0 then
    perform private.add_supplier_payment(
      v_purchase_id, (v_payment ->> 'amount')::numeric, (v_payment ->> 'paid_at')::date,
      (v_payment ->> 'method_id')::uuid, null
    );
  end if;
  return v_purchase_id;
end;
$$;

create function public.add_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_paid_at date default null,
  p_method_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return private.add_supplier_payment(p_purchase_id, p_amount, p_paid_at, p_method_id, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Charges
-- ---------------------------------------------------------------------------
create function public.approve_charge(p_charge_id uuid, p_amount numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_amount is not null and p_amount <= 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  update public.charges
     set status = 'approved', amount = coalesce(p_amount, amount),
         approved_by = auth.uid(), approved_at = now()
   where id = p_charge_id and status = 'pending' and not is_deleted;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron, see the storage_cron migration). Not callable by
-- app users; service_role may run them (tests, manual runs).
-- ---------------------------------------------------------------------------

-- Every active recurring charge whose day has come this month gets one pending
-- charge for the month (idempotent; also catches up days the job missed).
create function public.generate_recurring_charges(p_date date default public.business_date(now()))
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created int;
begin
  insert into public.charges (amount, charge_date, category_id, location_id, reason, status, recurring_charge_id)
  select r.amount,
         make_date(extract(year from p_date)::int, extract(month from p_date)::int, r.day_of_month),
         r.category_id, r.location_id, r.label, 'pending', r.id
    from public.recurring_charges r
   where r.is_active and r.day_of_month <= extract(day from p_date)
  on conflict (recurring_charge_id, date_trunc('month', charge_date::timestamp))
    where recurring_charge_id is not null
    do nothing;
  get diagnostics v_created = row_count;

  if v_created > 0 then
    perform private.notify_users(
      private.super_admin_ids(),
      'recurring_charges_pending',
      'recurring_charges_pending',
      jsonb_build_object(
        'count', (select count(*) from public.charges where status = 'pending' and not is_deleted),
        'created', v_created
      ),
      '/charges',
      'recurring_charges_pending:' || p_date
    );
  end if;
  return v_created;
end;
$$;

-- Orders in the same status longer than stuck_order_days[status] → super admins
-- + that store, once per order and status.
create function public.notify_stuck_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days jsonb := coalesce(private.setting('stuck_order_days'), '{}'::jsonb);
  v_order record;
  v_count int := 0;
begin
  for v_order in
    select o.id, o.store_id, o.status, n.display_number, h.since
      from public.orders o
      join public.order_numbers n on n.order_id = o.id
      cross join lateral (
        select max(changed_at) as since
          from public.order_status_history
         where order_id = o.id and to_status = o.status
      ) h
     where o.status in ('confirmed', 'in_workshop', 'prepared', 'in_store')
       and v_days ? o.status::text
       and coalesce(h.since, o.created_at) < now() - make_interval(days => (v_days ->> o.status::text)::int)
  loop
    perform private.notify_users(
      private.super_admin_ids() || private.store_user_ids(v_order.store_id),
      'order_stuck',
      'order_stuck',
      jsonb_build_object(
        'order_id', v_order.id, 'display_number', v_order.display_number,
        'status', v_order.status, 'since', v_order.since
      ),
      '/orders/' || v_order.id,
      'order_stuck:' || v_order.id || ':' || v_order.status
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_transfer(uuid, uuid, jsonb, text)',
    'record_damage(uuid, uuid, int, text)',
    'adjust_stock(uuid, uuid, int, uuid, text)',
    'create_purchase(jsonb)',
    'add_supplier_payment(uuid, numeric, date, uuid, text)',
    'approve_charge(uuid, numeric)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  foreach f in array array['generate_recurring_charges(date)', 'notify_stuck_orders()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
