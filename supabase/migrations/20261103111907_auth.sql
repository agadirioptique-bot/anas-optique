-- OPTICOR — authentication (SPEC §4): access token hook, role/store helpers,
-- secretary store check, the policies the app needs to read its own session,
-- and the user-management RPCs of Settings › Users.
-- All other policies come in phase 4.

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: claims app_role + store_id from an ACTIVE profile.
-- No profile / inactive → both claims removed → RLS denies everything.
-- Enable in Dashboard › Authentication › Hooks (see docs/AUTH-SETUP.md).
-- ---------------------------------------------------------------------------
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb) - 'app_role' - 'store_id';
  v_role public.app_role;
  v_store_id uuid;
begin
  select p.role, p.store_id
    into v_role, v_store_id
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid
     and p.is_active;

  if v_role is not null then
    claims := claims || jsonb_build_object('app_role', v_role::text, 'store_id', v_store_id);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant select on public.profiles to supabase_auth_admin;
create policy profiles_select_auth_admin on public.profiles
  for select to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- Helpers used by RLS and RPCs. The JWT claim counts only while it still
-- matches an active profile, so deactivation and role/store changes apply
-- immediately (not at the next token refresh). Security definer: reads
-- profiles without going through its RLS (no policy recursion).
-- Use as (select public.auth_role()) in policies.
-- ---------------------------------------------------------------------------
create function public.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active
     and p.role::text = auth.jwt() ->> 'app_role';
$$;

create function public.auth_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.store_id
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active
     and p.role::text = auth.jwt() ->> 'app_role'
     and p.store_id is not distinct from nullif(auth.jwt() ->> 'store_id', '')::uuid;
$$;

create function public.is_super_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.auth_role() = 'super_admin', false);
$$;

revoke execute on function public.auth_role() from public, anon;
revoke execute on function public.auth_store_id() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_store_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: a secretary belongs to one active store (never the lab);
-- a super admin has no store.
-- ---------------------------------------------------------------------------
create function public.profiles_check_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role = 'super_admin' then
    new.store_id := null;
  elsif not exists (
    select 1 from public.stores s
     where s.id = new.store_id and s.kind = 'store' and s.is_active
  ) then
    raise exception 'OPTICOR:SECRETARY_STORE_INVALID';
  end if;
  return new;
end;
$$;

create trigger profiles_check_store
  before insert or update of role, store_id on public.profiles
  for each row execute function public.profiles_check_store();

-- ---------------------------------------------------------------------------
-- Policies needed by the app shell (the rest: phase 4).
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_super_admin()));

create policy stores_select on public.stores
  for select to authenticated
  using (
    (select public.is_super_admin())
    or (is_active and (select public.auth_role()) is not null)
  );

-- ---------------------------------------------------------------------------
-- Settings › Users
-- ---------------------------------------------------------------------------

-- Profiles with their auth status (invited / confirmed / last sign-in).
create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.app_role,
  store_id uuid,
  is_active boolean,
  locale public.app_locale,
  created_at timestamptz,
  invited_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_super_admin() then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;

  return query
    select p.id, p.full_name, p.email, p.role, p.store_id, p.is_active, p.locale, p.created_at,
           u.invited_at, u.email_confirmed_at, u.last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.is_active desc, p.full_name;
end;
$$;

-- Change role / store / active flag. Revokes the user's sessions when anything
-- changes so the next token refresh fails (the helpers already stop trusting
-- the old claims).
create function public.admin_update_user_access(
  p_user_id uuid,
  p_role public.app_role,
  p_store_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'OPTICOR:SELF_CHANGE';
  end if;

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;

  if v_old.role = 'super_admin' and v_old.is_active
     and (p_role <> 'super_admin' or not p_is_active)
     and not exists (
       select 1 from public.profiles
        where role = 'super_admin' and is_active and id <> p_user_id
     ) then
    raise exception 'OPTICOR:LAST_SUPER_ADMIN';
  end if;

  update public.profiles
     set role = p_role,
         store_id = case when p_role = 'super_admin' then null else p_store_id end,
         is_active = p_is_active
   where id = p_user_id;

  if v_old.role is distinct from p_role
     or v_old.store_id is distinct from (case when p_role = 'super_admin' then null else p_store_id end)
     or v_old.is_active is distinct from p_is_active then
    delete from auth.sessions where user_id = p_user_id;
  end if;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_update_user_access(uuid, public.app_role, uuid, boolean) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user_access(uuid, public.app_role, uuid, boolean) to authenticated;
