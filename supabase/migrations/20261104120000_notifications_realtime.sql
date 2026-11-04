-- OPTICOR — Notifications in the app (SPEC §10, phase 12).

-- Realtime: the bell listens to its own rows. postgres_changes applies RLS
-- (notifications_select: user_id = auth.uid()), so nobody receives another user's rows.
alter publication supabase_realtime add table public.notifications;

-- Mark the caller's notifications read: these ids, or every unread one when null.
-- security invoker: RLS + the column grant (read_at only) still apply.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.notifications
     set read_at = now()
   where user_id = (select auth.uid())
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
