-- Paid plans (Silver / Gold): activation, expiry and trigger fixes.
--
-- Applied to production 2026-10-07 (owner approved the draft).
--
-- Already in the database, nothing to add:
--   orders.type allows 'plan' (check orders_type_check), orders.meta (jsonb) holds the plan details,
--   profiles.tier_expires_at exists.
--
-- This migration adds:
--   1) fulfill_plan_order(order_id): idempotent activation of a paid 'plan' order (service_role only).
--   2) expire_lapsed_tiers(grace):   daily downgrade to Basic, 7 days after expiry (service_role only).
--   3) Four trigger fixes: a downgrade never fails and never overwrites user data (hide footer link,
--      video layout, username), and Landing Page creation is Gold and up only.
--   4) Data: owner account expiry moved to 2030-12-31 (so the first expiry run does not downgrade it).
--
-- Owner decisions (2026-10-07): a username is NEVER changed by a tier downgrade; Landing Page is Gold only.
--
-- Order meta used by plan orders:
--   { "tier": "silver" | "gold", "kind": "new" | "upgrade", "months": 1 | 12 }
--   months = 12 is the annual plan (pays 11 months, gets 12). kind = "upgrade" is Silver -> Gold,
--   priced by the API from the remaining days; the expiry date does not change.
--
-- Rollback: drop function public.fulfill_plan_order(uuid); drop function public.expire_lapsed_tiers(interval);
-- then re-create the four trigger functions with their previous behavior:
--   enforce_hide_footer_link_tier_gate: raise on every insert/update when a toggle is on and tier is not Gold+.
--   enforce_video_layout_tier:          set video_layout = 'standard' on every insert/update when tier is Basic.
--   enforce_username_length:            validate the username length on every insert/update of username or tier.
--   enforce_landing_page_tier_gate:     raise only when the owner tier is Basic (Silver was allowed).

-- 1) Activate a paid plan order. Safe to call twice (second call changes nothing).
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
  v_active  boolean;
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
  if v_kind = 'new' and v_months not in (1, 12) then raise exception 'Invalid plan length'; end if;

  -- A paid tier without an expiry date is permanent (team accounts). Never touch it.
  if p.tier <> 'basic' and p.tier_expires_at is null then
    raise exception 'Account has a permanent tier';
  end if;

  -- Active = paid tier that has not passed its expiry by more than the 7 day grace period.
  v_active := p.tier <> 'basic' and p.tier_expires_at > now() - interval '7 days';

  if v_kind = 'upgrade' then
    if not v_active or p.tier <> 'silver' or v_tier <> 'gold' then
      raise exception 'Upgrade is only possible from an active Silver plan to Gold';
    end if;
    update public.profiles set tier = 'gold' where id = p.id;
    v_expires := p.tier_expires_at;
  else
    if v_active and public.tier_rank(v_tier) < public.tier_rank(p.tier) then
      raise exception 'Cannot buy a lower plan while a higher one is active';
    end if;
    if v_active and public.tier_rank(v_tier) > public.tier_rank(p.tier) then
      raise exception 'Use an upgrade order to move to a higher plan';
    end if;
    -- Renewal adds time after the current end date. Inside the grace period it starts from now.
    v_base    := case when v_active then greatest(p.tier_expires_at, now()) else now() end;
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

-- 2) Daily downgrade. Only paid tiers WITH an expiry date; tier_expires_at is kept so the
--    account page can still say "expired on ...". Returns who was downgraded (for notices).
create or replace function public.expire_lapsed_tiers(p_grace interval default interval '7 days')
returns table (r_user_id uuid, r_old_tier text, r_expired_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select id, tier as old_tier, tier_expires_at
      from public.profiles
     where tier <> 'basic'
       and tier_expires_at is not null
       and tier_expires_at < now() - p_grace
       for update
  ), upd as (
    update public.profiles pr set tier = 'basic'
      from due where pr.id = due.id
    returning pr.id, due.old_tier, due.tier_expires_at
  )
  select id, old_tier, tier_expires_at from upd;
