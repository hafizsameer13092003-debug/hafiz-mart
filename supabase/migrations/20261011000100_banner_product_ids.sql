-- Store the selected products as part of each sale banner campaign.
alter table public.banners
  add column if not exists product_ids text[] not null default '{}'::text[];
