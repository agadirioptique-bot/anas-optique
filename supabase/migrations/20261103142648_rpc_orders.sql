-- OPTICOR — order & client RPCs (SPEC §6, decisions §11).
-- security definer + search_path = '': each function checks role/store itself
-- and raises stable OPTICOR:* codes that the app translates.

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- Remaining balance (refunds are negative payments).
create function private.order_balance(p_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select o.total - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0)
    from public.orders o
   where o.id = p_order_id;
$$;

-- An active (or, when p_allow_archived, any) item of the given list.
create function private.check_list_item(p_id uuid, p_list_key text, p_allow_archived boolean default false)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_id is not null and not exists (
    select 1 from public.settings_list_items
     where id = p_id and list_key = p_list_key and (p_allow_archived or not is_archived)
  ) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
end;
$$;

-- Locked order row, or OPTICOR:NOT_FOUND.
create function private.lock_order(p_order_id uuid)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
  return v_order;
end;
$$;

create function private.add_order_payment(p_order_id uuid, p_amount numeric, p_method_id uuid, p_kind public.payment_kind)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_method_id is null then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  perform private.check_list_item(p_method_id, 'payment_methods');
  insert into public.payments (order_id, amount, method_id, kind)
  values (p_order_id, p_amount, p_method_id, p_kind)
  returning id into v_id;
  return v_id;
end;
$$;

create function private.set_order_status(p_order public.orders, p_to public.order_status)
returns void
language sql
set search_path = ''
as $$
  update public.orders
     set status = p_to,
         delivered_at = case when p_to = 'delivered' then now() else delivered_at end
   where id = p_order.id;
  insert into public.order_status_history (order_id, from_status, to_status)
  values (p_order.id, p_order.status, p_to);
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_order(payload) → { order_id, display_number }
-- or { error: 'DUPLICATE_SLIP', existing: { order_id, display, client, date } }
-- (not raised, so the notification to super admins is kept).
-- ---------------------------------------------------------------------------
create function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (payload ->> 'store_id')::uuid;
  v_booklet text := upper(coalesce(payload ->> 'booklet', ''));
  v_slip int := (payload ->> 'slip_number')::int;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_new_client jsonb := payload -> 'new_client';
  v_own_frame boolean := coalesce((payload ->> 'client_own_frame')::boolean, false);
  v_subtotal numeric(12,2) := (payload ->> 'subtotal')::numeric;
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_deposit numeric(12,2) := coalesce((payload -> 'deposit' ->> 'amount')::numeric, 0);
  v_deposit_method uuid := (payload -> 'deposit' ->> 'method_id')::uuid;
  v_frame_revenue numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_discount_source public.discount_source := 'none';
  v_client public.clients;
  v_existing record;
  v_item jsonb;
  v_category record;
  v_field record;
  v_order_id uuid;
  v_display text;
