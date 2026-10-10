-- Run AFTER orders-setup.sql. Additive and repeatable; no live-money support.
begin;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cod','demo-online','maya-sandbox'));
create table if not exists public.maya_sandbox_payments (
  id uuid primary key,
  order_id uuid not null unique references public.orders(id),
  user_id uuid not null references auth.users(id),
  amount_cents bigint not null check (amount_cents>0),
  status text not null check (status in ('creating','pending','sandbox-paid','failed','cancelled','expired','review')),
  checkout_id uuid unique,
  redirect_url text,
  provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maya_payments_user on public.maya_sandbox_payments(user_id);
alter table public.maya_sandbox_payments enable row level security;
revoke all on public.maya_sandbox_payments from public,anon,authenticated;
grant select(order_id,user_id,status) on public.maya_sandbox_payments to authenticated;
grant select,insert,update on public.maya_sandbox_payments to service_role;
grant select(id,user_id,total_cents,payment_method,status) on public.orders to service_role;
drop policy if exists maya_payment_read on public.maya_sandbox_payments;
create policy maya_payment_read on public.maya_sandbox_payments for select to authenticated using (
  user_id=(select auth.uid()) or (select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin','staff','kitchen_staff')
);
create or replace function hub_private.validate_maya_payment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.orders o where o.id=new.order_id and o.user_id=new.user_id
    and o.total_cents=new.amount_cents and o.payment_method='maya-sandbox') then
    raise exception 'Payment does not match its order' using errcode='22023';
  end if;
  if TG_OP='UPDATE' then
    if (new.id,new.order_id,new.user_id,new.amount_cents) is distinct from (old.id,old.order_id,old.user_id,old.amount_cents)
      or (old.status='sandbox-paid' and new.status<>'sandbox-paid') then
      raise exception 'Payment identity and verified success are immutable' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
revoke all on function hub_private.validate_maya_payment() from public,anon,authenticated;
drop trigger if exists maya_payment_validate on public.maya_sandbox_payments;
create trigger maya_payment_validate before insert or update on public.maya_sandbox_payments for each row execute function hub_private.validate_maya_payment();
-- Alphabetically after orders_prepare, including when the base setup is rerun.
create or replace function hub_private.prepare_maya_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.payment_method='maya-sandbox' then new.payment_status:='unpaid'; end if;
  return new;
end; $$;
revoke all on function hub_private.prepare_maya_order() from public,anon,authenticated;
drop trigger if exists zz_orders_maya_prepare on public.orders;
create trigger zz_orders_maya_prepare before insert on public.orders for each row execute function hub_private.prepare_maya_order();
create or replace function hub_private.guard_maya_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.payment_method='maya-sandbox' and new.status in ('accepted','preparing','ready','completed')
    and not exists(select 1 from public.maya_sandbox_payments p where p.order_id=old.id and p.status='sandbox-paid') then
    raise exception 'Verify Maya sandbox payment before preparing this order' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function hub_private.guard_maya_order() from public,anon,authenticated;
drop trigger if exists orders_maya_guard on public.orders;
create trigger orders_maya_guard before update on public.orders for each row execute function hub_private.guard_maya_order();
notify pgrst, 'reload schema';
commit;
