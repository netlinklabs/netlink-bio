# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

### Added
- **Ambassador Program, Pilot Season 1 (application only).** New in-app page `ambassador.html` (login required, `noindex`, listed in `robots.txt`, not linked from any navigation yet; open it by URL `/ambassador`). Logged-in members see a short explanation and an application form that is pre-filled from their profile (username, Net ID, referral code, country). The form asks for country and city, one of four tracks (Growth, Content, Community, Influence), 1 to 5 social media links, audience range, motivation, contribution plan and a terms checkbox. After submitting, the page shows the application status instead of the form.
- New table `ambassador_applications` (migration `supabase/migrations/20261004_ambassador_applications.sql`, **not yet applied to production**). One application per user per season (`unique (user_id, season)`). Status flow: `pending` -> `under_review` -> `approved` or `rejected`, and `approved` -> `revoked`, enforced by a trigger. RLS: users can only read and insert their own row; they cannot read `admin_notes`, and cannot update or delete. Reviews are done manually by an admin with the service role (no admin UI yet).
- No existing table was changed. No referral or reward logic is touched, so the program does not depend on the referral system.
