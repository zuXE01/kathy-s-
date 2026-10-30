-- Apply after orders-setup.sql and Maya setup scripts. Additive; no live changes made by checkout.
begin;
create table if not exists hub_private.menu_stock (
 product_id uuid primary key references public.menu_items(id),
 quantity integer check(quantity between 0 and 1000000),
 version integer not null default 1
);
create table if not exists hub_private.stock_reservations (
 order_id uuid references public.orders(id), product_id uuid references public.menu_items(id),
 quantity integer not null check(quantity>0), released boolean not null default false,
 primary key(order_id,product_id)
);
create table if not exists public.order_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 order_id uuid not null references public.orders(id), status text not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(order_id,status)
);
alter table public.order_notifications enable row level security;
revoke all on public.order_notifications from public,anon,authenticated;
grant select on public.order_notifications to authenticated;
grant update(read_at) on public.order_notifications to authenticated;
drop policy if exists own_notifications on public.order_notifications;
create policy own_notifications on public.order_notifications to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create index if not exists notifications_owner_time on public.order_notifications(user_id,created_at desc);
revoke all on hub_private.menu_stock,hub_private.stock_reservations from public,anon,authenticated;

create or replace function public.menu_stock_list()
returns table(product_id uuid,quantity integer,version integer)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'hub_role','') not in ('owner','admin','platform_admin') then raise exception 'Owner required' using errcode='42501'; end if;
 return query select m.id,s.quantity,coalesce(s.version,0) from public.menu_items m left join hub_private.menu_stock s on s.product_id=m.id;
end $$;
create or replace function public.set_menu_stock(item_id uuid, new_quantity integer, expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'hub_role','') not in ('owner','admin','platform_admin') then raise exception 'Owner required' using errcode='42501'; end if;
 if new_quantity is not null and (new_quantity<0 or new_quantity>1000000) then raise exception 'Invalid stock' using errcode='22023'; end if;
 insert into hub_private.menu_stock(product_id,quantity,version) values(item_id,null,0) on conflict do nothing;
 select version into current_version from hub_private.menu_stock where product_id=item_id for update;
 if expected_version is distinct from current_version then raise exception 'Stock changed; refresh' using errcode='P0001'; end if;
 update hub_private.menu_stock set quantity=new_quantity,version=version+1 where product_id=item_id;
end $$;
revoke all on function public.menu_stock_list(),public.set_menu_stock(uuid,integer,integer) from public,anon;
grant execute on function public.menu_stock_list(),public.set_menu_stock(uuid,integer,integer) to authenticated;

-- Elevated only to write internal stock and customer-owned notifications. Never exposed as RPC.
create or replace function hub_private.stock_and_notify()
returns trigger language plpgsql security definer set search_path='' as $$
declare line record; remaining integer;
begin
 if tg_op='INSERT' then
  for line in select (v->>'product_id')::uuid as product_id,sum((v->>'quantity')::integer)::integer as quantity from jsonb_array_elements(new.items) v group by 1 order by 1 loop
   insert into hub_private.menu_stock(product_id,quantity) values(line.product_id,null) on conflict do nothing;
   select quantity into remaining from hub_private.menu_stock where product_id=line.product_id for update;
   if remaining is not null then
    if remaining<line.quantity then raise exception 'Insufficient stock. Review your cart.' using errcode='P0001'; end if;
    update hub_private.menu_stock set quantity=quantity-line.quantity,version=version+1 where product_id=line.product_id;
    insert into hub_private.stock_reservations(order_id,product_id,quantity) values(new.id,line.product_id,line.quantity);
   end if;
  end loop;
 else
  if new.status is distinct from old.status then
   insert into public.order_notifications(user_id,order_id,status) values(new.user_id,new.id,new.status) on conflict do nothing;
   if new.status in ('cancelled','rejected') and old.status in ('pending','accepted') then
    for line in select * from hub_private.stock_reservations where order_id=new.id and not released order by product_id for update loop
     update hub_private.menu_stock set quantity=case when quantity is null then null else quantity+line.quantity end,version=version+1 where product_id=line.product_id;
     update hub_private.stock_reservations set released=true where order_id=new.id and product_id=line.product_id;
    end loop;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function hub_private.stock_and_notify() from public,anon,authenticated;
drop trigger if exists orders_stock_notifications on public.orders;
create trigger orders_stock_notifications after insert or update of status on public.orders for each row execute function hub_private.stock_and_notify();
commit;
