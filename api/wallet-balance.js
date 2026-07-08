// api/wallet-balance.js
// Proxies PolygonScan API calls server-side so the API key never appears
// in client-side code, and so we can combine 3 lookups (POL, NET, USDC)
// into a single request from the dashboard.

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
// PolygonScan's old standalone API (api.polygonscan.com) was fully retired on
// August 15, 2025. All explorers (Etherscan, PolygonScan, BscScan, etc.) now
// share one unified endpoint, distinguished by a `chainid` parameter.
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const POLYGON_CHAIN_ID = 137;

const NET_CONTRACT = '0x0e893B239094A5c573373d44CF1C7D03576b95cb';
const USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359'; // native USDC (Circle)

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
    const [polRes, netRes, usdcRes] = await Promise.all([
      polygonscanGet({ module: 'account', action: 'balance', address, tag: 'latest' }),
      polygonscanGet({ module: 'account', action: 'tokenbalance', contractaddress: NET_CONTRACT, address, tag: 'latest' }),
      polygonscanGet({ module: 'account', action: 'tokenbalance', contractaddress: USDC_CONTRACT, address, tag: 'latest' }),
    ]);

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      pol: fromWei(polRes.result, 18),
      net: fromWei(netRes.result, 18),
      usdc: fromWei(usdcRes.result, 6),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch balances from PolygonScan' });
  }
}

