// api/_lib/sync-fee-income.js
// Pulls the swap commission (LI.FI integrator fee, 0.5%) that arrives on the Netlink fee wallet
// from Polygon into public.swap_fee_income, so the printed report can show it per day or month.
// Not a serverless function (lives in _lib): it is called by api/cron/rollup-analytics.js, the
// Vercel Hobby plan caps api/ at 12 functions and that cap is already reached.
//
// How: alchemy_getAssetTransfers with toAddress = fee wallet (external = POL sent directly,
// internal = POL sent by a contract, erc20 = USDC and other tokens), oldest first, paged. The first
// run reads from block 0 (the wallet has few transfers), later runs start a little before the
// newest stored block. Rows are upserted by Alchemy's uniqueId, so re-reading is harmless.
// Which rows really are swap commission is decided at report time (SQL): only transfers whose tx
// hash is a swap recorded in wallet_transactions count. Other incoming transfers are stored too
// and reported as "not matched".
//
// Cost: one alchemy_getAssetTransfers query (150 CU) per page, normally 1 page per day.
// Env: SUPABASE_SERVICE_ROLE_KEY, ALCHEMY_API_KEY, optional FEE_WALLET_ADDRESS (public address,
// defaults to the LI.FI fee wallet registered for integrator `netlink-pay`).
// Needs the migration `swap_fee_income`.

import { sb } from './verify-wallet-tx.js';
import { trackAlchemy } from './usage.js';

const FEE_WALLET = (process.env.FEE_WALLET_ADDRESS || '0x7A7cf7B87bA43986114e7839cEb6f9406E57ef89').toLowerCase();
const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const NET = '0x0e893b239094a5c573373d44cf1c7d03576b95cb';
const MAX_PAGES = 6;       // 1000 transfers per page
const OVERLAP_BLOCKS = 200; // re-read a few blocks before the newest stored one (reorg safety)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map one Alchemy transfer to a table row, or null if it should be skipped (zero value, bad data).
export function toFeeRow(t) {
  if (!t || !t.uniqueId || !t.hash) return null;
  let asset;
  let contract = null;
  if (t.category === 'erc20') {
    contract = String(t.rawContract?.address || '').toLowerCase();
    asset = contract === USDC || contract === USDC_E ? 'USDC' : contract === NET ? 'NET' : String(t.asset || 'OTHER').toUpperCase();
  } else if (t.category === 'external' || t.category === 'internal') {
    asset = 'POL';
  } else return null;
  let raw;
  try { raw = BigInt(t.rawContract?.value); } catch { return null; }
  if (raw <= 0n) return null;
  const decimals = t.category === 'erc20' ? parseInt(t.rawContract?.decimal || '0x0', 16) || (asset === 'USDC' ? 6 : 18) : 18;
  const div = 10n ** BigInt(decimals);
  const amount = Number(raw / div) + Number(raw % div) / Number(div);
  let blockNum;
  try { blockNum = Number(BigInt(t.blockNum)); } catch { return null; }
  return {
    unique_id: String(t.uniqueId),
    tx_hash: String(t.hash).toLowerCase(),
    block_num: blockNum,
    block_time: t.metadata?.blockTimestamp || null,
    asset,
    contract,
    category: t.category,
    amount,
    from_address: t.from ? String(t.from).toLowerCase() : null,
  };
}

async function query(alchemyKey, params) {
  for (let attempt = 0; ; attempt++) {
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] });
    const res = await fetch(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    trackAlchemy(payload, res);
    if (res.status === 429 && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) {
      if (data.error.code === 429 && attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
      throw new Error(`Alchemy: ${data.error.message || data.error.code}`);
    }
    return data.result || { transfers: [] };
  }
}

export async function syncFeeIncome() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  if (!alchemyKey) throw new Error('ALCHEMY_API_KEY is not configured');

  const last = await sb(key, 'swap_fee_income?select=block_num&order=block_num.desc&limit=1');
  const fromBlock = last?.[0] ? Math.max(0, Number(last[0].block_num) - OVERLAP_BLOCKS) : 0;

  let pageKey;
  let read = 0;
  let stored = 0;
  let pages = 0;
  do {
    const result = await query(alchemyKey, {
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
      toAddress: FEE_WALLET,
      category: ['external', 'internal', 'erc20'],
      withMetadata: true,
      excludeZeroValue: true,
      order: 'asc',
      maxCount: '0x3e8',
      ...(pageKey ? { pageKey } : {}),
    });
    pages++;
    const rows = (result.transfers || []).map(toFeeRow).filter(Boolean);
    read += (result.transfers || []).length;
    for (let i = 0; i < rows.length; i += 200) {
      await sb(key, 'swap_fee_income?on_conflict=unique_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + 200)),
      });
      stored += Math.min(200, rows.length - i);
    }
    pageKey = result.pageKey;
    if (pageKey) await sleep(700);
  } while (pageKey && pages < MAX_PAGES);

  return { fromBlock, pages, transfersRead: read, rowsStored: stored, more: Boolean(pageKey) };
}
