// api/orders.js
// One serverless function for every paid order (KYC now, KYB and plans later),
// dispatched by ?action=create|status|check-payment|cancel. Kept as a single
// file on purpose: the Vercel Hobby plan caps a deployment at 12 functions
// and this is the last free slot.
//
// Security model:
//  - Every action requires a valid Supabase session (Bearer token).
//  - All reads/writes use the service role key, but every query is scoped
//    to the caller's own user id here. Clients never write to `orders` or
//    `order_payments` directly (RLS allows SELECT only).
//  - Prices come from PRICES below, never from the request.
//  - The finance wallet address comes from FINANCE_WALLET_ADDRESS (env) and
//    is snapshotted on each order as `pay_to_address`.
//
// Payment matching (no user-supplied tx hash required):
//  - Incoming native USDC transfers to the finance wallet are pulled from
//    Alchemy and stored in `order_payments` (unique per tx_hash + log_index).
//  - A transfer belongs to an order when it comes FROM the order's payer
//    address, or when its hash equals the order's claimed_tx_hash (a hash
//    the user supplied wins over the address).
//  - Transfers that match nothing stay `unmatched` for an admin to link.
//
// All amounts are handled as integer micro-USDC (BigInt) to avoid float drift.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
const FINANCE_WALLET = (process.env.FINANCE_WALLET_ADDRESS || '').toLowerCase();

const USDC_CONTRACT = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'; // native USDC (Circle), NOT USDC.e
const USDC_DECIMALS = 6;

// Price list in micro-USDC. Only KYC is open for now.
const PRICES = {
  kyc: 2_500_000n, // $2.50 one-time
};

const TOLERANCE = 50_000n; // $0.05 counts as fully paid
const ADDR_RE = /^0x[0-9a-f]{40}$/;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/;

const ACTIVE_STATUSES = ['awaiting_payment', 'underpaid'];
const CHECK_COOLDOWN_MS = 10_000;
const lastCheckAt = new Map(); // best-effort per-instance throttle, keyed by order id

// ---------------------------------------------------------------- helpers

function toMicro(value) {
  // numeric(18,6) comes back from PostgREST as a number or a string
  const [whole, frac = ''] = String(value).split('.');
  return BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
}

function fromMicro(micro) {
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}

function getAccessToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function getUser(req) {
  const token = getAccessToken(req);
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

async function db(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`Supabase ${method} ${path} failed (${r.status}): ${text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// Only these fields ever leave the server.
function publicOrder(o) {
  const amount = toMicro(o.amount_usdc);
  const paid = toMicro(o.paid_amount);
  const remaining = amount - paid > 0n ? amount - paid : 0n;
  return {
    id: o.id,
    order_no: o.order_no,
    type: o.type,
    amount_usdc: fromMicro(amount),
    paid_amount: fromMicro(paid),
    remaining_usdc: fromMicro(remaining),
    pay_method: o.pay_method,
    payer_address: o.payer_address,
    claimed_tx_hash: o.claimed_tx_hash,
    pay_to_address: o.pay_to_address,
    status: o.status,
    expires_at: o.expires_at,
    paid_at: o.paid_at,
    created_at: o.created_at,
  };
}

async function loadOwnOrder(orderId, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId || '')) return null;
  const rows = await db(`orders?id=eq.${orderId}&user_id=eq.${userId}&select=*&limit=1`);
  return rows[0] || null;
}

function configError() {
  if (!SERVICE_ROLE_KEY) return 'SUPABASE_SERVICE_ROLE_KEY is not configured';
  if (!ADDR_RE.test(FINANCE_WALLET)) return 'FINANCE_WALLET_ADDRESS is not configured';
  return null;
}

// ---------------------------------------------------------------- action=create

async function handleCreate(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, pay_method: payMethod } = req.body || {};
  let payerAddress = (req.body?.payer_address || '').trim().toLowerCase();

  if (!PRICES[type]) return res.status(400).json({ error: 'This order type is not available yet' });
  if (!['netlink_pay', 'external_wallet'].includes(payMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const profiles = await db(`profiles?id=eq.${user.id}&select=wallet_address,identity_verification_status&limit=1`);
  const profile = profiles[0];
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  if (type === 'kyc' && profile.identity_verification_status === 'approved') {
    return res.status(409).json({ error: 'Your identity is already verified' });
  }

  if (payMethod === 'netlink_pay') {
    // The sender is the user's own Netlink Pay wallet, read from the server side.
    payerAddress = (profile.wallet_address || '').toLowerCase();
    if (!ADDR_RE.test(payerAddress)) {
      return res.status(400).json({ error: 'Connect your Netlink Pay wallet first' });
    }
  } else if (!ADDR_RE.test(payerAddress)) {
    return res.status(400).json({ error: 'Enter a valid sender wallet address (0x...)' });
  }

  if (payerAddress === FINANCE_WALLET) {
    return res.status(400).json({ error: 'Sender address cannot be the receiving wallet' });
  }

  // One active order per user per type: hand back the existing one.
  const existing = await db(
    `orders?user_id=eq.${user.id}&type=eq.${type}&status=in.(${ACTIVE_STATUSES.join(',')})&select=*&limit=1`
  );
  if (existing[0]) {
    return res.status(200).json({ order: publicOrder(existing[0]), existing: true });
  }

  try {
    const rows = await db('orders', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        user_id: user.id,
        type,
        amount_usdc: fromMicro(PRICES[type]),
        pay_method: payMethod,
        payer_address: payerAddress,
        pay_to_address: FINANCE_WALLET,
      },
    });
    return res.status(201).json({ order: publicOrder(rows[0]), existing: false });
  } catch (err) {
    // orders_one_active_per_payer: another user is already paying from this address
    if (err.status === 409 && err.body?.includes('orders_one_active_per_payer')) {
      return res.status(409).json({ error: 'This sender address is already used by another open order' });
    }
    throw err;
  }
}

// ---------------------------------------------------------------- action=status

async function handleStatus(req, res, user) {
  const order = await loadOwnOrder(req.query.order_id, user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ order: publicOrder(order) });
}

// ---------------------------------------------------------------- action=cancel

async function handleCancel(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const order = await loadOwnOrder(req.body?.order_id, user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'awaiting_payment' || toMicro(order.paid_amount) > 0n) {
    return res.status(409).json({ error: 'This order can no longer be cancelled' });
  }
  const rows = await db(`orders?id=eq.${order.id}&status=eq.awaiting_payment`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status: 'cancelled' },
  });
  return res.status(200).json({ order: publicOrder(rows[0] || order) });
}

// ---------------------------------------------------------------- action=check-payment

// Pull the latest incoming native USDC transfers to the finance wallet.
async function fetchIncomingTransfers() {
  const r = await fetch(ALCHEMY_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getAssetTransfers',
      params: [{
        toAddress: FINANCE_WALLET,
        contractAddresses: [USDC_CONTRACT],
        category: ['erc20'],
        withMetadata: true,
        excludeZeroValue: true,
        order: 'desc',
        maxCount: '0x64',
      }],
    }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);

  return (data.result?.transfers || [])
    .map((t) => {
      const hash = (t.hash || '').toLowerCase();
      const logIndex = parseInt(String(t.uniqueId || '').split(':').pop(), 10);
      const raw = t.rawContract?.value;
      if (!TX_HASH_RE.test(hash) || !raw || !t.from) return null;
      return {
        tx_hash: hash,
        log_index: Number.isFinite(logIndex) ? logIndex : 0,
        from_address: t.from.toLowerCase(),
        to_address: FINANCE_WALLET,
        token_contract: USDC_CONTRACT,
        amount: fromMicro(BigInt(raw)),
        occurred_at: new Date(t.metadata?.blockTimestamp).toISOString(),
      };
    })
    .filter(Boolean);
}

async function handleCheckPayment(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ALCHEMY_API_KEY) return res.status(500).json({ error: 'Server misconfiguration' });

  let order = await loadOwnOrder(req.body?.order_id, user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (['paid', 'cancelled', 'refunded'].includes(order.status)) {
    return res.status(200).json({ order: publicOrder(order) });
  }

  const last = lastCheckAt.get(order.id) || 0;
  if (Date.now() - last < CHECK_COOLDOWN_MS) {
    return res.status(200).json({ order: publicOrder(order), throttled: true });
  }
  lastCheckAt.set(order.id, Date.now());

  const now = Date.now();
  const expiresAt = new Date(order.expires_at).getTime();

  // Optional tx hash from the user (for exchange withdrawals). Hash wins over address.
  const claimed = (req.body?.tx_hash || '').trim().toLowerCase();
  if (claimed) {
    if (!TX_HASH_RE.test(claimed)) return res.status(400).json({ error: 'Invalid transaction hash' });
    const taken = await db(`orders?claimed_tx_hash=eq.${claimed}&id=neq.${order.id}&select=id&limit=1`);
    if (taken[0]) return res.status(409).json({ error: 'This transaction hash is already used by another order' });
    if (order.claimed_tx_hash !== claimed) {
      const rows = await db(`orders?id=eq.${order.id}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { claimed_tx_hash: claimed },
      });
      order = rows[0] || order;
    }
  }

  // 1. Record every transfer we can see (duplicates are ignored).
  const transfers = await fetchIncomingTransfers();
  if (transfers.length) {
    await db('order_payments?on_conflict=tx_hash,log_index', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: transfers,
    });
  }

  // 2. Claim unassigned transfers that belong to this order.
  const since = new Date(new Date(order.created_at).getTime() - 60_000).toISOString();
  const filters = [`from_address.eq.${order.payer_address}`];
  if (order.claimed_tx_hash) filters.push(`tx_hash.eq.${order.claimed_tx_hash}`);
  const candidates = await db(
    `order_payments?order_id=is.null&match_status=eq.unmatched&occurred_at=gte.${since}` +
      `&or=(${filters.join(',')})&select=id,occurred_at`
  );
  for (const c of candidates) {
    const isLate = new Date(c.occurred_at).getTime() > expiresAt;
    // order_id=is.null in the filter makes the claim atomic: a transfer can only be taken once.
    await db(`order_payments?id=eq.${c.id}&order_id=is.null`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { order_id: order.id, match_status: isLate ? 'late' : 'matched' },
    });
  }

  // 3. Recompute the order from its assigned transfers.
  const assigned = await db(`order_payments?order_id=eq.${order.id}&select=amount,match_status`);
  let onTime = 0n;
  let late = 0n;
  for (const p of assigned) {
    if (p.match_status === 'matched') onTime += toMicro(p.amount);
    else if (p.match_status === 'late') late += toMicro(p.amount);
  }
  const target = toMicro(order.amount_usdc) - TOLERANCE;

  const patch = { paid_amount: fromMicro(onTime) };
  if (onTime >= target) {
    patch.status = 'paid';
    patch.paid_at = new Date().toISOString();
  } else if (onTime + late >= target) {
    patch.status = 'late_payment'; // arrived after expiry: an admin decides
  } else if (onTime > 0n) {
    patch.status = 'underpaid';
  } else if (order.status === 'awaiting_payment' && now > expiresAt) {
    patch.status = 'expired';
  }

  const updated = await db(`orders?id=eq.${order.id}&status=in.(awaiting_payment,underpaid,expired,late_payment)`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });

  return res.status(200).json({ order: publicOrder(updated[0] || order) });
}

// ---------------------------------------------------------------- dispatcher

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = configError();
  if (cfg) {
    console.error('orders:', cfg);
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to continue' });

    const action = req.query.action;
    if (action === 'create') return await handleCreate(req, res, user);
    if (action === 'status') return await handleStatus(req, res, user);
    if (action === 'check-payment') return await handleCheckPayment(req, res, user);
    if (action === 'cancel') return await handleCancel(req, res, user);
    return res.status(400).json({ error: 'Invalid or missing action (expected create, status, check-payment, or cancel)' });
  } catch (err) {
    console.error('orders: unhandled error', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
