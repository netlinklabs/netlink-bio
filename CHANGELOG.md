# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

### Added
- **Ambassador Program, Pilot Season 1 (application only).** New in-app page `ambassador.html` (login required, `noindex`, listed in `robots.txt`, not linked from any navigation yet; open it by URL `/ambassador`). Logged-in members see a short explanation and an application form that is pre-filled from their profile (username, Net ID, referral code, country). The form asks for country and city, one of four tracks (Growth, Content, Community, Influence), 1 to 5 social media links, audience range, motivation, contribution plan and a terms checkbox. After submitting, the page shows the application status instead of the form.
- New table `ambassador_applications` (migration `supabase/migrations/20261004_ambassador_applications.sql`, applied to production 2026-10-04). One application per user per season (`unique (user_id, season)`). Status flow: `pending` -> `under_review` -> `approved` or `rejected`, and `approved` -> `revoked`, enforced by a trigger. RLS: users can only read and insert their own row; they cannot read `admin_notes`, and cannot update or delete. Reviews are done manually by an admin with the service role (no admin UI yet).
- No existing table was changed. No referral or reward logic is touched, so the program does not depend on the referral system.
- **Admin: Ambassadors tab.** `admin.html` has a new "Ambassadors" tab (visible to `super_admin` and `support`; the badge shows the number of pending applications). It lists applications with a status filter and username search, and opens a detail view with the applicant's account (email, Net ID, referral code, plan, identity status), their answers and links, and private admin notes. `super_admin` can save notes and move an application through the flow (pending -> under review -> approved or rejected, approved -> revoked) with a required note; `support` is read-only. Links shown in the detail view are only clickable when they start with `http://` or `https://`.
- New admin API actions in `api/_lib/admin.js` (served through `api/orders.js`, so no new Vercel function): `admin-ambassadors`, `admin-ambassador`, `admin-ambassador-update`. Roles are checked on the server on every call, status changes are atomic and follow the same flow as the database trigger, and every change is written to `admin_audit_log` (`ambassador_status`, `ambassador_notes`).
- Migration `supabase/migrations/20261004_ambassador_service_role_grants.sql` (applied to production 2026-10-04): grants `select, update` on `ambassador_applications` to `service_role`. The first migration did not include it, so the admin API could not read the table. Grants only, no data or policy change.

### Changed
- **Ambassador application form** (`ambassador.html`): removed the social media links field, since applicants already have a Netlink bio page. The review is now based on the bio page and the CV: on submit, `https://netlink.bio/<username>` is stored in the existing `social_links` column (no migration). Applicants without a username are asked to set one first. The status card shows links to the applicant's bio page and CV instead of the typed links.
- Added a required consent checkbox before the program terms: applicants agree that the Netlink team may review their bio page, their CV and the application, and confirm they have read the Privacy Policy. Both checkboxes must be ticked to submit (`terms_accepted_at` stores the time).
- **Admin Ambassadors tab**: the detail view now shows the applicant's bio page, CV page and the active links on the bio (read from the publicly readable `links` table by the admin page itself, so no database or permission change). A link typed in an older application is still shown as "Link in application". Links are clickable only when they start with `http://` or `https://`. `admin-ambassador` also returns `user_id`.
