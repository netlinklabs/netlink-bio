// api/transfi-order-status.js
// Fallback for when TransFi's webhook doesn't arrive (seen in sandbox
// testing). Called from pay2.html right after the user is redirected back
// with ?tx=complete -- polls TransFi's Get Order Status endpoint directly
// and updates fiat_orders itself, instead of only waiting on the webhook.
// Only ever returns/updates orders that belong to the requesting user.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TRANSFI_API_KEY = process.env.TRANSFI_API_KEY;
const TRANSFI_API_SECRET = process.env.TRANSFI_API_SECRET;
const TRANSFI_MID = process.env.TRANSFI_MID;
const TRANSFI_BASE = 'https://sandbox-api.transfi.com'; // sandbox for now

function transfiAuthHeaders() {
  const basic = Buffer.from(`${TRANSFI_API_KEY}:${TRANSFI_API_SECRET}`).toString('base64');
  return { Accept: 'application/json', Authorization: `Basic ${basic}`, mid: TRANSFI_MID };
}

async function getAuthedUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getOwnedOrder(orderId, userId, accessToken) {
  // Uses the user's own token -- RLS (owner-only SELECT on fiat_orders)
  // makes sure this can only ever return an order that belongs to them.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/fiat_orders?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${userId}&select=order_id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function patchOrder(orderId, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fiat_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update fiat_orders (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!SERVICE_ROLE_KEY || !TRANSFI_API_KEY || !TRANSFI_API_SECRET || !TRANSFI_MID) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const authedUser = await getAuthedUser(accessToken);
  if (!authedUser) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const { orderId } = req.body || {};
  if (!orderId) {
    res.status(400).json({ error: 'Missing orderId' });
    return;
  }

  // Ownership check via the user's own token/RLS before we touch anything.
  const owned = await getOwnedOrder(orderId, authedUser.id, accessToken);
  if (!owned) {
    res.status(404).json({ error: 'Order not found for this account' });
    return;
  }

  try {
    const tfRes = await fetch(`${TRANSFI_BASE}/v3/orders/${encodeURIComponent(orderId)}`, {
      headers: transfiAuthHeaders(),
    });
    const tfBody = await tfRes.json().catch(() => ({}));
    if (!tfRes.ok) {
      throw new Error(tfBody.message || `TransFi status check failed (${tfRes.status})`);
    }
    const data = tfBody.data || tfBody;

    const updated = await patchOrder(orderId, {
      status: data.status || null,
      txn_hash: data.txnHash || null,
      raw_payload: data,
    });

    res.status(200).json({ status: updated?.status || data.status });
  } catch (err) {
    console.error('transfi-order-status failed:', err);
    res.status(502).json({ error: err.message || 'Failed to check order status' });
  }
}
