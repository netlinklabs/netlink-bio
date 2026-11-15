// api/_lib/signup-patterns.js
// Pure helpers for the sign-up pattern signals in the admin Security tab (api/_lib/security.js).
// MONITORING ONLY: nothing here blocks or rejects a sign-up. A yellow or red signal just tells an
// admin to look at the newest accounts. No database or network access, so it is easy to test
// (see signup-patterns.test.mjs).
//
// Why: a sign-up script made accounts like nl1794609893@<its own domain> (letters, then the Unix
// time of the sign-up), placed a paid-plan order minutes later, and none of the count based
// signals fired because only a handful of accounts were involved.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Big public mailbox providers. Many real users share them, so they are never "unusual".
export const COMMON_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.id', 'ymail.com', 'outlook.com',
  'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
]);

// A few letters followed by 9 or more digits, like nl1794609893 (a Unix time in seconds).
const SCRIPT_LOCAL = /^[a-z]{1,6}\d{9,}$/i;

export function domainOf(email) {
  const parts = String(email || '').trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isScriptEmail(email) {
  const parts = String(email || '').trim().split('@');
  return parts.length === 2 && SCRIPT_LOCAL.test(parts[0]);
}

// Domains that are not common providers, where 2 or more accounts signed up inside the window and
// none signed up before it (within the list given). Returns [{ domain, count }].
export function unusualDomains(signups, now = Date.now(), windowMs = DAY) {
  const byDomain = new Map();
  for (const s of signups) {
    const d = domainOf(s.email);
    if (!d || COMMON_DOMAINS.has(d)) continue;
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(new Date(s.created_at).getTime());
  }
  const out = [];
  for (const [domain, times] of byDomain) {
    const recent = times.filter((t) => now - t <= windowMs);
    if (recent.length >= 2 && recent.length === times.length) out.push({ domain, count: recent.length });
  }
  return out;
}

// The most accounts created inside any 60 minute stretch during the last 24 hours.
export function maxBurst(signups, now = Date.now(), windowMs = DAY, spanMs = HOUR) {
  const times = signups
    .map((s) => new Date(s.created_at).getTime())
    .filter((t) => Number.isFinite(t) && now - t <= windowMs)
    .sort((a, b) => a - b);
  let best = 0;
  let start = 0;
  for (let i = 0; i < times.length; i++) {
    while (times[i] - times[start] > spanMs) start++;
    best = Math.max(best, i - start + 1);
  }
  return best;
}

// How many accounts placed an order within 30 minutes of signing up.
// createdById: Map of user id -> profile created_at. orders: [{ user_id, created_at }].
export function fastOrderUsers(createdById, orders, withinMs = 30 * MIN) {
  const users = new Set();
  for (const o of orders) {
    const created = createdById.get(o.user_id);
    if (!created) continue;
    const gap = new Date(o.created_at).getTime() - new Date(created).getTime();
    if (gap >= 0 && gap <= withinMs) users.add(o.user_id);
  }
  return users.size;
}
