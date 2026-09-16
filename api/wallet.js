// api/wallet.js
// Consolidates api/wallet-balance.js, api/wallet-transactions.js, and
// api/tx-gas-fee.js behind one file, dispatched by ?action=balance|
// transactions|gas -- Vercel Hobby plan caps a deployment at 12
// Serverless Functions, and the project was over that limit. Each
// action's request params, response shape, headers, and error handling
// are copied over unchanged from the original file; this is a routing
// consolidation only, not a behavior change.

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const NET_CONTRACT = '0x0e893B239094A5c573373d44CF1C7D03576b95cb';
const USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359'; // native USDC (Circle)
const BALANCE_OF_SELECTOR = '0x70a08231';

function fromWei(rawValue, decimals) {
  if (!rawValue) return '0.00';
  const value = BigInt(rawValue);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole}.${fractionStr}`;
}

function balanceOfData(address) {
  return BALANCE_OF_SELECTOR + address.slice(2).toLowerCase().padStart(64, '0');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== action=balance (ex api/wallet-balance.js) ====================
// Added: request timeout + 1 retry to avoid 10s hangs on slow/failed RPC calls.

const BALANCE_RPC_TIMEOUT_MS = 4000; // kept low: Vercel Hobby plan caps function duration at 10s total
const BALANCE_MAX_ATTEMPTS = 2; // 1 try + 1 retry

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function balanceRpcBatchCall(requests) {
  let lastErr;

  for (let attempt = 1; attempt <= BALANCE_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        ALCHEMY_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requests),
        },
        BALANCE_RPC_TIMEOUT_MS
      );

      if (!res.ok) throw new Error(`Alchemy RPC request failed: ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected non-batch response from Alchemy');
      return data;
    } catch (err) {
      lastErr = err;
      const isTimeout = err.name === 'AbortError';
      console.error(`rpcBatchCall attempt ${attempt} failed:`, isTimeout ? 'timeout' : err.message);

      if (attempt < BALANCE_MAX_ATTEMPTS) {
        await sleep(300); // short backoff before retry
      }
    }
  }

  throw lastErr;
}

async function handleBalance(req, res) {
  const address = (req.query.address || '').trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid or missing wallet address' });
    return;
  }
  if (!ALCHEMY_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing Alchemy API key' });
    return;
  }

  try {
    const responses = await balanceRpcBatchCall([
      { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] },
      { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: NET_CONTRACT, data: balanceOfData(address) }, 'latest'] },
      { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: USDC_CONTRACT, data: balanceOfData(address) }, 'latest'] },
    ]);

    const byId = new Map(responses.map((r) => [r.id, r]));
    const polRes = byId.get(1);
    const netRes = byId.get(2);
    const usdcRes = byId.get(3);

    for (const r of [polRes, netRes, usdcRes]) {
      if (!r) throw new Error('Missing response in Alchemy batch reply');
      if (r.error) throw new Error(r.error.message);
    }

    const polResult = polRes.result;
    const netResult = netRes.result;
    const usdcResult = usdcRes.result;

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      pol: fromWei(polResult, 18),
      net: fromWei(netResult, 18),
      usdc: fromWei(usdcResult, 6),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch wallet balances' });
  }
}

// ================= action=transactions (ex api/wallet-transactions.js) =================
// Fetches the last 20 Polygon transactions (native POL + ERC-20 transfers
// for NET & USDC) for a wallet address, merged and sorted by time, for the
// Netlink Pay transaction history widget.

