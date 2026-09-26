create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  dob date,
  gender text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.try_profile_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  return nullif(value, '')::date;
exception when others then
  return null;
end;
$$;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, dob, gender)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    public.try_profile_date(new.raw_user_meta_data ->> 'dob'),
    nullif(new.raw_user_meta_data ->> 'gender', '')
  )
  on conflict (id) do update set
    name = excluded.name,
    dob = excluded.dob,
    gender = excluded.gender,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, name, dob, gender)
select
  id,
  coalesce(raw_user_meta_data ->> 'name', ''),
  public.try_profile_date(raw_user_meta_data ->> 'dob'),
  nullif(raw_user_meta_data ->> 'gender', '')
from auth.users
on conflict (id) do update set
  name = excluded.name,
  dob = excluded.dob,
  gender = excluded.gender,
  updated_at = now();