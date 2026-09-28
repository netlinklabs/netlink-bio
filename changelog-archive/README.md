# Changelog archive

`CHANGELOG.md` (repo root) only holds recent, active entries. Older entries get cut into dated
snapshot files here so the root file stays small (cheaper to read/write for both humans and AI
assistants working in this repo).

## File naming

Each archive file is named by the date and time it was cut, in the repo's local convention:

```
changelog-archive/YYYY-MM-DD-HHMM.md
```

Example: `2026-09-28-2135.md` was cut on 2026-09-28 at 21:35 WIB.

## How to find something

1. Check `CHANGELOG.md` first (the current/active file).
2. If it's not there, look in this folder starting from the **newest filename** (highest
   date/time) and work backwards to older files until you find it.

Each archive file is a frozen snapshot: whatever was in `CHANGELOG.md` at the moment it was cut.
Don't edit an archive file after the fact except to fix a factual error, it's a historical record.

## When to cut a new archive

When `CHANGELOG.md` starts getting large (roughly 100-150KB, or whenever it feels heavy to
read/write in a single tool call), move its current content into a new
`changelog-archive/YYYY-MM-DD-HHMM.md` file (same format as the ones already here) and reset
`CHANGELOG.md` to just the header plus an empty `## [Unreleased]` section. See the note in
`CLAUDE.md` under "Changelog archiving".
