-- Hafiz Mart Phase 6: Coupons + secure discounts + promotional banner images
-- Run once in Supabase SQL Editor after Phase 5.

create extension if not exists pgcrypto;

-- =========================
-- COUPONS
-- =========================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null default 'percent',
  discount_value numeric(12,2) not null default 0,
  min_order_amount numeric(12,2) not null default 0,
  max_discount numeric(12,2),
  usage_limit integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_lower check (code = lower(code)),
  constraint coupons_discount_type_check check (discount_type in ('percent','fixed')),
  constraint coupons_discount_value_check check (discount_value >= 0),
  constraint coupons_min_order_check check (min_order_amount >= 0),
  constraint coupons_max_discount_check check (max_discount is null or max_discount >= 0),
  constraint coupons_usage_limit_check check (usage_limit is null or usage_limit > 0),
  constraint coupons_used_count_check check (used_count >= 0),
  constraint coupons_status_check check (status in ('active','inactive'))
);

alter table public.coupons add column if not exists code text;
alter table public.coupons add column if not exists discount_type text not null default 'percent';
alter table public.coupons add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.coupons add column if not exists min_order_amount numeric(12,2) not null default 0;
alter table public.coupons add column if not exists max_discount numeric(12,2);
alter table public.coupons add column if not exists usage_limit integer;
alter table public.coupons add column if not exists used_count integer not null default 0;
alter table public.coupons add column if not exists starts_at timestamptz;
alter table public.coupons add column if not exists expires_at timestamptz;
alter table public.coupons add column if not exists status text not null default 'active';
alter table public.coupons add column if not exists created_at timestamptz not null default now();
alter table public.coupons add column if not exists updated_at timestamptz not null default now();

create unique index if not exists coupons_code_uidx on public.coupons(code);
create index if not exists coupons_status_idx on public.coupons(status);

-- =========================
-- PROMOTIONAL BANNER IMAGE
-- =========================
alter table public.banners add column if not exists image_url text;

-- =========================
-- RLS
-- =========================
alter table public.coupons enable row level security;

drop policy if exists "Admins can view coupons" on public.coupons;
create policy "Admins can view coupons"
on public.coupons for select to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can insert coupons" on public.coupons;
create policy "Admins can insert coupons"
on public.coupons for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update coupons" on public.coupons;
create policy "Admins can update coupons"
on public.coupons for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete coupons" on public.coupons;
create policy "Admins can delete coupons"
on public.coupons for delete to authenticated
using ((select public.is_admin()));

-- Ensure admins can manage banners (safe if these policies already exist).
drop policy if exists "Admins can insert banners" on public.banners;
create policy "Admins can insert banners"
on public.banners for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update banners" on public.banners;
create policy "Admins can update banners"
on public.banners for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete banners" on public.banners;
create policy "Admins can delete banners"
on public.banners for delete to authenticated
using ((select public.is_admin()));

