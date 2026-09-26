begin;
do $$ declare ids uuid[]; begin
 select array_agg(id) into ids from (select id from auth.users order by created_at limit 2) u;
 if coalesce(array_length(ids,1),0)<2 then raise exception 'Need two users';end if;
 perform set_config('hub.account_user1',ids[1]::text,true);
 perform set_config('hub.account_user2',ids[2]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids[1],'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 insert into public.customer_details(user_id,name,phone,address,postal) values(auth.uid(),'Test Customer','09123456789','Test Street','1000')
 on conflict(user_id) do update set name=excluded.name,address=excluded.address;
 update public.customer_details set address='Updated Street' where user_id=auth.uid();
 if not exists(select 1 from public.customer_details where user_id=auth.uid() and address='Updated Street') then raise exception 'Own save failed';end if;
 begin
 update public.customer_details set postal='bad' where user_id=auth.uid();
 raise exception 'Invalid postal accepted';
 exception when check_violation then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('hub.account_user2'),'role','authenticated','app_metadata',jsonb_build_object('hub_role','admin'))::text,true);
 if exists(select 1 from public.customer_details where user_id=current_setting('hub.account_user1')::uuid) then raise exception 'Other user read allowed';end if;
 update public.customer_details set address='Forged' where user_id=current_setting('hub.account_user1')::uuid;
 if found then raise exception 'Other user update allowed';end if;
 begin
 insert into public.customer_details(user_id,name) values(current_setting('hub.account_user1')::uuid,'Forged');
 raise exception 'Other user insert allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
 perform 1 from public.customer_details;
 raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Account isolation and validation checks passed; test data rolled back' as result;
rollback;
