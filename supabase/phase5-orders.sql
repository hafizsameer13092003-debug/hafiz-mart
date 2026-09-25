-- Hafiz Mart Phase 5: Real Orders + secure checkout
-- Run this ONCE in Supabase SQL Editor after Phase 4 storage.sql.

create extension if not exists pgcrypto;

-- Make the orders schema future-ready while keeping existing Phase 3 columns compatible.
alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists email text;
alter table public.orders add column if not exists address text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists subtotal numeric(12,2) not null default 0;
alter table public.orders add column if not exists discount numeric(12,2) not null default 0;
alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0;
alter table public.orders add column if not exists total numeric(12,2) not null default 0;
alter table public.orders add column if not exists status text not null default 'pending';
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;

-- Ensure order item records contain the fields needed by the admin order view.
alter table public.order_items add column if not exists product_id uuid;
alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists unit_price numeric(12,2) not null default 0;
alter table public.order_items add column if not exists quantity integer not null default 1;

create unique index if not exists orders_order_number_uidx
on public.orders(order_number)
where order_number is not null;

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- Backfill missing order numbers on any pre-existing records.
update public.orders
set order_number = 'HM-' || to_char(coalesce(created_at, now()), 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where order_number is null;

-- Keep checkout statuses controlled at the application/database boundary.
-- Existing rows are left untouched; new values are validated by the RPC below.

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Admins can view orders" on public.orders;
create policy "Admins can view orders"
on public.orders for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers can view own orders"
on public.orders for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
on public.orders for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can view order items" on public.order_items;
create policy "Admins can view order items"
on public.order_items for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Customers can view own order items" on public.order_items;
create policy "Customers can view own order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  )
);

-- Secure checkout function:
-- * can be called by guests or signed-in customers
-- * calculates prices from the database, not the browser
-- * validates stock
-- * inserts the order and order_items atomically
-- * decrements stock atomically
create or replace function public.create_hafiz_order(
  p_customer jsonb,
  p_items jsonb
)
returns table(order_id uuid, order_number text, subtotal numeric, delivery_fee numeric, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'HM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_unit numeric(12,2);
  v_items_snapshot jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if coalesce(trim(p_customer->>'name'), '') = '' then raise exception 'Customer name is required'; end if;
  if coalesce(trim(p_customer->>'phone'), '') = '' then raise exception 'Phone is required'; end if;
  if coalesce(trim(p_customer->>'address'), '') = '' then raise exception 'Address is required'; end if;
  if coalesce(trim(p_customer->>'city'), '') = '' then raise exception 'City is required'; end if;

  -- Lock product rows while checking stock so two simultaneous checkouts cannot oversell.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'product_id', '') is null then
      raise exception 'Invalid product in cart';
    end if;
    v_qty := greatest(coalesce((v_item->>'quantity')::integer, 0), 0);
    if v_qty < 1 then raise exception 'Invalid quantity'; end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then raise exception 'A product in the cart no longer exists'; end if;
    if coalesce(v_product.status, 'active') <> 'active' then raise exception 'Product % is not available', v_product.name; end if;
    if coalesce(v_product.stock_quantity, 0) < v_qty then raise exception 'Not enough stock for %', v_product.name; end if;

    v_unit := case when v_product.sale_price is not null then v_product.sale_price else v_product.price end;
    v_subtotal := v_subtotal + (v_unit * v_qty);
    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'sku', v_product.sku,
      'quantity', v_qty,
      'unit_price', v_unit,
      'line_total', v_unit * v_qty,
      'image', v_product.main_image
    ));
  end loop;

  v_total := v_subtotal + v_delivery;

  insert into public.orders (
    id, user_id, order_number, customer_name, phone, email, address, city,
    subtotal, discount, delivery_fee, total, status, items
  ) values (
    v_order_id, auth.uid(), v_order_number,
    trim(p_customer->>'name'), trim(p_customer->>'phone'), nullif(trim(p_customer->>'email'), ''),
    trim(p_customer->>'address'), trim(p_customer->>'city'),
    v_subtotal, 0, v_delivery, v_total, 'pending', v_items_snapshot
  );

  for v_item in select value from jsonb_array_elements(v_items_snapshot)
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric
    );

    update public.products
    set stock_quantity = stock_quantity - (v_item->>'quantity')::integer,
        updated_at = now()
    where id = (v_item->>'product_id')::uuid;
  end loop;

  return query select v_order_id, v_order_number, v_subtotal, v_delivery, v_total;
end;
$$;

revoke all on function public.create_hafiz_order(jsonb, jsonb) from public;
grant execute on function public.create_hafiz_order(jsonb, jsonb) to anon, authenticated;

-- Admin order status changes are the only direct order writes intended from the dashboard.
-- The customer checkout uses the secure RPC above.

-- Admins can read registered customer profiles.
drop policy if exists "Admins can view customer profiles" on public.profiles;
create policy "Admins can view customer profiles"
on public.profiles for select to authenticated
using ((select public.is_admin()));
