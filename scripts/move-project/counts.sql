-- Read-only. Run in the SQL Editor of the OLD project before the copy, then of the NEW one after it:
-- every number must be the same (docs/DEPLOY.md §8).
select current_setting('server_version')                 as postgres,
       (select count(*) from auth.users)                 as users,
       (select count(*) from public.profiles)            as profiles,
       (select count(*) from public.stores)              as stores,
       (select count(*) from public.clients)             as clients,
       (select count(*) from public.orders)              as orders,
       (select count(*) from public.payments)            as payments,
       (select count(*) from public.stock_movements)     as stock_movements,
       (select count(*) from public.charges)             as charges,
       (select count(*) from public.settings_list_items) as list_items,
       (select count(*) from storage.objects)            as files;
