-- Run after maya-sandbox-setup.sql and maya-cancellation-setup.sql.
-- Additive sandbox reliability release. Do not roll back to the legacy writer after activation.
begin;
alter table public.maya_sandbox_payments add column if not exists current_attempt_id uuid;
alter table public.maya_sandbox_payments add column if not exists last_verified_at timestamptz;
create table if not exists public.maya_payment_attempts (
 id uuid primary key, order_id uuid not null references public.orders(id),
 user_id uuid not null, amount_cents bigint not null check(amount_cents>0),
 status text not null check(status in ('creating','pending','sandbox-paid','failed','cancelled','expired','review')),
 checkout_id uuid unique, redirect_url text, provider_status text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_verified_at timestamptz, next_check_at timestamptz not null default now()
);
create unique index if not exists maya_one_active_attempt on public.maya_payment_attempts(order_id)
 where status in ('creating','pending','review');
create index if not exists maya_attempt_due on public.maya_payment_attempts(next_check_at,id) where status<>'sandbox-paid';
create index if not exists maya_attempt_order on public.maya_payment_attempts(order_id);
create table if not exists public.maya_payment_audit (
 id bigint generated always as identity primary key, attempt_id uuid not null,
 order_id uuid not null, event text not null, status text, created_at timestamptz not null default now()
);
create index if not exists maya_audit_order on public.maya_payment_audit(order_id,id desc);
create table if not exists public.maya_payment_jobs (
 reference uuid primary key, revision bigint not null default 1,
 due_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 failures integer not null default 0, last_error text, dead_at timestamptz
);
create index if not exists maya_jobs_due on public.maya_payment_jobs(due_at) where dead_at is null;
alter table public.maya_payment_attempts enable row level security;
alter table public.maya_payment_audit enable row level security;
alter table public.maya_payment_jobs enable row level security;
revoke all on public.maya_payment_attempts,public.maya_payment_audit,public.maya_payment_jobs from public,anon,authenticated;
grant select,insert,update on public.maya_payment_attempts,public.maya_payment_jobs to service_role;
grant delete on public.maya_payment_jobs to service_role;
grant select,insert on public.maya_payment_audit to service_role;
grant usage,select on sequence public.maya_payment_audit_id_seq to service_role;
create or replace view public.maya_payment_investigations with (security_invoker=true) as
select p.order_id,p.amount_cents,p.status,p.provider_status,p.last_verified_at,p.updated_at,p.current_attempt_id,o.status as order_status,
 (select count(*)::integer from public.maya_payment_attempts a where a.order_id=p.order_id) as attempts,
 (select count(*)::integer from public.maya_payment_attempts a where a.order_id=p.order_id and a.status='sandbox-paid') as paid_attempts,
 exists(select 1 from public.maya_payment_attempts a join public.maya_payment_jobs j on j.reference=a.id where a.order_id=p.order_id and j.dead_at is not null) as recovery_needs_attention,
 (p.status in ('creating','pending','review') or (o.status in ('cancelled','rejected') and p.status='sandbox-paid')
  or (select count(*) from public.maya_payment_attempts a where a.order_id=p.order_id and a.status='sandbox-paid')>1
  or exists(select 1 from public.maya_payment_attempts a join public.maya_payment_jobs j on j.reference=a.id where a.order_id=p.order_id and j.dead_at is not null)) as needs_attention
from public.maya_sandbox_payments p join public.orders o on o.id=p.order_id;
revoke all on public.maya_payment_investigations from public,anon,authenticated;
grant select on public.maya_payment_investigations to service_role;
grant select(items,delivery_cents) on public.orders to service_role;
insert into public.maya_payment_attempts(id,order_id,user_id,amount_cents,status,checkout_id,redirect_url,provider_status,created_at,updated_at)
 select id,order_id,user_id,amount_cents,status,checkout_id,redirect_url,provider_status,created_at,updated_at from public.maya_sandbox_payments
 on conflict(id) do nothing;
