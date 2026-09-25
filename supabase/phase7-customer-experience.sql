-- Hafiz Mart Phase 7: Customer experience, reviews and safe public review access
-- Run once in Supabase SQL Editor after Phase 6 migrations.

create extension if not exists pgcrypto;

alter table public.reviews add column if not exists product_id uuid;
alter table public.reviews add column if not exists user_id uuid;
alter table public.reviews add column if not exists reviewer_name text;
alter table public.reviews add column if not exists rating integer;
alter table public.reviews add column if not exists title text;
alter table public.reviews add column if not exists comment text;
alter table public.reviews add column if not exists status text not null default 'pending';
alter table public.reviews add column if not exists created_at timestamptz not null default now();
alter table public.reviews add column if not exists updated_at timestamptz not null default now();

create index if not exists reviews_product_id_idx on public.reviews(product_id);
create index if not exists reviews_status_idx on public.reviews(status);
create index if not exists reviews_user_id_idx on public.reviews(user_id);

-- Keep rating and moderation values controlled.
alter table public.reviews drop constraint if exists reviews_rating_check;
alter table public.reviews add constraint reviews_rating_check check (rating between 1 and 5);
alter table public.reviews drop constraint if exists reviews_status_check;
alter table public.reviews add constraint reviews_status_check check (status in ('pending','approved','rejected'));

alter table public.reviews enable row level security;

drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews"
on public.reviews for select
using (status = 'approved');

drop policy if exists "Customers can create own reviews" on public.reviews;
create policy "Customers can create own reviews"
on public.reviews for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Customers can view own reviews" on public.reviews;
create policy "Customers can view own reviews"
on public.reviews for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Customers can update own pending reviews" on public.reviews;
create policy "Customers can update own pending reviews"
on public.reviews for update to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins can manage reviews" on public.reviews;
create policy "Admins can manage reviews"
on public.reviews for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

notify pgrst, 'reload schema';

-- Customer profile self-service fields.
drop policy if exists "Customers can update own profile" on public.profiles;
create policy "Customers can update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

notify pgrst, 'reload schema';
