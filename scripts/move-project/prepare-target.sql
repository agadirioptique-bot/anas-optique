-- Runs on the NEW Supabase project only, inside the load command of docs/DEPLOY.md §8 (same transaction
-- as the data copy). After `db push` the new project already holds the rows the migrations create
-- ("Général" charge location, settings…); the copy brings them again, so the public tables are emptied
-- first. Refuses to run on a project that has users, clients or orders: nothing is deleted there.
do $$
declare
  public_tables text;
begin
  if exists (select 1 from auth.users)
     or exists (select 1 from public.clients)
     or exists (select 1 from public.orders) then
    raise exception 'STOP: this project already has users, clients or orders (old production?). Nothing was deleted.';
  end if;

  select string_agg(format('public.%I', tablename), ', ')
    into public_tables
    from pg_tables
   where schemaname = 'public';

  execute 'truncate table ' || public_tables || ' restart identity cascade';
end $$;
