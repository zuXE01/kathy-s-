begin;
create table if not exists public.lalamove_deliveries (
  order_id uuid primary key references public.orders(id),
  provider_id text unique,
  status text not null,
  quote jsonb not null
);
alter table public.lalamove_deliveries enable row level security;
revoke all on public.lalamove_deliveries from public, anon, authenticated;
grant select, insert, update on public.lalamove_deliveries to service_role;
commit;
