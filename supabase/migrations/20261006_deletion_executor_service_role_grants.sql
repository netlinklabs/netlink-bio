-- APPLIED to production on 2026-10-06 (owner approved), via Supabase MCP, name: deletion_executor_service_role_grants.
-- Follow-up to the account deletion executor (api/_lib/process-deletions.js).
-- The cron runs with service_role, which had no SELECT on these two tables, so the
-- executor got REST 403 and could not read due deletion requests.
-- Grants only: no data, policy or schema changes. Read access only, no DELETE:
-- the account itself is deleted through the Auth admin API and cascades.
--
-- Rollback:
--   revoke select on public.deletion_requests from service_role;
--   revoke select on public.sponsored_members from service_role;
grant select on public.deletion_requests to service_role;
grant select on public.sponsored_members to service_role;