begin
  perform private.require_store_access(v_store_id);
  if v_slip is null or v_slip <= 0 or v_subtotal is null or v_subtotal < 0
     or jsonb_typeof(v_items) <> 'array' then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;

  -- Same paper slip already used in this store.
  select o.id, o.created_at, c.full_name, n.display_number
    into v_existing
    from public.orders o
    join public.clients c on c.id = o.client_id
    join public.order_numbers n on n.order_id = o.id
   where o.store_id = v_store_id and o.booklet = v_booklet and o.slip_number = v_slip;
  if found then
    perform private.notify_users(
      private.super_admin_ids(),
      'duplicate_slip_blocked',
      'duplicate_slip_blocked',
      jsonb_build_object('order_id', v_existing.id, 'display_number', v_existing.display_number, 'attempted_by', auth.uid()),
      '/orders/' || v_existing.id
    );
    return jsonb_build_object(
      'error', 'DUPLICATE_SLIP',
      'existing', jsonb_build_object(
        'order_id', v_existing.id, 'display', v_existing.display_number,
        'client', v_existing.full_name, 'date', v_existing.created_at
      )
    );
  end if;

  -- Client: existing, or created in the same transaction.
  if v_client_id is null then
    if v_new_client is null then
      raise exception 'OPTICOR:INVALID_INPUT';
    end if;
    begin
      insert into public.clients (full_name, phone_e164, has_whatsapp, first_store_id)
      values (
        btrim(v_new_client ->> 'full_name'),
        v_new_client ->> 'phone_e164',
        coalesce((v_new_client ->> 'has_whatsapp')::boolean, true),
        v_store_id
      )
      returning id into v_client_id;
    exception
      when unique_violation then raise exception 'OPTICOR:PHONE_EXISTS';
      when check_violation or not_null_violation then raise exception 'OPTICOR:INVALID_INPUT';
    end;
  end if;
  select * into v_client from public.clients where id = v_client_id for update;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;

  -- Required fields (Settings › Custom fields). The photo is uploaded after the order exists.
  for v_field in
    select key, is_builtin from public.custom_fields
     where visibility = 'required' and key <> 'prescription_photo'
  loop
    if nullif(btrim(coalesce(
         case when v_field.is_builtin
              then payload ->> (case v_field.key when 'vision_type' then 'vision_type_id' else v_field.key end)
              else payload -> 'custom_values' ->> v_field.key
         end, '')), '') is null then
      raise exception 'OPTICOR:REQUIRED_FIELD_MISSING';
    end if;
  end loop;

  perform private.check_list_item((payload ->> 'lens_type_id')::uuid, 'lens_types');
  perform private.check_list_item((payload ->> 'vision_type_id')::uuid, 'vision_types');

  -- Items: active categories, price snapshot = current sale price.
  for v_item in select value from jsonb_array_elements(v_items) loop
    select c.sale_price into v_category
      from public.product_categories c
      join public.product_types t on t.id = c.product_type_id
     where c.id = (v_item ->> 'category_id')::uuid and not c.is_archived and not t.is_archived;
    if not found or coalesce((v_item ->> 'qty')::int, 0) <= 0 then
      raise exception 'OPTICOR:INVALID_INPUT';
    end if;
    v_frame_revenue := v_frame_revenue + v_category.sale_price * (v_item ->> 'qty')::int;
  end loop;

  if v_subtotal < v_frame_revenue then
    raise exception 'OPTICOR:TOTAL_BELOW_ITEMS';
  end if;

  -- Pre-approved client discount, consumed by this order.
  if coalesce((payload ->> 'apply_client_discount')::boolean, false) then
    if v_client.pending_discount_type is null then
      raise exception 'OPTICOR:NO_PENDING_DISCOUNT';
    end if;
    v_discount := case v_client.pending_discount_type
                    when 'percent' then round(v_subtotal * v_client.pending_discount_value / 100, 2)
                    else v_client.pending_discount_value
                  end;
    v_discount_source := 'client_pending';
    if v_subtotal - v_discount < v_frame_revenue then
      raise exception 'OPTICOR:DISCOUNT_TOO_HIGH';
    end if;
    update public.clients
       set pending_discount_type = null, pending_discount_value = null,
           pending_discount_note = null, pending_discount_set_by = null
     where id = v_client_id;
  end if;

  if v_deposit < 0 or v_deposit > v_subtotal - v_discount then
    raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
  end if;

  begin
    insert into public.orders (
      store_id, client_id, booklet, slip_number,
      re_sph, re_cyl, re_axis, re_add, le_sph, le_cyl, le_axis, le_add,
      ep_re, ep_le, fitting_height, vision_type_id, doctor_name, prescription_date, custom_values,
      lens_type_id, lens_details,
      subtotal, discount_amount, discount_source, frame_revenue, client_own_frame
    ) values (
      v_store_id, v_client_id, v_booklet, v_slip,
      (payload ->> 're_sph')::numeric, (payload ->> 're_cyl')::numeric, (payload ->> 're_axis')::int, (payload ->> 're_add')::numeric,
      (payload ->> 'le_sph')::numeric, (payload ->> 'le_cyl')::numeric, (payload ->> 'le_axis')::int, (payload ->> 'le_add')::numeric,
      (payload ->> 'ep_re')::numeric, (payload ->> 'ep_le')::numeric, (payload ->> 'fitting_height')::numeric,
      (payload ->> 'vision_type_id')::uuid, nullif(btrim(payload ->> 'doctor_name'), ''), (payload ->> 'prescription_date')::date,
      coalesce(payload -> 'custom_values', '{}'::jsonb),
      (payload ->> 'lens_type_id')::uuid, nullif(btrim(payload ->> 'lens_details'), ''),
      v_subtotal, v_discount, v_discount_source, v_frame_revenue, v_own_frame
    )
    returning id into v_order_id;
  exception
    when unique_violation then raise exception 'OPTICOR:DUPLICATE_SLIP';
    when check_violation then raise exception 'OPTICOR:INVALID_PRESCRIPTION';
  end;

  -- Items + stock (sorted so concurrent orders lock in the same order).
  for v_item in
    select value from jsonb_array_elements(v_items) order by value ->> 'category_id'
  loop
    insert into public.order_items (order_id, category_id, qty, unit_price)
    select v_order_id, c.id, (v_item ->> 'qty')::int, c.sale_price
      from public.product_categories c
     where c.id = (v_item ->> 'category_id')::uuid;
    perform private.move_stock(
      v_store_id, (v_item ->> 'category_id')::uuid, -((v_item ->> 'qty')::int), 'sale', 'orders', v_order_id
    );
  end loop;

  insert into public.order_treatments (order_id, treatment_id)
  select distinct v_order_id, i.id
    from jsonb_array_elements_text(coalesce(payload -> 'treatment_ids', '[]'::jsonb)) as t(id)
    join public.settings_list_items i on i.id = t.id::uuid and i.list_key = 'treatments' and not i.is_archived;

  if v_deposit > 0 then
    perform private.add_order_payment(v_order_id, v_deposit, v_deposit_method, 'deposit');
  end if;

  insert into public.order_status_history (order_id, from_status, to_status)
  values (v_order_id, null, 'confirmed');

  update public.clients set first_store_id = v_store_id where id = v_client_id and first_store_id is null;

  select display_number into v_display from public.order_numbers where order_id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'display_number', v_display);
