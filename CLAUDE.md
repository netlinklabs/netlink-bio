# CLAUDE.md — netlink-bio

Context file for Claude Code working in this repo. Read this before making any changes.

## Project

Netlink — digital identity platform (bio link, CV builder, business landing page) with an integrated crypto wallet sub-brand, Netlink Pay.

- Deployment: `netlink-bio.vercel.app` → custom domain `netlink.bio` (pending, migration not yet complete)
- Stack: vanilla HTML/JS (no bundler), Tailwind CSS via CDN, Vercel serverless functions (`api/`), Supabase (Postgres + RLS + Auth, project `fuewalufgiclrcgszlit`, ap-southeast-2), Sequence WaaS embedded wallets, Polygon PoS, LI.FI swap aggregator
- Related repo: `netlinklabs/netlink-token` (NET token landing page + docs) — separate repo, don't cross-edit without being told

## Branding rules (strict)

- Master brand is **"Netlink"**. Never write "Netlink.bio" as a brand name — `netlink.bio` is a URL only.
- Wallet sub-brand: **"Netlink Pay"**, accessed inside the main Netlink app — not a standalone product.
- NET token on-chain name is "Netlink" (symbol NET). Full form in UI: "Netlink (NET) is the Netlink Ecosystem Token."

## Language

- All UI text, error messages, and user-facing strings: **English only** — this applies even if the person instructing you writes in Indonesian.
- Explanatory code comments can be any language, but shipped text must be English.

## Multi-session / multi-assistant codebase — be careful

- This repo is edited across many separate Claude Code sessions (no shared memory between them) and sometimes by other tools/chats.
- **Always pull the latest version of a file before editing it.** Don't assume your context is current — check `git log` / re-read the file first.
- Prefer small, scoped diffs over full-file rewrites unless explicitly asked.
- Don't silently rewrite or refactor logic you don't understand the origin of — flag it and ask instead.

## Production data safety

- Before writing/inserting data into any **production Supabase table** (e.g. notifications broadcasts, manual data fixes), stop and show a draft of the change first. Do not execute without explicit approval.
- Never propose or build an email-change feature — intentionally excluded (account-takeover vector).
- Presale phases (all 3) were cancelled and refunded — don't reference presale as past traction, and this repo has no presale flows to begin with (that's `netlink-token`).

## Known in-progress / paused work (don't "helpfully" finish these)

- i18n on `dashboard.html` is mid-implementation and paused (`data-i18n` attributes added, `en.json`/`id.json`/`i18n.js` drafted, language switcher not done). Don't auto-complete this without being asked — re-check current state first, it may have changed.
- "Netlink Pay Connect" (embeddable widget) is concept-stage only. Do not build, wire up, or publish anything referencing it unless explicitly instructed.
- SMTP is currently Gmail-based (temporary). Don't migrate to Resend unless told the `netlink.bio` domain is confirmed live.

## After making changes

**Always update `CHANGELOG.md`** to reflect what was changed, in the same PR/commit — even for small fixes. This is required, not optional; the changelog is the source of truth used to sync context across sessions and other tools.

## Before committing

- Run through the branding + language rules above on any UI-facing change.
- Keep diffs scoped to what was asked — don't touch unrelated sections or files.
- If something looks broken or inconsistent but wasn't part of the task, flag it in the PR description rather than fixing it inline.
- Confirm element IDs used by existing JS (e.g. `balanceNet`, `balancePol`, `balanceUsdc`) are preserved when redesigning markup.
