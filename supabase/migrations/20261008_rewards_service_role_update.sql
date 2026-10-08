-- Follow-up to the admin Rewards tab (admin-rewards-confirm in api/_lib/admin.js).
-- Lets the admin API (service_role) mark a claim as received. Only the three columns that change
-- are granted, not the whole row. No data or policy changes.
grant update (status, tx_hash, claimed_at) on public.rewards to service_role;
