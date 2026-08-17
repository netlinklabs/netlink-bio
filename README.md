# Netlink

One profile for everything — bio link, CV builder, business landing page, and an integrated crypto wallet (**Netlink Pay**) on Polygon.

> **Naming note:** the brand is **Netlink**. `netlink.bio` is a domain/URL only, not the product name — don't write "Netlink.bio" as a brand in copy or docs.

## Status

🟢 Pre-seed, active development — public bio/CV/landing pages and Netlink Pay wallet are live and used by internal testers. Full public launch pending completion of core milestones.

Built as static HTML + Tailwind CSS (CDN), no bundler. Vercel serverless functions handle dynamic/public-facing rendering and blockchain-related endpoints.

## Structure

```
netlink-bio/
├── index.html              # Marketing landing page
├── login.html               # Auth (email/password + Google OAuth + email OTP)
├── recovery.html            # Account recovery flow
├── reset-password.html      # Password reset flow
├── dashboard.html           # User dashboard
├── identity.html            # KYC/identity verification (Didit)
├── page-builder.html        # Landing page builder (business-type presets, etc.)
├── pay.html                 # Netlink Pay — wallet, balances, send/receive, swap
├── pay2.html                # Netlink Pay — on-ramp/off-ramp testing (Transfi sandbox, etc.)
├── tx.html                  # Transaction history / detail
├── contacts.html            # Saved contacts for sending
├── investor.html            # Investor-facing page
├── username-policy.html     # Username policy explainer
├── privacy.html / privacy-policy.html
├── terms.html / terms-of-use.html
├── manifest.json, sw.js     # PWA manifest + service worker
├── api/                     # Vercel serverless functions
│   ├── bio.js                # Public bio page renderer  (/:username)
│   ├── cv.js                 # Public CV renderer        (/cv/:username)
│   ├── landing.js            # Public landing page renderer (/page/:slug)
│   ├── og.js                  # OG image generation (@vercel/og)
│   ├── wallet-balance.js      # Wallet balance fetch (Polygon)
│   ├── wallet-transactions.js # Transaction history fetch
│   ├── lifi-quote.js          # LI.FI swap quote proxy
│   ├── tx-gas-fee.js          # Gas fee estimation
│   ├── transfi-create-order.js / transfi-order-status.js / transfi-webhook.js
│   ├── export-data.js         # User data export (privacy/GDPR-style request)
│   ├── record-consent.js      # Consent logging
│   └── webhooks/didit.js      # Didit KYC webhook
├── shared/                  # Shared JS/CSS used across pages
│   ├── site-nav.js / site-nav.css   # Shared header/nav
│   ├── nav.js                        # Bottom nav (mobile)
│   ├── account-menu.js               # Account dropdown/menu
│   └── app-lock.js                   # App lock / PIN screen
├── assets/                  # Logos, badges, icons
└── CHANGELOG.md             # Source of truth for what's shipped — keep updated
```

## Core Stack

- **Frontend:** Vanilla HTML/JS, Tailwind CSS (CDN), Lucide icons
- **Hosting:** Vercel (static + serverless functions in `api/`)
- **Backend/DB:** Supabase (PostgreSQL + RLS + Auth)
- **Wallet:** Sequence WaaS — embedded smart-contract wallets, no exportable private key
- **Chain:** Polygon PoS
- **Swap:** LI.FI aggregator (integrator name `netlink-pay`, 0.5% fee)
- **On/off-ramp:** Alchemy Pay, Transfi, Onramp.Money, OnMeta (in progress — KYB/approval pending for most)
- **KYC/KYB:** Didit (only `verification_session_id` stored locally; sensitive data stays with Didit)
- **Email:** Supabase custom SMTP (Gmail, temporary) — planned migration to Resend once `netlink.bio` domain is live

## Live Features

- Public bio page, CV page, and business landing page per user (`@username`)
- Verification badge system (Green/Silver/Gold/Black), computed live from tier + dates
- Netlink Pay: embedded wallet, USDC/NET/POL balances, send/receive, in-app swap (POL ⇄ USDC via LI.FI)
- Tiered plans (Basic/Silver/Gold/Platinum) with link limits, landing page access, and cumulative NET rewards
- Auth: email/password, Google OAuth, email OTP verification at signup, password reset
- Account deletion request flow (with outgoing-transaction lock while pending)

## Known Gaps / In Progress

See `CHANGELOG.md` for the current, authoritative list — this section intentionally stays short to avoid going stale. As of this writing:
- Custom domain `netlink.bio` migration pending (site currently live at `netlink-bio.vercel.app`)
- On-ramp providers mostly pending KYB approval (Transfi furthest along)
- i18n on `dashboard.html` — paused mid-implementation
- Account Linking (multiple auth methods → same wallet) not yet built

## Related

Part of the Netlink ecosystem, built by **PT Netlink Labs Global**:
- [`netlink-token`](https://github.com/netlinklabs/netlink-token) — NET token landing page, whitepaper, and docs (`docs.netlinktoken.com`)

## Contributing / Working in this repo

Read `CLAUDE.md` before making changes — it covers branding/language rules, production-data safety, and the requirement to update `CHANGELOG.md` on every change.
