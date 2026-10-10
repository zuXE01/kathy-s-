-- Run after maya-sandbox-setup.sql. Preserves orders and existing payment results.
begin;
-- SELECT FOR UPDATE on order rows serializes the first payment claim with closure.
grant update(status) on public.orders to service_role;
create or replace function hub_private.validate_maya_payment()
returns trigger language plpgsql security invoker set search_path='' as $$
declare order_status text;
begin
  if TG_OP='INSERT' then
    select o.status into order_status from public.orders o where o.id=new.order_id for update;
    if order_status is distinct from 'pending' then
      raise exception 'Cannot start a payment for a closed or accepted order' using errcode='P0001';
    end if;
  end if;
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
create or replace function hub_private.guard_maya_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare payment_state text;
begin
  if old.payment_method<>'maya-sandbox' then return new;end if;
  select p.status into payment_state from public.maya_sandbox_payments p where p.order_id=old.id;
  if new.status in ('accepted','preparing','ready','completed') and payment_state is distinct from 'sandbox-paid' then
    raise exception 'Verify Maya sandbox payment before preparing this order' using errcode='P0001';
  end if;
  if new.status='cancelled' and coalesce(payment_state,'missing') not in ('cancelled','expired') then
    raise exception 'Confirm Maya cancellation before closing this order' using errcode='P0001';
  end if;
  if new.status='rejected' and coalesce(payment_state,'missing') not in ('cancelled','expired','sandbox-paid') then
    raise exception 'Confirm Maya cancellation before rejecting this order' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function hub_private.guard_maya_order() from public,anon,authenticated;
-- Uses caller RLS and column grants; never exposes customer contact or provider IDs.
create or replace view public.maya_payment_exceptions with (security_invoker=true) as
select o.id,o.user_id,o.request_id,o.request_hash,o.items,o.total_cents,o.delivery_cents,
  o.payment_method,o.payment_status,o.status,o.status_note,o.history,o.version,o.is_demo,o.created_at,o.updated_at
from public.orders o join public.maya_sandbox_payments p on p.order_id=o.id
where o.status in ('cancelled','rejected') and p.status='sandbox-paid'
  and (select auth.jwt())->'app_metadata'->>'hub_role' in ('admin','owner','platform_admin','staff','kitchen_staff');
revoke all on public.maya_payment_exceptions from public,anon,authenticated;
grant select on public.maya_payment_exceptions to authenticated;
notify pgrst, 'reload schema';
commit;
