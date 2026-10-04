-- Applied to production 2026-10-04.
-- Least privilege for reserved_usernames: anon and authenticated had TRUNCATE,
-- REFERENCES and TRIGGER on the list of banned usernames. Nothing uses them
-- (the Supabase API cannot truncate, and username checks run through
-- SECURITY DEFINER functions and triggers that use the owner's rights).
-- SELECT for authenticated is left as it was. Revert with GRANT if ever needed.

revoke truncate, references, trigger
  on public.reserved_usernames
  from anon, authenticated;
