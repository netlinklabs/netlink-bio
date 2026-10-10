# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

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
