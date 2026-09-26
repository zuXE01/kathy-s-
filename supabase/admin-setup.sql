-- Run after schema.sql. No admin role is assigned by email at signup.
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  category text not null check (category in ('coffee', 'bites', 'sweet')),
  price numeric(10,2) not null check (price between 0 and 100000),
  available boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;
revoke all on public.menu_items from anon, authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select on public.menu_items to anon;
drop policy if exists hub_available_menu on public.menu_items;
create policy hub_available_menu on public.menu_items for select to anon, authenticated
using (available = true);
drop policy if exists hub_admin_menu on public.menu_items;
create policy hub_admin_menu on public.menu_items for all to authenticated
using ((select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin'))
with check ((select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin'));
grant select on public.profiles to authenticated;
drop policy if exists hub_admin_profiles on public.profiles;
create policy hub_admin_profiles on public.profiles for select to authenticated
using ((select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin'));
