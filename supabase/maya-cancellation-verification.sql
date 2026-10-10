-- Isolated test database only. All fixtures roll back.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010","app_metadata":{}}',true);
with saved as (
  insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method)
  select auth.uid(),gen_random_uuid(),repeat('b',64),
    '{"name":"Demo","email":"demo@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Test","province":"Test","postal":"1000","notes":""}',
    jsonb_build_array(jsonb_build_object('product_id',id,'label','Hot','quantity',1)),10000,'maya-sandbox'
  from public.menu_items where name='Test coffee' limit 1 returning id
) select set_config('test.cancel_order',(select id::text from saved),true);
do $$ begin
  begin
    update public.orders set status='cancelled' where id=current_setting('test.cancel_order')::uuid;
    raise exception 'Cancellation bypassed payment coordination' using errcode='22023';
  exception when raise_exception then null;end;
end $$;
reset role;
set local role service_role;
insert into public.maya_sandbox_payments(id,order_id,user_id,amount_cents,status)
values(gen_random_uuid(),current_setting('test.cancel_order')::uuid,'00000000-0000-4000-8000-000000000010',10000,'creating');
reset role;
set local role authenticated;
do $$ begin
  begin
    update public.orders set status='cancelled' where id=current_setting('test.cancel_order')::uuid;
    raise exception 'Creating payment was silently cancelled' using errcode='22023';
  exception when raise_exception then null;end;
end $$;
reset role;
set local role service_role;
update public.maya_sandbox_payments set status='pending' where order_id=current_setting('test.cancel_order')::uuid;
reset role;
set local role authenticated;
do $$ begin
  begin
    update public.orders set status='cancelled' where id=current_setting('test.cancel_order')::uuid;
    raise exception 'Pending payment was silently cancelled' using errcode='22023';
  exception when raise_exception then null;end;
end $$;
reset role;
set local role service_role;
update public.maya_sandbox_payments set status='cancelled' where order_id=current_setting('test.cancel_order')::uuid;
reset role;
set local role authenticated;
update public.orders set status='cancelled' where id=current_setting('test.cancel_order')::uuid;
do $$ begin
  if (select status from public.orders where id=current_setting('test.cancel_order')::uuid) is distinct from 'cancelled' then raise exception 'Confirmed cancellation failed';end if;
end $$;
reset role;
set local role service_role;
-- A later authoritative success is retained and becomes a visible exception.
update public.maya_sandbox_payments set status='sandbox-paid' where order_id=current_setting('test.cancel_order')::uuid;
do $$ begin
  begin
    insert into public.maya_sandbox_payments(id,order_id,user_id,amount_cents,status)
    values(gen_random_uuid(),current_setting('test.cancel_order')::uuid,'00000000-0000-4000-8000-000000000010',10000,'creating');
    raise exception 'Payment started for a closed order' using errcode='22023';
  exception when raise_exception then null;end;
end $$;
reset role;
set local role authenticated;
-- Even the customer who owns the order cannot use the staff review view.
do $$ begin
  if exists(select id from public.maya_payment_exceptions) then raise exception 'Customer accessed staff payment queue';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","app_metadata":{"hub_role":"owner"}}',true);
do $$ begin
  if not exists(select id from public.maya_payment_exceptions where id=current_setting('test.cancel_order')::uuid) then raise exception 'Owner cannot see closed paid order';end if;
  begin
    perform customer from public.maya_payment_exceptions;raise exception 'Contact details leaked through review view';
  exception when undefined_column then null;end;
end $$;
rollback;
