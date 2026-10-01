// api/_lib/verify-wallet-amount.js
// Compares the amount recorded in public.wallet_transactions with the transfers that really
// happened on Polygon in that transaction. Not a serverless function (lives in _lib): it is
// called by api/cron/rollup-analytics.js, together with verify-wallet-tx.js, because the
// Vercel Hobby plan caps api/ at 12 functions and that cap is already reached.
//
// Why: the browser inserts the amount, and onchain_verified only proves the tx exists and
// succeeded. A real hash with a made-up amount would pass that check.
//
// How: for every verified row without an amount result, take the block of its receipt and
// ask Alchemy (alchemy_getAssetTransfers, same call shape as api/wallet.js) for the transfers
// from and to the owner's wallet in that block, then keep only the ones in this tx hash.
// Result goes to onchain_amount_status / onchain_amount_note, never to onchain_verified:
//   match      the recorded amount is one of the on-chain transfers (or their sum), within tolerance
//   mismatch   transfers of that token exist for the wallet but none equals the recorded amount
//              (only for send, receive and export, where the on-chain side is unambiguous)
//   unchecked  could not be confirmed: no transfer found (for example the user has since moved
//              to another wallet), swaps that do not line up, unknown token. Never an accusation.
//
// Alchemy rate limit (HTTP 429): small batches with a pause, retry with back-off; if it persists the
// run stops cleanly (rateLimited: true) and the rows stay unchecked for the next run.
//
// Known limits: tolerance is max(0.01, 0.5%) (2% for swaps, whose output comes from a quote);
// the Sequence relayer fee transfer is ignored, as in api/wallet.js; amounts are compared as
// numbers, which is fine at these sizes.
//
// Needs the migration `wallet_tx_amount_check`. Env: SUPABASE_SERVICE_ROLE_KEY, ALCHEMY_API_KEY.

import { sb, chunk, getReceipts } from './verify-wallet-tx.js';

const NET = '0x0e893b239094a5c573373d44cf1c7d03576b95cb';
const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const TOKEN_INFO = {
  [NET]: { symbol: 'NET', decimals: 18 },
  [USDC]: { symbol: 'USDC', decimals: 6 },
};
// Sequence WaaS relayer fee address (same constant as api/wallet.js). Smart-wallet txs often
// bundle a small separate POL transfer to it, which is not part of what the user sent.
const RELAYER_FEE_ADDRESS = '0x7e08701cc9194ef4ffd82421dd0d986d1b43d521';

const PER_ROUND = 30;        // rows per round
// alchemy_getAssetTransfers costs 150 compute units per query and the free plan allows roughly
// 500 CU per second, so a big batch gets HTTP 429. Send few queries at a time with a pause.
const QUERY_BATCH = 3;       // transfer queries per Alchemy HTTP request
const PAUSE_MS = 1100;       // pause between those requests
const BUDGET_MS = 90000;     // stop starting new work after this long (cron has maxDuration 120s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const within = (a, b, rel = 0.005) =>
  Math.abs(a - b) <= Math.max(0.01, rel * Math.max(Math.abs(a), Math.abs(b)));

const fmt = (n) => String(Number(Number(n).toFixed(6)));

