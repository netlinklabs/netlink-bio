-- Ambassador program: remember that the thank-you email was sent.
-- One nullable column on the existing table. Nothing else changes.
-- The server claims it atomically (only while null), so each application gets
-- at most one email. Users cannot read or write it: the column-level grants from
-- 20261004_ambassador_applications.sql do not include it, and service_role
-- already has table-level select/update.

alter table public.ambassador_applications
  add column thanks_emailed_at timestamptz;
