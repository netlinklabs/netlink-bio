// Shared analytics helpers used by api/bio.js, api/cv.js, api/landing.js,
// api/track-event.js, and api/cron/rollup-analytics.js.
//
// Writes go through the service role key, not the anon publishable key --
// analytics_events has RLS enabled with zero policies (see the
// `analytics_tables` migration), so only the service role can insert/read it.
// This keeps the raw event log off the public PostgREST surface entirely.

import { createHash } from 'crypto';

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

// Fire-and-forget insert -- callers should not await this in a way that
// blocks the response (or should await it after res.send has already been
// called), and must never let a failure here break the page render.
export async function recordEvent({ userId, eventType, linkId = null, referrer = null, req }) {
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
        referrer: (referrer || '').slice(0, 500) || null,
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