// Turn Alchemy transfers into the wallet's legs for one tx hash. `transfers` may hold the
// results of both the fromAddress and the toAddress query (duplicates are dropped by uniqueId).
export function legsFor(transfers, hash, wallet) {
  const h = String(hash).toLowerCase();
  const w = String(wallet).toLowerCase();
  const seen = new Set();
  const legs = [];
  for (const t of transfers || []) {
    if (!t || String(t.hash).toLowerCase() !== h) continue;
    if (t.uniqueId) {
      if (seen.has(t.uniqueId)) continue;
      seen.add(t.uniqueId);
    }
    let token;
    let decimals;
    if (t.category === 'erc20') {
      const info = TOKEN_INFO[String(t.rawContract?.address || '').toLowerCase()];
      if (!info) continue;
      token = info.symbol;
      decimals = info.decimals;
    } else {
      token = 'POL';
      decimals = 18;
    }
    let raw;
    try { raw = BigInt(t.rawContract?.value); } catch { continue; }
    const from = String(t.from || '').toLowerCase();
    const to = String(t.to || '').toLowerCase();
    if (from === to) continue; // self transfer
    const isOut = from === w;
    const isIn = to === w;
    if (!isOut && !isIn) continue;
    if ((isOut ? to : from) === RELAYER_FEE_ADDRESS) continue;
    legs.push({ token, amount: Number(raw) / 10 ** decimals, dir: isOut ? 'out' : 'in' });
  }
  return legs;
}

function side(legs, token, dir, amount, rel) {
  const values = legs.filter((l) => l.token === token && l.dir === dir).map((l) => l.amount);
  if (!values.length) return { found: false };
  const sum = values.reduce((a, b) => a + b, 0);
  return { found: true, ok: values.some((v) => within(amount, v, rel)) || within(amount, sum, rel), values };
}

// Decide the result for one row. Pure function: no network.
export function evaluateRow(row, legs) {
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) return { status: 'unchecked', note: 'Recorded amount is not a number' };

  if (row.type === 'swap') {
    const a = side(legs, row.token, 'out', amount, 0.02);
    const b = row.to_token ? side(legs, row.to_token, 'in', Number(row.to_amount), 0.02) : { found: false };
    if (a.found && a.ok && b.found && b.ok) return { status: 'match', note: 'Both swap amounts found on-chain' };
    return { status: 'unchecked', note: 'Swap amounts not confirmed (swaps are never flagged)' };
  }

  const dir = row.type === 'receive' ? 'in' : row.type === 'send' || row.type === 'export' ? 'out' : null;
  if (!dir) return { status: 'unchecked', note: `Type ${row.type} is not compared` };
  const r = side(legs, row.token, dir, amount, 0.005);
  if (!r.found) return { status: 'unchecked', note: `No ${row.token} transfer for this wallet found in the tx` };
  if (r.ok) return { status: 'match', note: 'Amount found on-chain' };
  return { status: 'mismatch', note: `Recorded ${fmt(amount)} ${row.token}, on-chain ${r.values.map(fmt).join(' + ')}`.slice(0, 200) };
}

class RateLimited extends Error {}

async function transferBatch(alchemyKey, queries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transferBatchOnce(alchemyKey, queries);
    } catch (err) {
      if (!(err instanceof RateLimited) || attempt >= 2) throw err;
      await sleep(2000 * (attempt + 1)); // back off, then try the same queries again
    }
  }
}

async function transferBatchOnce(alchemyKey, queries) {
  const res = await fetch(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queries),
  });
  if (res.status === 429) throw new RateLimited('Alchemy HTTP 429');
  if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Alchemy: unexpected batch response');
  // a rate limit can also come back inside the batch body
  if (data.some((r) => r?.error?.code === 429)) throw new RateLimited('Alchemy HTTP 429 (in batch)');
  return new Map(data.map((r) => [r.id, r]));
}

