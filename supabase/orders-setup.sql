-- Additive setup after menu-catalog-setup.sql. No existing data is removed.
begin;
create schema if not exists hub_private;
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  request_hash text not null check (length(request_hash)=64),
  customer jsonb not null,
  items jsonb not null,
  total_cents bigint not null check (total_cents >= 0),
  delivery_cents integer not null default 0 check (delivery_cents=0),
  payment_method text not null check (payment_method in ('cod','demo-online')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','simulated')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','preparing','ready','completed','cancelled')),
  status_note text not null default '' check (length(status_note)<=500),
  history jsonb not null default '[]',
  version integer not null default 1,
  is_demo boolean not null default true check (is_demo),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
-- Keep rerunning this setup safe for databases created before cancellation was added.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending','accepted','rejected','preparing','ready','completed','cancelled'));
create index if not exists orders_user_created on public.orders(user_id,created_at desc,id);
create index if not exists orders_status_created on public.orders(status,created_at desc,id);
create index if not exists orders_created on public.orders(created_at desc,id);
alter table public.orders enable row level security;
revoke all on public.orders from anon,authenticated;
grant select on public.orders to authenticated;
grant insert(user_id,request_id,request_hash,customer,items,total_cents,payment_method) on public.orders to authenticated;
grant update(status,status_note) on public.orders to authenticated;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
using (user_id=(select auth.uid()) or (select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin','staff','kitchen_staff'));
drop policy if exists orders_create on public.orders;
create policy orders_create on public.orders for insert to authenticated
with check (user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated
using ((select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin','staff','kitchen_staff'))
with check ((select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin','staff','kitchen_staff'));
drop policy if exists orders_customer_cancel on public.orders;
create policy orders_customer_cancel on public.orders for update to authenticated
using (user_id=(select auth.uid()) and status='pending')
with check (user_id=(select auth.uid()) and status='cancelled');

-- Invoker trigger: no elevated privileges or service key. Reprices even direct API inserts.
create or replace function hub_private.prepare_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  entry jsonb; product public.menu_items%rowtype; option_price numeric;
  quantity integer; result jsonb := '[]'; total bigint := 0;
  field text; clean_customer jsonb := '{}'; seen text[] := '{}'; identity text;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Sign in required' using errcode='42501'; end if;
  if jsonb_typeof(new.customer) is distinct from 'object' or pg_column_size(new.customer)>8000 then raise exception 'Invalid customer details' using errcode='22023'; end if;
  foreach field in array array['name','email','phone','address','barangay','city','province','postal','notes'] loop
    if jsonb_typeof(new.customer->field) is distinct from 'string' or length(trim(new.customer->>field))>(case when field='notes' then 500 else 200 end)
      or (field<>'notes' and length(trim(new.customer->>field))=0) then
      raise exception 'Invalid customer details' using errcode='22023';
    end if;
    clean_customer := clean_customer || jsonb_build_object(field,trim(new.customer->>field));
  end loop;
  if clean_customer->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or clean_customer->>'phone' !~ '^[+]?[0-9 ()-]{7,20}$'
    or length(regexp_replace(clean_customer->>'phone','[^0-9]','','g'))<7
    or clean_customer->>'postal' !~ '^[0-9]{4}$' then raise exception 'Invalid contact details' using errcode='22023'; end if;
  if jsonb_typeof(new.items) is distinct from 'array' then raise exception 'Invalid cart' using errcode='22023'; end if;
  if jsonb_array_length(new.items) not between 1 and 120 then raise exception 'Cart must contain 1 to 120 lines' using errcode='22023'; end if;
  -- Lock menu rows in a stable order so an admin edit cannot race this snapshot.
  perform 1 from public.menu_items m where m.id in
    (select (x->>'product_id')::uuid from jsonb_array_elements(new.items) x) order by m.id for share;
  for entry in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(entry->'quantity') is distinct from 'number' or coalesce(entry->>'quantity','') !~ '^[0-9]{1,2}$'
      or jsonb_typeof(entry->'label') is distinct from 'string' then raise exception 'Invalid cart quantity or option' using errcode='22023'; end if;
    quantity := (entry->>'quantity')::integer;
    if quantity not between 1 and 99 then raise exception 'Invalid cart quantity' using errcode='22023'; end if;
    identity := jsonb_build_array(entry->>'product_id',entry->>'label')::text;
    if identity=any(seen) then raise exception 'Duplicate cart line' using errcode='22023'; end if;
    seen := array_append(seen,identity);
    select * into product from public.menu_items where id=(entry->>'product_id')::uuid and available;
    if not found then raise exception 'An item is no longer available' using errcode='P0001'; end if;
    if jsonb_array_length(product.variants)=0 then
      option_price := case when entry->>'label'='Regular' then product.price else null end;
    else
      select (v->>'price')::numeric into option_price from jsonb_array_elements(product.variants) v where v->>'label'=entry->>'label' limit 1;
    end if;
    if option_price is null or option_price<0 or option_price>100000 then raise exception 'An option is no longer available' using errcode='P0001'; end if;
    total := total + round(option_price*100)::bigint*quantity;
    result := result || jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'section',product.section,'label',entry->>'label','quantity',quantity,'cents',round(option_price*100)::bigint));
  end loop;
  if total <> new.total_cents then raise exception 'Prices changed. Review your cart and try again.' using errcode='P0001'; end if;
  new.customer:=clean_customer; new.items:=result; new.total_cents:=total;
  new.status:='pending'; new.status_note:=''; new.version:=1; new.is_demo:=true; new.delivery_cents:=0;
  new.payment_status:=case when new.payment_method='cod' then 'unpaid' else 'simulated' end;
  new.created_at:=now(); new.updated_at:=now();
  new.history:=jsonb_build_array(jsonb_build_object('status','pending','at',now(),'actor',auth.uid(),'note','Order submitted'));
  return new;
end; $$;
revoke all on function hub_private.prepare_order() from public,anon,authenticated;
drop trigger if exists orders_prepare on public.orders;
create trigger orders_prepare before insert on public.orders for each row execute function hub_private.prepare_order();

create or replace function hub_private.transition_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare role text := coalesce(auth.jwt()->'app_metadata'->>'hub_role','');
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if role not in ('admin','owner','platform_admin','staff','kitchen_staff') and not (old.user_id=auth.uid() and old.status='pending' and new.status='cancelled') then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if role='kitchen_staff' and new.status not in ('preparing','ready') then raise exception 'Kitchen staff cannot perform this transition' using errcode='42501'; end if;
  if (to_jsonb(new)-array['status','status_note']) is distinct from (to_jsonb(old)-array['status','status_note']) then raise exception 'Order details are immutable' using errcode='22023'; end if;
  if not (
    (old.status='pending' and new.status in ('accepted','rejected')) or
    (old.status='accepted' and new.status in ('preparing','rejected')) or
    (old.status='preparing' and new.status in ('ready','rejected')) or
    (old.status='ready' and new.status='completed') or
    (old.status='pending' and new.status='cancelled')
  ) then raise exception 'Invalid status transition' using errcode='P0001'; end if;
  new.status_note:=trim(new.status_note);
  if new.status='rejected' and length(new.status_note)=0 then raise exception 'Give a rejection reason' using errcode='22023'; end if;
  new.version:=old.version+1; new.updated_at:=now();
  new.history:=old.history || jsonb_build_array(jsonb_build_object('status',new.status,'at',now(),'actor',auth.uid(),'note',new.status_note));
  return new;
end; $$;
revoke all on function hub_private.transition_order() from public,anon,authenticated;
drop trigger if exists orders_transition on public.orders;
create trigger orders_transition before update on public.orders for each row execute function hub_private.transition_order();
commit;
