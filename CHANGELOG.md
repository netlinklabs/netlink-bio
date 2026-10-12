# Changelog

All notable changes to Netlink.bio are documented in this file.

Older entries are archived to keep this file small, see `changelog-archive/` (newest file first,
older entries in older-dated files) if what you are looking for is not below.

## [Unreleased]

### Added
- Landing page builder: new **Legal Info** module (19 modules now). The owner enters a company name and registration numbers (NIB, NPWP, SIUP, or any label plus number, up to 6). It shows as a small card on the page and is published in the JSON-LD as `legalName`, `taxID` (when the label is NPWP or tax id) and `identifier` (PropertyValue, label as `propertyID`). Rows need both a label and a number. The numbers are typed by the owner and are not verified by Netlink. The editor warns not to enter a personal ID number (KTP or NIK).
- Landing page builder: the Location module has a new Country selector (uses `shared/countries.js`). The chosen ISO code is published as `addressCountry` in the page JSON-LD. Pages with no country selected publish no `addressCountry`, nothing is guessed. The visible Location block is unchanged.

### Changed
- Landing pages: business types that used `Person` (creator, author, musician, podcaster, artist, freelance, educator, trainer, tutor) now emit a business type in JSON-LD (`Organization` or `ProfessionalService`). A landing page always describes a business. The person stays described by the bio and CV pages, which already link to each other through `sameAs` and a shared `#person` id.

### Docs
- `CLAUDE.md`: new "Deployment (Vercel)" rule. All deployments go straight to production, no preview deployments unless the owner asks. Preview deployments were also turned off in the Vercel project settings (free plan quota was at 75%).

