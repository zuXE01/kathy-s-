-- Run after admin-setup.sql. Additive and repeatable; existing items are preserved.
begin;
alter table public.menu_items add column if not exists source_key text;
alter table public.menu_items add column if not exists section text not null default 'House Favorites';
alter table public.menu_items add column if not exists variants jsonb not null default '[]'::jsonb;
create unique index if not exists menu_items_source_key on public.menu_items(source_key);
-- A dish can share a name across sections, but not be entered twice in one section.
-- Deliberately fail if pre-existing duplicates need an owner's decision; never delete them.
create unique index if not exists menu_items_section_name on public.menu_items(category,lower(trim(section)),lower(trim(name)));
alter table public.menu_items drop constraint if exists menu_items_section_length;
alter table public.menu_items add constraint menu_items_section_length check(length(trim(section)) between 1 and 80);
alter table public.menu_items drop constraint if exists menu_items_variants_shape;
alter table public.menu_items add constraint menu_items_variants_shape check(
  case when jsonb_typeof(variants) = 'array' then jsonb_array_length(variants) <= 12 else false end
);
commit;
