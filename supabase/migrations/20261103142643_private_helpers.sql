-- OPTICOR — internal helpers (SPEC §6). Schema `private` is not exposed by the
-- Data API: only security definer functions and triggers call these.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role / store checks (raise OPTICOR:FORBIDDEN)
-- ---------------------------------------------------------------------------

-- Any active, signed-in user. Returns the role.
create function private.require_role()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text := public.auth_role();
begin
  if v_role is null then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;
  return v_role;
end;
$$;

create function private.require_super_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;
end;
$$;

-- Super admin, or the secretary of that store.
create function private.require_store_access(p_store_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text := private.require_role();
begin
  if v_role <> 'super_admin' and public.auth_store_id() is distinct from p_store_id then
    raise exception 'OPTICOR:FORBIDDEN';
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create function private.setting(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select value from public.app_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Stock: quantity = sum of movements, never negative.
-- Every function that removes stock takes the (store, category) lock first,
-- so two concurrent sales cannot both take the last frame.
-- ---------------------------------------------------------------------------
create function private.stock_qty(p_store_id uuid, p_category_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(qty_delta), 0)::int
    from public.stock_movements
   where store_id = p_store_id and category_id = p_category_id;
$$;

create function private.lock_stock(p_store_id uuid, p_category_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_category_id::text, 0));
$$;

-- Adds one movement. Negative deltas are checked against the locked quantity.
create function private.move_stock(
  p_store_id uuid,
  p_category_id uuid,
  p_qty_delta int,
  p_kind public.stock_movement_kind,
  p_ref_table text default null,
  p_ref_id uuid default null,
  p_reason text default null,
  p_reason_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_qty_delta = 0 then
    return;
  end if;
  if p_qty_delta < 0 then
    perform private.lock_stock(p_store_id, p_category_id);
    if private.stock_qty(p_store_id, p_category_id) + p_qty_delta < 0 then
      raise exception 'OPTICOR:NO_STOCK';
    end if;
  end if;
  insert into public.stock_movements (store_id, category_id, qty_delta, kind, ref_table, ref_id, reason, reason_id)
  values (p_store_id, p_category_id, p_qty_delta, p_kind, p_ref_table, p_ref_id, p_reason, p_reason_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications (SPEC §10). dedupe_key makes "notify once" idempotent.
-- ---------------------------------------------------------------------------
create function private.notify_users(
  p_user_ids uuid[],
  p_kind text,
  p_title_key text,
  p_params jsonb default '{}',
  p_link text default null,
  p_dedupe_key text default null
)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title_key, params, link, dedupe_key)
  select distinct u, p_kind, p_title_key, coalesce(p_params, '{}'), p_link, p_dedupe_key
    from unnest(p_user_ids) as u
  on conflict (user_id, dedupe_key) do nothing;
$$;

create function private.super_admin_ids()
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(id), '{}') from public.profiles where role = 'super_admin' and is_active;
$$;

create function private.store_user_ids(p_store_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(id), '{}')
    from public.profiles
   where role = 'secretary' and is_active and store_id = p_store_id;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
