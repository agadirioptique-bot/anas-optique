-- Phase 13 hardening (SPEC §11).
-- The app never queries the database signed out: `anon` gets nothing in `public`.
-- Views are read models: no writes through them. Trigger functions are not callable.
-- Stock sums read the movements index only.

-- 1. anon: no table/view/sequence/function access, now and for future objects.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- 2. Views are read-only for signed-in users (RLS of the base tables still applies to selects).
do $$
declare
  v record;
begin
  for v in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', v.relname);
  end loop;
end $$;

-- 3. Trigger functions only run as triggers.
revoke execute on function public.set_updated_at() from authenticated;
revoke execute on function public.profiles_check_store() from authenticated;

-- 4. stock_qty / stock_levels sum qty_delta per (store, category): index-only scans.
create index stock_movements_store_category_qty_idx on public.stock_movements (store_id, category_id) include (qty_delta);
drop index public.stock_movements_store_category_idx;
