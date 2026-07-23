// api/lifi-quote.js
// Proxies LI.FI quote requests server-side so the API key never appears
// in client-side code. Adds our integrator string + fee automatically.

const LIFI_API_KEY = process.env.LIFI_API_KEY;
const LIFI_BASE = 'https://li.quest/v1/quote';

const INTEGRATOR = 'netlink-pay';
const LIFI_FEE_PERCENT = 0.005; // 0.5% — ubah di sini kalau mau beda

// Native POL uses this placeholder address on LI.FI's API (standard across
// most aggregators for native gas tokens).
const NATIVE_POL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const POLYGON_CHAIN_ID = 137;

const TOKEN_ADDRESS = { POL: NATIVE_POL, USDC: USDC_CONTRACT };

export default async function handler(req, res) {
  const { fromToken, toToken, fromAmount, fromAddress } = req.query;

  if (!fromToken || !toToken || !fromAmount || !fromAddress) {
    res.status(400).json({ error: 'Missing required params: fromToken, toToken, fromAmount, fromAddress' });
    return;
  }
  if (!TOKEN_ADDRESS[fromToken] || !TOKEN_ADDRESS[toToken]) {
    res.status(400).json({ error: 'Only POL and USDC are supported right now' });
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(fromAddress)) {
    res.status(400).json({ error: 'Invalid fromAddress' });
    return;
  }
  if (!LIFI_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing LI.FI API key' });
    return;
  }

  const params = new URLSearchParams({
    fromChain: POLYGON_CHAIN_ID,
    toChain: POLYGON_CHAIN_ID,
    fromToken: TOKEN_ADDRESS[fromToken],
    toToken: TOKEN_ADDRESS[toToken],
    fromAmount,
    fromAddress,
    integrator: INTEGRATOR,
    fee: LIFI_FEE_PERCENT,
    slippage: 0.005, // 0.5%
  });

  try {
    const lifiRes = await fetch(`${LIFI_BASE}?${params}`, {
      headers: { 'x-lifi-api-key': LIFI_API_KEY },
    });
    const data = await lifiRes.json();

    if (!lifiRes.ok) {
      res.status(lifiRes.status).json({ error: data.message || 'LI.FI quote failed' });
      return;
    }

    // Only forward what the frontend actually needs — keeps the response
    // small and avoids leaking internal routing details unnecessarily.
    res.status(200).json({
      toAmount: data.estimate.toAmount,
      toAmountMin: data.estimate.toAmountMin,
      approvalAddress: data.estimate.approvalAddress,
      executionDuration: data.estimate.executionDuration,
      feeCosts: data.estimate.feeCosts,
      gasCosts: data.estimate.gasCosts,
      transactionRequest: data.transactionRequest,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch quote from LI.FI' });
  }
}
