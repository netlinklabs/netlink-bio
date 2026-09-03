// api/wallet-balance.js
// Proxies Alchemy JSON-RPC calls server-side so the API key never appears
// in client-side code, and so we can combine 3 lookups (POL, NET, USDC)
// into a single request from the dashboard.
// Migrated from PolygonScan/Etherscan V2 to Alchemy RPC — see CHANGELOG.
// Added: request timeout + 1 retry to avoid 10s hangs on slow/failed RPC calls.

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const NET_CONTRACT = '0x0e893B239094A5c573373d44CF1C7D03576b95cb';
const USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359'; // native USDC (Circle)
const BALANCE_OF_SELECTOR = '0x70a08231';

const RPC_TIMEOUT_MS = 6000;
const MAX_ATTEMPTS = 2; // 1 try + 1 retry

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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rpcBatchCall(requests) {
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(
        ALCHEMY_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requests),
        },
        RPC_TIMEOUT_MS
      );

      if (!res.ok) throw new Error(`Alchemy RPC request failed: ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Unexpected non-batch response from Alchemy');
      return data;
    } catch (err) {
      lastErr = err;
      const isTimeout = err.name === 'AbortError';
      console.error(`rpcBatchCall attempt ${attempt} failed:`, isTimeout ? 'timeout' : err.message);

      if (attempt < MAX_ATTEMPTS) {
        await sleep(300); // short backoff before retry
      }
    }
  }

  throw lastErr;
}

export default async function handler(req, res) {
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
    const responses = await rpcBatchCall([
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
