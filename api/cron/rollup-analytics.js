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
// other caller. Set CRON_SECRET in Vercel's project env vars.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' });
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
    res.status(200).json({ ok: true, date: targetDate || 'yesterday (UTC)' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
