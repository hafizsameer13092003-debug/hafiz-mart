-- Hafiz Mart: product video uploads
-- Run once in the Supabase SQL Editor to enable the Admin > Products > Upload Video control.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-videos', 'product-videos', true, 104857600, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = 104857600, allowed_mime_types = array['video/mp4','video/webm','video/quicktime'];

create policy "Admins can upload product videos"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-videos' and (select public.is_admin()));

create policy "Admins can update product videos"
on storage.objects for update to authenticated
using (bucket_id = 'product-videos' and (select public.is_admin()))
with check (bucket_id = 'product-videos' and (select public.is_admin()));

create policy "Admins can delete product videos"
on storage.objects for delete to authenticated
using (bucket_id = 'product-videos' and (select public.is_admin()));

create policy "Public can view product videos"
on storage.objects for select to public
using (bucket_id = 'product-videos');
