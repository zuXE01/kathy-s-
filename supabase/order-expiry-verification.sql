-- Isolated database test. Fixtures are rolled back.
begin;
do $$
declare
  customer_id uuid;
  fixture_product uuid;
  stale_id uuid := gen_random_uuid();
  fresh_id uuid := gen_random_uuid();
begin
  select id into customer_id from auth.users limit 1;
  select id into fixture_product from public.menu_items where available limit 1;
  insert into hub_private.menu_stock(product_id,quantity) values(fixture_product,3);
  -- Seed historical timestamps directly because the normal insert trigger sets now().
  alter table public.orders disable trigger user;
  insert into public.orders(id,user_id,request_id,request_hash,customer,items,total_cents,payment_method,created_at)
  select fixture.id,customer_id,gen_random_uuid(),repeat('a',64),'{}'::jsonb,
    jsonb_build_array(jsonb_build_object('product_id',fixture_product,'quantity',1)),1000,'cod',fixture.at
  from (values (stale_id,now()-interval '3 hours'),(fresh_id,now()-interval '2 hours')) fixture(id,at);
  alter table public.orders enable trigger user;
  insert into hub_private.stock_reservations(order_id,product_id,quantity) values(stale_id,fixture_product,1);
  if has_function_privilege('authenticated','public.hub_expire_pending_order(uuid,integer)','EXECUTE') then
    raise exception 'Customers can call expiry worker RPC';
  end if;
  if public.hub_expire_pending_order(fresh_id,1) or public.hub_expire_pending_order(stale_id,2) then
    raise exception 'Fresh or changed order was expired';
  end if;
  if not public.hub_expire_pending_order(stale_id,1) or public.hub_expire_pending_order(stale_id,1) then
    raise exception 'Stale order should expire exactly once';
  end if;
  if not exists(select from public.order_notifications where order_id=stale_id and status='cancelled')
    or (select quantity from hub_private.menu_stock s where s.product_id=fixture_product) is distinct from 4 then
    raise exception 'Missing cancellation notification or stock restoration';
  end if;
end $$;
rollback;
