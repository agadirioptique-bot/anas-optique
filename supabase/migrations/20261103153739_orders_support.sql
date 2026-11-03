-- OPTICOR — Clients & Orders pages support (SPEC §8, phase 6).

-- ---------------------------------------------------------------------------
-- One row per order for the board, list, client file and search.
-- security_invoker: the caller's RLS on orders decides which rows exist.
-- ---------------------------------------------------------------------------
create view public.order_overview
with (security_invoker = true)
as
select
  o.id,
  o.store_id,
  s.name as store_name,
  s.prefix as store_prefix,
  public.format_order_number(
    s.prefix, o.booklet, o.slip_number,
    coalesce((select (a.value ->> 'digits')::int from public.app_settings a where a.key = 'slip_number_padding'), 5)
  ) as display_number,
  o.slip_number,
  o.booklet,
  o.status,
  o.client_id,
  c.full_name as client_name,
  c.phone_e164 as client_phone,
  c.has_whatsapp as client_has_whatsapp,
  c.is_loyal as client_is_loyal,
  o.subtotal,
  o.discount_amount,
  o.total,
  p.paid::numeric(12,2) as paid,
  (o.total - p.paid)::numeric(12,2) as balance,
  o.client_own_frame,
  (
    select pc.name
      from public.order_items i
      join public.product_categories pc on pc.id = i.category_id
      join public.product_types t on t.id = pc.product_type_id
     where i.order_id = o.id and t.is_frame
     limit 1
  ) as frame_name,
  o.re_sph, o.re_cyl, o.re_axis, o.re_add, o.le_sph, o.le_cyl, o.le_axis, o.le_add,
  o.created_at,
  o.delivered_at,
  o.cancelled_at,
  coalesce(
    (select max(h.changed_at) from public.order_status_history h where h.order_id = o.id and h.to_status = o.status),
    o.created_at
  ) as status_since
from public.orders o
join public.clients c on c.id = o.client_id
left join public.stores s on s.id = o.store_id
cross join lateral (
  select coalesce(sum(pay.amount), 0) as paid from public.payments pay where pay.order_id = o.id
) p;

-- ---------------------------------------------------------------------------
-- Prescription photo path (orders are written through RPCs only). The file
-- must already be in the private bucket under prescriptions/{order_id}/.
-- ---------------------------------------------------------------------------
create function public.set_prescription_photo(p_order_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  perform private.require_store_access(v_order.store_id);
  if p_path is null
     or public.storage_order_id(p_path) is distinct from p_order_id
     or not exists (select 1 from storage.objects where bucket_id = 'private' and name = p_path) then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  update public.orders set prescription_photo_path = p_path where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Names for timelines and history ("by Salma") without opening profiles.
-- ---------------------------------------------------------------------------
create function public.user_names(p_ids uuid[])
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_role();
  return query select p.id, p.full_name from public.profiles p where p.id = any (p_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Clients list with segment counts across ALL stores (SPEC §11) — counts and
-- dates only, never money, so secretaries can use it.
-- Segments: loyal = is_loyal; new = 0–1 non-cancelled order; regular = the rest.
-- ---------------------------------------------------------------------------
create function public.client_directory(
  p_q text default null,
  p_segment text default 'all',
  p_sort text default 'name',
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_digits text := regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_result jsonb;
begin
  perform private.require_role();
  if p_segment not in ('all', 'new', 'regular', 'loyal') or p_sort not in ('name', 'recent', 'orders') then
    raise exception 'OPTICOR:INVALID_INPUT';
  end if;
  v_phone := case
               when v_digits like '212%' then substr(v_digits, 4)
               when v_digits like '0%' then substr(v_digits, 2)
               else v_digits
             end;

  with stats as (
    select
      c.id, c.full_name, c.phone_e164, c.has_whatsapp, c.is_loyal, c.loyal_since,
      c.pending_discount_type is not null as has_pending_discount,
      (select count(*) from public.orders o where o.client_id = c.id and o.status <> 'cancelled')::int as orders,
      (select max(o.created_at) from public.orders o where o.client_id = c.id and o.status <> 'cancelled') as last_order_at
    from public.clients c
    where v_q is null
       or c.full_name ilike '%' || v_q || '%'
       or (length(v_phone) >= 3 and c.phone_e164 like '%' || v_phone || '%')
  ),
  seg as (
    select s.*,
           case when s.is_loyal then 'loyal' when s.orders <= 1 then 'new' else 'regular' end as segment
      from stats s
  )
  select jsonb_build_object(
    'counts', (
      select jsonb_build_object(
        'all', count(*),
        'new', count(*) filter (where segment = 'new'),
        'regular', count(*) filter (where segment = 'regular'),
        'loyal', count(*) filter (where segment = 'loyal')
      ) from seg
    ),
    'rows', coalesce((
      select jsonb_agg(r)
        from (
          select id, full_name, phone_e164, has_whatsapp, is_loyal, loyal_since, has_pending_discount,
                 orders, last_order_at, segment
            from seg
           where p_segment = 'all' or segment = p_segment
           order by
             case when p_sort = 'orders' then orders end desc nulls last,
             case when p_sort = 'recent' then last_order_at end desc nulls last,
             full_name
           limit least(greatest(p_limit, 1), 200)
          offset greatest(p_offset, 0)
        ) r
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- "A client named … already exists" while creating a client (RLS: all clients).
create function public.similar_clients(p_name text)
returns table (id uuid, full_name text, phone_e164 text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.full_name, c.phone_e164
    from public.clients c
   where length(btrim(coalesce(p_name, ''))) >= 3
     and extensions.similarity(c.full_name, btrim(p_name)) >= 0.4
   order by extensions.similarity(c.full_name, btrim(p_name)) desc
   limit 3;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'set_prescription_photo(uuid, text)',
    'user_names(uuid[])',
    'client_directory(text, text, text, int, int)',
    'similar_clients(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
