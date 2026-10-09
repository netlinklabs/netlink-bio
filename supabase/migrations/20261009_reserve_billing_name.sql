-- Applied to production 2026-10-09 (1 row added).
-- Reserve the name of the new billing page so nobody can register it as a username
-- or landing page slug (billing.html would shadow it). reserved_usernames is enforced
-- by triggers on profiles.username and landing_pages.slug.
-- Checked on production 2026-10-09: 'billing' is not reserved and no profile or
-- landing page uses it.

insert into public.reserved_usernames (username, reason, note) values
  ('billing', 'system', 'app or public page')
on conflict (username) do nothing;
