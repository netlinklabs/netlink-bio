// api/track-event.js
// Public POST endpoint called client-side (navigator.sendBeacon, with fetch
// as a fallback) from the rendered bio and landing pages when a visitor
// clicks a link/contact button. Page views are recorded server-side in
// bio.js/cv.js/landing.js directly (no client round-trip needed there) --
// this endpoint only ever records a click event, so a visitor's browser
// can't forge extra page-view counts by calling it directly. The event
// type is never taken from the client: it's derived from which identifier
// resolved (username -> click_link, slug -> click_landing), so a click
// can't be mislabeled either.
//
// The request never carries a user_id -- only a username or a landing page
// slug, resolved server-side against public data (anon key, same views/
// tables bio.js and landing.js already read from). This keeps a client
// from attributing a click to an arbitrary user_id.

import { recordEvent } from './_lib/analytics.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  // sendBeacon delivers a Blob whose body Vercel doesn't always auto-parse
  // as JSON depending on the Content-Type the browser sent -- handle both.
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const username = String(body.username || '').toLowerCase().trim();
  const slug = String(body.slug || '').toLowerCase().trim();
  const linkId = body.linkId ? String(body.linkId) : null;
  const referrer = typeof body.referrer === 'string' ? body.referrer : (req.headers.referer || '');

  if (!username && !slug) {
    res.status(400).json({ error: 'Missing username or slug' });
    return;
  }

  try {
    let userId = null;
    let eventType = null;
    if (username) {
      const profiles = await supabaseGet(`profiles_bio_public?username=eq.${encodeURIComponent(username)}&select=id`);
      if (profiles.length) { userId = profiles[0].id; eventType = 'click_link'; }
    } else if (slug) {
      // Landing page click (page-builder.html / api/landing.js) -- resolved
      // by slug instead of username since the public page never renders
      // the owner's username anywhere.
      const pages = await supabaseGet(`landing_pages?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=user_id`);
      if (pages.length) { userId = pages[0].user_id; eventType = 'click_landing'; }
    }
    if (!userId) {
      // Unknown username/slug -- nothing to attribute the click to. Not an
      // error worth surfacing to the beacon caller.
      res.status(204).end();
      return;
    }

    let validLinkId = null;
    if (linkId && eventType === 'click_link') {
      const owned = await supabaseGet(`links?id=eq.${encodeURIComponent(linkId)}&user_id=eq.${userId}&select=id`);
      if (owned.length) validLinkId = linkId;
    }

    // Registered via waitUntil() inside recordEvent, so the 204 goes out
    // immediately and the insert finishes in the background.
    recordEvent({ userId, eventType, linkId: validLinkId, referrer, req });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(204).end();
  }
}
