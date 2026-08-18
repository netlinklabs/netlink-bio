# Changelog

All notable changes to Netlink.bio are documented in this file.

## [Unreleased]

### Added
- `app.html` — "coming soon" placeholder page for the main app (dark slate-900 theme with teal/blue gradients matching netlink-token's landing page style): banner with a subtle float/glow animation, "In Development" status badge, Q3 2026 timeline note, a 3-pillar Netlink/Netlink Pay/NET Token grid linking out to docs and the whitepaper, secondary CTAs (Whitepaper, Documentation), and social links (Telegram, X/Twitter, Instagram).
- **NET ID** — permanent per-user identifier, format `NET` + 10 random digits (e.g. `NET1234567890`), stored plain in `profiles.net_id`, rendered with a cosmetic hyphen grouping (`NET-12345-67890`) via `formatNetId()`. Auto-generated on profile creation via DB trigger (`generate_net_id()`); existing users backfilled. Currently identity-only — no transactional use yet.

### Changed
- `shared/site-nav.js` — the header's "Get Started Free" CTA now points to `app.html` (temporary, until the app is live) instead of `login.html`. The "Login" nav links are unchanged.
- `pay.html` — USDC card ID display now reads the real `net_id` from Supabase instead of generating a random value on every page load.
- `pay.html` and `pay2.html` — `goToSendConfirm()` now checks `sequenceWaas.isSignedIn()` before showing the send confirmation step. If the Sequence WaaS session is already active, it skips the Google/email-OTP re-auth prompt and shows a direct "Confirm Send" button (built with `document.createElement` + `addEventListener`, not an inline `onclick`) that calls `doExecuteSend()`; if the session is not signed in, the existing Google sign-in confirm flow (with email OTP fallback on `pay.html`) is unchanged. Promoted from the `pay3.html` experiment, which has been removed now that its logic lives in production. `performTransfer()`, `doExecuteSend()`, and the wallet connect/disconnect flow were not touched.
- `pay.html` and `pay2.html` — the "No wallet yet" toast shown when opening Send or Receive without a connected wallet now reads "No wallet connected — tap Connect Wallet to continue", matching the wording already used elsewhere (`copyWalletAddress()`, the swap error state). Text-only change; no logic touched.

### Removed
- `pay3.html` — experimental page for the skip-relogin Send flow. Its logic has been merged into `pay.html` and `pay2.html`; the standalone experiment is no longer needed.

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
