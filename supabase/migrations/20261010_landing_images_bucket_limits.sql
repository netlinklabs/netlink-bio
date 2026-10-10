-- landing-images bucket: cap each file at 2 MB and allow only JPEG, PNG and WebP.
-- The page builder always uploads compressed JPEGs far below this size.
-- Already applied to production on 2026-10-10 via the Supabase MCP.
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'landing-images';
