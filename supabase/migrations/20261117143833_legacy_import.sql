-- OPTICOR — import of the optician's Excel history (SPEC §12 "Import historique").
--
-- 1. Clients: phone optional (imported clients) and shared by several people (families).
--    Same phone + same name = same client; the app still requires a phone for a new client.
-- 2. Orders: source 'legacy' carries the original Excel values in orders.legacy; read only.
-- 3. Every signed-in user reads legacy orders (secretaries included: prescriptions, no costs).
-- 4. import_legacy_batch / finish_legacy_import: called from the SQL editor only.
-- 5. KPIs: legacy orders keep their revenue but not the workshop times / busy hours (made-up hours).

-- ---------------------------------------------------------------------------
-- 1. Clients
-- ---------------------------------------------------------------------------
-- "  Fatima   EL Idrissi " → "fatima el idrissi" (comparison key for the same-client rule).
create function private.name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

alter table public.clients alter column phone_e164 drop not null;
alter table public.clients drop constraint clients_phone_e164_key;
alter table public.clients add column legacy_key text unique;

create unique index clients_phone_name_key
  on public.clients (phone_e164, private.name_key(full_name))
  where phone_e164 is not null;
create index clients_phone_idx on public.clients (phone_e164);

-- A client created in the app always has a phone; only imported clients may have none.
create function private.clients_phone_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone_e164 is null and new.legacy_key is null then
    raise exception 'OPTICOR:PHONE_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger clients_phone_required
  before insert or update of phone_e164 on public.clients
  for each row execute function private.clients_phone_required();

-- ---------------------------------------------------------------------------
-- 2. Orders
-- ---------------------------------------------------------------------------
alter table public.orders add column legacy jsonb;
alter table public.orders add constraint orders_legacy check (
  (source = 'legacy') = (legacy is not null)
  and (legacy is null or (jsonb_typeof(legacy) = 'object' and legacy ? 'key'))
);
create unique index orders_legacy_key on public.orders ((legacy ->> 'key')) where source = 'legacy';

