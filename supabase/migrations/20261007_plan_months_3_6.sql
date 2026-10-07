-- Plan lengths: 1, 3, 6 and 12 months (was 1 and 12).
--
-- Applied to production 2026-10-07 (owner approved).
--
-- Only change: fulfill_plan_order accepts months 1, 3, 6 and 12 for a new plan order. Everything else
-- (running plan rules, upgrade, renewal after the end date, grants) is the same as in
-- 20261007_plan_fulfill_running_fix.sql. Prices are not stored in the database, they are set by api/orders.js.
-- No table, column or trigger changes. Existing orders are not touched.
--
-- Rollback: re-run the function from 20261007_plan_fulfill_running_fix.sql.

create or replace function public.fulfill_plan_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o         public.orders%rowtype;
  p         public.profiles%rowtype;
  v_tier    text;
  v_kind    text;
  v_months  integer;
  v_running boolean;
  v_base    timestamptz;
  v_expires timestamptz;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.type <> 'plan' then raise exception 'Not a plan order'; end if;
  if o.status <> 'paid' then raise exception 'Order is not paid'; end if;

  select * into p from public.profiles where id = o.user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  -- Already activated: return the current state, never extend twice.
  if o.fulfilled_at is not null then
    return jsonb_build_object('tier', p.tier, 'tier_expires_at', p.tier_expires_at, 'already', true);
  end if;

  v_tier   := o.meta->>'tier';
  v_kind   := coalesce(o.meta->>'kind', 'new');
  v_months := coalesce((o.meta->>'months')::integer, 0);

  if v_tier not in ('silver', 'gold') then raise exception 'Invalid plan tier'; end if;
  if v_kind not in ('new', 'upgrade') then raise exception 'Invalid order kind'; end if;
  if v_kind = 'new' and v_months not in (1, 3, 6, 12) then raise exception 'Invalid plan length'; end if;

  -- A paid tier without an expiry date is permanent (team accounts). Never touch it.
  if p.tier <> 'basic' and p.tier_expires_at is null then
    raise exception 'Account has a permanent tier';
  end if;

  -- Running = a paid tier whose end date is still in the future.
  v_running := p.tier <> 'basic' and p.tier_expires_at > now();

  if v_kind = 'upgrade' then
    if not v_running or p.tier <> 'silver' or v_tier <> 'gold' then
      raise exception 'Upgrade is only possible from a running Silver plan to Gold';
    end if;
    update public.profiles set tier = 'gold' where id = p.id;
    v_expires := p.tier_expires_at;
  else
    if v_running and public.tier_rank(v_tier) < public.tier_rank(p.tier) then
      raise exception 'Cannot buy a lower plan while a higher one is running';
    end if;
    if v_running and public.tier_rank(v_tier) > public.tier_rank(p.tier) then
      raise exception 'Use an upgrade order to move to a higher plan';
    end if;
    -- Renewal of a running plan adds time after the current end date. Otherwise it starts now.
    v_base    := case when v_running then p.tier_expires_at else now() end;
    v_expires := v_base + make_interval(months => v_months);
    update public.profiles set tier = v_tier, tier_expires_at = v_expires where id = p.id;
  end if;

  update public.orders
     set fulfilled_at = now(),
         meta = o.meta || jsonb_build_object('granted_until', v_expires)
   where id = o.id;

  return jsonb_build_object('tier', v_tier, 'tier_expires_at', v_expires, 'already', false);
end;
$$;

revoke execute on function public.fulfill_plan_order(uuid) from public, anon, authenticated;
grant  execute on function public.fulfill_plan_order(uuid) to service_role;
