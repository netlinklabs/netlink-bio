// api/_lib/verify-wallet-tx.js
// Verifies app-recorded wallet transactions against Polygon mainnet.
// Not a serverless function (lives in _lib): it is called by
// api/cron/rollup-analytics.js, because the Vercel Hobby plan caps api/ at 12
// functions and that cap is already reached.
//
// For each wallet_transactions row with status = 'success' and
// onchain_verified = false, looks up the tx receipt via Alchemy (batched
// JSON-RPC, no history limit) and sets onchain_verified = true when the tx
// exists and succeeded on-chain. The wallet match is informational only and
// goes to onchain_check_note: Sequence smart-contract wallets and internal
// native transfers may not show the user's address in the receipt.
//
// Needs the migration in `wallet_tx_onchain_verification` (adds onchain_*
// columns). Env: SUPABASE_SERVICE_ROLE_KEY, ALCHEMY_API_KEY.

import { trackAlchemy } from './usage.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';

// eth_getTransactionReceipt costs 20 CU and the free plan allows about 500 CU per second, so a
// batch of 100 (2000 CU) in one request is a burst that gets rate limited (HTTP 429). Small
// batches with a pause stay near 300 CU per second.
const RPC_BATCH = 10;    // receipts per Alchemy batch request
const RPC_PAUSE_MS = 700; // pause between batches
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BATCH_SIZE = 150;  // rows per run (keeps one cron run well under the function time limit)
const MAX_ATTEMPTS = 5;  // stop retrying a row after this many failed checks
const IN_CHUNK = 100;    // ids per PostgREST in.(...) filter (keeps URLs short)

export const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export async function sb(key, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  // 204, or a 2xx with an empty body (for example a POST upsert with Prefer: return=minimal
  // answers 201 and no body), means there is nothing to parse.
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Returns { [hash]: { receipt } | { error } }
export async function getReceipts(alchemyKey, hashes) {
  const url = `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  const out = {};
  const groups = chunk(hashes, RPC_BATCH);
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (gi > 0) await sleep(RPC_PAUSE_MS);
    const body = group.map((h, i) => ({
      jsonrpc: '2.0', id: i, method: 'eth_getTransactionReceipt', params: [h],
    }));
    let res;
    for (let attempt = 0; ; attempt++) {
      const payload = JSON.stringify(body);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      trackAlchemy(payload, res);
      if (res.status !== 429 || attempt >= 2) break;
      await sleep(2000 * (attempt + 1)); // rate limited: back off and try the same batch again
    }
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Alchemy: unexpected batch response');
    for (const item of data) {
      const hash = group[item.id];
      if (hash === undefined) continue;
      out[hash] = item.error
        ? { error: String(item.error.message || 'RPC error') }
        : { receipt: item.result };
    }
  }
  return out;
}

// Does the user's wallet appear in the receipt (sender, recipient, log topics or data)?
function walletSeen(receipt, wallet) {
  if (!wallet) return false;
  const w = wallet.toLowerCase().replace(/^0x/, '');
  const same = (a) => typeof a === 'string' && a.toLowerCase().replace(/^0x/, '') === w;
  if (same(receipt.from) || same(receipt.to)) return true;
  return (receipt.logs || []).some(
    (l) =>
      (l.topics || []).some((t) => typeof t === 'string' && t.toLowerCase().endsWith(w)) ||
      (typeof l.data === 'string' && l.data.toLowerCase().includes(w))
  );
}

async function patchByIds(key, ids, patch) {
  for (const group of chunk(ids, IN_CHUNK)) {
    await sb(key, `wallet_transactions?id=in.(${group.join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  }
}

export async function verifyWalletTx() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  if (!alchemyKey) throw new Error('ALCHEMY_API_KEY is not configured');

  // 1. Pick unverified successful rows
  const rows = await sb(
    key,
    `wallet_transactions?select=id,hash,owner_id,onchain_check_attempts` +
      `&status=eq.success&onchain_verified=eq.false` +
      `&onchain_check_attempts=lt.${MAX_ATTEMPTS}` +
      `&order=created_at.asc&limit=${BATCH_SIZE}`
  );
  if (!rows.length) return { checked: 0, verified: 0, walletNotSeen: 0, failed: 0 };

  // 2. Wallet address per owner (informational match only)
  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const walletByOwner = {};
  for (const group of chunk(ownerIds, IN_CHUNK)) {
    const profiles = await sb(key, `profiles?select=id,wallet_address&id=in.(${group.join(',')})`);
    for (const p of profiles) walletByOwner[p.id] = p.wallet_address;
  }

  // 3. Fetch receipts in batches
  const results = await getReceipts(alchemyKey, [...new Set(rows.map((r) => r.hash))]);

  // 4. Sort rows into outcomes
  const okMatched = [];
  const okUnmatched = [];
  const failures = []; // { id, patch }
  for (const row of rows) {
    const r = results[row.hash];
    const attempts = row.onchain_check_attempts + 1;
    if (!r || r.error) {
      failures.push({ id: row.id, patch: { onchain_check_attempts: attempts, onchain_check_note: (r && r.error ? r.error : 'No result from RPC').slice(0, 200) } });
    } else if (!r.receipt) {
      failures.push({ id: row.id, patch: { onchain_check_attempts: attempts, onchain_check_note: 'Tx not found on Polygon' } });
    } else if (r.receipt.status !== '0x1') {
      // Reverted on-chain but recorded as success in the app: flag it and stop retrying.
      failures.push({ id: row.id, patch: { onchain_check_attempts: MAX_ATTEMPTS, onchain_check_note: 'Tx reverted on-chain' } });
    } else if (walletSeen(r.receipt, walletByOwner[row.owner_id])) {
      okMatched.push(row.id);
    } else {
      okUnmatched.push(row.id);
    }
  }

  // 5. Write results (grouped to keep the number of requests low)
  const now = new Date().toISOString();
  await patchByIds(key, okMatched, { onchain_verified: true, onchain_verified_at: now, onchain_check_note: 'Tx confirmed; wallet matched' });
  await patchByIds(key, okUnmatched, { onchain_verified: true, onchain_verified_at: now, onchain_check_note: 'Tx confirmed; wallet not seen in receipt' });
  for (const f of failures) await patchByIds(key, [f.id], f.patch);

  return {
    checked: rows.length,
    verified: okMatched.length + okUnmatched.length,
    walletNotSeen: okUnmatched.length,
    failed: failures.length,
  };
}
