// api/pol-price.js
// Proxies Alchemy Prices API server-side so the API key never appears in
// client-side code. Returns POL price in USD, used to convert the POL
// balance shown in pay.html into the user's local currency.
// Reuses the same ALCHEMY_API_KEY already used by api/wallet.js.

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_PRICES_URL = `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/by-symbol?symbols=POL`;

const REQUEST_TIMEOUT_MS = 4000; // kept low: Vercel Hobby plan caps function duration at 10s total
const MAX_ATTEMPTS = 2; // 1 try + 1 retry

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

async function fetchPolPrice() {
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(ALCHEMY_PRICES_URL, {}, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`Alchemy Prices API request failed: ${res.status}`);

      const data = await res.json();
      const entry = data?.data?.find((t) => t.symbol === 'POL');
      const usdPrice = entry?.prices?.find((p) => p.currency === 'usd')?.value;
      if (!usdPrice) throw new Error('No USD price found for POL in Alchemy response');

      return parseFloat(usdPrice);
    } catch (err) {
      lastErr = err;
      const isTimeout = err.name === 'AbortError';
      console.error(`fetchPolPrice attempt ${attempt} failed:`, isTimeout ? 'timeout' : err.message);

      if (attempt < MAX_ATTEMPTS) {
        await sleep(300);
      }
    }
  }

  throw lastErr;
}

// Merged from api/trails-config.js (Vercel Hobby allows max 12 functions).
// /api/trails-config is rewritten to /api/pol-price?action=trails-config in vercel.json.
// Serves the Trails client key from env; the key is public by design, restrict it by domain in the Trails dashboard.
function trailsConfig(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const apiKey = process.env.TRAILS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfiguration: missing Trails API key' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ apiKey });
}

export default async function handler(req, res) {
  if (req.query && req.query.action === 'trails-config') return trailsConfig(req, res);
  if (!ALCHEMY_API_KEY) {
    res.status(500).json({ error: 'Server misconfiguration: missing Alchemy API key' });
    return;
  }

  try {
    const priceUsd = await fetchPolPrice();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ pol_usd: priceUsd });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch POL price' });
  }
}
