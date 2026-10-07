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
//     (api/_lib/verify-wallet-tx.js), then checkWalletTxAmounts() compares the
//     recorded amount with the on-chain transfers (api/_lib/verify-wallet-amount.js).
//     They run after the rollup and never affect it. `?job=verify-wallet-tx`
//     runs only these two, for manual backfill.
//   - syncFeeIncome(): copies the swap commission arriving on the fee wallet into
//     swap_fee_income (api/_lib/sync-fee-income.js). Part of the same wallet jobs, so the
//     same `?job=verify-wallet-tx` call also runs it (this is how the first backfill is done).
//   - processAccountDeletions(): deletes accounts whose 45-day deletion grace period is over
//     (api/_lib/process-deletions.js). Dry run unless DELETION_EXECUTOR_ENABLED=true.
//     `?job=process-deletions` runs only this job.
//   - processPlanExpiry(): paid plan reminders (7 and 3 days before the end date) and the
//     downgrade to Basic 7 days after it (api/_lib/plan-expiry.js). `?job=plan-expiry` runs only this job.

import { sendMail, getUserEmail, reminderMail } from '../_lib/mailer.js';
import { verifyWalletTx } from '../_lib/verify-wallet-tx.js';
import { checkWalletTxAmounts } from '../_lib/verify-wallet-amount.js';
import { syncFeeIncome } from '../_lib/sync-fee-income.js';
import { processAccountDeletions } from '../_lib/process-deletions.js';
import { processPlanExpiry } from '../_lib/plan-expiry.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Each step is isolated: one failing never hides or blocks the other.
async function runWalletJobs() {
  const out = {};
  try {
    out.verify = await verifyWalletTx();
  } catch (err) {
    console.error('verify-wallet-tx failed', err);
    out.verify = { error: 'failed' };
  }
  try {
    out.amounts = await checkWalletTxAmounts();
  } catch (err) {
    console.error('verify-wallet-amount failed', err);
    out.amounts = { error: 'failed' };
  }
  // Swap commission received on the fee wallet (api/_lib/sync-fee-income.js), for the printed report.
  try {
    out.fees = await syncFeeIncome();
  } catch (err) {
    console.error('sync-fee-income failed', err);
    out.fees = { error: 'failed' };
  }
  return out;
}

async function runPlanExpiryJob() {
  try {
    const out = await processPlanExpiry();
    return out;
  } catch (err) {
    console.error('plan-expiry failed', err);
    return { error: 'failed' };
  }
}

// Isolated like the wallet jobs: a failure is reported but never fails the rollup.
async function runDeletionJob() {
  try {
    return await processAccountDeletions();
  } catch (err) {
    console.error('process-deletions failed', err);
    return { error: 'failed' };
  }
}

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

  // Manual run of the account deletion job only (dry run unless DELETION_EXECUTOR_ENABLED=true).
  if (req.query.job === 'process-deletions') {
    const out = await runDeletionJob();
    res.status(out.error ? 500 : 200).json({ ok: !out.error, job: 'process-deletions', ...out });
    return;
  }

  // Manual run of the plan expiry job only.
  if (req.query.job === 'plan-expiry') {
    const out = await runPlanExpiryJob();
    res.status(out.error ? 500 : 200).json({ ok: !out.error, job: 'plan-expiry', ...out });
    return;
  }

  // Manual run of the wallet checks only (no rollup, no reminders).
  if (req.query.job === 'verify-wallet-tx') {
    const out = await runWalletJobs();
    const failed = out.verify.error || out.amounts.error || out.fees.error;
    res.status(failed ? 500 : 200).json({ ok: !failed, job: 'verify-wallet-tx', ...out });
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
    const walletChecks = await runWalletJobs();
    const accountDeletions = await runDeletionJob();
    const planExpiry = await runPlanExpiryJob();
    res.status(200).json({ ok: true, date: targetDate || 'yesterday (UTC)', reminders, walletChecks, accountDeletions, planExpiry });
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
