// api/_lib/usage.js
// Third party usage for the admin "Usage and limits" section (admin.html, admin-usage action).
// Lives in _lib, so it adds no serverless function (api/ is at the Vercel Hobby cap of 12).
//
// What is measured, and how reliable it is:
//  - Alchemy: counted by us, per method, every time the server calls Alchemy (trackAlchemy). The
//    compute units (CU) are an ESTIMATE: method count times the CU cost in ALCHEMY_CU below.
//    Compare with the Alchemy dashboard now and then and fix the table if they drift. Rate limit
//    hits (HTTP 429) are counted too, they are the real signal that throughput is too low.
//    Calls made by other tools (not this server) are not counted.
//  - Didit: exact, from kyc_sessions (one row per verification session, which Didit bills).
//  - Supabase: monthly active users (last sign-in in 30 days), exact from the database.
//  - Sequence: wallets and transactions from the Sequence Analytics API (needs a Secret API key,
//    see sequenceStats). If the key is missing or rejected, the section says so and nothing else
//    breaks. Wallet activity in our own database is shown next to it as a cross-check.
//  - Vercel: serverless functions are a constant, update it when api/ changes.
//
// Limits below are plan constants. Update them when a plan changes.

import { waitUntil } from '@vercel/functions';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';

export const LIMITS = {
  alchemy_cu_month: 30_000_000, // Alchemy free plan, from the dashboard
  alchemy_cu_per_second: 500,
  supabase_mau: 50_000,         // Supabase Free plan, check the plan page if it changes
  vercel_functions: 12,         // Vercel Hobby cap
};
// api/ currently holds this many functions (update when one is added or merged)
export const VERCEL_FUNCTIONS_USED = 12;

// Compute units per call. Values for the RPC methods are from Alchemy's compute unit table;
// the Prices API value is an assumption. Unknown methods count as DEFAULT_CU.
export const ALCHEMY_CU = {
  eth_getTransactionReceipt: 20,
  eth_call: 26,
  eth_getBalance: 19,
  eth_blockNumber: 10,
  eth_gasPrice: 19,
  eth_getTransactionByHash: 17,
  eth_getLogs: 60,
  alchemy_getAssetTransfers: 150,
  'prices/tokens/by-symbol': 40,
};
const DEFAULT_CU = 30;
const RATE_LIMIT_METRIC = '429';

export function alchemyUnits(counts) {
  let cu = 0;
  for (const [m, n] of Object.entries(counts || {})) {
    if (m === RATE_LIMIT_METRIC) continue;
    cu += (ALCHEMY_CU[m] ?? DEFAULT_CU) * n;
  }
  return cu;
}

async function bump(provider, items) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !Object.keys(items).length) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_third_party_usage`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_provider: provider, p_items: items }),
    });
  } catch (e) {
    console.error('usage: bump failed', provider, e.message);
  }
}

// Call after each Alchemy request. `body` is the JSON string that was sent (one request or a
// batch array), `res` is the fetch Response (only its status is read). Never throws and never
// delays the caller: the write runs in waitUntil().
export function trackAlchemy(body, res) {
  try {
    const items = {};
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    for (const q of Array.isArray(parsed) ? parsed : [parsed]) {
      const m = q && typeof q.method === 'string' ? q.method.slice(0, 60) : null;
      if (m) items[m] = (items[m] || 0) + 1;
    }
    if (res && res.status === 429) items[RATE_LIMIT_METRIC] = 1;
    waitUntil(bump('alchemy', items));
  } catch (e) {
    console.error('usage: track failed', e.message);
  }
}

// For calls that are not JSON-RPC (the Prices API): count one named metric.
export function trackAlchemyMetric(metric, res) {
  try {
    const items = { [metric]: 1 };
    if (res && res.status === 429) items[RATE_LIMIT_METRIC] = 1;
    waitUntil(bump('alchemy', items));
  } catch (e) {
    console.error('usage: track failed', e.message);
  }
}

// ------------------------------------------------------------------ reading

const sbHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

async function alchemyMonth(key, monthStart) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/third_party_usage_daily?select=day,metric,count&provider=eq.alchemy&day=gte.${monthStart}&limit=5000`,
    { headers: sbHeaders(key) }
  );
  if (!r.ok) throw new Error(`alchemy usage ${r.status}`);
  const rows = await r.json();
  const counts = {};
  let rateLimited = 0;
  let lastLimitedDay = null;
  for (const row of rows) {
    const n = Number(row.count) || 0;
    if (row.metric === RATE_LIMIT_METRIC) {
      rateLimited += n;
      if (!lastLimitedDay || row.day > lastLimitedDay) lastLimitedDay = row.day;
    } else counts[row.metric] = (counts[row.metric] || 0) + n;
  }
  return {
    cu: alchemyUnits(counts),
    requests: Object.values(counts).reduce((a, b) => a + b, 0),
    by_method: Object.entries(counts).map(([method, n]) => ({ method, n, cu: (ALCHEMY_CU[method] ?? DEFAULT_CU) * n }))
      .sort((a, b) => b.cu - a.cu),
    rate_limited: rateLimited,
    last_rate_limited_day: lastLimitedDay,
  };
}

