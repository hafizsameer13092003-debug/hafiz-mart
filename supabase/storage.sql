-- Hafiz Mart Phase 4: Product image storage
-- Run this once in Supabase SQL Editor.

-- Public bucket so storefront visitors can load product images without login.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Admins can upload product images.
create policy "Admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

-- Admins can update their uploaded objects.
create policy "Admins can update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin())
)
with check (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

-- Admins can delete product images.
create policy "Admins can delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin())
);

-- Public storefront visitors may list images in this bucket.
create policy "Public can view product image objects"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

-- Product gallery support: stores an array of public image URLs.
alter table public.products
add column if not exists images jsonb not null default '[]'::jsonb;

create index if not exists products_images_gin_idx
on public.products using gin (images);