-- Legacy orders and their payments are history: nothing changes them, except the import itself
-- (transaction-local flag set by import_legacy_batch, never reachable through the API).
create function private.legacy_read_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
begin
  if coalesce(current_setting('opticor.legacy_import', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'orders' then
    if old.source = 'legacy' then
      raise exception 'OPTICOR:LEGACY_READ_ONLY';
    end if;
  else
    v_order := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
    if exists (select 1 from public.orders o where o.id = v_order and o.source = 'legacy') then
      raise exception 'OPTICOR:LEGACY_READ_ONLY';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger orders_legacy_read_only
  before update or delete on public.orders
  for each row execute function private.legacy_read_only();

do $$
declare
  t text;
begin
  foreach t in array array['payments', 'order_items', 'order_treatments', 'order_status_history'] loop
    execute format(
      'create trigger %1$s_legacy_read_only before insert or update or delete on public.%1$I
         for each row execute function private.legacy_read_only()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Read access: every active user sees the imported history (and its store's name/prefix,
--    which is deactivated after the import).
-- ---------------------------------------------------------------------------
drop policy orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    (select public.is_super_admin())
    or store_id = (select public.auth_store_id())
    or (source = 'legacy' and (select public.auth_role()) is not null)
  );

drop policy stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (is_active and (select public.auth_role()) is not null)
    or (
      (select public.auth_role()) is not null
      and exists (select 1 from public.orders o where o.store_id = stores.id and o.source = 'legacy')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Import (SQL editor only: execute revoked from the API roles)
-- ---------------------------------------------------------------------------
-- payload: {
--   "store":   {"name": "Historique", "prefix": "HIS"},
--   "clients": [{"key", "full_name", "phone" (E.164 or null), "has_whatsapp", "notes"}],
--   "orders":  [{"key", "client_key", "booklet", "slip", "created_at",
--                "re_sph", "re_cyl", "re_axis", "re_add", "le_sph", "le_cyl", "le_axis", "le_add",
--                "lens_type_code", "treatment_codes": [], "lens_details",
--                "total", "deposit", "balance", "legacy": {...}}]
-- }
-- Idempotent: a client or an order already imported (same key) is skipped.
create function public.import_legacy_batch(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_cash uuid;
  v_client jsonb;
  v_order jsonb;
  v_client_id uuid;
  v_order_id uuid;
  v_at timestamptz;
  v_lens uuid;
  v_map jsonb := '{}';
  v_clients_created int := 0;
  v_clients_matched int := 0;
  v_orders_created int := 0;
  v_orders_skipped int := 0;
begin
  perform set_config('opticor.legacy_import', 'on', true);

  -- History store: created active (orders need an active store), deactivated by finish_legacy_import.
  select id into v_store_id from public.stores where prefix = p -> 'store' ->> 'prefix';
  if v_store_id is null then
    insert into public.stores (name, kind, prefix)
    values (p -> 'store' ->> 'name', 'store', p -> 'store' ->> 'prefix')
    returning id into v_store_id;
  elsif not (select is_active from public.stores where id = v_store_id) then
    update public.stores set is_active = true where id = v_store_id;
  end if;

  select id into v_cash from public.settings_list_items
   where list_key = 'payment_methods' and code = 'cash';
  if v_cash is null then
    select id into v_cash from public.settings_list_items
     where list_key = 'payment_methods' and not is_archived order by sort limit 1;
  end if;

  -- Clients: by import key, else same phone + same name (reuses clients typed in the app).
  for v_client in select value from jsonb_array_elements(p -> 'clients') loop
    select id into v_client_id from public.clients where legacy_key = v_client ->> 'key';
    if v_client_id is null and v_client ->> 'phone' is not null then
      select id into v_client_id from public.clients
       where phone_e164 = v_client ->> 'phone'
         and private.name_key(full_name) = private.name_key(v_client ->> 'full_name')
       limit 1;
      if v_client_id is not null then
        update public.clients set legacy_key = coalesce(legacy_key, v_client ->> 'key') where id = v_client_id;
      end if;
    end if;
    if v_client_id is null then
      insert into public.clients (full_name, phone_e164, has_whatsapp, first_store_id, notes, legacy_key, created_by)
      values (
        btrim(v_client ->> 'full_name'),
        v_client ->> 'phone',
        coalesce((v_client ->> 'has_whatsapp')::boolean, v_client ->> 'phone' is not null),
        v_store_id,
        nullif(v_client ->> 'notes', ''),
        v_client ->> 'key',
        null
      )
      returning id into v_client_id;
      v_clients_created := v_clients_created + 1;
    else
      v_clients_matched := v_clients_matched + 1;
    end if;
    v_map := v_map || jsonb_build_object(v_client ->> 'key', v_client_id);
  end loop;

  for v_order in select value from jsonb_array_elements(p -> 'orders') loop
    if exists (
      select 1 from public.orders where source = 'legacy' and legacy ->> 'key' = v_order ->> 'key'
    ) then
      v_orders_skipped := v_orders_skipped + 1;
      continue;
    end if;

    v_client_id := coalesce(
      (v_map ->> (v_order ->> 'client_key'))::uuid,
      (select id from public.clients where legacy_key = v_order ->> 'client_key')
    );
    if v_client_id is null then
      raise exception 'OPTICOR:INVALID_INPUT' using detail = 'unknown client_key ' || (v_order ->> 'client_key');
    end if;

    v_at := (v_order ->> 'created_at')::timestamptz;
    select id into v_lens from public.settings_list_items
     where list_key = 'lens_types' and code = v_order ->> 'lens_type_code';

    insert into public.orders (
      store_id, client_id, booklet, slip_number, status, source,
      re_sph, re_cyl, re_axis, re_add, le_sph, le_cyl, le_axis, le_add,
      lens_type_id, lens_details, subtotal, frame_revenue,
      delivered_at, created_by, created_at, legacy
    ) values (
      v_store_id, v_client_id, coalesce(v_order ->> 'booklet', ''), (v_order ->> 'slip')::int, 'delivered', 'legacy',
      (v_order ->> 're_sph')::numeric, (v_order ->> 're_cyl')::numeric, (v_order ->> 're_axis')::int, (v_order ->> 're_add')::numeric,
      (v_order ->> 'le_sph')::numeric, (v_order ->> 'le_cyl')::numeric, (v_order ->> 'le_axis')::int, (v_order ->> 'le_add')::numeric,
      v_lens, nullif(v_order ->> 'lens_details', ''), coalesce((v_order ->> 'total')::numeric, 0), 0,
      v_at, null, v_at, (v_order -> 'legacy') || jsonb_build_object('key', v_order ->> 'key')
    )
    returning id into v_order_id;

    insert into public.order_treatments (order_id, treatment_id)
    select v_order_id, s.id
      from public.settings_list_items s
     where s.list_key = 'treatments'
       and s.code in (select jsonb_array_elements_text(coalesce(v_order -> 'treatment_codes', '[]')));

    if coalesce((v_order ->> 'deposit')::numeric, 0) > 0 then
      insert into public.payments (order_id, amount, method_id, kind, received_at, received_by)
      values (v_order_id, (v_order ->> 'deposit')::numeric, v_cash, 'deposit', v_at, null);
    end if;
    if coalesce((v_order ->> 'balance')::numeric, 0) > 0 then
      insert into public.payments (order_id, amount, method_id, kind, received_at, received_by)
      values (v_order_id, (v_order ->> 'balance')::numeric, v_cash, 'balance', v_at, null);
    end if;

    insert into public.order_status_history (order_id, from_status, to_status, changed_by, changed_at)
    values (v_order_id, null, 'delivered', null, v_at);

    v_orders_created := v_orders_created + 1;
  end loop;

  return jsonb_build_object(
    'clients_created', v_clients_created,
    'clients_matched', v_clients_matched,
    'orders_created', v_orders_created,
    'orders_skipped', v_orders_skipped
  );
end;
$$;

-- After the last batch: loyalty (no notification for history) and the history store put away.
create function public.finish_legacy_import(p_prefix text default 'HIS')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold int := coalesce((private.setting('loyalty_threshold') ->> 'orders')::int, 5);
  v_loyal int;
  v_store_id uuid;
begin
  with ranked as (
    select o.client_id, o.created_at,
           row_number() over (partition by o.client_id order by o.created_at, o.id) as n
      from public.orders o
     where o.status = 'delivered'
  ),
  reached as (
    select client_id, created_at from ranked where n = v_threshold
  )
  update public.clients c
     set is_loyal = true, loyal_since = r.created_at
    from reached r
   where c.id = r.client_id and not c.is_loyal;
  get diagnostics v_loyal = row_count;

  select id into v_store_id from public.stores where prefix = p_prefix;
  update public.stores set is_active = false where id = v_store_id;
  update public.charge_locations set is_archived = true where store_id = v_store_id;

  return jsonb_build_object(
    'new_loyal_clients', v_loyal,
    'legacy_orders', (select count(*) from public.orders where source = 'legacy'),
    'legacy_clients', (select count(*) from public.clients where legacy_key is not null),
    'clients_without_phone', (select count(*) from public.clients where phone_e164 is null),
    'history_store_active', (select is_active from public.stores where id = v_store_id)
  );
end;
$$;

revoke execute on function public.import_legacy_batch(jsonb) from public, anon, authenticated;
revoke execute on function public.finish_legacy_import(text) from public, anon, authenticated;
grant execute on function public.import_legacy_batch(jsonb) to service_role;
grant execute on function public.finish_legacy_import(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. KPIs: same functions as 20261104090000_dashboard_kpis.sql, except that legacy orders
--    (made-up hours, delivered the day they were ordered) stay out of the workshop times
--    and of the busiest-hours heatmap.
-- ---------------------------------------------------------------------------
create or replace function public.kpi_summary(p_from date, p_to date, p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.day_start(p_from);
  v_end timestamptz := private.day_start(p_to + 1);
  v_result jsonb;
begin
  perform private.require_super_admin();
  perform private.check_kpi_range(p_from, p_to);

  with
  o as (
    select o.id, o.client_id, o.status, o.total, o.discount_amount, o.created_at, o.delivered_at, o.source
      from public.orders o
     where o.created_at >= v_start and o.created_at < v_end
       and (p_store_id is null or o.store_id = p_store_id)
  ),
  live as (select * from o where status <> 'cancelled'),
  paid as (
    select p.order_id, sum(p.amount) as paid
      from public.payments p
     where p.order_id in (select id from live where status <> 'delivered')
     group by p.order_id
  ),
  served as (
    select distinct l.client_id from live l
  ),
  served_stats as (
    select s.client_id, c.is_loyal,
           (select count(*) from public.orders d where d.client_id = s.client_id and d.status = 'delivered') as delivered
      from served s
      join public.clients c on c.id = s.client_id
  ),
  in_store as (
    select l.id, l.created_at, min(h.changed_at) as at
      from live l
      join public.order_status_history h on h.order_id = l.id and h.to_status = 'in_store'
     where l.source = 'app'
     group by l.id, l.created_at
  ),
  ch as (
    select c.amount, c.status
      from public.charges c
      join public.charge_locations loc on loc.id = c.location_id
     where not c.is_deleted
       and (p_store_id is null or loc.store_id = p_store_id)
  )
  select jsonb_build_object(
    'revenue', (select coalesce(sum(total), 0)::numeric(12,2) from live),
    'orders', (select count(*) from live),
    'created', (select count(*) from o),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'cancellation_rate', (select round(count(*) filter (where status = 'cancelled')::numeric / nullif(count(*), 0), 4) from o),
    'avg_basket', (select round(sum(total) / nullif(count(*), 0), 2) from live),
    'discounts', (select coalesce(sum(discount_amount), 0)::numeric(12,2) from live),
    'balance_to_collect', (
      select coalesce(sum(l.total - coalesce(p.paid, 0)), 0)::numeric(12,2)
        from live l left join paid p on p.order_id = l.id
       where l.status <> 'delivered'
    ),
    'collected', (
      select coalesce(sum(p.amount), 0)::numeric(12,2)
        from public.payments p
        join public.orders po on po.id = p.order_id
       where p.received_at >= v_start and p.received_at < v_end
         and (p_store_id is null or po.store_id = p_store_id)
    ),
    'charges', (
      select coalesce(sum(c.amount), 0)::numeric(12,2)
        from public.charges c
        join public.charge_locations loc on loc.id = c.location_id
       where c.status = 'approved' and not c.is_deleted
         and c.charge_date between p_from and p_to
         and (p_store_id is null or loc.store_id = p_store_id)
    ),
    'damaged_frames', (
      select coalesce(-sum(m.qty_delta), 0)
        from public.stock_movements m
        join public.product_categories pc on pc.id = m.category_id
        join public.product_types t on t.id = pc.product_type_id
       where m.kind = 'damage' and t.is_frame
         and m.created_at >= v_start and m.created_at < v_end
         and (p_store_id is null or m.store_id = p_store_id)
    ),
    'owed_to_suppliers', (
      select coalesce(sum(b.remaining), 0)::numeric(12,2)
        from public.purchase_balances b
        join public.purchases pu on pu.id = b.purchase_id
       where p_store_id is null or pu.receive_store_id = p_store_id
    ),
    'served_clients', (select count(*) from served_stats),
    'loyal_clients', (select count(*) from served_stats where is_loyal),
    'repeat_rate', (select round(count(*) filter (where delivered >= 2)::numeric / nullif(count(*), 0), 4) from served_stats),
    'workshop_days_in_store', (select round(avg(extract(epoch from at - created_at) / 86400)::numeric, 1) from in_store),
    'workshop_days_delivered', (
      select round(avg(extract(epoch from delivered_at - created_at) / 86400)::numeric, 1)
        from live where status = 'delivered' and source = 'app'
    ),
    'pending_charges_count', (select count(*) from ch where status = 'pending'),
    'pending_charges_amount', (select coalesce(sum(amount), 0)::numeric(12,2) from ch where status = 'pending')
  ) into v_result;

  v_result := v_result || jsonb_build_object(
    'net', ((v_result ->> 'revenue')::numeric - (v_result ->> 'charges')::numeric)::numeric(12,2)
  );
  return v_result;
end;
$$;

create or replace function public.kpi_breakdown(p_from date, p_to date, p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.day_start(p_from);
  v_end timestamptz := private.day_start(p_to + 1);
  v_threshold int := coalesce((select (value ->> 'orders')::int from public.app_settings where key = 'loyalty_threshold'), 5);
  v_result jsonb;
begin
  perform private.require_super_admin();
  perform private.check_kpi_range(p_from, p_to);

  with
  live as (
    select o.*
      from public.orders o
     where o.created_at >= v_start and o.created_at < v_end
       and o.status <> 'cancelled'
       and (p_store_id is null or o.store_id = p_store_id)
  ),
  store_rows as (
    select
      s.id, s.name, s.kind,
      (select coalesce(sum(l.total), 0) from live l where l.store_id = s.id)::numeric(12,2) as revenue,
      (select count(*) from live l where l.store_id = s.id) as orders,
      (select coalesce(sum(p.amount), 0)
         from public.payments p join public.orders po on po.id = p.order_id
        where po.store_id = s.id and p.received_at >= v_start and p.received_at < v_end)::numeric(12,2) as collected,
      (select coalesce(sum(c.amount), 0)
         from public.charges c join public.charge_locations loc on loc.id = c.location_id
        where loc.store_id = s.id and c.status = 'approved' and not c.is_deleted
          and c.charge_date between p_from and p_to)::numeric(12,2) as charges
    from public.stores s
    where (p_store_id is null and s.is_active) or s.id = p_store_id
  ),
  served as (
    select distinct l.client_id from live l
  ),
  segments as (
    select
      case
        when c.is_loyal then 'loyal'
        when (select count(*) from public.orders x where x.client_id = c.id and x.status <> 'cancelled') <= 1 then 'new'
        else 'regular'
      end as segment
    from served s join public.clients c on c.id = s.client_id
  ),
  lead as (
    select
      l.store_id,
      extract(epoch from (
        select min(h.changed_at) from public.order_status_history h where h.order_id = l.id and h.to_status = 'in_store'
      ) - l.created_at) / 86400 as to_in_store,
      extract(epoch from l.delivered_at - l.created_at) / 86400 as to_delivered
    from live l
    where l.source = 'app'
  )
  select jsonb_build_object(
    'stores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'store_id', id, 'name', name, 'kind', kind, 'revenue', revenue, 'orders', orders,
        'collected', collected, 'charges', charges, 'net', (revenue - charges)::numeric(12,2)
      ) order by kind desc, name), '[]'::jsonb)
      from store_rows
    ),
    'general_charges', (
      select case when p_store_id is null then coalesce(sum(c.amount), 0)::numeric(12,2) end
        from public.charges c join public.charge_locations loc on loc.id = c.location_id
       where loc.store_id is null and c.status = 'approved' and not c.is_deleted
         and c.charge_date between p_from and p_to
    ),
    'frame_categories', (
      select coalesce(jsonb_agg(r order by r.revenue desc, r.name), '[]'::jsonb)
      from (
        select pc.name, sum(i.qty)::int as count, sum(i.qty * i.unit_price)::numeric(12,2) as revenue
          from live l
          join public.order_items i on i.order_id = l.id
          join public.product_categories pc on pc.id = i.category_id
          join public.product_types t on t.id = pc.product_type_id
         where t.is_frame
         group by pc.name
         order by revenue desc, pc.name
         limit 10
      ) r
    ),
    'own_frames', (select count(*) from live where client_own_frame),
    'treatments', (
      select coalesce(jsonb_agg(r order by r.count desc, r.label_fr), '[]'::jsonb)
      from (
        select it.label_fr, it.label_en, count(*)::int as count
          from live l
          join public.order_treatments ot on ot.order_id = l.id
          join public.settings_list_items it on it.id = ot.treatment_id
         group by it.label_fr, it.label_en
         order by count desc, it.label_fr
         limit 10
      ) r
    ),
    'lens_types', (
      select coalesce(jsonb_agg(r order by r.count desc, r.label_fr), '[]'::jsonb)
      from (
        select it.label_fr, it.label_en, count(*)::int as count
          from live l
          join public.settings_list_items it on it.id = l.lens_type_id
         group by it.label_fr, it.label_en
         order by count desc, it.label_fr
         limit 10
      ) r
    ),
    'segments', (
      select jsonb_build_object(
        'new', count(*) filter (where segment = 'new'),
        'regular', count(*) filter (where segment = 'regular'),
        'loyal', count(*) filter (where segment = 'loyal')
      ) from segments
    ),
    'loyalty_threshold', v_threshold,
    'heatmap', (
      select coalesce(jsonb_agg(r order by r.dow, r.hour), '[]'::jsonb)
      from (
        select extract(isodow from l.created_at at time zone 'Africa/Casablanca')::int as dow,
               extract(hour from l.created_at at time zone 'Africa/Casablanca')::int as hour,
               count(*)::int as orders
          from live l
         where l.source = 'app'
         group by 1, 2
      ) r
    ),
    'lead_times', (
      select coalesce(jsonb_agg(r order by r.name), '[]'::jsonb)
      from (
        select s.name,
               round(avg(ld.to_in_store)::numeric, 1) as to_in_store,
               round(avg(ld.to_delivered)::numeric, 1) as to_delivered,
               count(ld.to_in_store)::int as measured
          from lead ld join public.stores s on s.id = ld.store_id
         group by s.name
        having count(ld.to_in_store) > 0 or count(ld.to_delivered) > 0
      ) r
    )
  ) into v_result;
  return v_result;
end;
$$;
