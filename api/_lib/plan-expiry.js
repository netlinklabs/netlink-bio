// api/_lib/plan-expiry.js
// Daily plan expiry job, called from api/cron/rollup-analytics.js (no new serverless function).
//   1. Reminders: paid plans ending within 7 days get an email and an in-app notice at 7 and
//      at 3 days before the end date.
//   2. Downgrade: expire_lapsed_tiers() sets tier to basic 7 days after the end date
//      (grace period). Data is kept. The username is never touched.
//
// Dedupe without a migration: notifyUser() inserts only if no notification with the same
// target and link exists, and returns true only when it inserted. We send the email only
// in that case. The link contains the end date, so a renewal (new end date) starts fresh.

import { sendMail, getUserEmail, planExpiringMail, planEndedMail } from './mailer.js';
import { notifyUser } from './notify.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const DAY = 24 * 3600 * 1000;
const TIER_NAME = { silver: 'Silver', gold: 'Gold' };

function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' });
}

// 7 days window: more than 3 days left. 3 days window: 3 days or less. Else not due.
export function reminderWindow(expiresAt, now = new Date()) {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0 || left > 7 * DAY) return null;
  return left > 3 * DAY ? 7 : 3;
}

async function sendReminders(now) {
  const out = { sent: 0, checked: 0 };
  const soon = new Date(now.getTime() + 7 * DAY).toISOString();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?tier=in.(silver,gold)&tier_expires_at=gt.${now.toISOString()}&tier_expires_at=lte.${soon}&select=id,tier,tier_expires_at&limit=1000`,
    { headers: headers() }
  );
  if (!r.ok) return { ...out, error: r.status };
  for (const p of await r.json()) {
    out.checked++;
    const days = reminderWindow(p.tier_expires_at, now);
    if (!days) continue;
    const name = TIER_NAME[p.tier] || 'plan';
    const fresh = await notifyUser(p.id, {
      type: 'tier',
      icon: 'star',
      title: `Your ${name} plan ends in ${days} days`,
      body: `Active until ${fmtDay(p.tier_expires_at)}. Renew to keep your features.`,
      link: `/plans?reminder=${days}&until=${encodeURIComponent(p.tier_expires_at)}`,
    });
    if (!fresh) continue;
    const to = await getUserEmail(p.id);
    if (to) await sendMail({ ...planExpiringMail(p.tier, days, p.tier_expires_at), to });
    out.sent++;
  }
  return out;
}

async function downgradeLapsed() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/expire_lapsed_tiers`, { method: 'POST', headers: headers(), body: '{}' });
  if (!r.ok) return { downgraded: 0, error: r.status };
  const rows = await r.json();
  for (const row of rows) {
    const name = TIER_NAME[row.r_old_tier] || 'plan';
    await notifyUser(row.r_user_id, {
      type: 'tier',
      icon: 'star',
      title: `Your ${name} plan has ended`,
      body: 'Your account is now on Basic. Your data is kept. Renew any time.',
      link: `/plans?ended=${encodeURIComponent(row.r_expired_at)}`,
    });
    const to = await getUserEmail(row.r_user_id);
    if (to) await sendMail({ ...planEndedMail(row.r_old_tier), to });
  }
  return { downgraded: rows.length };
}

// Each part is isolated: a failure in one never blocks the other.
export async function processPlanExpiry(now = new Date()) {
  const out = {};
  try { out.reminders = await sendReminders(now); } catch (err) { console.error('plan reminders failed', err); out.reminders = { error: 'failed' }; }
  try { out.downgrade = await downgradeLapsed(); } catch (err) { console.error('plan downgrade failed', err); out.downgrade = { error: 'failed' }; }
  return out;
}
