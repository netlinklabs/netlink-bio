// api/tx-gas-fee.js
// Looks up the real gas fee for any transaction hash via PolygonScan's paid
// API — the same reliable source already used for syncing incoming
// transactions — instead of guessing from Sequence WaaS's receipt (which
// doesn't seem to include gas data) or a public RPC node that may not have
// caught up to a very-fresh transaction yet. Works identically for send,
// receive, and swap.

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
const POLYGON_CHAIN_ID = 137;

export default async function handler(req, res) {
  const hash = (req.query.hash || '').trim();

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    res.status(400).json({ error: 'Invalid or missing transaction hash' });
    return;
  }
  if (!POLYGONSCAN_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing PolygonScan API key' });
    return;
  }

  try {
    const url = `${ETHERSCAN_V2_BASE}?${new URLSearchParams({
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: hash,
      chainid: POLYGON_CHAIN_ID,
      apikey: POLYGONSCAN_API_KEY,
    })}`;

    const apiRes = await fetch(url);
    const data = await apiRes.json();
    const receipt = data.result;

    // Transaction not indexed yet (very fresh) — tell the caller so it can
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

    // Safe to cache once found — a mined transaction's gas fee never changes.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ gasFee, pending: false });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch gas fee from PolygonScan' });
  }
}