-- =========================
-- PUBLIC COUPON VALIDATION
-- =========================
create or replace function public.validate_hafiz_coupon(
  p_code text,
  p_subtotal numeric
)
returns table(code text, discount numeric, message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_subtotal numeric(12,2) := greatest(coalesce(p_subtotal,0),0);
  v_discount numeric(12,2) := 0;
begin
  select * into v_coupon
  from public.coupons
  where code = lower(trim(coalesce(p_code,'')))
  limit 1;

  if not found then
    return query select lower(trim(coalesce(p_code,''))), 0::numeric, 'Invalid coupon code';
    return;
  end if;

  if v_coupon.status <> 'active' then
    return query select v_coupon.code, 0::numeric, 'This coupon is inactive';
    return;
  end if;
  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    return query select v_coupon.code, 0::numeric, 'This coupon is not active yet';
    return;
  end if;
  if v_coupon.expires_at is not null and now() > v_coupon.expires_at then
    return query select v_coupon.code, 0::numeric, 'This coupon has expired';
    return;
  end if;
  if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
    return query select v_coupon.code, 0::numeric, 'This coupon usage limit has been reached';
    return;
  end if;
  if v_subtotal < v_coupon.min_order_amount then
    return query select v_coupon.code, 0::numeric,
      'Minimum order is Rs. ' || to_char(v_coupon.min_order_amount, 'FM999999999990.00');
    return;
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := v_subtotal * v_coupon.discount_value / 100;
  else
    v_discount := v_coupon.discount_value;
  end if;
  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;
  v_discount := greatest(least(v_discount, v_subtotal),0);

  return query select v_coupon.code, round(v_discount,2), 'Coupon applied successfully';
end;
$$;

revoke all on function public.validate_hafiz_coupon(text,numeric) from public;
grant execute on function public.validate_hafiz_coupon(text,numeric) to anon, authenticated;

-- =========================
-- SECURE COUPON-AWARE CHECKOUT
-- =========================
create or replace function public.create_hafiz_order(
  p_customer jsonb,
  p_items jsonb,
  p_coupon_code text default null
)
returns table(order_id uuid, order_number text, subtotal numeric, discount numeric, delivery_fee numeric, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'HM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_delivery numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_coupon public.coupons%rowtype;
  v_qty integer;
  v_unit numeric(12,2);
  v_items_snapshot jsonb := '[]'::jsonb;
  v_code text := lower(trim(coalesce(p_coupon_code,'')));
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if coalesce(trim(p_customer->>'name'), '') = '' then raise exception 'Customer name is required'; end if;
  if coalesce(trim(p_customer->>'phone'), '') = '' then raise exception 'Phone is required'; end if;
  if coalesce(trim(p_customer->>'address'), '') = '' then raise exception 'Address is required'; end if;
  if coalesce(trim(p_customer->>'city'), '') = '' then raise exception 'City is required'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'product_id', '') is null then raise exception 'Invalid product in cart'; end if;
    v_qty := greatest(coalesce((v_item->>'quantity')::integer,0),0);
    if v_qty < 1 then raise exception 'Invalid quantity'; end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid for update;
    if not found then raise exception 'A product in the cart no longer exists'; end if;
    if coalesce(v_product.status,'active') <> 'active' then raise exception 'Product % is not available', v_product.name; end if;
    if coalesce(v_product.stock_quantity,0) < v_qty then raise exception 'Not enough stock for %', v_product.name; end if;

    v_unit := case when v_product.sale_price is not null then v_product.sale_price else v_product.price end;
    v_subtotal := v_subtotal + (v_unit * v_qty);
    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'name',v_product.name,'sku',v_product.sku,
      'quantity',v_qty,'unit_price',v_unit,'line_total',v_unit*v_qty,'image',v_product.main_image
    ));
  end loop;

  if v_code <> '' then
    select * into v_coupon from public.coupons where code = v_code for update;
    if not found then raise exception 'Invalid coupon code'; end if;
    if v_coupon.status <> 'active' then raise exception 'This coupon is inactive'; end if;
    if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception 'This coupon is not active yet'; end if;
    if v_coupon.expires_at is not null and now() > v_coupon.expires_at then raise exception 'This coupon has expired'; end if;
    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then raise exception 'This coupon usage limit has been reached'; end if;
    if v_subtotal < v_coupon.min_order_amount then raise exception 'Minimum order for coupon is Rs. %', v_coupon.min_order_amount; end if;

    if v_coupon.discount_type = 'percent' then
      v_discount := v_subtotal * v_coupon.discount_value / 100;
    else
      v_discount := v_coupon.discount_value;
    end if;
    if v_coupon.max_discount is not null then v_discount := least(v_discount,v_coupon.max_discount); end if;
    v_discount := greatest(least(v_discount,v_subtotal),0);
  end if;

  v_total := greatest(v_subtotal - v_discount + v_delivery,0);

  insert into public.orders (
    id,user_id,order_number,customer_name,phone,email,address,city,
    subtotal,discount,delivery_fee,total,status,items
  ) values (
    v_order_id,auth.uid(),v_order_number,trim(p_customer->>'name'),trim(p_customer->>'phone'),
    nullif(trim(p_customer->>'email'),''),trim(p_customer->>'address'),trim(p_customer->>'city'),
    v_subtotal,v_discount,v_delivery,v_total,'pending',v_items_snapshot
  );

  for v_item in select value from jsonb_array_elements(v_items_snapshot)
  loop
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price)
    values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric);
    update public.products set stock_quantity=stock_quantity-(v_item->>'quantity')::integer,updated_at=now()
    where id=(v_item->>'product_id')::uuid;
  end loop;

  if v_code <> '' then
    update public.coupons set used_count=used_count+1,updated_at=now() where id=v_coupon.id;
  end if;

  return query select v_order_id,v_order_number,v_subtotal,v_discount,v_delivery,v_total;
end;
$$;

revoke all on function public.create_hafiz_order(jsonb,jsonb,text) from public;
grant execute on function public.create_hafiz_order(jsonb,jsonb,text) to anon, authenticated;

-- =========================
-- BANNER STORAGE
-- =========================
insert into storage.buckets (id,name,public)
values ('banner-images','banner-images',true)
on conflict (id) do update set public=true;

drop policy if exists "Public can view banner images" on storage.objects;
create policy "Public can view banner images"
on storage.objects for select to public
using (bucket_id='banner-images');

drop policy if exists "Admins can upload banner images" on storage.objects;
create policy "Admins can upload banner images"
on storage.objects for insert to authenticated
with check (bucket_id='banner-images' and (select public.is_admin()));

drop policy if exists "Admins can update banner images" on storage.objects;
create policy "Admins can update banner images"
on storage.objects for update to authenticated
using (bucket_id='banner-images' and (select public.is_admin()))
with check (bucket_id='banner-images' and (select public.is_admin()));

drop policy if exists "Admins can delete banner images" on storage.objects;
create policy "Admins can delete banner images"
on storage.objects for delete to authenticated
using (bucket_id='banner-images' and (select public.is_admin()));

notify pgrst, 'reload schema';
