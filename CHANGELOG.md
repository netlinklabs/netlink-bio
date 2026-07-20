# Changelog

All notable changes to Netlink.bio are documented in this file.

## [Unreleased]

### Added
- **NET ID** — permanent per-user identifier, format `NET` + 10 random digits (e.g. `NET1234567890`), stored plain in `profiles.net_id`, rendered with a cosmetic hyphen grouping (`NET-12345-67890`) via `formatNetId()`. Auto-generated on profile creation via DB trigger (`generate_net_id()`); existing users backfilled. Currently identity-only — no transactional use yet.

### Changed
- `pay.html` — USDC card ID display now reads the real `net_id` from Supabase instead of generating a random value on every page load.

---

## Previous Sessions

### Added
- Landing Page builder (`page-builder.html`) with business-type presets, contact channels, gallery, offerings editor, and JSON-LD generation for AI/search indexing.
- `landing_pages` table (one page per user, all tiers) and `net_reward_milestone` / `net_reward_pending` tracking columns on `profiles`.
- `reserved_usernames` table shared between `profiles.username` and `landing_pages.slug`, enforced via DB trigger.
- Verification badge system (Green/Gold/Silver/Black) computed live from stored dates + current tier — never stored as a static color. Rendered in `bio.js`, `cv.js`, `dashboard.html`, and `og.js`.
- `verification_session_id` column — stores only the Didit KYC session reference, no raw ID data.
- Tier structure finalized: Basic (free), Silver ($2.5/mo), Gold ($4.9/mo), Platinum ($9.9/mo) — link limits, landing page access, watermark removal, and cumulative one-time NET rewards per tier.
- Slug length policy (locked): Basic min 5 chars, Silver min 4, Gold min 3, Platinum min 2, max 25 for all tiers, 1-char reserved.

### Changed
- `bio.js` — new header (plain top-left logo, top-right share button), donate card redesigned.
- `cv.js` — corner logo fixed (no more stray blue banner), Print/Share toolbar moved below content, WhatsApp number shown in full instead of generic label.
- `og.js` — verification badge now shown as a labeled text line instead of a plain color dot.
- Watermark automatically hidden for Gold/Platinum tier on `bio.js` and `cv.js`.

### Known Gaps (tracked, not yet built)
- `page-builder.html` only checks slug availability — does not yet write to `landing_pages`.
- No public render endpoint for landing pages (`api/landing.js`, equivalent to `bio.js`/`cv.js`).
- NET reward tracking has no on-chain transfer mechanism yet (needs treasury wallet + smart contract).
- No admin panel — tier/badge management is manual via Supabase Table Editor.
- NET ID: no automatic length-extension mechanism yet if the 10-digit space nears capacity (principle agreed, not implemented).
- No separate referral code (shorter, shareable code distinct from NET ID).
