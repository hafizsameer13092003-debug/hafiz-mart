-- Store the selected products as part of each sale banner campaign.
alter table public.banners
  add column if not exists product_ids text[] not null default '{}'::text[];

-- Admin campaign editor must be able to load active and inactive banners.
drop policy if exists "Admins can view banners" on public.banners;
create policy "Admins can view banners"
on public.banners for select to authenticated
using ((select public.is_admin()));

notify pgrst, 'reload schema';
