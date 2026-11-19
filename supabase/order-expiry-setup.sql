-- Run after orders, Maya, and stock/notifications setup.
begin;
create index if not exists orders_pending_expiry on public.orders(created_at,id) where status='pending';

-- Keep the existing transition, version, stock and notification triggers in the path.
create or replace function public.hub_expire_pending_order(p_order uuid,p_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  locked_order record;
  prior_claims text := current_setting('request.jwt.claims',true);
  prior_subject text := current_setting('request.jwt.claim.sub',true);
begin
  select id,user_id,payment_method into locked_order from public.orders
  where id=p_order and version=p_version and status='pending'
    and created_at<=now()-interval '3 hours'
  for update;
  if not found then return false; end if;

  if locked_order.payment_method='maya-sandbox' then
    perform 1 from public.maya_sandbox_payments
    where order_id=p_order and status in ('cancelled','expired') for update;
    if not found then return false; end if;
  end if;

  -- The transition trigger supports pending-order cancellation by the order owner.
  -- Set that identity only within this restricted operation and restore it after.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',locked_order.user_id)::text,true);
  perform set_config('request.jwt.claim.sub',locked_order.user_id::text,true);
  update public.orders set status='cancelled',
    status_note='Automatically cancelled because the restaurant did not accept the order within 3 hours.'
  where id=p_order;
  perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(prior_subject,''),true);
  return true;
end;
$$;
revoke all on function public.hub_expire_pending_order(uuid,integer) from public,anon,authenticated;
grant execute on function public.hub_expire_pending_order(uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
