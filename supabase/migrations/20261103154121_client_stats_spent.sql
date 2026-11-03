-- OPTICOR — client file stats (phase 6): add the money spent for the super admin.
-- Secretaries still get counts only (SPEC §11): `spent` is null for them.
-- Money is summed here, never in the browser (CLAUDE.md rule 5).

create or replace function public.client_order_stats(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.require_role();
begin
  return (
    select jsonb_build_object(
      'orders', count(*) filter (where status <> 'cancelled'),
      'delivered', count(*) filter (where status = 'delivered'),
      'stores', count(distinct store_id) filter (where status <> 'cancelled'),
      'first_order_at', min(created_at) filter (where status <> 'cancelled'),
      'last_order_at', max(created_at) filter (where status <> 'cancelled'),
      'spent', case when v_role = 'super_admin'
                    then coalesce(sum(total) filter (where status <> 'cancelled'), 0)
               end
    )
    from public.orders
    where client_id = p_client_id
  );
end;
$$;
