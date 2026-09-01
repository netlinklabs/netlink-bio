// api/wallet-balance.js
// Proxies Alchemy JSON-RPC calls server-side so the API key never appears
// in client-side code, and so we can combine 3 lookups (POL, NET, USDC)
// into a single request from the dashboard.
// Migrated from PolygonScan/Etherscan V2 to Alchemy RPC — see CHANGELOG.

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

async function rpcCall(method, params) {
  const res = await fetch(ALCHEMY_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy RPC request failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
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
    const [polResult, netResult, usdcResult] = await Promise.all([
      rpcCall('eth_getBalance', [address, 'latest']),
      rpcCall('eth_call', [{ to: NET_CONTRACT, data: balanceOfData(address) }, 'latest']),
      rpcCall('eth_call', [{ to: USDC_CONTRACT, data: balanceOfData(address) }, 'latest']),
    ]);

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
