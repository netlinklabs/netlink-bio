# Payment, KYC and Membership Rules

Single source of truth for every rule that touches money or membership tiers.
Read this BEFORE changing any payment-related file (see "Files covered" at the bottom).
If you change a rule, update this file in the same PR, and add a line to the
"Rule history" section.

Last verified against code and production: 2026-10-07.

---

## 1. Payment basics

- Currency: **USDC on Polygon** only (native USDC, Circle, NOT USDC.e). No fiat processor.
- Money goes to one **finance wallet** (`FINANCE_WALLET_ADDRESS` env var). KYC and plans share it.
- Pay methods: **Netlink Pay** (sender is the user's own wallet, read server side) or **External Wallet** (user enters a sender address).
- Sender address cannot be the finance wallet. One open order per sender address at a time.
- Amounts are decided on the server (`api/orders.js`). Never trust a price from the client.
- Tolerance: **$0.05** under the price still counts as fully paid.
- Order number format: `NL-YYMMDD-XXXXXX`.
- Invoice (open order) lifetime: **3 days** (`orders.expires_at` default, database).
- One active order (awaiting_payment or underpaid) per user per type. Opening the same one again returns the existing order.
- A different plan or a new upgrade price replaces an open order only if nothing was paid on it. If a partial payment exists, the user must finish it or wait for it to expire.
- Status check is throttled to once per 10 seconds per order.

### Order statuses

| Status | Meaning |
|---|---|
| awaiting_payment | Open, nothing paid |
| underpaid | Partial payment received |
| paid | Fully paid (within tolerance) |
| expired | Invoice time ran out, nothing paid |
| late_payment | Money arrived after expiry. An admin decides (refund or credit) |
| cancelled | Replaced or cancelled |
| refunded | Marked by admin after a manual refund |

### Refunds

- **No refunds** for plan payments (server cost stays). Shown on plans.html.
- Any refund is manual (admin sends the money, then marks the order `refunded` in admin).
- Marking an order `refunded` does NOT remove the plan time already granted.

---

## 2. Tiers

Active tiers: **Basic (free), Silver, Gold**. Platinum is disabled for now (kept in code and
the 200 link limit for the roadmap, not sold).

| Feature | Basic | Silver | Gold |
|---|---|---|---|
| Links in Bio | 20 | 30 | 50 |
| Video cards | 1 | 5 | 13 |
| Video layouts | standard only | 3 layouts | 3 layouts |
| Username length | 5+ characters | 4+ | 3+ |
| Template Gallery | locked (2 templates) | Silver (4 templates) | Gold (6 exclusive + 4 Silver) |
| Header banner | no | yes | yes |
| Professional CV | Basic | Advance | Advance |
| Certificate PDF upload (CV) | no | yes | yes |
| Landing Page | **no** | **no** | **yes** |
| Hide footer link | no (locked ON) | no (locked ON) | yes (toggle) |
| Click analytics | no | yes | yes |
| Netlink Pay wallet | yes | yes | yes |

Notes:
- Landing Page is **Gold only** (also enforced in the database).
- Link limit is enforced on the public page in `api/bio.js` (`LINK_LIMITS`): basic 20, silver 30, gold 50, platinum 200.
- Click analytics still shows "Coming Soon" in places. Check before promising it.
- Feature lists on `plans.html` must match this table.

---

## 3. Plan prices (USDC)

Set in `api/orders.js` (`PLAN_PRICES`). Period names in requests: `monthly`, `quarterly`, `semiannual`, `annual`.

| Length | Silver | Gold | Discount |
|---|---|---|---|
| 1 month | $3 | $6 | none |
| 3 months | $9 | $18 | none |
| 6 months | $15 | $30 | 1 month free (-17%) |
| 12 months | $27 | $54 | 3 months free (-25%) |

- Only these 4 lengths. No free 1 to 12 month input.
- The user can change the length on the checkout page before clicking Continue. The choice from plans.html is only the starting value.
- The 20 NET discount idea is **postponed** until NET is listed and has a market price. Do not build it yet.

---

## 4. Plan life cycle

1. **Buy**: order type `plan` (`tier`, `months`, `kind` in `orders.meta`). When paid, `settleOrder` calls `fulfill_plan_order` (database function, service_role only, idempotent). Activation happens within seconds.
2. **Renew** (plan still running): time is added **after the current end date**.
3. **Buy after the plan ended** (grace or already Basic): counts as a fresh purchase, time starts from now.
4. **Upgrade Silver to Gold** (plan running): price is the difference per day for the remaining days, rounded up to the cent.
   - Rate = (Gold price − Silver price) / days, using the length of the user's last paid Silver (non-upgrade) order (fallback 1 month).
   - Days per length: 1 = 30, 3 = 91, 6 = 182, 12 = 365.
   - The end date does not change on upgrade.
5. **Downgrade (Gold to Silver) while running**: not allowed. The Silver button is locked until the Gold plan ends.
6. **Reminders**: email + in-app notice **7 days** and **3 days** before the end date. Sent once each (deduped by notification link).
7. **Grace period**: **7 days** after the end date. The tier stays.
8. **After grace**: a daily job (inside `api/cron/rollup-analytics.js`, `?job=plan-expiry`) sets the tier to **Basic** (`expire_lapsed_tiers`), sends an email and an in-app notice.
9. **Basic after expiry**: features above Basic limits are **hidden on public pages, not deleted**. The user's data stays.
10. **Username** is never changed by a downgrade.
11. **Expired Gold landing page** shows a neutral page: "This page is not active". Landing page data stays. The page is removed from the sitemap.
12. **Data cleanup after 6 months expired**: a policy idea only. **Not built. Not promised in public copy.**
13. **Permanent tier**: a profile with a paid tier and no `tier_expires_at` never expires (owner accounts).
14. Owner account `ramlanhadiansyah` (Gold) runs until **2030-12-31**.
15. Test account `@yourname` is used for marketing mockups and live payment tests.

### billing.html behaviour (in-app page)

- `billing.html` is an **app page**: signed in users only. It shows the current plan (tier and end date) and the user's order history (plans and KYC), newest first, up to 50 rows.
- Orders come from `api/orders.js?action=list`. It returns only the caller's own orders and only the fields a history row needs (no wallet addresses, no transaction hashes).
- Each row links to `checkout?order=<id>`, which shows the order status, the payment details and the receipt.
- Status labels: awaiting_payment "Awaiting payment", underpaid "Partly paid", paid "Paid", late_payment "Under review", expired "Expired", cancelled "Cancelled", refunded "Refunded".
- Reached from the Account menu item "Billing" (`shared/account-menu.js`) and from the "View billing history" link at the bottom of `plans.html`.
- `billing` is a reserved name (client lists in `page-builder.html` and `dashboard.html`, and `reserved_usernames` in the database, see migration `20261009_reserve_billing_name.sql`).

### plans.html behaviour (in-app page)

- `plans.html` is an **app page** (`PAGE-TYPE: app`): signed in users only, app nav, no marketing header or footer. Signed out visitors are sent to `login`. Every Upgrade, Renew and "See plans" button in the app points to `/plans`. The Account menu has a "Plans" item (`shared/account-menu.js`) that opens it.
- Reads the user's own `tier` and `tier_expires_at`. Labels: "Current Plan", "Renew Silver", "Upgrade to Gold", "Renew Gold", locked Silver while Gold is running, a note when a paid plan ended.
- The page stays `noindex, nofollow`. A public pricing page (with the website header and footer) is a separate future file, for example `pricing.html`. It must not copy prices by hand: it should link signed in users to `/plans`.
- Feature lists and prices on any plans or pricing page must match the tier feature table in this file.

---

## 5. KYC (identity verification)

- **$2.50, one-time add-on.** Not part of any tier and not required by any tier. Any tier (Basic, Silver, Gold) can buy it.
- Price in `api/orders.js` (`PRICES.kyc`). Same checkout, same finance wallet as plans.
- Provider: **Didit** (500 free full verifications per month, then about $0.33 each).
- KYC has **no length options** (no monthly or yearly choice). Plan changes must never touch the KYC checkout.
- Pay first, then verify: the verification session is created only for a **paid** KYC order.
- Already verified (`identity_verification_status = approved`): a new KYC order is refused.
- Limits: **3 verification sessions per 24 hours** and **10 per order**. After that the user must contact support.
- Rejected (`declined`): the user must contact support.
- Verified users get a trust badge on their profile.
- A paid KYC order that is still open is reused (shown again) instead of creating a new one.
- **Postponed idea**: yearly KYC renewal. Today KYC does not expire. Decide before building.

---

## 6. Wallet rules that affect payment

- Each social login (Google, etc.) creates a separate wallet address. One user is not always one wallet.
- Before any wallet action (send, sign), validate `sessionMatchesCurrentWallet()` (see CLAUDE.md, wallet security).
- Netlink Pay payments for orders send USDC from the user's wallet to the finance wallet, then return to `checkout?order=<id>&paid=1`.
- Checkout shows a "Confirming payment" state for up to 150 seconds (polls every 5 seconds) after a Netlink Pay payment, before showing a warning.
- No presale runs in 2026. Token purchases go through the Investor and Partnership Inquiry form (private sale with vesting).

---

## 7. Database objects (production project `fuewalufgiclrcgszlit`)

- `orders` (type `kyc` or `plan`, status, amount_usdc, paid_amount, meta, expires_at)
- `profiles.tier`, `profiles.tier_expires_at`
- `fulfill_plan_order(order_id)`: allows lengths 1, 3, 6, 12 only. Service role only.
- `expire_lapsed_tiers(grace)`: default grace 7 days. Service role only.
- Triggers keep Landing Page Gold only.
- Migrations: `20261007_plan_orders_and_expiry.sql`, `20261007_plan_fulfill_running_fix.sql`, `20261007_plan_months_3_6.sql`.
- Production writes (data fixes, broadcasts) need a draft shown and approved first (see CLAUDE.md).

---

## 8. Files covered (read this document before editing)

- `api/orders.js` (prices, order flow, settle, KYC sessions)
- `api/_lib/mailer.js` (invoice, receipt, plan emails)
- `api/_lib/plan-expiry.js`, `api/cron/rollup-analytics.js` (reminders and downgrade job)
- `api/_lib/admin.js`, `admin.html` (order review, refunds)
- `checkout.html`, `plans.html`, `billing.html`, `identity.html`
- `pay.html`, `pay2.html`, `pay5.html`, `tx.html`, `recovery.html` (wallet and payment return)
- `api/bio.js`, `api/landing.js`, `api/_lib/sitemap.js` (tier limits on public pages)
- `dashboard.html`, `template.html`, `privacy.html` (tier gates and locks)
- `supabase/migrations/*plan*`, `*order*`, anything that touches `tier` or `tier_expires_at`

---

## 9. Rule history

- 2026-10-07: Silver $3 and Gold $6 per month. Paid plans go live with the KYC checkout flow.
- 2026-10-07: Plan lengths 1, 3, 6, 12 months. 6 months = 1 month free, 12 months = 3 months free (replaces the earlier 12 months = 2 months free idea).
- 2026-10-07: Grace 7 days, reminders at 7 and 3 days, no refunds, features hidden not deleted.
- 2026-10-07: Landing Page Gold only. Expired Gold landing shows a neutral inactive page.
- 2026-10-07: 20 NET discount postponed. KYC yearly renewal postponed.
- Earlier: KYC became a separate $2.50 one-time add-on, no longer required for Gold.
- 2026-10-09: `plans.html` became an in-app page (app nav, login required). A public pricing page, if built later, is a separate file that sends signed in users to `/plans`.
- 2026-10-09: New in-app `billing.html` (current plan and order history) and `api/orders.js?action=list`. The Account menu now has separate "Plans" and "Billing" items.
