-- Applied to production 2026-10-04. Clears the 3 "Security Definer View" advisor errors.
-- security_invoker needs the caller (service_role) to have SELECT on the base tables.
grant select on public.landing_pages to service_role;
alter view public.profiles_bio_public set (security_invoker = true);
alter view public.profiles_cv_public set (security_invoker = true);
alter view public.landing_pages_public set (security_invoker = true);
