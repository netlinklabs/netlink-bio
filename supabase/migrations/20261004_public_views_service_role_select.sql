-- Applied to production 2026-10-04 (run BEFORE closing anon access).
-- The API now reads the public views with the service role key.
grant select on public.profiles_bio_public, public.profiles_cv_public, public.landing_pages_public to service_role;
