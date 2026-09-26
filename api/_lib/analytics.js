// Shared analytics helpers used by api/bio.js, api/cv.js, api/landing.js,
// api/track-event.js, and api/cron/rollup-analytics.js.
//
// Writes go through the service role key, not the anon publishable key --
// analytics_events has RLS enabled with zero policies (see the
// `analytics_tables` migration), so only the service role can insert/read it.
// This keeps the raw event log off the public PostgREST surface entirely.

import { createHash } from 'crypto';
import { waitUntil } from '@vercel/functions';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Stable per-deployment salt so visitor_hash can't be reversed back to a
// real IP/user-agent pair just by knowing the hash. Falls back to a fixed
// string if the env var isn't set yet, so tracking still works (just less
// hardened) rather than silently no-op-ing.
const HASH_SALT = process.env.ANALYTICS_HASH_SALT || 'netlink-analytics-default-salt';

// Builds a short, irreversible per-visitor id from IP + User-Agent, used
// only to dedupe "unique visitors" per day at rollup time -- never the raw
// IP itself, and never stored anywhere.
export function visitorHash(req) {
  const forwarded = req.headers['x-forwarded-for'] || '';
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim() || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return createHash('sha256').update(`${ip}|${ua}|${HASH_SALT}`).digest('hex').slice(0, 24);
}

// Normalizes a referrer down to its hostname (e.g.
// "https://chat.openai.com/c/abc123?x=1" -> "chat.openai.com") before it's
// stored. Grouping by full URL would split traffic from the same source
// into many one-count rows (every AI chat conversation has a different
// path) -- analytics.html's Top Sources list needs the hostname to group
// on, and does the "friendly name" lookup (ChatGPT, Claude, etc.) itself.
function normalizeReferrer(referrer) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

// Fire-and-forget: registers the insert with Vercel's waitUntil() so it
// runs in the background without delaying the response. Call it BEFORE
// sending the response and don't await it. (An earlier version awaited it
// after res.send(), but Vercel can suspend the function as soon as the
// response is sent, so the insert never ran and nothing was logged.)
export function recordEvent(args) {
  waitUntil(insertEvent(args));
}

async function insertEvent({ userId, eventType, linkId = null, referrer = null, req }) {
  // TEMPORARY (remove once AI fetcher user-agents are identified): log the
  // user-agent of page views that arrive without a referrer, so we can see
  // which AI assistants (e.g. Qwen) fetch profiles server-side and what
  // user-agent string they send. Vercel runtime logs only -- never stored
  // in the database, and no IP is logged.
  if (!referrer && eventType.startsWith('view_')) {
    console.log(`[ua-probe] ${eventType} ua="${String(req.headers['user-agent'] || '').slice(0, 300)}"`);
  }
  if (!SERVICE_ROLE_KEY) {
    console.error('recordEvent: SUPABASE_SERVICE_ROLE_KEY is not set, skipping.');
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        event_type: eventType,
        link_id: linkId,
        referrer: normalizeReferrer(referrer),
        visitor_hash: visitorHash(req),
      }),
    });
    if (!res.ok) {
      console.error('recordEvent failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('recordEvent error:', err);
  }
}
