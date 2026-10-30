-- Isolated/rollback verification; requires two existing test users.
begin;
insert into public.menu_items(id,name,category,price,available,section,variants) values('70000000-0000-4000-8000-000000000001','Stock test','bites',10,true,'Test','[]');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users order by id limit 1),'app_metadata',jsonb_build_object('hub_role','owner'))::text,true);
set local role authenticated;
select public.set_menu_stock('70000000-0000-4000-8000-000000000001',3,0);
do $$ begin
 begin perform public.set_menu_stock('70000000-0000-4000-8000-000000000001',10,0);raise exception 'Stale edit allowed' using errcode='XX000';exception when raise_exception then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'app_metadata','{}'::jsonb)::text,true);
do $$ declare placed uuid; begin
 begin perform public.menu_stock_list();raise exception 'Customer inventory access' using errcode='XX000';exception when insufficient_privilege then null;end;
 insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method) values(auth.uid(),gen_random_uuid(),repeat('a',64),'{"name":"Test","email":"test@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Manila","province":"Test","postal":"1000","notes":""}','[{"product_id":"70000000-0000-4000-8000-000000000001","label":"Regular","quantity":2}]',2000,'cod') returning id into placed;
 perform set_config('hub.stock_order',placed::text,true);
 begin
 insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method) values(auth.uid(),gen_random_uuid(),repeat('b',64),'{"name":"Test","email":"test@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Manila","province":"Test","postal":"1000","notes":""}','[{"product_id":"70000000-0000-4000-8000-000000000001","label":"Regular","quantity":2}]',2000,'cod');
 raise exception 'Oversold stock' using errcode='XX000';exception when raise_exception then null;end;
 update public.orders set status='cancelled' where id=placed;
 if (select count(*) from public.order_notifications where order_id=placed and status='cancelled')<>1 then raise exception 'Notification missing';end if;
 update public.order_notifications set read_at=now() where order_id=placed;
end $$;
reset role;
do $$ begin
 if (select quantity from hub_private.menu_stock where product_id='70000000-0000-4000-8000-000000000001')<>3 then raise exception 'Stock not restored exactly once';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users order by id desc limit 1),'app_metadata','{}'::jsonb)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.order_notifications where order_id=current_setting('hub.stock_order')::uuid) then raise exception 'Other customer sees notifications';end if;end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users order by id limit 1),'app_metadata',jsonb_build_object('hub_role','owner'))::text,true);
set local role authenticated;
do $$ declare placed uuid; begin
 insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method) values(auth.uid(),gen_random_uuid(),repeat('c',64),'{"name":"Test","email":"test@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Manila","province":"Test","postal":"1000","notes":""}','[{"product_id":"70000000-0000-4000-8000-000000000001","label":"Regular","quantity":1}]',1000,'cod') returning id into placed;
 update public.orders set status='accepted' where id=placed;
 update public.orders set status='preparing' where id=placed;
 update public.orders set status='ready' where id=placed;
 if (select count(*) from public.order_notifications where order_id=placed)<>3 then raise exception 'Accepted/preparing/ready alerts missing';end if;
end $$;
reset role;
rollback;