$$;

revoke execute on function public.expire_lapsed_tiers(interval) from public, anon, authenticated;
grant  execute on function public.expire_lapsed_tiers(interval) to service_role;

-- 3) Trigger fixes. Without them a downgrade breaks.
--
-- 3a) enforce_hide_footer_link_tier_gate fires on EVERY update of profiles and raised an error when a
--     non-Gold profile had a Hide Footer Link toggle on, so downgrading a Gold user with the toggle on
--     would have failed. Now it only blocks turning the toggle ON (or inserting it on). The stored
--     toggle is kept; the public pages (bio.js, cv.js, landing.js) already ignore it below Gold.
create or replace function public.enforce_hide_footer_link_tier_gate()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(new.tier, 'basic') not in ('gold', 'platinum') then
    if new.hide_footer_link_bio
       and (tg_op = 'INSERT' or old.hide_footer_link_bio is distinct from new.hide_footer_link_bio) then
      raise exception 'Hide Footer Link is available from the Gold plan and up.';
    end if;
    if new.hide_footer_link_cv
       and (tg_op = 'INSERT' or old.hide_footer_link_cv is distinct from new.hide_footer_link_cv) then
      raise exception 'Hide Footer Link is available from the Gold plan and up.';
    end if;
    if new.hide_footer_link_landing
       and (tg_op = 'INSERT' or old.hide_footer_link_landing is distinct from new.hide_footer_link_landing) then
      raise exception 'Hide Footer Link is available from the Gold plan and up.';
    end if;
  end if;
  return new;
end;
$$;

-- 3b) enforce_video_layout_tier overwrote video_layout with 'standard' whenever the tier changed to
--     Basic, so a lapsed plan would lose the user's chosen layout for good. Now it only normalizes
--     when the layout itself is being set. bio.js already falls back to the standard layout at render
--     time for Basic, so the page looks right and the choice comes back after renewal.
create or replace function public.enforce_video_layout_tier()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(new.tier, 'basic') = 'basic'
     and (tg_op = 'INSERT' or new.video_layout is distinct from old.video_layout) then
    new.video_layout := 'standard';
  end if;
  return new;
end;
$$;

-- 3c) enforce_username_length ran on "update of username, tier" and raised when the username was shorter
--     than the new tier allows (Basic needs 5+), so downgrading a Gold user with a 3 or 4 character
--     username would fail. Decision: a username is never changed by a downgrade. Now it validates only
--     on insert or when the username itself changes. Message and rules are unchanged. Known trade-off:
--     a short name bought with a short Gold plan stays after expiry.
create or replace function public.enforce_username_length()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.username is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.username is not distinct from old.username then
    return new;
  end if;

  if not public.is_slug_length_valid(new.username, new.tier) then
    raise exception
      'Username "%" does not meet the length requirement for tier "%" (min % characters, max 25)',
      new.username, coalesce(new.tier, 'basic'), public.min_slug_length_for_tier(new.tier);
  end if;

  return new;
end;
$$;

-- 3d) Landing Page is Gold and up only (was: anything but Basic, so Silver could create one).
--     The trigger is BEFORE INSERT only, so existing pages of a lapsed account are kept (hidden, not
--     deleted). Checked in production: both existing landing pages belong to Gold accounts.
create or replace function public.enforce_landing_page_tier_gate()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tier text;
begin
  select tier into v_tier from public.profiles where id = new.user_id;

  if coalesce(v_tier, 'basic') not in ('gold', 'platinum') then
    raise exception 'Landing Page is available from the Gold plan and up.';
  end if;

  return new;
end;
$$;

-- 4) Data: owner account (ramlanhadiansyah) had tier_expires_at 2026-07-12, already past, so the first
--    expire_lapsed_tiers() run would have downgraded it. Moved to 2030-12-31 (owner decision).
update public.profiles
   set tier_expires_at = timestamptz '2030-12-31 23:59:59+07'
 where username = 'ramlanhadiansyah' and tier = 'gold';
