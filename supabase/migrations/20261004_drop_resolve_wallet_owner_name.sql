-- Applied to production 2026-10-04 (run by the owner in the SQL Editor).
-- Old receipt helper, replaced by resolve_receipt_party (used by tx.html).
-- Not called anywhere in code, and already broken: it read profiles.show_name_on_receipt,
-- a column that no longer exists.
drop function public.resolve_wallet_owner_name(text);
