-- ---------------------------------------------------------------------------
-- Activity calendar and leave advice (SPEC §9 « Calendrier d'activité et congés »).
--
-- kpi_activity(store): every business day with orders (all time, history included), and a
-- seasonality index per month and per ISO week computed on the reference years:
--   * an order counts when it is not cancelled, whatever its source (app or Excel history);
--   * reference years = finished calendar years with orders in at least 10 months
--     (the empty years between the history and the app are left out by themselves);
--   * index = orders per day in the month / week ÷ orders per day over that year, averaged over
--     the reference years (1 = an ordinary month / week); ISO week 53 joins week 52;
--   * level: calm = in the lowest 25 % and index < 1 (leave possible), busy = in the highest 25 %
--     and index > 1 (be there 100 %), else normal;
--   * upcoming = the 52 weeks from the Monday of the current week, with their week's level.
-- The app always calls it without a store (the optician is one person; the history lives in the
-- inactive store « Historique »); p_store_id is there for the DB tests.
-- ---------------------------------------------------------------------------
create function public.kpi_activity(p_store_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.business_date(now());
  v_monday date := date_trunc('week', v_today::timestamp)::date;
  v_result jsonb;
begin
  perform private.require_super_admin();

  with
  days as (
    select public.business_date(o.created_at) as d,
           count(*)::int as n,
           bool_or(o.source = 'legacy') as legacy
      from public.orders o
     where o.status <> 'cancelled'
       and (p_store_id is null or o.store_id = p_store_id)
     group by 1
  ),
  ref_years as (
    select extract(year from d)::int as y, sum(n) as total
      from days
     where d < make_date(extract(year from v_today)::int, 1, 1)
     group by 1
    having count(distinct extract(month from d)) >= 10
  ),
  -- Every day of the reference years: a day without orders counts as 0.
  cal as (
    select g::date as d,
           ry.y,
           ry.total::numeric / (make_date(ry.y + 1, 1, 1) - make_date(ry.y, 1, 1)) as year_per_day,
           coalesce(dd.n, 0) as n
      from ref_years ry
      cross join lateral generate_series(make_date(ry.y, 1, 1)::timestamp, make_date(ry.y, 12, 31)::timestamp, interval '1 day') g
      left join days dd on dd.d = g::date
  ),
  months as (
    select k, avg(idx) as idx
      from (
        select y, extract(month from d)::int as k, avg(n) / max(year_per_day) as idx
          from cal
         group by y, 2
      ) m
     group by k
  ),
  weeks as (
    select k, avg(idx) as idx
      from (
        select y, least(extract(week from d)::int, 52) as k, avg(n) / max(year_per_day) as idx
          from cal
         group by y, 2
      ) w
     group by k
  ),
  months_lvl as (
    select k, idx,
           case
             when percent_rank() over (order by idx) <= 0.25 and idx < 1 then 'calm'
             when percent_rank() over (order by idx desc) <= 0.25 and idx > 1 then 'busy'
             else 'normal'
           end as level
      from months
  ),
  weeks_lvl as (
    select k, idx,
           case
             when percent_rank() over (order by idx) <= 0.25 and idx < 1 then 'calm'
             when percent_rank() over (order by idx desc) <= 0.25 and idx > 1 then 'busy'
             else 'normal'
           end as level
      from weeks
  ),
  upcoming as (
    select g::date as start, least(extract(week from g)::int, 52) as k
      from generate_series(v_monday::timestamp, v_monday::timestamp + interval '51 weeks', interval '1 week') g
  )
  select jsonb_build_object(
    'today', v_today,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n, 'legacy', legacy) order by d), '[]'::jsonb)
        from days
    ),
    'years', (select coalesce(jsonb_agg(y order by y), '[]'::jsonb) from ref_years),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object('month', k, 'index', round(idx, 2), 'level', level) order by k), '[]'::jsonb)
        from months_lvl
    ),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object('week', k, 'index', round(idx, 2), 'level', level) order by k), '[]'::jsonb)
        from weeks_lvl
    ),
    'upcoming', (
      select coalesce(jsonb_agg(jsonb_build_object('start', u.start, 'week', u.k, 'index', round(w.idx, 2), 'level', w.level) order by u.start), '[]'::jsonb)
        from upcoming u
        join weeks_lvl w on w.k = u.k
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.kpi_activity(uuid) from public, anon;
grant execute on function public.kpi_activity(uuid) to authenticated;
