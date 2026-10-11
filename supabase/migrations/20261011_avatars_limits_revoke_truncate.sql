-- Security audit 2026-10-11.
-- NOT yet applied to production. Review, then apply via the Supabase MCP or SQL editor.

-- 1) avatars bucket had no size limit and accepted any file type.
-- dashboard.html always uploads a compressed JPEG into the user's own folder,
-- so a 1 MB cap with image-only types does not break the app.
-- Limits apply to new uploads only; existing objects are untouched.
update storage.buckets
set file_size_limit = 1048576,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'avatars';

-- 2) anon and authenticated hold TRUNCATE on 22 public tables (Supabase default grant).
-- TRUNCATE ignores RLS. PostgREST does not expose it, so this is defense in depth only.
-- service_role and the table owner keep their access.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
