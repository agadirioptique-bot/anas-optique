-- OPTICOR — private storage for prescription photos, and scheduled jobs.

-- ---------------------------------------------------------------------------
-- Storage: bucket 'private' (no public access).
-- prescriptions/{order_id}/… readable/uploadable by the super admin and the
-- secretaries of that order's store (the orders RLS decides), deletable by the
-- super admin only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private', 'private', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- 'prescriptions/<uuid>/photo.jpg' → <uuid>; anything else → null (never raises).
create function public.storage_order_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^prescriptions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

revoke execute on function public.storage_order_id(text) from public, anon;
grant execute on function public.storage_order_id(text) to authenticated;

create policy prescriptions_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private'
    and exists (select 1 from public.orders o where o.id = public.storage_order_id(name))
  );

create policy prescriptions_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private'
    and exists (select 1 from public.orders o where o.id = public.storage_order_id(name))
  );

create policy prescriptions_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'private'
    and public.storage_order_id(name) is not null
    and (select public.is_super_admin())
  );

-- ---------------------------------------------------------------------------
-- pg_cron. Times are UTC: 05:00 UTC = 06:00 in Casablanca (UTC+1), 05:00 during
-- Ramadan (UTC+0). Both jobs are idempotent, so the shift does not matter.
-- cron.schedule replaces a job with the same name.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule('generate-recurring-charges', '0 5 * * *', 'select public.generate_recurring_charges()');
select cron.schedule('notify-stuck-orders', '0 7 * * *', 'select public.notify_stuck_orders()');
