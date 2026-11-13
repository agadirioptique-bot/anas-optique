-- Security review 2 (SPEC §4, §11).
--
-- 1. Brute-force protection for the signed-out auth actions (sign in, forgot password).
--    The Server Actions call Supabase Auth from the server, so Auth's own per-IP limits see the
--    hosting provider's IPs, not the visitor's. The app counts attempts itself, per hashed client
--    IP and per hashed email, in a table no API role can reach. Only the service role (used by
--    src/features/auth/throttle.ts) may call the two functions below.
-- 2. Length limits on the client columns a secretary may write directly through the API, so they
--    match the forms (zod) even when the API is called without the app.

-- ---------------------------------------------------------------------------
-- 1. Auth attempts
-- ---------------------------------------------------------------------------
create table private.auth_attempts (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) <= 200),
  attempted_at timestamptz not null default now()
);
create index auth_attempts_key_time_idx on private.auth_attempts (key, attempted_at);
create index auth_attempts_time_idx on private.auth_attempts (attempted_at);
revoke all on private.auth_attempts from public, anon, authenticated;

-- Attempts per key during the last p_window_seconds (a key never seen → 0).
create function public.auth_attempt_counts(p_keys text[], p_window_seconds int)
returns table (key text, attempts int)
language sql
stable
security definer
set search_path = ''
as $$
  select k.attempt_key, count(a.id)::int
    from unnest(p_keys) as k(attempt_key)
    left join private.auth_attempts a
      on a.key = k.attempt_key
     and a.attempted_at > now() - make_interval(secs => p_window_seconds)
   group by k.attempt_key;
$$;

-- Records one attempt per key; rows older than a day are purged on the way.
create function public.auth_record_attempt(p_keys text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.auth_attempts where attempted_at < now() - interval '1 day';
  insert into private.auth_attempts (key)
  select distinct k from unnest(p_keys) as k;
$$;

revoke execute on function public.auth_attempt_counts(text[], int) from public, anon, authenticated;
revoke execute on function public.auth_record_attempt(text[]) from public, anon, authenticated;
grant execute on function public.auth_attempt_counts(text[], int) to service_role;
grant execute on function public.auth_record_attempt(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Client text columns (same limits as src/features/clients/schemas.ts).
--    NOT VALID: checked on every new insert/update, existing rows are left as they are.
-- ---------------------------------------------------------------------------
alter table public.clients
  add constraint clients_full_name_length check (char_length(full_name) <= 120) not valid,
  add constraint clients_notes_length check (notes is null or char_length(notes) <= 500) not valid;