end;
$$;

-- ---------------------------------------------------------------------------
-- Status moves: forward one step (both roles); back one step super admin only,
-- never from delivered. Delivered only with a zero balance.
-- ---------------------------------------------------------------------------
create function public.change_order_status(p_order_id uuid, p_to_status public.order_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_steps public.order_status[] := array['confirmed', 'in_workshop', 'prepared', 'in_store', 'delivered']::public.order_status[];
  v_order public.orders := private.lock_order(p_order_id);
  v_role text := private.require_store_access(v_order.store_id);
  v_from int := array_position(v_steps, v_order.status);
  v_to int := array_position(v_steps, p_to_status);
begin
  if v_from is null or v_to is null then
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;

  if v_to = v_from + 1 then
    if p_to_status = 'delivered' and private.order_balance(p_order_id) > 0 then
      raise exception 'OPTICOR:BALANCE_DUE';
    end if;
  elsif v_to = v_from - 1 then
    if v_role <> 'super_admin' then
      raise exception 'OPTICOR:FORBIDDEN';
    end if;
    if v_order.status = 'delivered' then
      raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
    end if;
  else
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;

  perform private.set_order_status(v_order, p_to_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create function public.add_payment(p_order_id uuid, p_amount numeric, p_method_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  perform private.require_store_access(v_order.store_id);
  if v_order.status = 'cancelled' then
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  if p_amount > private.order_balance(p_order_id) then
    raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
  end if;
  return private.add_order_payment(p_order_id, p_amount, p_method_id, 'balance');
end;
$$;

-- Optional final payment + delivered, in one transaction (from "in store" only).
create function public.deliver_order(p_order_id uuid, p_final_payment jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
  v_amount numeric(12,2) := coalesce((p_final_payment ->> 'amount')::numeric, 0);
begin
  perform private.require_store_access(v_order.store_id);
  if v_order.status <> 'in_store' then
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;
  if v_amount < 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  if v_amount > 0 then
    if v_amount > private.order_balance(p_order_id) then
      raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
    end if;
    perform private.add_order_payment(p_order_id, v_amount, (p_final_payment ->> 'method_id')::uuid, 'balance');
  end if;
  if private.order_balance(p_order_id) > 0 then
    raise exception 'OPTICOR:BALANCE_DUE';
  end if;
  perform private.set_order_status(v_order, 'delivered');
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel (super admin): any status except cancelled, delivered included.
-- Items go back to stock; optional refund ≤ paid as a negative payment.
-- ---------------------------------------------------------------------------
create function public.cancel_order(
  p_order_id uuid,
  p_reason_id uuid,
  p_note text default null,
  p_refund_amount numeric default 0,
  p_refund_method_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item record;
  v_refund numeric(12,2) := coalesce(p_refund_amount, 0);
begin
  perform private.require_super_admin();
  v_order := private.lock_order(p_order_id);
  if v_order.status = 'cancelled' then
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;
  if p_reason_id is null then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  perform private.check_list_item(p_reason_id, 'cancel_reasons');

  if v_refund < 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  if v_refund > 0 then
    if v_refund > coalesce((select sum(amount) from public.payments where order_id = p_order_id), 0) then
      raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
    end if;
    perform private.add_order_payment(p_order_id, -v_refund, p_refund_method_id, 'refund');
  end if;

  for v_item in select category_id, qty from public.order_items where order_id = p_order_id loop
    perform private.move_stock(v_order.store_id, v_item.category_id, v_item.qty, 'sale_cancel', 'orders', p_order_id);
  end loop;

  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason_id = p_reason_id, cancel_note = nullif(btrim(p_note), '')
   where id = p_order_id;
  insert into public.order_status_history (order_id, from_status, to_status)
  values (p_order_id, v_order.status, 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- Free discount (super admin, before delivery): ≤ balance, never below the
-- frame/items price, never on top of a client pre-approved discount.
-- ---------------------------------------------------------------------------
create function public.apply_free_discount(p_order_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform private.require_super_admin();
  v_order := private.lock_order(p_order_id);
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'OPTICOR:INVALID_STATUS_CHANGE';
  end if;
  if v_order.discount_source = 'client_pending' then
    raise exception 'OPTICOR:DISCOUNT_ALREADY_APPLIED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  if p_amount > private.order_balance(p_order_id) then
    raise exception 'OPTICOR:AMOUNT_TOO_HIGH';
  end if;
  if v_order.total - p_amount < v_order.frame_revenue then
    raise exception 'OPTICOR:DISCOUNT_TOO_HIGH';
  end if;
  update public.orders
     set discount_amount = discount_amount + p_amount, discount_source = 'admin_free'
   where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client pre-approved discount (super admin), consumed by create_order.
-- ---------------------------------------------------------------------------
create function public.set_client_discount(
  p_client_id uuid,
  p_type public.discount_type,
  p_value numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_type is null or p_value is null or p_value <= 0 or (p_type = 'percent' and p_value > 100) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  update public.clients
     set pending_discount_type = p_type, pending_discount_value = p_value,
         pending_discount_note = nullif(btrim(p_note), ''), pending_discount_set_by = auth.uid()
   where id = p_client_id;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
end;
$$;

create function public.clear_client_discount(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  update public.clients
     set pending_discount_type = null, pending_discount_value = null,
         pending_discount_note = null, pending_discount_set_by = null
   where id = p_client_id;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
end;
$$;

-- Counts across all stores (secretaries can't read other stores' orders).
create function public.client_order_stats(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_role();
  return (
    select jsonb_build_object(
      'orders', count(*) filter (where status <> 'cancelled'),
      'delivered', count(*) filter (where status = 'delivered'),
      'stores', count(distinct store_id) filter (where status <> 'cancelled')
    )
    from public.orders
    where client_id = p_client_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Global search (Ctrl K). security invoker: RLS decides what the caller sees.
-- Orders by display number in any form: 832, 00832, cnt-832, CNT-00832, CNT-B-00001.
-- Clients by name (trigram) or phone (06…, +2126…).
-- ---------------------------------------------------------------------------
create function public.search_global(q text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(q, ''));
  v_match text[];
  v_digits text := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_phone text;
  v_clients jsonb;
  v_orders jsonb := '[]'::jsonb;
begin
  if length(v_q) < 2 then
    return jsonb_build_object('clients', '[]'::jsonb, 'orders', '[]'::jsonb);
  end if;

  -- Phones are stored +212XXXXXXXXX; "06 12 34 56 78" → "612345678".
  v_phone := case
               when v_digits like '212%' then substr(v_digits, 4)
               when v_digits like '0%' then substr(v_digits, 2)
               else v_digits
             end;

  select coalesce(jsonb_agg(r order by r.score desc, r.full_name), '[]'::jsonb)
    into v_clients
    from (
      select c.id, c.full_name, c.phone_e164, c.is_loyal,
             extensions.similarity(c.full_name, v_q) as score
        from public.clients c
       where c.full_name ilike '%' || v_q || '%'
          or extensions.similarity(c.full_name, v_q) > 0.3
          or (length(v_phone) >= 4 and c.phone_e164 like '%' || v_phone || '%')
       order by score desc, c.full_name
       limit 10
    ) r;

  v_match := regexp_match(v_q, '^(?:([A-Za-z]{2,5})[- ]?)?(?:([A-Za-z]{1,2})[- ])?0*([0-9]{1,9})$');
  if v_match is not null then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
      into v_orders
      from (
        select o.id, n.display_number, c.full_name as client_name, o.status, o.created_at
          from public.orders o
          join public.order_numbers n on n.order_id = o.id
          join public.stores s on s.id = o.store_id
          join public.clients c on c.id = o.client_id
         where o.slip_number = v_match[3]::int
           and (v_match[1] is null or s.prefix = upper(v_match[1]))
           and (v_match[2] is null or o.booklet = upper(v_match[2]))
         order by o.created_at desc
         limit 10
      ) r;
  end if;

  return jsonb_build_object('clients', v_clients, 'orders', v_orders);
end;
$$;

-- App users call these through supabase.rpc(); never anon.
do $$
declare
  f text;
begin
  foreach f in array array[
    'create_order(jsonb)',
    'change_order_status(uuid, public.order_status)',
    'add_payment(uuid, numeric, uuid)',
    'deliver_order(uuid, jsonb)',
    'cancel_order(uuid, uuid, text, numeric, uuid)',
    'apply_free_discount(uuid, numeric)',
    'set_client_discount(uuid, public.discount_type, numeric, text)',
    'clear_client_discount(uuid)',
    'client_order_stats(uuid)',
    'search_global(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
