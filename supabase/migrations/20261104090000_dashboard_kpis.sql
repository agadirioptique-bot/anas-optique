-- OPTICOR — Dashboard KPIs (SPEC §9, phase 11). Every money total is summed here, never in JS.
-- Store rule: a store filter keeps the orders / payments / stock of that store and the charges of
-- its charge location; 'Général' and other non-store locations count only under "All stores"
-- (p_store_id null). The lab is a store row: selecting it keeps the lab's charges.

-- Start of a business day (Africa/Casablanca) as a timestamp, so filters stay index-friendly.
create function private.day_start(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_day::timestamp at time zone 'Africa/Casablanca');
$$;

revoke execute on function private.day_start(date) from public, anon, authenticated;

create function private.check_kpi_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 3660 then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
end;
$$;

revoke execute on function private.check_kpi_range(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Headline numbers for a period (SPEC §9 table).
-- ---------------------------------------------------------------------------
create function public.kpi_summary(p_from date, p_to date, p_store_id uuid default null)
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
    select o.id, o.client_id, o.status, o.total, o.discount_amount, o.created_at, o.delivered_at
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
      select round(avg(extract(epoch from delivered_at - created_at) / 86400)::numeric, 1) from live where status = 'delivered'
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

-- ---------------------------------------------------------------------------
-- Time series for sparklines and the revenue chart: per hour (one day), per
-- day (up to 92 days) or per month. Empty buckets are 0, so two periods line
-- up index by index. Charges have a date only: in hourly series they sit in
-- the first hour. The buckets always add up to kpi_summary.
-- ---------------------------------------------------------------------------
create function public.kpi_timeseries(p_from date, p_to date, p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bucket text := case when p_from = p_to then 'hour' when p_to - p_from < 92 then 'day' else 'month' end;
  v_points jsonb;
begin
  perform private.require_super_admin();
  perform private.check_kpi_range(p_from, p_to);

  with
  buckets as (
    select
      to_char(h, 'HH24') as at,
      private.day_start(p_from) + (extract(hour from h) * interval '1 hour') as b_start,
      private.day_start(p_from) + ((extract(hour from h) + 1) * interval '1 hour') as b_end,
      case when extract(hour from h) = 0 then p_from end as d_from,
      case when extract(hour from h) = 0 then p_to end as d_to
    from generate_series(p_from::timestamp, p_from::timestamp + interval '23 hours', interval '1 hour') h
    where v_bucket = 'hour'
    union all
    select to_char(d, 'YYYY-MM-DD'), private.day_start(d::date), private.day_start(d::date + 1), d::date, d::date
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    where v_bucket = 'day'
    union all
    select
      to_char(m, 'YYYY-MM'),
      private.day_start(greatest(m::date, p_from)),
      private.day_start(least((m + interval '1 month')::date - 1, p_to) + 1),
      greatest(m::date, p_from),
      least((m + interval '1 month')::date - 1, p_to)
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') m
    where v_bucket = 'month'
  ),
  points as (
    select
      b.at,
      o.revenue, o.orders, o.created, o.cancelled, o.balance,
      coalesce(pay.collected, 0)::numeric(12,2) as collected,
      coalesce(ch.charges, 0)::numeric(12,2) as charges
    from buckets b
    cross join lateral (
      select
        coalesce(sum(x.total) filter (where x.status <> 'cancelled'), 0)::numeric(12,2) as revenue,
        count(*) filter (where x.status <> 'cancelled') as orders,
        count(*) as created,
        count(*) filter (where x.status = 'cancelled') as cancelled,
        coalesce(sum(x.total - coalesce((select sum(p.amount) from public.payments p where p.order_id = x.id), 0))
          filter (where x.status not in ('cancelled', 'delivered')), 0)::numeric(12,2) as balance
      from public.orders x
      where x.created_at >= b.b_start and x.created_at < b.b_end
        and (p_store_id is null or x.store_id = p_store_id)
    ) o
    cross join lateral (
      select sum(p.amount) as collected
      from public.payments p
      join public.orders po on po.id = p.order_id
      where p.received_at >= b.b_start and p.received_at < b.b_end
        and (p_store_id is null or po.store_id = p_store_id)
    ) pay
    cross join lateral (
      select sum(c.amount) as charges
      from public.charges c
      join public.charge_locations loc on loc.id = c.location_id
      where b.d_from is not null
        and c.status = 'approved' and not c.is_deleted
        and c.charge_date between b.d_from and b.d_to
        and (p_store_id is null or loc.store_id = p_store_id)
    ) ch
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'at', at,
    'revenue', revenue,
    'collected', collected,
    'charges', charges,
    'net', (revenue - charges)::numeric(12,2),
    'orders', orders,
    'avg_basket', round(revenue / nullif(orders, 0), 2),
    'cancellation_rate', round(cancelled::numeric / nullif(created, 0), 4),
    'balance_to_collect', balance
  ) order by at), '[]'::jsonb)
  into v_points
  from points;

  return jsonb_build_object('bucket', v_bucket, 'points', v_points);
end;
$$;

-- ---------------------------------------------------------------------------
-- Breakdowns for the charts: by store, sales mix, client segments, busiest
-- hours, workshop lead times.
-- ---------------------------------------------------------------------------
create function public.kpi_breakdown(p_from date, p_to date, p_store_id uuid default null)
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

do $$
declare
  f text;
begin
  foreach f in array array[
    'kpi_summary(date, date, uuid)',
    'kpi_timeseries(date, date, uuid)',
    'kpi_breakdown(date, date, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
