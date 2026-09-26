begin;
create table public.customer_details (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 phone text not null default '' check(phone='' or (phone ~ '^\+?[0-9 ()-]{7,20}$' and length(regexp_replace(phone,'[^0-9]','','g'))>=7)),
 address text not null default '' check(length(address)<=200),
 barangay text not null default '' check(length(barangay)<=100),
 city text not null default '' check(length(city)<=100),
 province text not null default '' check(length(province)<=100),
 postal text not null default '' check(postal='' or postal ~ '^[0-9]{4}$'),
 notes text not null default '' check(length(notes)<=500)
);
alter table public.customer_details enable row level security;
revoke all on public.customer_details from anon,authenticated;
grant select,insert,update on public.customer_details to authenticated;
create policy customer_details_owner on public.customer_details for all to authenticated
using (user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false))
with check (user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
commit;
