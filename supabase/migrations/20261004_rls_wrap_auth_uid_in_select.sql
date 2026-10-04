-- Applied to production 2026-10-04 (verified: advisor 'Auth RLS Initialization Plan' count is 0).
-- Auth RLS Initialization Plan: wrap auth.uid() in (select ...) in 33 policies.
-- ALTER POLICY keeps role, command and name. Only the expression changes (same logic).

-- admin_users
alter policy "admin_users_select_own" on public.admin_users
  using (user_id = (select auth.uid()));
-- ambassador_applications
alter policy "Users can submit own ambassador application" on public.ambassador_applications
  with check ((select auth.uid()) = user_id and status = 'pending');
alter policy "Users can view own ambassador application" on public.ambassador_applications
  using ((select auth.uid()) = user_id);
-- analytics_daily_summary
alter policy "Users can view own analytics summary" on public.analytics_daily_summary
  using (user_id = (select auth.uid()));
-- contacts
alter policy "contacts_owner_all" on public.contacts
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
-- deletion_requests
alter policy "deletion_requests_select_own" on public.deletion_requests
  using ((select auth.uid()) = user_id);
-- fiat_orders
alter policy "fiat_orders_owner_select" on public.fiat_orders
  using ((select auth.uid()) = user_id);
-- kyc_sessions
alter policy "kyc_sessions_select_own" on public.kyc_sessions
  using (user_id = (select auth.uid()));
-- landing_pages
alter policy "Users manage own landing page" on public.landing_pages
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Owner can delete own landing page" on public.landing_pages
  using ((select auth.uid()) = user_id);
alter policy "Owner can insert own landing page" on public.landing_pages
  with check ((select auth.uid()) = user_id);
alter policy "Owner can view own landing page" on public.landing_pages
  using ((select auth.uid()) = user_id);
alter policy "Owner can update own landing page" on public.landing_pages
  using ((select auth.uid()) = user_id);
-- links
alter policy "Users can delete own links" on public.links
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own links" on public.links
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own links" on public.links
  using ((select auth.uid()) = user_id);
-- notification_reads
alter policy "manage_own_reads" on public.notification_reads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- notifications
alter policy "select_own_or_broadcast" on public.notifications
  using ((target_id = (select auth.uid())) or (target_id is null and target_tier is null) or (target_id is null and target_tier = (select p.tier from public.profiles p where p.id = (select auth.uid()))));
-- orders
alter policy "orders_select_own" on public.orders
  using (user_id = (select auth.uid()));
-- profile_videos
alter policy "Users can delete own videos" on public.profile_videos
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own videos" on public.profile_videos
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own videos" on public.profile_videos
  using ((select auth.uid()) = user_id);
-- profiles
alter policy "Allow authenticated insert to profiles" on public.profiles
  with check ((select auth.uid()) = id);
alter policy "profiles_select_own" on public.profiles
  using ((select auth.uid()) = id);
alter policy "Users can update own profile" on public.profiles
  using ((select auth.uid()) = id);
-- referrals
alter policy "referrals_select_own" on public.referrals
  using (((select auth.uid()) = referrer_id) or ((select auth.uid()) = referred_id));
-- rewards
alter policy "Users can insert own pending claim" on public.rewards
  with check (user_id = (select auth.uid()) and status = 'pending');
alter policy "Users can view own rewards" on public.rewards
  using (user_id = (select auth.uid()));
-- user_consents
alter policy "user_consents_select_own" on public.user_consents
  using ((select auth.uid()) = user_id);
-- verifications
alter policy "verifications_select_own" on public.verifications
  using ((select auth.uid()) = profile_id);
-- wallet_transactions
alter policy "Owner can insert own transactions" on public.wallet_transactions
  with check ((select auth.uid()) = owner_id);
alter policy "Owner can view own transactions" on public.wallet_transactions
  using ((select auth.uid()) = owner_id);
alter policy "Owner can update own transactions" on public.wallet_transactions
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