export async function checkWalletTxAmounts() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  if (!alchemyKey) throw new Error('ALCHEMY_API_KEY is not configured');

  const deadline = Date.now() + BUDGET_MS;
  const totals = { checked: 0, match: 0, mismatch: 0, unchecked: 0, retryLater: 0, rateLimited: false, complete: false };
  const skip = new Set(); // ids that hit a transient problem this run; retried on the next run

  while (Date.now() < deadline) {
    const notIn = skip.size ? `&id=not.in.(${[...skip].join(',')})` : '';
    const rows = await sb(
      key,
      `wallet_transactions?select=id,hash,owner_id,type,token,amount,to_token,to_amount` +
        `&status=eq.success&onchain_verified=eq.true&onchain_amount_status=is.null${notIn}` +
        `&order=created_at.asc&limit=${PER_ROUND}`
    );
    if (!rows.length) { totals.complete = true; break; }

    const owners = [...new Set(rows.map((r) => r.owner_id))];
    const walletByOwner = {};
    for (const group of chunk(owners, 100)) {
      const profiles = await sb(key, `profiles?select=id,wallet_address&id=in.(${group.join(',')})`);
      for (const p of profiles) walletByOwner[p.id] = p.wallet_address;
    }

    const receipts = await getReceipts(alchemyKey, rows.map((r) => r.hash));

    // Only the direction that matters: send and export look at what the wallet sent, receive at
    // what it received, swap at both. Identical queries (same wallet, block, direction) are shared.
    const queries = [];
    const queryIds = new Map(); // "dir|wallet|block" -> id
    const want = (dir, wallet, block) => {
      const k = `${dir}|${wallet}|${block}`;
      if (!queryIds.has(k)) {
        const id = queries.length + 1;
        const base = { fromBlock: block, toBlock: block, category: ['external', 'internal', 'erc20'], withMetadata: false, excludeZeroValue: true };
        queries.push({ jsonrpc: '2.0', id, method: 'alchemy_getAssetTransfers', params: [{ ...base, [dir === 'out' ? 'fromAddress' : 'toAddress']: wallet }] });
        queryIds.set(k, id);
      }
      return queryIds.get(k);
    };
    const results = []; // { row, wallet, ids } or { row, early: {status, note} }
    for (const row of rows) {
      const wallet = walletByOwner[row.owner_id];
      const rc = receipts[row.hash]?.receipt;
      if (!wallet) { results.push({ row, early: { status: 'unchecked', note: 'No wallet address on the profile' } }); continue; }
      if (!rc || !rc.blockNumber) { skip.add(row.id); totals.retryLater++; continue; }
      const dirs = row.type === 'swap' ? ['out', 'in'] : row.type === 'receive' ? ['in'] : ['out'];
      results.push({ row, wallet, ids: dirs.map((d) => want(d, wallet, rc.blockNumber)) });
    }

    const byId = new Map();
    let limited = false;
    for (const group of chunk(queries, QUERY_BATCH)) {
      if (Date.now() > deadline) break; // out of time: unanswered rows are retried next run
      try {
        for (const [id, r] of await transferBatch(alchemyKey, group)) byId.set(id, r);
      } catch (err) {
        if (err instanceof RateLimited) { limited = true; break; }
        throw err;
      }
      await sleep(PAUSE_MS);
    }
    if (limited) totals.rateLimited = true;

    const outcomes = new Map(); // "status|note" -> ids
    for (const item of results) {
      let outcome = item.early;
      if (!outcome) {
        const rs = item.ids.map((id) => byId.get(id));
        const bad = rs.some((r) => !r || r.error || r.result?.pageKey);
        if (bad) { skip.add(item.row.id); totals.retryLater++; continue; }
        const transfers = rs.flatMap((r) => r.result?.transfers || []);
        outcome = evaluateRow(item.row, legsFor(transfers, item.row.hash, item.wallet));
      }
      const k = `${outcome.status}|${outcome.note}`;
      if (!outcomes.has(k)) outcomes.set(k, []);
      outcomes.get(k).push(item.row.id);
      totals[outcome.status]++;
      totals.checked++;
    }

    const now = new Date().toISOString();
    for (const [k, ids] of outcomes) {
      const sep = k.indexOf('|');
      const patch = { onchain_amount_status: k.slice(0, sep), onchain_amount_note: k.slice(sep + 1), onchain_amount_checked_at: now };
      for (const group of chunk(ids, 100)) {
        await sb(key, `wallet_transactions?id=in.(${group.join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      }
    }
    if (limited) break; // still rate limited after retries: stop, the next run continues
  }
  return totals;
}
