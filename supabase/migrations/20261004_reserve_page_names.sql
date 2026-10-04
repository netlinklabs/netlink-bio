-- Applied to production 2026-10-04 (252 -> 274 rows).
-- Reserve app and public page names in the server-side username list.
-- reserved_usernames already exists (252 rows) and is enforced by triggers on
-- profiles.username and landing_pages.slug. This only adds the 22 page names that
-- were missing. Existing rows are untouched (on conflict do nothing).
-- Checked before running: no profile and no landing page uses any of these names.

insert into public.reserved_usernames (username, reason, note) values
  ('404',             'system', 'app or public page'),
  ('ambassador',      'system', 'app or public page'),
  ('analytics',       'system', 'app or public page'),
  ('business-page',   'system', 'app or public page'),
  ('changelog',       'system', 'app or public page'),
  ('checkout',        'system', 'app or public page'),
  ('contact',         'system', 'app or public page'),
  ('digital-cv',      'system', 'app or public page'),
  ('faq',             'system', 'app or public page'),
  ('index',           'system', 'app or public page'),
  ('link-in-bio',     'system', 'app or public page'),
  ('netlink-pay',     'system', 'app or public page'),
  ('pay5',            'system', 'app or public page'),
  ('plans',           'system', 'app or public page'),
  ('template',        'system', 'app or public page'),
  ('username-policy', 'system', 'app or public page'),
  ('verification',    'system', 'app or public page'),
  ('llms',            'system', 'site file or path'),
  ('manifest',        'system', 'site file or path'),
  ('robots',          'system', 'site file or path'),
  ('shared',          'system', 'site file or path'),
  ('sitemap',         'system', 'site file or path')
on conflict (username) do nothing;
