-- Follow-up to the admin Rewards tab (admin-rewards in api/_lib/admin.js).
-- service_role had no privileges on these two tables, so the admin API (service role) failed
-- with a generic error when finance opened the Rewards tab.
-- Grants only, read only: no data or policy changes. Users keep reading only their own claims.
grant select on public.rewards to service_role;
grant select on public.reward_programs to service_role;
