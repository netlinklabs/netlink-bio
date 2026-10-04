-- Applied to production 2026-10-04 (run by the owner in the SQL Editor).
-- The "Discoverable via NET ID" feature was removed, nothing in code, views, functions,
-- policies or indexes referenced this column (checked before dropping).
alter table public.profiles drop column net_id_discoverable;