### Changed
- **Landing pages (`netlink.bio/page/:slug`): the JSON-LD now describes every module, so AI assistants and search engines can read the whole page.** Before, only name, url, description, one image and the address were emitted, as one flat object. Now `api/landing.js` calls the new `api/_lib/landing-jsonld.js`, which outputs one `@graph`.
  - Graph: `WebPage` (with `dateModified`, `primaryImageOfPage`) pointing to the business node (`@type` still from `BUSINESS_TYPE_SCHEMA`), plus a `FAQPage` and one `VideoObject` per YouTube video.
  - Business node, by module: Hero/Text/Image + Text/Gallery/Full Image feed `description` and `image` (list, https only, max 10); logo becomes `logo`; tagline becomes `slogan` (`jobTitle` on Person). Location gives `address` and `hasMap`. Opening Hours gives `openingHoursSpecification`. Contact gives `telephone`, `email` and `contactPoint` (WhatsApp, Telegram, LINE as links; WeChat has no public link, so it is skipped). Social Links give `sameAs`. Cards and Products give `hasOfferCatalog` (`Offer`, with `price` and `priceCurrency` from the page currency; cards are `Product` for cafe, restaurant, bakery, local store and florist, `Service` otherwise). Team gives `employee`. Testimonials give `review`.
  - Not described (nothing to say to a machine): Call to Action, Wallet Card, Divider. Empty modules produce nothing, same checks as the renderer.
  - Types are respected: Person gets no `review`, `employee`, `openingHoursSpecification`, `hasMap` or `logo`. Organization and NGO get no hours or `hasMap`.
  - Nothing is guessed. Opening hours rows are converted only when days and times are read with certainty (English and Indonesian day names, "09:00 - 17:00" or "09.00-17.00", "24 jam"); closed or unreadable rows are skipped. Non-numeric prices get no `price`. Reviews without a name are skipped. No `aggregateRating` (reviews on the business's own page are self-serving). `uploadDate` is not invented for videos.
  - Also: the meta description now falls back to the hero subtitle before the tagline when the page has no text module. The stale comment above `BUSINESS_TYPE_SCHEMA` (it claimed a copy in `page-builder.html` that no longer exists) was corrected.
  - Still missing, needs a new field in the editor: `addressCountry` (the Location module has no country), structured opening hours (so free text is no longer guessed) and a video upload date.
  - Tested with sample data through the real handler (all 18 module types, Person, NGO, empty page, bad data): valid JSON, no owner id in the output, script-breakout text stays escaped. Not run against live Supabase data or Google's Rich Results Test (blocked from this sandbox), so check one live page in validator.schema.org after deploy.
- **`pay.html`, `pay2.html`, `pay5.html`: the profile's record of linked sign-in methods is also kept in step with Sequence here.** Once per page load, when the wallet session is valid, a linked Google or email identity missing from the profile is filled into `wallet_google_email` / `wallet_recovery_email`.
  - Why: the identity gate offers methods from those columns. Until now only `recovery.html` corrected them, so accounts that never opened it could miss a valid option in the Send/Swap gate.
  - Same safety as the `recovery.html` sync: fills only empty columns (`.is(col, null)`), never overwrites, ignores non-email values, best-effort.
- **`recovery.html`: removed the redundant "Email address" label above the locked email in the sign-in gate.** It now shows only "We will send a code to" and the address. With several saved emails (dropdown) the label stays.
- **`recovery.html`: an account with no connected wallet now sees "Connect your wallet first" instead of a sign-in.** Shown when the profile has no `wallet_address` (for example after "Disconnect" in Netlink Pay), with a "Go to Netlink Pay" button.
  - Why: the sign-in could never succeed there and ended with the misleading "signed you into a different wallet" message.
  - Nothing else changes: with a connected wallet the gate works as before.
- **`pay.html`, `pay2.html`, `pay5.html`: the identity gate (Send and Swap) now offers only the sign-in methods that open this account's wallet.** Same rule as `recovery.html`.
  - Google is offered only if the profile has `wallet_google_email`. Email code is offered if the profile has `wallet_recovery_email`, or if there is no Google record.
  - Both linked: Google first, with the "Use email instead" link. Google only: no email link. Email only: goes straight to the email code step (no Google button).
  - The methods are decided before the gate becomes visible, so nothing flashes. If the profile cannot be read, both are offered. `sessionMatchesCurrentWallet()` is unchanged and still checks the wallet after sign-in.
- **`recovery.html`: the profile's record of linked sign-in methods now follows what Sequence reports.** When the Sign-in methods list loads (valid wallet session), a linked Google or email identity that is missing from the profile is filled into `wallet_google_email` / `wallet_recovery_email`.
  - Why: the identity gate offers Google and email based on those two columns. A wallet could have both linked in Sequence while the profile only had one (found on `ramlanhadiansyah`), which would hide a valid option in the gate.
  - Safe by design: fills a column only when it is empty (`.is(col, null)`), never overwrites, ignores values that are not an email address, and is best-effort (a failure is only logged).
  - It runs per user, when they open `recovery.html` with a valid session. Other accounts get corrected the same way on their own visit.
  - Static check only (script syntax). Not tested in a browser. The email field name on Sequence email accounts (`email`) is assumed; if Sequence does not return it, nothing is written.

### Fixed
- **Logout now also drops the wallet (Sequence) session on `recovery.html` and on the app-lock screen.** The wallet session is browser-global. `shared/nav.js` drops it on Logout only when the page exposes `window.sequenceWaas`, and `recovery.html` did not, so logging out there left the previous account's wallet session in the browser. The app-lock screen's Logout button never dropped it either.
  - `recovery.html`: added `window.sequenceWaas = sequenceWaas;` so the existing Logout code in `shared/nav.js` works there.
  - `shared/app-lock.js`: the Logout button now calls `dropSession()` (when `window.sequenceWaas` exists) before `signOut()`.
  - Not changed: `dashboard.html`'s own `handleLogout()` has no `dropSession()`, but nothing calls it (the Logout button uses the `shared/nav.js` handler, which already drops the session there).
  - Bumped `shared/app-lock.js?v=3` to `?v=4` on the 10 pages that include it, so browsers load the new file.
  - Dropping the session only logs out the browser. Funds and the profile's `wallet_address` are untouched.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Fixed
- **`recovery.html`: Emergency Export now works for wallets whose gas is sponsored.** Before, an empty list of gas options was treated as an error ("Gas payment options are not available from the relayer right now"), so a sponsored wallet could not export at all. An empty list means the relayer pays the gas (same reading as `checkGasSponsorship()` in `pay.html`).
  - Sponsored: no POL is reserved for gas, the whole POL balance is exported, and the transaction is sent without a gas option. The review line says "network fee sponsored".
  - Not sponsored: unchanged (gas paid in POL, fee reserved).
  - Safety: if sponsorship changes between the first estimate and the send, the export stops with "Nothing was sent" instead of sending a wrongly planned amount.
  - Static check only (script syntax). Not tested in a browser or with a real transfer. Test with a small balance first.

### Changed
- **`recovery.html`: the sign-in gate and Emergency Export now offer only the sign-in methods that open this account's wallet.** Before, Google and email were always both offered, and the wrong one (a method this wallet was not made with) only created a different empty wallet and was then rejected.
  - Rule: Google is offered only when the profile has `wallet_google_email`. Email is offered when `wallet_recovery_email` is set, or when the wallet was not made with Google. If the profile is unreadable, both stay available.
  - Email-only wallets (for example `labs_netlinkteam_1843`) now see only the email code step, with the locked email. Google-only wallets see only Google. Wallets with both keep both.
  - Also fixed: "Send a new code" in the gate could leave a blank card. It now returns to the email step.
  - Not changed yet: the Send gate on `pay.html`, `pay2.html`, `pay5.html` (same rule planned as a separate change).
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Fixed
- **`recovery.html`: the sign-in gate is no longer a dead end.** Choosing Google could leave the card dimmed with no message and no way out when the wallet service did not answer.
  - Google sign-in now times out after 45 seconds with a clear message ("Sign-in is taking too long...") and the button becomes usable again.
  - Added a "Back to wallet" link at the bottom of the gate card, always visible.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Changed
- **`pay.html`, `pay2.html`, `pay5.html`, `recovery.html`: the locked email in the identity gate is now plain text, not a form field.** It shows "We will send a code to" and the email. The value still sits in a hidden input, so the code flow is unchanged. With several saved emails the dropdown stays.
- **`pay.html`, `pay2.html`, `pay5.html`: removed the empty bar under the "Send" title on the identity gate and the Swap identity step.** It was the transfer summary card with nothing inside. It is now hidden whenever it has no visible content (CSS `:has()`), and still shows on the real Confirm Send step.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Changed
- **`pay.html`, `pay2.html`, `pay5.html`, `recovery.html`: the email code step of the identity gate no longer lets you type an email.** The field is locked to the email that opens this account's wallet, so the code always goes to the right inbox and no code is wasted on a wrong address.
  - Where it applies: Send identity gate (pay pages), sign-in gate and Emergency Export confirmation (`recovery.html`).
  - Email source: `wallet_recovery_email`, `wallet_google_email`, then the Netlink account email. One match shows a read-only field. Older wallets with several saved emails show a dropdown (no free typing).
  - "Use a different email" is now "Send a new code". The "different wallet" error no longer tells you to change the email.
  - Not changed: Connect Wallet modal (still checked by `checkConnectEmailAllowed()`) and the "Add recovery email" field in `recovery.html` (it adds a new backup email by design).
  - This is a UI guard only. `sessionMatchesCurrentWallet()` still decides if the wallet session is valid.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Fixed
- **`pay.html`, `pay2.html`, `pay5.html`: the Send identity gate now really blocks the Send form until the wallet session is verified.** Before, pressing Cancel (or the x) on the gate revealed the Send form without confirming identity, and the form flashed briefly while the session was being checked.
  - Cancel on the gate now closes the Send modal. The modal opens only after the session check, so the form is never visible without a verified session.
  - Cancel at the Confirm Send step still returns to the form (the session was already verified at that point).
  - The transfer itself was already protected (`goToSendConfirm()` and `doExecuteSend()` re-check the session), so this closes a UX and security-posture gap, not a fund risk.
  - Static check only (script syntax). Not tested in a browser or on a real phone.
- **`pay.html`, `pay2.html`, `pay5.html`, `recovery.html`: the email code step no longer shows "Could not send code" when the code email was actually sent.** The page waited only 3 seconds for the wallet service to hand over the code prompt. When it took longer (seen right after a wrong-wallet check dropped the session), the red error appeared even though the email arrived. It now waits up to 20 seconds, and stops early if the sign-in itself fails. Applies to Connect Wallet, the Send identity step (also used for Swap) and, on `recovery.html`, the sign-in gate and Emergency Export.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Fixed
- **`pay.html`, `pay2.html`, `pay5.html`: choosing a different Google account (or email) when confirming your identity can no longer send or swap from the wrong wallet.** Before, picking "Use another account" at the Confirm Send step signed in with that account and sent right away, without checking that its wallet is this account's wallet.
  - After every identity confirmation (Google and email code) the wallet session is checked against the account's wallet. On a mismatch nothing runs, the session is dropped, and a clear message is shown ("That signed you into a different wallet than this account's...").
  - `doExecuteSend()` and the swap send (`executeSwapTx()`) check the session again right before sending. For Swap, a failed check re-opens the identity step.
  - `recovery.html` already had these checks (Emergency Export).
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Changed
- **`pay.html`, `pay2.html`, `pay5.html`: connecting a wallet for the first time now requires the same email as the Netlink account.** In the Connect Wallet modal, a Google account or an email whose address differs from the account's email is rejected before any wallet is created ("Use the same email as your Netlink account (...) to connect a wallet."). The email field is pre-filled with the account's email.
  - Only applies when no wallet is connected. Existing wallets and Send, Swap and the re-auth steps are not affected.
  - Reconnecting after Disconnect also accepts an email already saved on the profile (`wallet_google_email`, `wallet_recovery_email`), so older wallets made with a different email can still be reconnected. Email match is case-insensitive.
  - Same change in `pay2.html` and `pay5.html` (staging copies). Not changed: `recovery.html` (still a soft `login_hint`).
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Fixed
- **`recovery.html`: Google sign-in now steers to the Netlink account's own email, same as `pay.html`.** The three Google buttons (sign-in gate, Emergency Export confirmation, Add Google backup) now pass `login_hint` with the account's email, so the account picker defaults to the same Google account as the app (Supabase). It is a hint only: a different account can still be picked, and `sessionMatchesCurrentWallet()` still decides whether the wallet is the right one.
  - The email fields (sign-in gate, Add email backup, Emergency Export) are pre-filled with the account's email when empty.
  - After a wallet-mismatch error on the sign-in gate, the Google button is no longer left dimmed (opacity 0.5), so it can be tried again.
  - Static check only (script syntax). Not tested in a browser or on a real phone.

### Changed
- **`dashboard.html`: Link in Bio header now has the same parts as the CV header, so both cards are the same height.** The link line (`netlink.bio/username`, the real username once it is set) and the Copy, Preview and Share buttons moved from the body of the Link in Bio card into its blue header, under the AI Score bar, the same way as the CV card. They are no longer repeated in the body (the Save button and Choose Template stay). Same `onclick` functions, so nothing else changes.
  - On phones narrower than 380px the CV title shows "Professional CV" without "(Resume)", because the full title wrapped to two lines there and made the CV header 24px taller. Checked from 320px to 430px wide: both headers are the same height, 199px closed and 167px open (the 32px difference is the "Tap to expand" line).
- **`dashboard.html`: smaller corner radius on the page cards (Link in Bio, Professional CV, Landing Page, Complete Your Profile): 11px, was 16px (`rounded-2xl`).** 11px is the radius of the regular cards on `pay.html` (`.pay-card`). For reference, the blue main card on `pay.html` is 17px and its modals are 20px, so 16px was already close to the main card. The blue header follows the card radius (one pixel less, inside the 1px border). One CSS variable, `--dash-card-radius`, controls it. Modals on the dashboard keep `rounded-2xl`. Plain CSS (`.dash-surface`), no new Tailwind classes, so `shared/tailwind.css` is not rebuilt.
  - Checked in Chromium: computed radius 11px on all four cards, header corners 10px, no page errors. Not tested on a real phone.

### Changed
- **`dashboard.html`: the Link in Bio, Professional CV and Landing Page cards now open and close, and only one is open at a time.** Opening one closes the other two, so the page stays short on a phone. The blue header of each card always stays visible. A round chevron button sits at the right of the title and turns upside down when the card is open, and a closed card shows a small "Tap to expand" line under its header. Tapping the empty part of a header works too, and Copy, Preview, Share and the info icon keep their own action. Tapping the open card closes it (all three can be closed). The body slides open and shut in 0.4 seconds, and the card being tapped stays where it is on screen while the cards above it change height. Turned off when the device asks for reduced motion.
  - The Landing Page card now has the same blue header as the other two (icon, title, subtitle), with its buttons moved into the body.
  - First open card: a link such as `dashboard#cvCard` (analytics checklist, Account menu) opens that card, else the card used earlier in the same browser tab, else Link in Bio. This happens with no animation.
  - `shared/nav.js`: when the Account menu links to a card on the page you are already on, it now asks the page to open the card first (`window.openDashboardCard`, only if the page defines it, so other pages are not affected) and the page scrolls to it after it opened. Before, it scrolled to a card that could still be closed.
  - Cards now have a top scroll margin of 88px, so a card scrolled into view is no longer hidden behind the fixed top bar (72px).
  - Closed bodies use `visibility: hidden`, so buttons and fields inside a closed card cannot be reached with Tab. Each chevron button has `aria-expanded` and an `aria-label` ("Expand Link in Bio", "Collapse Link in Bio").
  - Plain CSS only (`.dash-card-*`), no new Tailwind classes, so `shared/tailwind.css` is not rebuilt. All element IDs and the JavaScript that saves data are unchanged.
  - Checked in Chromium at 390px wide: opening one card closes the others, the height changes gradually over about 0.4 seconds, Copy inside the CV header does not toggle it, a closed body is `visibility: hidden`, the tapped header stays in place while the cards above shrink (until the top of the page is reached), `#cvCard` opens the CV card, the open card is kept after a reload in the same tab, no page errors. Not tested on a real phone or in Safari.

### Changed
- **`dashboard.html`: blue header on the Link in Bio card and the Professional CV card.** The two cards looked almost the same, so it was easy to scroll past one on a phone. The top part of each card now has the same blue gradient as the main card on `pay.html` (`#0ea5e9` to `#0369a1`) with white text. On Link in Bio the blue covers the title, the AI Score and its bar, down to the line under the bar. On Professional CV it covers the title, the AI Score and bar, the CV link and the Copy, Preview and Share buttons, down to the line under them. The buttons are now see-through white with a white border. The rest of each card is unchanged, and so are all element IDs and the JavaScript.
  - New `.dash-card-head` CSS is plain CSS (no new Tailwind classes, so `shared/tailwind.css` is not rebuilt). Its selectors start with `html body` so they also win over the `html.dark` text color rules, which use `!important`.
  - Checked in Chromium at 390px wide in light and dark mode (computed colors and screenshots): white title and score text, the progress bar track and the three buttons stay readable on the blue. Not tested on a real phone.
  - Both cards use the same blue. If the CV card should look different from Link in Bio, only its gradient needs another color.

### Added
- **`dashboard.html`: crop window for the profile photo (avatar).** After picking a photo, a "Crop Photo" window opens with the photo filling a square, and a circle shows what will appear as the avatar. Drag to move, use the slider, mouse wheel or a two-finger pinch to zoom (1x to 4x). The photo can never leave an empty gap inside the square. "Save Photo" crops that area and uploads it as a 512x512 JPEG (quality 0.85, transparent PNGs get a white background) to the same `avatars/{user_id}/avatar.jpg` path and `profiles.avatar_url` as before, so storage, policies and the database do not change. Cancel, Escape and a tap outside close it without uploading. Images over 15 MB or files that are not images are refused with a message.
  - Fixes photos that are not 1:1 (wide or tall) not sitting in the middle of the avatar circle. The old code only shrank the photo and kept its ratio, and the page showed it with `object-cover`, so the user could not choose which part to show.
  - Removed the unused `compressImage()` and `handleAvatarUpload()` from `dashboard.html` (replaced by `openAvatarCropper()`, `confirmAvatarCrop()` and `uploadAvatarBlob()`). Nothing else in the repo used them.
  - Plain CSS classes (`.crop-*`) and Tailwind classes that already exist in `shared/tailwind.css`, so no Tailwind rebuild. Icons `zoom-in` and `zoom-out` are in the pinned lucide 0.460.0.
  - Checked in Chromium (390px wide) with an 800x400 test photo: it opens centered, dragging stops at the edges, slider and wheel zoom work, the saved file is 512x512 `image/jpeg` showing the area that was chosen, and a non-image file is refused. Not tested on a real phone or with the real Supabase upload.

### Fixed
- **`tx.html`: the page number bar no longer pushes the page sideways on phones.** The bar listed every page number (36px each), so with 20+ pages it was wider than the screen and the page scrolled sideways. It now shows only the first page, the last page and the pages around the current one, with "..." in between (for example `< 1 ... 9 10 11 ... 20 >`). Buttons are 34px on phones (30px under 340px wide, 36px from 480px up) with more space between them. Each button has an `aria-label`, and the current page has `aria-current="page"`.
  - Checked in Chromium at 320, 360, 384 and 414px wide: one row, no sideways scroll, for 3, 4, 5, 7, 20 and 60 pages and for every position (first, second, middle, near last, last).
  - Not changed: the notification cards keep their old 44px icon, and the rest of the page.

### Changed
- **`tx.html`: smaller send, receive and swap icons in the activity cards.** The round icon is 38px (was 44px) with a 17px arrow (was 20px), and the gap to the text is a little smaller. Only the transaction cards changed. No new Tailwind classes, so `shared/tailwind.css` is not rebuilt.

### Security
- **CSP is now enforced (`vercel.json`).** The header `Content-Security-Policy-Report-Only` (added in #348) is renamed to `Content-Security-Policy`, same policy text. Browsers now block scripts from any origin except `'self'` and `accounts.google.com`, block `object`/`embed`, and stop other sites from framing our pages.
  - Checked by reading the code: all script tags and runtime-injected scripts load from `'self'` or Google Sign-In, Trails and the PDF worker are served from our own paths, `eval`/`new Function` appear only in guarded library fallbacks (pdfjs, html5-qrcode), no external iframes or form actions. Manual check with Eruda on login, dashboard and wallet login showed no CSP messages.
  - Still weak: `'unsafe-inline'` stays in `script-src` (removing it needs a bigger refactor).
  - Rollback: rename the header key back to `Content-Security-Policy-Report-Only`.

### Changed
- **`tx.html`: one amount format for the card, the swap row and the receipt.** Rule: at least 2 decimals and up to 6, so 12 shows "12.00", 12.5 "12.50", 12.05 "12.05", 1234 "1,234.00" and 0.000123 "0.000123". Exactly 3 decimals get a 4th (1.567 shows "1.5670", 0.002 "0.0020") so they cannot be read as a thousands group, as happened with a 1.567 NET send. A non-zero amount below 0.000001 shows "<0.000001", never "0.00". Comma for thousands and a point for decimals, the same as Indonesian bank apps (for example "IDR 104,746.00"). Replaces the trimmed-zeros card format and the separate receipt format. The swap row, which showed raw numbers, now uses the same format. Display only, nothing stored changes. Not tested in a browser.

### Changed
- **`tx.html`: the transaction card hides trailing zeros.** Amounts show as written: 12 (not 12.0000), 12.5, 12.55, 12.05, 0.000123 (not 0.0001), up to 6 decimals, with thousands separators. This replaces the fixed 4 decimals from the previous change and matches how wallet apps such as TokenPocket show amounts. The receipt keeps its own rule (at least 2 decimals, so 12.00). Display only. Not tested in a browser.

### Fixed
- **`tx.html`: the transaction card shows 4 decimals for every token, with a slightly smaller amount.** A 0.001 USDC send showed "-0.00 USDC" and 1.567 NET showed "-1.57 NET". Now POL, NET and USDC all show 4 decimals (for example "-1.5670 NET", "-0.0010 USDC"), so support can explain one rule. The amount font went from 17px bold to 15px semibold with no wrapping (`whitespace-nowrap`) so longer numbers fit on a phone. Only classes already in the built `shared/tailwind.css` are used, so no CSS rebuild. Display only. Not tested in a browser.

### Security
- **Amount check: sends of NET and USDC are now exact too (`api/_lib/verify-wallet-amount.js`).** After the per-token change, only POL sends and exports were strict (0.0001); NET and USDC kept 0.01, so a small USDC amount (for example 0.001 recorded as 0.005) still passed. Now every `send` must match within 0.0001, because `pay.html` records the amount exactly as typed. POL exports stay at 0.0001. Incoming rows and NET or USDC exports keep 0.01, because those amounts are read with `fromWei` (2 decimals, truncated). Swaps keep 2%.
  - Checked with a unit test of `evaluateRow`: USDC 0.001 vs 0.005 mismatch, USDC 0.001 exact match, NET 12.34 exact match, NET 12 vs 12.005 mismatch, truncated NET export 5.99 vs 5.999 match, truncated NET receive match. Not tested against live Alchemy: send a small USDC amount and confirm the receipt unlocks.

### Fixed
- **`tx.html`: the receipt no longer rounds small amounts to 0.00.** The Amount row used a fixed 2 decimals, so a 0.0001 POL send showed "0.00" on the receipt (the card already showed 0.0001). Now it shows at least 2 and up to 6 decimals: 12 NET stays "12.00", 0.0001 POL shows "0.0001". Display only, no stored data changes. Not tested in a browser.

### Security
- **Amount check is stricter, per token (`api/_lib/verify-wallet-amount.js`).** The tolerance was the larger of 0.01 or 0.5%, the same for every token, so a small POL amount could be changed (for example 0.005 recorded as 0.01) and still pass, and 100 NET recorded as 100.3 also passed. Now: POL sends and exports must match within 0.0001 (they are recorded at full precision), and everything else within 0.01 with no percentage, because incoming rows and NET or USDC sends are stored with 2 decimals and cutting digits off loses less than 0.01. Swaps keep 2% (output comes from a quote).
  - Data check: POL sends have at most 3 decimals and POL exports 18, so 0.0001 does not reject real rows. Incoming POL rows have 2 decimals (`fromWei` in `api/wallet.js`), so they keep 0.01. Rows already marked `match` are not rechecked; new checks and `unchecked` rows use the new rule.
  - Checked with a unit test of `evaluateRow`: 12 vs 12 match, 12 vs 12.4 mismatch, 100 vs 100.3 mismatch, POL 0.01 vs 0.005 mismatch, POL 0.435353 exact match, 1.99 recorded vs 1.999 on-chain (truncated incoming) match. Not tested against live Alchemy.

### Security
- **Receipts now also need the recorded amount to match the chain (`tx.html`, `api/wallet.js`, `api/_lib/verify-wallet-amount.js`).** Before, a real transaction hash with a made-up amount could still unlock a receipt, because `onchain_verified` only proves the tx exists and succeeded. Now `GET /api/wallet?action=verify` runs `verifyOneTxFull()`: tx confirmed, then the same amount comparison the daily cron uses (`evaluateRow`), written to `onchain_amount_status`. The receipt unlocks only when the status is `match`, so the progress bar now covers both checks (a few seconds). If the amount differs or no matching transfer is found, the card shows "Amount not confirmed" in amber and no receipt is issued. Extra cost per call: 1 receipt (20 CU) plus 1 or 2 `alchemy_getAssetTransfers` (150 CU each). The 20 calls per user per minute limit still applies.
  - Data check before this change: 329 of 336 rows were already `match`; 2 old receive rows are `unchecked` and 5 recent sends were still empty (they verify on demand).
  - Checked: syntax, and `evaluateRow` returns `match` for 10 NET recorded versus 10 on-chain and `mismatch` for 99 versus 10. Not tested in a browser or against live Alchemy: send a small transaction and confirm Receipt and Verified appear within seconds.

### Changed
- **`tx.html`: card bottom row layout for receipt verification.** One full-width row: `[View] [Receipt] [progress bar] [check icon Verified]`. The Receipt button always uses the receipt icon (no check icon). The progress bar fills the middle while the transaction is checked and disappears at 100%. Then "Verified" with a check icon stays at the far right.
  - Checked: inline scripts pass a syntax check. Not tested in a browser.

### Changed
- **`tx.html`: receipt verification now shows a progress bar on the transaction card instead of a toast.** The bottom row of a send or receive card is now `[View] [Receipt with check icon] Verified`. While the server checks the transaction on Polygon, the Receipt button is replaced by a small progress bar and the text "Verifying". Fresh transactions (under 1 hour old, up to 3, one at a time) are checked automatically after the list loads. Older unverified rows keep a plain Receipt button that starts the check on tap. The "Confirming transaction..." toast is gone; only a failure toast remains. Uses the `circle-check` icon (already used in `analytics.html`, so it exists in the pinned lucide).
  - Checked: inline scripts of `tx.html` pass a syntax check. Not tested in a browser: send a small transaction, open Activity, expand the new card and watch the bar fill, then Receipt and Verified appear.

### Security
- **Receipts in `tx.html` are only issued for transactions confirmed on Polygon.** Before, the receipt was built from the row the browser inserted, so a forged row could produce a receipt. Now "View Receipt", Download Image, Download PDF and Share all need `onchain_verified = true`. Opening a receipt for an unverified row asks the server to check that one transaction right away (up to 8 tries, 4 seconds apart), so a fresh send unlocks its receipt in seconds instead of waiting for the daily cron.
  - New `GET /api/wallet?action=verify&hash=0x...` (inside `api/wallet.js`, no new function file, because the Hobby plan limit is reached). Needs the user's access token and only checks rows owned by that user. Cost is one `eth_getTransactionReceipt` (20 CU) per call. Limit: 20 calls per user per minute (best effort, per instance). A transaction not mined yet does not use up `onchain_check_attempts`, so the daily cron keeps its own retries. The logic is `verifyOneTx()` in `api/_lib/verify-wallet-tx.js`.
  - Checked: syntax of `api/wallet.js`, the lib and the inline scripts of `tx.html`. Not tested in a browser or against live Alchemy: send a small test transaction, open its receipt, and confirm it unlocks within a few seconds.

### Security
- **Removed the unused WalletConnect code and its 2 MB bundle (`dashboard.html`, `shared/vendor/`, `vendor-build/`).** The dashboard no longer offers a WalletConnect button (no element with id `walletConnectBtn` exists, nothing called `connectWallet()`), but the code and the bundled third-party library were still shipped. Deleted: `loadEthereumProvider`, `getWcProvider`, `applyConnectedWallet`, `connectWallet`, the WalletConnect project id, and the two `wcProvider.disconnect()` lines in `disconnectWallet` and `removeWalletAddress` (both functions stay). `walletconnect-ethereum-provider.js` and its build entry are gone; the other bundles are byte for byte unchanged after a rebuild.
  - Checked: both inline module scripts of `dashboard.html` pass a syntax check, and no reference to the removed names is left. Not tested in a browser: open `/dashboard`, check the wallet card shows the address, then use Disconnect and Remove wallet once on a test account.

### Security
- **CSP (Report-Only) tightened to match what the site really loads (`vercel.json`).** Scripts: only our own files and `accounts.google.com` (Google sign-in). Removed from the policy: `esm.sh`, `cdn.jsdelivr.net`, `cdn.tailwindcss.com`, `cdnjs.cloudflare.com` and `'unsafe-eval'`, since those are no longer loaded. Added `frame-ancestors 'self'`. Still Report-Only: nothing is blocked yet.
  - **To switch to enforcing:** open the main pages with the browser console open (F12) and look for "Content Security Policy" messages: `/login`, `/dashboard`, `/pay`, `/tx`, `/identity`, `/recovery`, `/page-builder`, one `/page/...` page and one bio page. If nothing important is reported, rename the header to `Content-Security-Policy`. `'unsafe-inline'` stays for now because pages use inline scripts and styles, so this policy limits where scripts come from, not inline code.

### Security
- **Wallet SDKs are now bundled and served by us, not imported from `esm.sh` and jsDelivr (`shared/vendor/`, `vendor-build/`).** These pages hold wallet sessions and ran third-party code fetched at page load. Now: `sequence-waas.js` (`@0xsequence/waas` 2.3.44) for `pay`, `pay2`, `pay5`, `identity`, `recovery` and `dashboard`; `walletconnect-ethereum-provider.js` (2.26.0, 2 MB, loaded only when a user connects WalletConnect) for `dashboard`; `onramp-web-sdk.js` (2.0.1) for `pay2`. Built with esbuild from pinned versions, see `vendor-build/README.md`.
  - **Version changes you should know about:** `dashboard.html` used `@0xsequence/waas` with no version (it was on 2.3.47). It is now on 2.3.44 like the other wallet pages, so every page reads the saved wallet session the same way. It only calls `signIn` there. WalletConnect was `@2` (floating), now 2.26.0. Onramp SDK had no version, now 2.0.1.
  - Checked in Node: each bundle loads, exports the names the pages import, and `SequenceWaaS` builds with the real project config and has `signIn`, `getAddress`, `isSignedIn`, `sendTransaction`, `feeOptions` ready. **Not tested in a browser: please test a real login, send, export, recovery, the dashboard wallet connect and the Buy Crypto widget before relying on this.**
  - Still loaded from outside, by design: Google sign-in script (`accounts.google.com`), Google Fonts, and the Onramp widget itself. jsDelivr is still used for currency rates (data) and brand icon images (not code).

### Security
- **Fix: headings on the legal pages looked plain after the Tailwind CSS change (`terms`, `terms-of-use`, `privacy-policy`, `username-policy`, `contact`, `investor`, `changelog`).** The static `tailwind-public.css` link was placed after each page's own `<style>`, so Tailwind's reset (headings inherit size and weight, margins removed) overrode the page's `h1`, `h2` and `h3` rules. The link now sits where the old CDN script tag was, before `site-nav.css` and the page `<style>`, so the page rules win again. Found from phone screenshots of `/privacy-policy` and `/terms` after PR 345. Not tested in a browser after this fix: check that section headings ("1. Who We Are") are bold, with space above, on both pages.

### Security
- **Tailwind CDN and Font Awesome CDN are gone from the legal pages and the page builder.** `terms`, `terms-of-use`, `privacy-policy`, `username-policy`, `contact`, `investor` and `changelog` loaded `https://cdn.tailwindcss.com`, which builds CSS in the browser from a third-party script. They now load a static `shared/tailwind-public.css` (7 KB), built from the new `tailwind.public.config.js` with `npm run build:css:public`. The app pages keep their own `shared/tailwind.css`, untouched. The link first went at the end of `<head>`, which was wrong, see the fix right above this entry.
  - Font Awesome 6.4.0 is now served from `shared/vendor/fontawesome/` (CSS plus woff2 fonts only) for `page-builder.html`, its preview iframe and published landing pages (`api/landing.js`). The preview iframe is sandboxed, so `vercel.json` sends `Access-Control-Allow-Origin: *` for the webfonts folder only.
  - Not tested in a browser: check one legal page in light and dark mode, the page builder icons (editor and preview), and one published `/page/...` landing page.
  - Audit note (no code change): `wallet_transactions` is safe against fake on-chain status (a trigger resets `onchain_*` columns for client writes, and clients can only update `gas_fee`). Still open: a user can insert a made-up row for their own wallet and open a receipt from it in `tx.html`, because the receipt does not check `onchain_verified`.

### Security
- **lucide, jspdf, html2canvas and chart.js are now served by us, pinned (`shared/vendor/`).** These were loaded from unpkg, cdnjs and jsDelivr. If one of those CDNs were hacked, bad code could run on pages that hold wallet sessions and KYC data. The files are the unchanged npm builds: `lucide@0.460.0` (27 pages), `jspdf@2.5.1` and `html2canvas@1.4.1` (`tx.html`), `chart.js@4.4.0` (`analytics.html`, `research/usdc-report-2026.html`). `analytics.html` used `chart.js@4`, a floating version, so it moves to the pinned 4.4.0.
  - To update a library: replace the file in `shared/vendor/` and bump `?v=` on every page that loads it (see `shared/vendor/README.txt`).
  - Not verified: the files were not compared byte for byte with the CDN copies, because the CDNs are blocked from the build sandbox. They come from the official npm packages at the same versions. Not tested in a browser: icons, PDF receipt download and the analytics charts should be checked once after deploy.
  - **`vercel.json`: added `X-Content-Type-Options: nosniff` and a `Content-Security-Policy-Report-Only` header.** Report-Only means nothing is blocked. Open the browser console on each page and look for "Content Security Policy" messages to see what an enforced policy would break, then tighten it.
  - **Database audit (Supabase advisors and read-only SQL):** no table without RLS, and every write policy is limited to `auth.uid()`. New migration `20261011_avatars_limits_revoke_truncate.sql` (NOT yet applied): caps the `avatars` bucket at 1 MB and JPEG, PNG and WebP, and revokes the unused `TRUNCATE` grant from `anon` and `authenticated`.
  - Still open, flagged: wallet pages import Sequence WaaS from `esm.sh` at runtime (`pay`, `pay2`, `pay5`, `identity`, `recovery`), `dashboard.html` imports WalletConnect from `esm.sh`, `pay2.html` imports the Onramp SDK from jsDelivr, and legal pages still use `cdn.tailwindcss.com`. Supabase Auth leaked password protection is off (dashboard setting).
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
