# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

### Security
- **Supabase JS library is now served by us, pinned to 2.117.3 (`shared/vendor/supabase.js`, 25 pages).** Every page loaded `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, where `@2` means "the newest 2.x". Whatever that CDN served on the day ran on the login, dashboard, wallet (`pay*.html`, `tx.html`, `recovery.html`), checkout, admin and public pages, with the user's session in reach. The same file (`dist/umd/supabase.js`, MIT) is now copied unchanged from the npm package into `shared/vendor/` and included with `<script src="/shared/vendor/supabase.js?v=1">`. 2.117.3 is the current latest 2.x, so behavior is the same as before. Pages changed: admin, ambassador, analytics, billing, card, checkout, contacts, dashboard, identity, index, login, page-builder, pay, pay2, pay5, plans, privacy, privacy-policy, recovery, reset-password, reward, template, terms, terms-of-use, tx.
  - To update the library: replace `shared/vendor/supabase.js` with the new file from npm and bump `?v=` on every page that includes it (see `shared/vendor/README.txt`).
  - Checked: the file loads on all 25 pages with no `supabase` or `createClient` error, and a client made on `login.html` has `auth.signInWithPassword`, `auth.signInWithOtp`, `from`, `rpc` and `storage`. Not tested with a real login (needs a real session): please sign in once and open the dashboard and Pay after deploy.
  - Still loaded from public CDNs (pinned versions, not floating): `lucide@0.460.0` (unpkg), `jspdf@2.5.1` and `html2canvas@1.4.1` (cdnjs, `tx.html`).

### Security
- **QR codes are now drawn by us, not by `api.qrserver.com` (`shared/qr.js`, `shared/vendor/qrcode-generator.js`).** The QR image used to come from an outside service. If that service were hacked it could return a QR with another wallet address, and anyone scanning it would pay the attacker (crypto payments cannot be undone). Now the QR is built from the same address that is shown as text, and no address leaves our servers or the browser. Replaced in: the donate card on the link in bio page (`api/bio.js`), the Wallet Card on landing pages (`shared/landing-blocks.js`), the Receive popup in `pay.html`, `pay2.html` and `pay5.html`, the receipt in `tx.html` (PNG, so the saved image and PDF capture it reliably), and the external payment QR in `checkout.html`.
  - `shared/qr.js` exports `qrSvg`, `qrSvgDataUri` (server and browser) and `qrPngDataUri` (browser). The QR math is the MIT licensed `qrcode-generator` 2.0.4 library, copied unchanged into `shared/vendor/`. Browser pages load it only when a QR is needed (`import('/shared/qr.js?v=1')`). Bump the `?v=` when `shared/qr.js` changes.
  - Checked by decoding the output with a QR reader: wallet addresses and a polygonscan link decode back to the exact text, as an SVG image and as a PNG made in Chromium.
  - **QR scanner no longer loaded from `unpkg.com` (`pay.html`, `pay2.html`, `pay5.html`).** The Send screen scanner (`html5-qrcode`) was loaded from `https://unpkg.com/html5-qrcode` with no version, so whatever unpkg served that day ran on the wallet pages. It is now version 2.3.8 (the version unpkg was serving), copied unchanged from the npm package into `shared/vendor/html5-qrcode.min.js` with its Apache-2.0 license and a `README.txt`. Included with `?v=1`, bump it when the file changes. Checked: the copied scanner reads a QR made by `shared/qr.js` back to the exact wallet address.
  - Not changed, flagged: wallet pages still load `@supabase/supabase-js@2` (floating major version) from jsDelivr.

### Added
- **New landing page module: Wallet Card (`shared/landing-blocks.js`, `page-builder.html`, `api/landing.js`).** A card to receive USDC donations or payments, like the "Receive Crypto Payment" card on the link in bio page. Tap the card to open a popup with a QR code, the wallet address, a Copy address button and a note to use the Polygon (PoS) network only. The same USDC logo (`/assets/usdc-logo.png`) and the same shimmer and pulse look as the bio card. The card and the popup buttons use the page brand color (`--primary`), and the text color follows `--on-primary`, so they match any palette.
  - **Editor:** Card title, Short description, Wallet address (Polygon) and Background. A new Wallet Card starts with the wallet saved on the user's profile, and a "Use my wallet from my profile" button fills it again. The address must be 0x plus 40 hex characters. A wrong address shows a warning in the editor.
  - **Public page:** a Wallet Card with an empty or invalid address is not shown. The popup code (open, close, Escape, copy) is in `BLOCKS_JS`, and `api/landing.js` loads it when the page has a Wallet Card. Opening the card counts as a click in the page stats.
  - The address is stored in the block itself (no database change). `page-builder.html` now also reads `wallet_address` from the user's own profile row.

### Changed
- **Landing page meta tags (`api/landing.js`).** From the OpenGraph checker results on `/page/yourbrand`: added `og:site_name` ("Netlink"), `<link rel="canonical">`, `apple-touch-icon` and `og:image:alt`, and shortened the meta and `og:description` text to about 155 characters at a word boundary (it was 191, and up to 300). JSON-LD keeps the full text. Same tags `api/bio.js` already had.

