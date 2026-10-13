-- Landing page slug may equal the owner's own username.
-- Before: get_slug_status / is_slug_available treated the caller's own profile
-- (profiles.username = slug) as "taken", so a Gold user named "foo" could not
-- use /page/foo. The landing page URL (/page/...) is a different path from the
-- bio URL (/foo), so the same owner can safely use both.
-- Now: when exclude_user_id is given, that user's own profile row is ignored in
-- the profiles check. Other users' usernames, reserved names and other users'
-- landing page slugs are still blocked. Callers that do not pass
-- exclude_user_id (index.html, dashboard.html username checks) behave as before.

CREATE OR REPLACE FUNCTION public.get_slug_status(
    check_slug text,
    check_tier text DEFAULT NULL::text,
    exclude_user_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM reserved_usernames WHERE username = check_slug
        ) THEN 'reserved'
        WHEN EXISTS (
            SELECT 1 FROM profiles
            WHERE username = check_slug
              AND (exclude_user_id IS NULL OR id <> exclude_user_id)
        ) THEN 'taken'
        WHEN EXISTS (
            SELECT 1 FROM landing_pages
            WHERE slug = check_slug
              AND (exclude_user_id IS NULL OR user_id <> exclude_user_id)
        ) THEN 'taken'
        WHEN check_tier IS NOT NULL AND NOT is_slug_length_valid(check_slug, check_tier)
            THEN 'too_short'
        ELSE 'available'
    END;
$function$;

CREATE OR REPLACE FUNCTION public.is_slug_available(
    check_slug text,
    check_tier text DEFAULT NULL::text,
    exclude_user_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT
        NOT EXISTS (SELECT 1 FROM reserved_usernames WHERE username = check_slug)
        AND NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE username = check_slug
              AND (exclude_user_id IS NULL OR id <> exclude_user_id)
        )
        AND NOT EXISTS (
            SELECT 1 FROM landing_pages
            WHERE slug = check_slug
              AND (exclude_user_id IS NULL OR user_id <> exclude_user_id)
        )
        AND (check_tier IS NULL OR is_slug_length_valid(check_slug, check_tier));
$function$;
