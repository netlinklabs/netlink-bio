// api/cron/rollup-analytics.js
// Runs once daily via Vercel Cron (see vercel.json's `crons` entry).
// Aggregates the previous UTC day's raw analytics_events into
// analytics_daily_summary and prunes events older than 90 days, via the
// rollup_analytics_day() Postgres function (see the `analytics_tables`
// migration) -- one RPC call instead of pulling raw rows over REST and
// grouping them here.
//
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
// when the CRON_SECRET env var is set on the project -- this rejects any
// other caller. Fails closed: if CRON_SECRET isn't configured, every call is
// rejected (an earlier version skipped the check in that case, which left
// the endpoint open to anyone). CRON_SECRET is set in Vercel's production
// env vars (2026-09-27).
//
// This one function also runs the other daily jobs, because the Vercel Hobby
// plan caps api/ at 12 functions and that cap is reached:
//   - sendReminders(): day-2 payment reminders (below)
//   - verifyWalletTx(): marks wallet_transactions rows as verified on-chain
//     (api/_lib/verify-wallet-tx.js). Runs after the rollup and never affects
//     it. `?job=verify-wallet-tx` runs only this job, for manual backfill.

import { sendMail, getUserEmail, reminderMail } from '../_lib/mailer.js';
import { verifyWalletTx } from '../_lib/verify-wallet-tx.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('rollup-analytics: CRON_SECRET is not set, refusing to run.');
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' });
    return;
  }

  // Manual run of the wallet verification only (no rollup, no reminders).
  if (req.query.job === 'verify-wallet-tx') {
    try {
      res.status(200).json({ ok: true, job: 'verify-wallet-tx', ...(await verifyWalletTx()) });
    } catch (err) {
      console.error('verify-wallet-tx failed', err);
      res.status(500).json({ error: 'Verification run failed' });
    }
    return;
  }

  // Optional ?date=YYYY-MM-DD for manual backfill/testing -- defaults to
  // "yesterday" inside rollup_analytics_day() itself when omitted.
  const targetDate = typeof req.query.date === 'string' ? req.query.date : undefined;

  try {
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rollup_analytics_day`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(targetDate ? { target_date: targetDate } : {}),
    });
    if (!res2.ok) {
      const text = await res2.text();
      console.error('rollup_analytics_day RPC failed:', res2.status, text);
      res.status(502).json({ error: 'Rollup RPC failed', detail: text });
      return;
    }
    const reminders = await sendReminders();
    // Isolated: a failure here is reported in the response but never fails the rollup.
    let walletVerify;
    try {
      walletVerify = await verifyWalletTx();
    } catch (err) {
      console.error('verify-wallet-tx failed', err);
      walletVerify = { error: 'failed' };
    }
    res.status(200).json({ ok: true, date: targetDate || 'yesterday (UTC)', reminders, walletVerify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
}

// Day-2 payment reminder. Orders live 3 days, so an unpaid order whose invoice
// expires within 24 hours is due. The cron runs daily, so each order lands in
// this window once; meta.emails.reminder is the dedupe marker (no migration).
async function sendReminders() {
  const h = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  let sent = 0;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?status=in.(awaiting_payment,underpaid)&expires_at=gt.${now.toISOString()}&expires_at=lte.${soon}&select=*`,
      { headers: h }
    );
    if (!r.ok) return { error: r.status };
    for (const o of await r.json()) {
      if (o.meta?.test || o.meta?.emails?.reminder) continue;
      const to = await getUserEmail(o.user_id);
      if (!to) continue;
      const ok = await sendMail({ ...reminderMail(o), to });
      if (!ok) continue;
      const meta = { ...(o.meta || {}), emails: { ...(o.meta?.emails || {}), reminder: now.toISOString() } };
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${o.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ meta }) });
      sent++;
    }
  } catch (err) {
    console.error('reminders failed', err);
  }
  return { sent };
}
