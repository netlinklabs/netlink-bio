// Shared analytics helpers used by api/bio.js, api/cv.js, api/landing.js,
// api/track-event.js, and api/cron/rollup-analytics.js.
//
// Writes go through the service role key, not the anon publishable key --
// analytics_events has RLS enabled with zero policies (see the
// `analytics_tables` migration), so only the service role can insert/read it.
// This keeps the raw event log off the public PostgREST surface entirely.

import { createHash } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { detectAiBot, detectAiApp } from './ai-bots.js';
import { verifyWebBotAuth } from './web-bot-auth.js';

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

// Fallback source from a `utm_source` URL parameter, used only when the
// browser sent no referrer. Many apps (including AI assistants like the
// ChatGPT app) open links without a referrer, but some add a utm_source
// (e.g. ChatGPT search citations use utm_source=chatgpt.com). Accepts a URL
// or a bare name/domain; keeps only a short, safe token. Like the referrer
// header, this is visitor-controlled, so it's a best-effort signal.
function normalizeUtmSource(value) {
  if (!value) return null;
  const raw = String(Array.isArray(value) ? value[0] : value).trim().toLowerCase().slice(0, 100);
  if (/^https?:\/\//.test(raw)) return normalizeReferrer(raw);
  const cleaned = raw.replace(/^www\./, '').replace(/[^a-z0-9._-]/g, '').slice(0, 60);
  return cleaned || null;
}

// Fire-and-forget: registers the insert with Vercel's waitUntil() so it
// runs in the background without delaying the response. Call it BEFORE
// sending the response and don't await it. (An earlier version awaited it
// after res.send(), but Vercel can suspend the function as soon as the
// response is sent, so the insert never ran and nothing was logged.)
export function recordEvent(args) {
  waitUntil(insertEvent(args));
}

async function insertEvent({ userId, eventType, linkId = null, referrer = null, utmSource = null, req }) {
  // Page views read utm_source from their own request URL (Vercel keeps the
  // original query string through the rewrite); clicks pass it explicitly
  // from the page, since the click beacon's own URL has none.
  const utm = utmSource ?? req.query?.utm_source ?? null;
  // Last fallback: an AI app's in-app browser token in the User-Agent (see
  // detectAiApp in ai-bots.js). Applies to clicks too -- the click beacon
  // is sent from the same WebView, so it carries the same User-Agent.
  const appSource = detectAiApp(req.headers['user-agent']);
  const source = normalizeReferrer(referrer) || normalizeUtmSource(utm) || appSource;

  // Tag AI reads so they're counted separately instead of as human views.
  // A valid Web Bot Auth signature (api/_lib/web-bot-auth.js) wins: it's
  // cryptographic proof, and it's the only way to recognize agentic
  // browsers whose User-Agent looks like plain Chrome. Otherwise fall back
  // to the self-declared User-Agent match in ai-bots.js. Only page views
  // are tagged: crawlers fetching static HTML never run the click beacon.
  // (A signed agentic browser could run it; its clicks currently still
  // count as ordinary clicks.) This runs inside waitUntil(), so the key
  // directory fetch never delays the page response.
  const aiBot = eventType.startsWith('view_')
    ? (await verifyWebBotAuth(req)) || detectAiBot(req.headers['user-agent'])
    : null;

  // TEMPORARY (remove once the current wave of unrecognized AI agents is
  // cataloged into api/_lib/ai-bots.js): log the user-agent of page views
  // that arrive with no referrer AND don't match a known AI bot, so we can
  // tell a real unrecognized AI agent (e.g. Manus) apart from a human app
  // open (WhatsApp/Telegram/etc. also arrive with no referrer). Vercel
  // runtime logs only, never stored in the database, no IP logged.
  if (!referrer && !aiBot && !appSource && eventType.startsWith('view_')) {
    console.log(`[ua-probe] ${eventType} utm_source="${String(utm ?? '').slice(0, 100)}" ua="${String(req.headers['user-agent'] || '').slice(0, 300)}"`);
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
        referrer: source,
        visitor_hash: visitorHash(req),
        ai_bot_category: aiBot?.category ?? null,
        ai_bot_name: aiBot?.name ?? null,
      }),
    });
    if (!res.ok) {
      console.error('recordEvent failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('recordEvent error:', err);
  }
}
