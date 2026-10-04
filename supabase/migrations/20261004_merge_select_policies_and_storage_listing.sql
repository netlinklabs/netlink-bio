-- Applied to production 2026-10-04 (step 1 via MCP, drops run by the owner in the SQL Editor).
-- 1) Merge duplicate permissive SELECT policies (advisor: multiple_permissive_policies).
-- 2) Stop public listing of storage buckets (advisor: public_bucket_allows_listing).
--    Public bucket files are still served by URL without any SELECT policy.
--    Owner-scoped SELECT is kept because upload with upsert:true needs it.
-- Rollback: recreate the dropped policies (definitions are in CHANGELOG history / pg_policies dump before this change).

alter policy "kyc_sessions_select_own" on public.kyc_sessions
  using (user_id = (select auth.uid())
         or (select has_admin_role(array['super_admin','kyc_reviewer'])));

alter policy "orders_select_own" on public.orders
  using (user_id = (select auth.uid())
         or (select has_admin_role(array['super_admin','finance','support']))
         or (type in ('kyc','kyb') and (select has_admin_role(array['kyc_reviewer']))));

alter policy "Public can view published landing pages" on public.landing_pages
  using (is_published = true or (select auth.uid()) = user_id);

create policy "avatars_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "banners_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Drops (run after the statements above)
drop policy "kyc_sessions_select_admin" on public.kyc_sessions;
drop policy "orders_select_admin" on public.orders;
drop policy "Owner can view own landing page" on public.landing_pages;
drop policy "Avatar images are publicly accessible" on storage.objects;
drop policy "banners_public_read" on storage.objects;
drop policy "Public read landing-images" on storage.objects;
