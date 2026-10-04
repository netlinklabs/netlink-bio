-- Follow-up to 20261004_ambassador_applications.sql.
-- Tables created through a migration do not get privileges for service_role either, so the
-- admin API (api/_lib/admin.js, service role) could not read or review applications.
-- Grants only: no data or policy changes. Applicants still cannot read admin_notes.
grant select, update on public.ambassador_applications to service_role;
