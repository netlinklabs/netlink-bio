# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you're looking for isn't below.

## [Unreleased]


### Security
- **Supabase `profiles`: signed-in users could edit their own `tier`, `tier_expires_at`, verification statuses, `is_black_badge`, `net_id`, `referral_code`, and `net_reward_*` directly from the browser (RLS only checked the row, not the columns), so anyone could self-upgrade to Gold or mark themselves verified.** Migration `lock_profile_sensitive_columns` revokes table-level `UPDATE` from `authenticated`/`anon` and grants it back only on the 40 user-editable columns (bio, contact, wallet, theme, privacy toggles, etc.). No page in this repo writes the locked columns from the client; the `SECURITY DEFINER` trigger `sync_verification_cache`, the Didit webhook, and the service role are unaffected. Verified after the change: `dashboard.html` and `pay.html` still save normally. Any new client-side `profiles.update()` on a locked column will now fail with "permission denied" and must go through an API route instead.

### Added
- **Paid-order backend for KYC (KYB and plans reuse it later): new `api/orders.js` and Supabase tables `orders`, `order_payments`, `admin_users`, `admin_audit_log`.** No checkout UI yet, so nothing is user-visible.
  - **`api/orders.js`** is one function dispatched by `?action=create|status|check-payment|cancel` (this is the 12th and last Vercel Hobby function slot, so future order features must be added as actions here). Every action needs a Supabase session. The price comes from the server (`PRICES.kyc` = 2.5 USDC), never from the request. Native USDC only (`0x3c49...3359`), not USDC.e.
  - **Payment matching needs no tx hash from the user.** `check-payment` pulls incoming USDC transfers to the finance wallet from Alchemy, stores each in `order_payments` (unique per `tx_hash` + `log_index`), and assigns a transfer to an order when it comes from the order's sender address, or when its hash equals the optional `claimed_tx_hash` (hash wins, for exchange withdrawals). Statuses: `paid` (within 0.05 USDC tolerance, overpay counts as paid), `underpaid` (remaining amount is shown, later transfers add up), `late_payment` (arrived after the 3-day expiry, an admin decides), `expired`. Unmatched transfers stay `unmatched` for admin review. Amounts are integer micro-USDC (BigInt).
  - **Requires two Vercel env vars**: `FINANCE_WALLET_ADDRESS` (public receiving address only, never a key) and the existing `SUPABASE_SERVICE_ROLE_KEY` / `ALCHEMY_API_KEY`. Without `FINANCE_WALLET_ADDRESS` the API returns a generic 500 by design.
  - **Supabase**: `orders` (one active order per user per type and per sender address, `pay_to_address` snapshotted per order so moving to a Safe later does not affect old orders), `order_payments`, `admin_users` (one row per person per role: `super_admin`, `finance`, `kyc_reviewer`, `support`), `admin_audit_log` (append-only, enforced by a trigger). Clients only have `SELECT` under RLS; all writes go through the API with the service role. `has_admin_role(text[])` drives the admin RLS policies. Initial admins seeded: owner as `super_admin`, one team member as `finance` and `kyc_reviewer`.
