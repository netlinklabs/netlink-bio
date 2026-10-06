-- DRAFT, NOT APPLIED. Needs owner approval before running on production.
-- Input checks on public link data (defense in depth, the public pages also
-- validate when rendering).
--
--  * links.icon: plain icon name only. api/bio.js puts it into an image URL, and
--    before the render-side fix a value like  x" onerror="...  ran script on the
--    public bio page for every visitor.
--  * links.url, profile_videos.url: http(s) only, no spaces, max 2000 chars.
--
-- Checked on production before drafting (2026-10-06): 0 rows violate any of
-- these rules (links: 27 rows, profile_videos: 3 rows, no NULLs).
--
-- Rollback:
--   alter table public.links drop constraint links_icon_format;
--   alter table public.links drop constraint links_url_http;
--   alter table public.profile_videos drop constraint profile_videos_url_http;

alter table public.links
  add constraint links_icon_format check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

alter table public.links
  add constraint links_url_http check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2000);

alter table public.profile_videos
  add constraint profile_videos_url_http check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2000);
