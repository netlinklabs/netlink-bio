// api/_lib/notify.js
// Writes one in-app notification (public.notifications) for a single user.
// Lives in _lib so it does not count toward the Vercel Hobby 12-function cap.
//
// Dedupe: `link` must be unique per event (for example include the order id
// and a state marker). If a notification with the same target and link already
// exists, nothing is inserted, so webhook retries and repeated checks are safe.
// Failures are logged and swallowed: a notification must never break a payment
// or a webhook.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';

export async function notifyUser(userId, { type = 'system', title, body = null, icon = null, link }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !userId || !title || !link) return false;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const q = `notifications?target_id=eq.${encodeURIComponent(userId)}&link=eq.${encodeURIComponent(link)}&select=id&limit=1`;
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
    if (existing.ok && (await existing.json())[0]) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ target_id: userId, type, title, body, icon, link }),
    });
    if (!r.ok) {
      console.error('notify: insert failed', r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('notify: error', err);
    return false;
  }
}