update public.maya_sandbox_payments set current_attempt_id=id where current_attempt_id is null;

-- All RPCs are invoker-only and callable only by the server role.
create or replace function public.hub_maya_claim(p_order uuid,p_expected uuid default null,p_cancel boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o record; s public.maya_sandbox_payments; a public.maya_payment_attempts; aid uuid;
begin
 select id,user_id,total_cents,status,payment_method into o from public.orders where id=p_order for update;
 if o.id is null or o.payment_method<>'maya-sandbox' or o.status<>'pending' then raise exception 'Order is not payable';end if;
 select * into s from public.maya_sandbox_payments where order_id=p_order for update;
 if s.id is not null then
   select * into a from public.maya_payment_attempts where id=s.current_attempt_id;
   if p_expected is null or p_expected<>a.id or p_cancel then return jsonb_build_object('attempt',to_jsonb(a),'created',false);end if;
   if s.status='sandbox-paid' or a.status not in ('failed','cancelled','expired') or
     (a.provider_status not in ('PAYMENT_FAILED','AUTH_FAILED','PAYMENT_CANCELLED','PAYMENT_EXPIRED','CREATE_REJECTED') or a.provider_status is null) then
     raise exception 'Previous payment is not safely closed';end if;
   if exists(select 1 from public.maya_payment_attempts where order_id=p_order and status='sandbox-paid') then raise exception 'Order already paid';end if;
 end if;
 if (select count(*) from public.maya_payment_attempts where order_id=p_order)>=10 then raise exception 'Payment attempt limit reached; contact the restaurant';end if;
 aid=gen_random_uuid();
 insert into public.maya_payment_attempts(id,order_id,user_id,amount_cents,status,provider_status)
 values(aid,o.id,o.user_id,o.total_cents,case when p_cancel then 'cancelled' else 'creating' end,case when p_cancel then 'NOT_STARTED' end) returning * into a;
 if s.id is null then
   insert into public.maya_sandbox_payments(id,order_id,user_id,amount_cents,status,provider_status,current_attempt_id)
   values(aid,o.id,o.user_id,o.total_cents,a.status,a.provider_status,aid);
 else
   update public.maya_sandbox_payments set current_attempt_id=aid,status='creating',checkout_id=null,redirect_url=null,provider_status=null,last_verified_at=null,updated_at=now() where id=s.id;
 end if;
 insert into public.maya_payment_audit(attempt_id,order_id,event,status) values(aid,o.id,'attempt_claimed',a.status);
 return jsonb_build_object('attempt',to_jsonb(a),'created',true);
end; $$;

create or replace function public.hub_maya_record(p_attempt uuid,p_values jsonb,p_event text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.maya_payment_attempts; s public.maya_sandbox_payments; v_status text;
begin
 select * into a from public.maya_payment_attempts where id=p_attempt;
 if a.id is null then raise exception 'Unknown payment attempt';end if;
 -- Consistent order -> snapshot -> attempt lock ordering with claim and order closure.
 perform 1 from public.orders where id=a.order_id for update;
 select * into s from public.maya_sandbox_payments where order_id=a.order_id for update;
 select * into a from public.maya_payment_attempts where id=p_attempt for update;
 if p_event not in ('verified','verify_failed','created','create_unknown','create_rejected','cancel_requested') then raise exception 'Invalid audit event';end if;
 v_status=coalesce(p_values->>'status',a.status);
 if a.status='sandbox-paid' then v_status='sandbox-paid';end if;
 if a.status in ('cancelled','expired','failed') and v_status not in ('sandbox-paid','cancelled','expired','failed') then v_status=a.status;end if;
 -- A delayed create response must not reopen a cancelled/verified attempt.
 if p_event='created' and a.status<>'creating' then v_status=a.status;end if;
 update public.maya_payment_attempts set status=v_status,
   checkout_id=coalesce(checkout_id,(p_values->>'checkout_id')::uuid),
   redirect_url=case when p_event='created' and v_status='pending' then p_values->>'redirect_url' else redirect_url end,
   provider_status=case when v_status=coalesce(p_values->>'status',a.status) then coalesce(p_values->>'provider_status',provider_status) else provider_status end,
   last_verified_at=case when p_event='verified' then now() else last_verified_at end,
   next_check_at=now()+case when v_status in ('failed','cancelled','expired') then interval '1 hour' else interval '1 minute' end,
   updated_at=now() where id=a.id returning * into a;
 if s.status<>'sandbox-paid' and (s.current_attempt_id=a.id or a.status='sandbox-paid') then
   update public.maya_sandbox_payments set status=a.status,checkout_id=a.checkout_id,redirect_url=a.redirect_url,
     provider_status=a.provider_status,last_verified_at=a.last_verified_at,updated_at=now() where id=s.id;
 end if;
 insert into public.maya_payment_audit(attempt_id,order_id,event,status) values(a.id,a.order_id,p_event,a.status);
end; $$;

create or replace function public.hub_maya_enqueue(p_reference uuid)
returns void language sql security invoker set search_path='' as $$
 insert into public.maya_payment_jobs(reference) values(p_reference)
 on conflict(reference) do update set revision=public.maya_payment_jobs.revision+1,due_at=now(),dead_at=null,failures=0;
 insert into public.maya_payment_audit(attempt_id,order_id,event,status)
 select id,order_id,'verification_queued',status from public.maya_payment_attempts where id=p_reference;
$$;
create or replace function public.hub_maya_schedule()
returns void language plpgsql security invoker set search_path='' as $$
declare a record;
begin
 for a in select id from public.maya_payment_attempts where status<>'sandbox-paid' and provider_status is distinct from 'NOT_STARTED'
   and next_check_at<=now() and (status in ('creating','pending','review') or created_at>now()-interval '7 days')
   order by next_check_at,id limit 50 for update skip locked loop
   -- A schedule pass never resets a webhook retry/dead-letter job.
   insert into public.maya_payment_jobs(reference) values(a.id) on conflict do nothing;
   update public.maya_payment_attempts set next_check_at=now()+interval '1 minute' where id=a.id;
 end loop;
end; $$;
create or replace function public.hub_maya_take_job()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.maya_payment_jobs;
begin
 select * into j from public.maya_payment_jobs where due_at<=now() and dead_at is null and (lease_until is null or lease_until<now())
 order by due_at,reference limit 1 for update skip locked;
 if j.reference is null then return null;end if;
 update public.maya_payment_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where reference=j.reference returning * into j;
 return to_jsonb(j);
end; $$;
create or replace function public.hub_maya_finish_job(p_reference uuid,p_token uuid,p_revision bigint,p_ok boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_ok then
   delete from public.maya_payment_jobs where reference=p_reference and lease_token=p_token and revision=p_revision;
   update public.maya_payment_jobs set lease_until=null,lease_token=null where reference=p_reference and lease_token=p_token;
 else
   update public.maya_payment_jobs set failures=failures+1,last_error='verification_unavailable',
     due_at=now()+least(3600,power(2,least(failures+1,12))::integer)*interval '1 second',
     dead_at=case when failures>=11 then now() end,lease_until=null,lease_token=null where reference=p_reference and lease_token=p_token;
 end if;
end; $$;
revoke all on function public.hub_maya_claim(uuid,uuid,boolean),public.hub_maya_record(uuid,jsonb,text),public.hub_maya_enqueue(uuid),public.hub_maya_schedule(),public.hub_maya_take_job(),public.hub_maya_finish_job(uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.hub_maya_claim(uuid,uuid,boolean),public.hub_maya_record(uuid,jsonb,text),public.hub_maya_enqueue(uuid),public.hub_maya_schedule(),public.hub_maya_take_job(),public.hub_maya_finish_job(uuid,uuid,bigint,boolean) to service_role;
notify pgrst,'reload schema';
commit;
