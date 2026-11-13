-- Secretary → admin WhatsApp (SPEC §8, §11): each account can hold a WhatsApp number; secretaries
-- read the active super admins' numbers only through admin_contacts() (3 fields, no other profile data).

alter table public.profiles
  add column whatsapp_e164 text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- Set or clear (null) a user's WhatsApp number. Super admins only; their own number included.
create function public.set_user_whatsapp(p_user_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  update public.profiles set whatsapp_e164 = p_phone where id = p_user_id;
  if not found then
    raise exception 'OPTICOR:NOT_FOUND';
  end if;
end;
$$;

-- Who a secretary can notify: active super admins with a number, never the caller.
create function public.admin_contacts()
returns table (id uuid, full_name text, whatsapp_e164 text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_role();
  return query
    select p.id, p.full_name, p.whatsapp_e164
      from public.profiles p
     where p.role = 'super_admin' and p.is_active and p.whatsapp_e164 is not null
       and p.id <> (select auth.uid())
     order by p.full_name;
end;
$$;

-- Settings › Users shows the number: new return type, so drop and recreate (same body + the column).
drop function public.admin_list_users();
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
  last_sign_in_at timestamptz,
  whatsapp_e164 text
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
           u.invited_at, u.email_confirmed_at, u.last_sign_in_at, p.whatsapp_e164
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.is_active desc, p.full_name;
end;
$$;

revoke execute on function public.set_user_whatsapp(uuid, text) from public, anon;
revoke execute on function public.admin_contacts() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.set_user_whatsapp(uuid, text) to authenticated;
grant execute on function public.admin_contacts() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
