// api/_lib/stats.js
// Counts API requests per endpoint per day for the admin Overview tab.
//
// withStats(name, handler) wraps a Vercel Node handler. After the handler
// finishes it bumps a counter row through the bump_api_stat() RPC, inside
// waitUntil() so the response is never delayed. Failures are swallowed:
// stats must never break a real request.
//
// Cardinality is bounded on purpose: `endpoint` is a fixed name given by the
// caller, and `action` is only recorded for successful requests (status < 400)
// and only if it looks like a normal action name, so random ?action= values
// from bots cannot create unlimited rows.

import { waitUntil } from '@vercel/functions';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const ACTION_RE = /^[a-z0-9-]{1,32}$/;

function statusClass(code) {
  const c = Math.floor((Number(code) || 0) / 100);
  return c >= 2 && c <= 5 ? `${c}xx` : '5xx';
}

async function bump(endpoint, action, cls) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_api_stat`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_endpoint: endpoint, p_action: action, p_status_class: cls }),
    });
  } catch (e) {
    console.error('stats: bump failed', endpoint, e.message);
  }
}

export function withStats(endpoint, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } finally {
      const code = res.statusCode;
      const raw = String(req.query?.action || '');
      const action = code < 400 && ACTION_RE.test(raw) ? raw : '';
      waitUntil(bump(endpoint, action, statusClass(code)));
    }
  };
}

// Logs the username of a bio page 404 (see supabase/migrations/20261006_bio_not_found_log.sql).
// Fire and forget, never throws, never delays the response.
export function logBioNotFound(username) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  waitUntil((async () => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_bio_not_found`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_username: String(username || '').slice(0, 80) }),
      });
    } catch (e) {
      console.error('stats: bio 404 log failed', e.message);
    }
  })());
}
