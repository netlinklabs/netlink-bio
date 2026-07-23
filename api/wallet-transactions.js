// api/wallet-transactions.js
// Fetches the last 20 Polygon transactions (native POL + ERC-20 transfers
// for NET & USDC) for a wallet address, merged and sorted by time, for the
// Netlink Pay transaction history widget. Same PolygonScan/Etherscan V2
// pattern as api/wallet-balance.js.

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const POLYGON_CHAIN_ID = 137;

const TOKEN_INFO = {
  '0x0e893b239094a5c573373d44cf1c7d03576b95cb': { symbol: 'NET', decimals: 18 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
};

function fromWei(rawValue, decimals) {
  if (!rawValue) return '0.00';
  const value = BigInt(rawValue);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole}.${fractionStr}`;
}

async function polygonscanGet(params) {
  const url = `${ETHERSCAN_V2_BASE}?${new URLSearchParams({ ...params, chainid: POLYGON_CHAIN_ID, apikey: POLYGONSCAN_API_KEY })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan V2 request failed: ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  const address = (req.query.address || '').trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid or missing wallet address' });
    return;
  }
  if (!POLYGONSCAN_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing PolygonScan API key' });
    return;
  }

  try {
    const [nativeRes, internalRes, tokenRes] = await Promise.all([
      polygonscanGet({ module: 'account', action: 'txlist', address, sort: 'desc', page: 1, offset: 20 }),
      polygonscanGet({ module: 'account', action: 'txlistinternal', address, sort: 'desc', page: 1, offset: 20 }),
      polygonscanGet({ module: 'account', action: 'tokentx', address, sort: 'desc', page: 1, offset: 40 }),
    ]);

    const lowerAddr = address.toLowerCase();

    const nativeTxs = (Array.isArray(nativeRes.result) ? nativeRes.result : [])
      .filter((tx) => tx.value !== '0')
      .map((tx) => ({
        hash: tx.hash,
        token: 'POL',
        amount: fromWei(tx.value, 18),
        type: tx.to?.toLowerCase() === lowerAddr ? 'in' : 'out',
        counterparty: tx.to?.toLowerCase() === lowerAddr ? tx.from : tx.to,
        timestamp: parseInt(tx.timeStamp, 10) * 1000,
      }));

    // Smart-contract wallets (Sequence WaaS) move native POL through internal
    // calls when the transfer happens as part of a contract interaction (e.g.
    // a swap). PolygonScan's plain `txlist` only sees top-level transactions,
    // so those internal POL movements are invisible without this endpoint.
    const internalTxs = (Array.isArray(internalRes.result) ? internalRes.result : [])
      .filter((tx) => tx.value !== '0' && tx.isError === '0')
      .map((tx) => ({
        hash: tx.hash,
        token: 'POL',
        amount: fromWei(tx.value, 18),
        type: tx.to?.toLowerCase() === lowerAddr ? 'in' : 'out',
        counterparty: tx.to?.toLowerCase() === lowerAddr ? tx.from : tx.to,
        timestamp: parseInt(tx.timeStamp, 10) * 1000,
      }));

    const tokenTxs = (Array.isArray(tokenRes.result) ? tokenRes.result : [])
      .map((tx) => {
        const info = TOKEN_INFO[tx.contractAddress?.toLowerCase()];
        if (!info) return null;
        return {
          hash: tx.hash,
          token: info.symbol,
          amount: fromWei(tx.value, info.decimals),
          type: tx.to?.toLowerCase() === lowerAddr ? 'in' : 'out',
          counterparty: tx.to?.toLowerCase() === lowerAddr ? tx.from : tx.to,
          timestamp: parseInt(tx.timeStamp, 10) * 1000,
        };
      })
      .filter(Boolean);

    // Same tx hash can produce both a top-level and an internal entry (e.g.
    // gas refund patterns) — dedupe by hash+token+type+amount so we don't
    // double-count the same movement.
    const seen = new Set();
    const allLegs = [...nativeTxs, ...internalTxs, ...tokenTxs].filter((tx) => {
      const key = `${tx.hash}-${tx.token}-${tx.type}-${tx.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Group legs by tx hash. A swap (even multi-hop, with several internal
    // POL legs) nets out to one token going out and a different token coming
    // in on the same hash — collapse that into a single "swap" entry instead
    // of showing every intermediate hop.
    const byHash = new Map();
    for (const leg of allLegs) {
      if (!byHash.has(leg.hash)) byHash.set(leg.hash, []);
      byHash.get(leg.hash).push(leg);
    }

    const grouped = [];
    for (const [hash, legs] of byHash) {
      const netByToken = {};
      for (const leg of legs) {
        const signed = (leg.type === 'in' ? 1 : -1) * parseFloat(leg.amount);
        netByToken[leg.token] = (netByToken[leg.token] || 0) + signed;
      }
      const tokensInvolved = Object.keys(netByToken).filter((t) => Math.abs(netByToken[t]) > 0.0000001);
      const outToken = tokensInvolved.find((t) => netByToken[t] < 0);
      const inToken = tokensInvolved.find((t) => netByToken[t] > 0);

      if (outToken && inToken && tokensInvolved.length === 2) {
        // Clean swap: exactly one token net-out, one token net-in.
        grouped.push({
          hash,
          type: 'swap',
          fromToken: outToken,
          fromAmount: Math.abs(netByToken[outToken]).toFixed(2),
          toToken: inToken,
          toAmount: Math.abs(netByToken[inToken]).toFixed(2),
          timestamp: legs[0].timestamp,
        });
      } else {
        // Not a simple two-token swap (plain send/receive, or a hash with
        // only same-token legs) — keep as-is, one row per leg.
        grouped.push(...legs);
      }
    }

    const merged = grouped
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ transactions: merged });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch transaction history from PolygonScan' });
  }
}
