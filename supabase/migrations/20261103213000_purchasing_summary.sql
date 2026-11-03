-- OPTICOR — Purchasing page header numbers, summed in SQL (phase 8). Super admin only through RLS.
create view public.purchasing_summary
with (security_invoker = true)
as
select
  coalesce(sum(b.remaining), 0)::numeric(12,2) as owed,
  count(*) filter (where b.remaining > 0)::int as unpaid_count,
  coalesce(sum(b.total), 0)::numeric(12,2) as total_bought
from public.purchase_balances b;

revoke all on public.purchasing_summary from anon, authenticated;
grant select on public.purchasing_summary to authenticated;
