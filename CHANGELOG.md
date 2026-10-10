# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

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