### Added
- **Landing page social preview image (`api/og.js`, `api/landing.js`).** Sharing `netlink.bio/page/:slug` now shows a 1200x630 card built from the page hero banner, like the link in bio card on Gold accounts. The banner gets a dark gradient overlay (40% black at the top to 70% at the bottom, 55% on average), the business name and tagline sit at the bottom left, and the Netlink logo is at the top right. The wide desktop crop of the hero is used first, then the square one. If the hero has no image, the card uses a gradient of the page color. `api/landing.js` points `og:image` and `twitter:image` to `/api/og?type=page&slug=...&r=N&v=<updated_at>`, so the card refreshes after every edit. Only hero images stored in our own public storage are fetched. A page whose owner is no longer on Gold gets the static Netlink image. No new serverless function.

### Fixed
- **Landing page hero filled only the left part of the screen in Chrome mobile "Desktop site" (`shared/landing-blocks.js`).** Desktop site mode uses a viewport of about 980px, between the 768px and 1024px breakpoints. In that range the cropped hero kept its square (1:1) box capped at 560px high, so it shrank to a 560px wide square with white space on the right. The cropped hero is now full width and uses the wide image and 12:5 ratio from 768px up (was 1024px). Phones (under 768px) are unchanged. Heroes without crop images are unchanged.

### Changed
- **Landing page grids: no more empty hole in a short last row (`shared/landing-blocks.js`, `page-builder.html`).** Used by both the editor preview and the published page.
  - **Team:** new **Columns (desktop)** option (2, 3 or 4, default 4). Team used to be fixed at 3 columns on desktop, so 4 people showed as 3 + 1. Existing team blocks have no saved value and now use 4 columns (a team of 4 is one row). Phone stays at 2 columns.
  - **Team and Products:** the grids are now centered flex rows instead of CSS grid, so a short last row is centered, not left aligned with a hole on the right. Card width is unchanged (`(100% - gaps) / columns`). The Products **Columns (desktop)** option still works.
  - **Gallery:** the last photo of a short row stretches to fill it. On phone (2 columns) an odd photo count gives a wide last photo. On desktop it fills the rest of the row (for example 5 photos in 3 columns: the 5th spans 2 columns at the same height as its neighbour, 4 photos in 3 columns: the 4th spans the full row). Set by the renderer through `--sm/--am` (phone) and `--sd/--ad` (desktop) on the last `.gallery-item.gl`. The lightbox is unchanged.
  - Checked in headless Chromium at 1280px and 390px with 3, 4, 5, 6 and 7 items: last rows are centered (equal left and right gap), the stretched gallery photo has the same bottom edge as its neighbours. Saved content is not changed.

### Changed
- **`page-builder.html`: the 12 Brand Color choices are now a curated, more muted palette.** Replaced the bright set (red, green, amber, pink, purple and others) with tones based on current website and brand color guidance (earthy and warm neutrals, calm greens, deep jewel blues, soft mauve and plum): Espresso `#5D4037`, Terracotta `#B0553A`, Dusty rose `#B0546E`, Plum `#6B4E8C`, Sage `#4F7360`, Forest `#1F5C4A`, Teal `#1B7A7A`, Sapphire `#1F4E8C`, Midnight `#1F2A44`, Ochre `#A8680F`, Warm sand `#C9B08A` and Charcoal `#212121`. Espresso (the default) and Charcoal are unchanged, so pages using them still show the active swatch. Eleven colors keep white text with contrast 4.5 or higher. Warm sand is light, so the page switches to dark text automatically (contrast 7.7). Each swatch has a `title` and `aria-label`. Saved pages keep their color, the old swatches (for example `#1A237E`) simply no longer show as active in the editor. No JS change.

### Added
- **`page-builder.html`: 6 more Brand Color choices.** Added Light brown `#8D6E63`, Pink `#D81B60`, Purple `#7E57C2`, Teal `#00796B`, Coral `#D84315` and Slate `#455A64` after the existing six, so the palette also suits women owned and other businesses. All six keep readable white text on the brand color (contrast 4.6 or higher). The picker now wraps to two rows. No JS change: `setPrimary()` and the active state already work on any `.color-btn`. Saved pages are not affected. The swatches are only added to the editor, `primary` accepts any hex color.

### Fixed
- **`shared/nav.js`: Account menu items that point to an anchor on the current page now close the sheet and scroll to the target.** Before, tapping "Link in Bio" or "Professional CV" while already on `dashboard.html` only changed the URL hash, so the sheet stayed open and hid the section. Now the sheet closes and the page scrolls to `#profileCard` or `#cvCard`. From other pages, and for "Landing Page", navigation is unchanged. `shared/nav.js?v=` bumped from 7 to 8 on every page that loads it.

### Added
- **`shared/account-menu.js`: new "Profile" group in the Account sheet, above "Wallet".** Three items: **Link in Bio** (`dashboard#profileCard`), **Professional CV** (`dashboard#cvCard`) and **Landing Page** (`page-builder`). The dashboard already scrolls to `#profileCard` and `#cvCard` from the URL hash, so no change was needed there. Icons `link`, `briefcase`, `layout-template` (lucide 0.460.0). No new Tailwind classes, no CSS rebuild.

### Changed
- **`CHANGELOG.md` archived.** All entries up to and including PR #331 (landing page builder: dynamic modules, 8 new modules, crop boxes, limits, storage limits) moved to `changelog-archive/2026-10-10-1835.md`
