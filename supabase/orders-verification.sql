-- Run in SQL Editor after orders-setup.sql; all sample orders are rolled back.
-- Requires two existing auth users; never returns their contact details.
begin;
do $$ declare ids uuid[]; begin
 select array_agg(id) into ids from (select id from auth.users order by created_at limit 2) u;
 if array_length(ids,1)<2 then raise exception 'Two existing accounts needed for isolation test';end if;
 perform set_config('hub.test_user1',ids[1]::text,true);
 perform set_config('hub.test_user2',ids[2]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[1],'role','authenticated','app_metadata','{}'::jsonb)::text,true);
end $$;
set local role authenticated;
do $$ declare product public.menu_items%rowtype; placed public.orders%rowtype; denied boolean:=false; begin
 select * into product from public.menu_items where available order by id limit 1;
 insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method)
 values(auth.uid(),'01000000-0000-4000-8000-000000000001',repeat('a',64),
 '{"name":"Demo Test","email":"test@example.test","phone":"09123456789","address":"123 Test","barangay":"Test","city":"Manila","province":"Metro Manila","postal":"1000","notes":""}',
 jsonb_build_array(jsonb_build_object('product_id',product.id,'label',product.variants->0->>'label','quantity',2,'name','FORGED','cents',1)),
 round((product.variants->0->>'price')::numeric*100)*2,'cod') returning * into placed;
 if placed.items->0->>'name'='FORGED' or placed.status<>'pending' or placed.payment_status<>'unpaid' then raise exception 'Unsafe snapshot'; end if;
 begin
  update public.orders set status='accepted' where id=placed.id;
  if found then raise exception 'Member changed status';end if;
 exception when insufficient_privilege then denied:=true; end;
 begin
  insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method)
  values(auth.uid(),'01000000-0000-4000-8000-000000000002',repeat('b',64),placed.customer,
  jsonb_build_array(jsonb_build_object('product_id',product.id,'label',product.variants->0->>'label','quantity',2)),1,'cod');
  raise exception 'Wrong total accepted' using errcode='XX000';
 exception when raise_exception then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('hub.test_user2'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
 if exists(select 1 from public.orders where id=placed.id) then raise exception 'Other customer sees order';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('hub.test_user2'),'role','authenticated','app_metadata',jsonb_build_object('hub_role','admin'))::text,true);
 update public.orders set status='accepted' where id=placed.id;
 update public.orders set status='preparing' where id=placed.id;
 update public.orders set status='ready' where id=placed.id;
 update public.orders set status='completed' where id=placed.id;
 select * into placed from public.orders where id=placed.id;
 if placed.version<>5 or jsonb_array_length(placed.history)<>5 or placed.payment_status<>'unpaid' then raise exception 'Invalid status history';end if;
 begin
 update public.orders set status='accepted' where id=placed.id;
 raise exception 'Terminal order reopened' using errcode='XX000';
 exception when raise_exception then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.orders;
    raise exception 'Anonymous access allowed' using errcode='XX000';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
select count(*) as rollback_test_orders from public.orders where request_id='01000000-0000-4000-8000-000000000001';
rollback;
