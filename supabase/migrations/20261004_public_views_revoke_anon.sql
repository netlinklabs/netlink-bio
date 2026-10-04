-- Applied to production 2026-10-04. Browsers (anon/authenticated) can no longer read the views.
revoke all on public.profiles_bio_public, public.profiles_cv_public, public.landing_pages_public from anon, authenticated;
revoke truncate, references, trigger on public.profiles_bio_public, public.profiles_cv_public, public.landing_pages_public from service_role;
