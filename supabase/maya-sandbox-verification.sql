-- Isolated test database only. The script rolls back all fixture data.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010","app_metadata":{}}',true);
insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method)
select auth.uid(),'10000000-0000-4000-8000-000000000001',repeat('a',64),
  '{"name":"Demo","email":"demo@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Test","province":"Test","postal":"1000","notes":""}',
  jsonb_build_array(jsonb_build_object('product_id',id,'label','Hot','quantity',1)),10000,'maya-sandbox'
from public.menu_items where name='Test coffee' limit 1;
select set_config('test.maya_order',(select id::text from public.orders where request_id='10000000-0000-4000-8000-000000000001'),true);
do $$ begin
  if (select payment_status from public.orders where id=current_setting('test.maya_order')::uuid) is distinct from 'unpaid' then raise exception 'Maya order incorrectly marked paid';end if;
  begin
    insert into public.maya_sandbox_payments(id,order_id,user_id,amount_cents,status) values(gen_random_uuid(),current_setting('test.maya_order')::uuid,auth.uid(),10000,'sandbox-paid');
    raise exception 'Customer forged payment';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","app_metadata":{"hub_role":"owner"}}',true);
do $$ begin
  begin
    update public.orders set status='accepted' where id=current_setting('test.maya_order')::uuid;
    raise exception 'Unverified order accepted' using errcode='22023';
  exception when raise_exception then null;end;
end $$;
reset role;
set local role service_role;
insert into public.maya_sandbox_payments(id,order_id,user_id,amount_cents,status) values('20000000-0000-4000-8000-000000000001',current_setting('test.maya_order')::uuid,'00000000-0000-4000-8000-000000000010',10000,'sandbox-paid');
do $$ begin
  begin
    update public.maya_sandbox_payments set status='failed';raise exception 'Verified success regressed';
  exception when invalid_parameter_value then null;end;
  begin
    update public.maya_sandbox_payments set amount_cents=1;raise exception 'Wrong amount saved';
  exception when invalid_parameter_value then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","app_metadata":{}}',true);
do $$ begin
  if exists(select order_id from public.maya_sandbox_payments) then raise exception 'Other customer can read payment';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010","app_metadata":{}}',true);
do $$ begin
  if not exists(select order_id from public.maya_sandbox_payments) then raise exception 'Owner cannot read payment';end if;
  begin
    perform checkout_id from public.maya_sandbox_payments;raise exception 'Customer can read private provider id';
  exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","app_metadata":{"hub_role":"owner"}}',true);
update public.orders set status='accepted' where id=current_setting('test.maya_order')::uuid;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","app_metadata":{"hub_role":"kitchen_staff"}}',true);
update public.orders set status='preparing' where id=current_setting('test.maya_order')::uuid;
do $$ begin
  if (select status from public.orders where id=current_setting('test.maya_order')::uuid) is distinct from 'preparing' then raise exception 'Verified order could not progress';end if;
end $$;
rollback;