// Sequence Analytics API (https://docs.sequence.xyz/api-references/analytics/overview).
// Needs a Secret API Access Key: SEQUENCE_SECRET_API_KEY, or TRAILS_API_KEY as a fallback (same
// Sequence project). Each figure is fetched on its own, so one rejected endpoint (for example
// one locked on the current plan) only hides that figure. Cached for 10 minutes.
const SEQ_BASE = 'https://api.sequence.app/rpc/Analytics/';
const SEQ_PROJECT_ID = Number(process.env.SEQUENCE_PROJECT_ID) || 49724;
let seqCache = { at: 0, data: null };

async function seqCall(key, endpoint, filter) {
  try {
    const r = await fetch(SEQ_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `BEARER ${key}`, 'X-Access-Key': key },
      body: JSON.stringify({ filter: { projectId: SEQ_PROJECT_ID, ...filter } }),
    });
    if (r.status === 401 || r.status === 403) return { denied: true };
    if (!r.ok) return { error: true };
    return { data: await r.json() };
  } catch {
    return { error: true };
  }
}

const sumChart = (arr) => (Array.isArray(arr) ? arr.reduce((a, c) => a + (Number(c?.value) || 0), 0) : null);
const lastValue = (arr) => (Array.isArray(arr) && arr.length ? Number(arr[arr.length - 1]?.value) || 0 : null);

export async function sequenceStats() {
  const key = process.env.SEQUENCE_SECRET_API_KEY || process.env.TRAILS_API_KEY;
  if (!key) return { configured: false };
  if (seqCache.data && Date.now() - seqCache.at < 10 * 60 * 1000) return seqCache.data;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [walletsTotal, walletsMonthly, txMonthly, compute] = await Promise.all([
    seqCall(key, 'WalletsTotal', { startDate: yearAgo, endDate: today }),
    seqCall(key, 'WalletsMonthly', { startDate: monthStart, endDate: today, dateInterval: 'MONTH' }),
    seqCall(key, 'WalletsTxnSentMonthly', { startDate: monthStart, endDate: today, dateInterval: 'MONTH' }),
    seqCall(key, 'TotalCompute', { startDate: monthStart, endDate: today }),
  ]);
  const part = (r, pick) => (r.denied ? { status: 'denied' } : r.error ? { status: 'error' } : { status: 'ok', value: pick(r.data) });
  const out = {
    configured: true,
    wallets_total: part(walletsTotal, (d) => lastValue(d.walletStats)),
    wallets_active_month: part(walletsMonthly, (d) => lastValue(d.walletStats)),
    wallets_with_tx_month: part(txMonthly, (d) => lastValue(d.walletStats)),
    compute_month: part(compute, (d) => sumChart(d.computeStats)),
  };
  seqCache = { at: Date.now(), data: out };
  return out;
}

// Everything the admin section shows. Each source is isolated: a failure becomes null for it.
export async function usageSummary() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const safe = async (fn) => { try { return await fn(); } catch (e) { console.error('usage summary part failed', e.message); return null; } };
  const sql = await safe(async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_usage_summary`, {
      method: 'POST',
      headers: { ...sbHeaders(key), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error(`admin_usage_summary ${r.status}`);
    return r.json();
  });
  const monthStart = (sql && sql.month_start) || new Date().toISOString().slice(0, 8) + '01';
  const [alchemy, sequence] = await Promise.all([safe(() => alchemyMonth(key, monthStart)), safe(sequenceStats)]);
  return {
    month_start: monthStart,
    limits: LIMITS,
    alchemy,
    didit: sql && { sessions_month: sql.didit_sessions_month, sessions_total: sql.didit_sessions_total },
    supabase: sql && { mau_30d: sql.mau_30d, users_total: sql.users_total },
    sequence,
    netlink_pay: sql && { wallets_connected: sql.wallets_connected, tx_month: sql.pay_tx_month, tx_total: sql.pay_tx_total },
    vercel: { functions_used: VERCEL_FUNCTIONS_USED, functions_limit: LIMITS.vercel_functions },
  };
}