const TOKEN_INFO = {
  '0x0e893b239094a5c573373d44cf1c7d03576b95cb': { symbol: 'NET', decimals: 18 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
};

// Sequence WaaS relayer fee address. Smart-contract wallet transactions often
// bundle a small separate POL transfer to this address (sponsorship/relayer
// fee) inside the SAME tx hash as a swap or send. It must be excluded from
// swap net-amount calculations, or the "swapped" amount ends up inflated by
// this unrelated fee.
const RELAYER_FEE_ADDRESS = '0x7e08701cc9194ef4ffd82421dd0d986d1b43d521';

// Alchemy's Transfers API doesn't include gasUsed/gasPrice per transfer (unlike
// PolygonScan's txlist/tokentx), so gas fee is no longer computed here. Each
// transaction's `gasFee` is always null -- tx.html's fetchAndPersistGasFee()
// already fetches it fresh from /api/wallet?action=gas (also Alchemy-based)
// when the receipt modal opens and gas_fee is missing in the database, so
// this is safe.

async function transactionsRpcBatchCall(requests, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ALCHEMY_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });
      if (!res.ok) throw new Error(`Alchemy RPC request failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected non-batch response from Alchemy');

      const errorItem = data.find((r) => r.error);
      if (!errorItem || attempt === retries) return data;
      lastErr = new Error(errorItem.error.message);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw lastErr;
    }
    await sleep(400 * attempt);
  }
}

async function handleTransactions(req, res) {
  const address = (req.query.address || '').trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid or missing wallet address' });
    return;
  }
  if (!ALCHEMY_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing Alchemy API key' });
    return;
  }

  try {
    const lowerAddr = address.toLowerCase();
    const transferParams = {
      category: ['external', 'internal', 'erc20'],
      contractAddresses: [NET_CONTRACT, USDC_CONTRACT],
      withMetadata: true,
      excludeZeroValue: true,
      order: 'desc',
      maxCount: '0x32',
    };

    const responses = await transactionsRpcBatchCall([
      { jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [{ fromAddress: address, ...transferParams }] },
      { jsonrpc: '2.0', id: 2, method: 'alchemy_getAssetTransfers', params: [{ toAddress: address, ...transferParams }] },
    ]);

    const byId = new Map(responses.map((r) => [r.id, r]));
    const outRes = byId.get(1);
    const inRes = byId.get(2);
    for (const r of [outRes, inRes]) {
      if (!r) throw new Error('Missing response in Alchemy batch reply');
      if (r.error) throw new Error(r.error.message);
    }

    const rawTransfers = [...(outRes.result?.transfers || []), ...(inRes.result?.transfers || [])];

    // The same transfer can appear in both the fromAddress and toAddress
    // results if this wallet is on both sides of it -- dedupe on Alchemy's
    // own uniqueId rather than building a manual key.
    const seenIds = new Set();
    const uniqueTransfers = rawTransfers.filter((t) => {
      if (seenIds.has(t.uniqueId)) return false;
      seenIds.add(t.uniqueId);
      return true;
    });

    const allLegs = uniqueTransfers
      .map((t) => {
        let token, decimals;
        if (t.category === 'erc20') {
          const info = TOKEN_INFO[t.rawContract?.address?.toLowerCase()];
          if (!info) return null;
          token = info.symbol;
          decimals = info.decimals;
        } else {
          token = 'POL';
          decimals = 18;
        }

        const isIn = t.to?.toLowerCase() === lowerAddr;
        return {
          hash: t.hash,
          token,
          amount: fromWei(t.rawContract?.value, decimals),
          type: isIn ? 'in' : 'out',
          counterparty: isIn ? t.from : t.to,
          timestamp: new Date(t.metadata?.blockTimestamp).getTime(),
          gasFee: null,
        };
      })
      .filter(Boolean)
      .filter((leg) => leg.counterparty?.toLowerCase() !== RELAYER_FEE_ADDRESS);

    // Group legs by tx hash. A swap (even multi-hop, with several internal
    // POL legs) nets out to one token going out and a different token coming
    // in on the same hash -- collapse that into a single "swap" entry instead
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
        // only same-token legs) -- keep as-is, one row per leg.
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
    res.status(502).json({ error: 'Failed to fetch transaction history' });
  }
}

// ==================== action=gas (ex api/tx-gas-fee.js) ====================
// Looks up the real gas fee for any transaction hash via Alchemy's Polygon
// Mainnet JSON-RPC. Works identically for send, receive, and swap.

async function handleGas(req, res) {
  const hash = (req.query.hash || '').trim();

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    res.status(400).json({ error: 'Invalid or missing transaction hash' });
    return;
  }
  if (!ALCHEMY_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing Alchemy API key' });
    return;
  }

  try {
    const apiRes = await fetch(ALCHEMY_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
    });
    const data = await apiRes.json();
    const receipt = data.result;

    // Transaction not indexed yet (very fresh) -- tell the caller so it can
    // retry shortly, rather than silently caching an empty result.
    if (!receipt || !receipt.gasUsed) {
      res.status(200).json({ gasFee: null, pending: true });
      return;
    }

    const gasPrice = receipt.effectiveGasPrice || receipt.gasPrice;
    if (!gasPrice) {
      res.status(200).json({ gasFee: null, pending: true });
      return;
    }

    const feeWei = BigInt(receipt.gasUsed) * BigInt(gasPrice);
    const divisor = 10n ** 18n;
    const whole = feeWei / divisor;
    const frac = feeWei % divisor;
    const gasFee = `${whole}.${frac.toString().padStart(18, '0').slice(0, 6)}`;

    // Safe to cache once found -- a mined transaction's gas fee never changes.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ gasFee, pending: false });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch gas fee' });
  }
}

export default async function handler(req, res) {
  const action = req.query.action;
  if (action === 'balance') return handleBalance(req, res);
  if (action === 'transactions') return handleTransactions(req, res);
  if (action === 'gas') return handleGas(req, res);
  res.status(400).json({ error: 'Invalid or missing action (expected balance, transactions, or gas)' });
}
