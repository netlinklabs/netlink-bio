// api/orders.js
// One serverless function for every paid order (KYC now, KYB and plans later),
// dispatched by ?action=create|status|check-payment|cancel|didit-session, plus admin-* actions
// (see api/_lib/admin.js). Kept as a single
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

import { notifyUser } from './_lib/notify.js';
import { emailUser, emailAdmin, invoiceMail, receiptMail, adminPaidMail, getUserEmail, sendMail, ambassadorThanksMail } from './_lib/mailer.js';
import { handleAdmin, isAdminAction } from './_lib/admin.js';
import { withStats } from './_lib/stats.js';
import { trackAlchemy } from './_lib/usage.js';

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
    emailUser(user.id, invoiceMail(rows[0]));
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

// ?order_id=<uuid> returns that order (404 if it is not the caller's).
// ?type=kyc returns the caller's most recent open or paid order of that type,
// or { order: null }, so the checkout page can resume instead of starting over.
async function handleStatus(req, res, user) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.query.order_id) {
    const order = await loadOwnOrder(req.query.order_id, user.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ order: publicOrder(order) });
  }

  const type = req.query.type;
  if (!PRICES[type]) return res.status(400).json({ error: 'Missing order_id or a valid type' });
  const rows = await db(
    `orders?user_id=eq.${user.id}&type=eq.${type}` +
      `&status=in.(awaiting_payment,underpaid,late_payment,paid)&select=*&order=created_at.desc&limit=1`
  );
  return res.status(200).json({ order: rows[0] ? publicOrder(rows[0]) : null });
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
  const transfersBody = JSON.stringify({
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
    });
  const r = await fetch(ALCHEMY_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: transfersBody,
  });
  trackAlchemy(transfersBody, r);
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

// Assigns transfers that belong to this order: sent from its payer address, or
// matching the hash the user supplied. Late ones (after expiry) are marked
// 'late' for an admin to decide. The claim is atomic (order_id=is.null).
async function claimTransfersForOrder(order) {
  const expiresAt = new Date(order.expires_at).getTime();
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
}

// Recomputes an order from its assigned transfers and saves the result. Used by
// the user's payment check and by the admin actions, so both follow the same
// rules. Returns the updated order row, or null if nothing changed (for example
// another request already settled it). Sends the in-app notification only when
// this call actually changed the order.
async function settleOrder(order, now = Date.now()) {
  const assigned = await db(`order_payments?order_id=eq.${order.id}&select=amount,match_status,tx_hash,occurred_at&order=occurred_at.desc`);
  let onTime = 0n;
  let late = 0n;
  let lastMatchedHash = null; // newest on-time transfer, shown as the receipt reference
  for (const p of assigned) {
    if (p.match_status === 'matched') {
      onTime += toMicro(p.amount);
      if (!lastMatchedHash) lastMatchedHash = p.tx_hash;
    } else if (p.match_status === 'late') late += toMicro(p.amount);
  }
  const target = toMicro(order.amount_usdc) - TOLERANCE;

  const patch = { paid_amount: fromMicro(onTime) };
  if (onTime >= target) {
    patch.status = 'paid';
    patch.paid_at = new Date().toISOString();
    patch.paid_tx_hash = lastMatchedHash;
  } else if (onTime + late >= target) {
    patch.status = 'late_payment'; // arrived after expiry: an admin decides
  } else if (onTime > 0n) {
    patch.status = 'underpaid';
  } else if (order.status === 'awaiting_payment' && now > new Date(order.expires_at).getTime()) {
    patch.status = 'expired';
  }

  const updated = await db(`orders?id=eq.${order.id}&status=in.(awaiting_payment,underpaid,expired,late_payment)`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });

  // In-app notifications, only when this call actually changed the order.
  const after = updated[0];
  if (after) {
    if (after.status === 'paid' && order.status !== 'paid') {
      await notifyUser(order.user_id, {
        type: 'kyc', icon: 'shield-check',
        title: 'Payment received',
        body: `We received ${fromMicro(toMicro(after.paid_amount))} USDC for order ${after.order_no}. You can start your verification now.`,
        link: `/checkout?order=${after.id}&n=paid`,
      });
      // Emails go out only on this transition, so repeated checks never resend.
      emailUser(order.user_id, receiptMail(after));
      getUserEmail(order.user_id).then((e) => emailAdmin(adminPaidMail(after, e)));
    } else if (after.status === 'underpaid' && toMicro(after.paid_amount) !== toMicro(order.paid_amount)) {
      const left = toMicro(after.amount_usdc) - toMicro(after.paid_amount);
      await notifyUser(order.user_id, {
        type: 'kyc', icon: 'shield-check',
        title: 'Partial payment received',
        body: `Order ${after.order_no} still needs ${fromMicro(left > 0n ? left : 0n)} USDC. Send the rest from the same wallet.`,
        link: `/checkout?order=${after.id}&n=partial-${toMicro(after.paid_amount)}`,
      });
    }
  }
  return updated[0] || null;
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
  await claimTransfersForOrder(order);

  // 3. Recompute the order from its assigned transfers.
  const settled = await settleOrder(order, now);
  return res.status(200).json({ order: publicOrder(settled || order) });
}

// ---------------------------------------------------------------- action=didit-session

// Creates (or resumes) the Didit verification session for a PAID kyc order.
// Limits protect the per-session Didit cost: 3 new sessions per rolling 24 h
// and 10 per order. vendor_data is the profile id, which is what
// api/webhooks/didit.js uses to attach the result to the user.
const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;
const DIDIT_SESSION_URL = 'https://verification.didit.me/v3/session/';
const SESSIONS_PER_DAY = 3;
const SESSIONS_PER_ORDER = 10;
const IDENTITY_CALLBACK = 'https://netlink.bio/identity';

async function handleDiditSession(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!DIDIT_API_KEY || !DIDIT_WORKFLOW_ID) {
    console.error('orders: DIDIT_API_KEY or DIDIT_WORKFLOW_ID is not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const order = await loadOwnOrder(req.body?.order_id, user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.type !== 'kyc') return res.status(400).json({ error: 'This order does not include verification' });
  if (order.status !== 'paid') return res.status(409).json({ error: 'Payment is not confirmed yet' });

  const profiles = await db(`profiles?id=eq.${user.id}&select=identity_verification_status&limit=1`);
  if (profiles[0]?.identity_verification_status === 'approved') {
    return res.status(409).json({ error: 'Your identity is already verified' });
  }

  const sessions = await db(
    `kyc_sessions?order_id=eq.${order.id}&select=didit_session_id,created_at&order=created_at.desc`
  );
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const today = sessions.filter((x) => new Date(x.created_at).getTime() > dayAgo).length;
  if (sessions.length >= SESSIONS_PER_ORDER) {
    return res.status(429).json({ error: 'Verification attempt limit reached. Please contact support.' });
  }
  if (today >= SESSIONS_PER_DAY) {
    return res.status(429).json({ error: 'Daily verification attempt limit reached. Please try again tomorrow.' });
  }

  const r = await fetch(DIDIT_SESSION_URL, {
    method: 'POST',
    headers: { 'x-api-key': DIDIT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow_id: DIDIT_WORKFLOW_ID,
      vendor_data: user.id,
      callback: IDENTITY_CALLBACK,
      metadata: { order_id: order.id, order_no: order.order_no },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.session_id || !data.url) {
    console.error('orders: Didit session failed', r.status, JSON.stringify(data).slice(0, 500));
    return res.status(502).json({ error: 'Could not start verification. Please try again in a moment.' });
  }

  // Didit returns the same unfinished session for the same vendor_data.
  // Only count it as a new attempt when we have not stored it yet.
  const known = sessions.some((x) => x.didit_session_id === data.session_id);
  if (!known) {
    await db('kyc_sessions', {
      method: 'POST',
      body: {
        order_id: order.id,
        user_id: user.id,
        didit_session_id: data.session_id,
        verification_url: data.url,
      },
    });
    if (!order.fulfilled_at) {
      await db(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { fulfilled_at: new Date().toISOString() } });
    }
  }

  return res.status(200).json({
    url: data.url,
    resumed: known,
    attempts_left: Math.max(0, Math.min(SESSIONS_PER_DAY - today - (known ? 0 : 1), SESSIONS_PER_ORDER - sessions.length - (known ? 0 : 1))),
  });
}

// ---------------------------------------------------------------- action=ambassador-thanks

// Thank-you email after an ambassador application. The recipient is always the
// signed-in user's own auth email, never an address sent by the client. Each
// application gets at most one email: thanks_emailed_at is claimed atomically
// before sending and released again if the send fails.
async function handleAmbassadorThanks(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!user.email) return res.status(200).json({ sent: false });

  const apps = await db(
    `ambassador_applications?user_id=eq.${user.id}&season=eq.pilot-1&select=id,country_code,track,status&limit=1`
  );
  const app = apps[0];
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const claimedAt = new Date().toISOString();
  const claimed = await db(
    `ambassador_applications?id=eq.${app.id}&status=eq.pending&thanks_emailed_at=is.null&select=id`,
    { method: 'PATCH', prefer: 'return=representation', body: { thanks_emailed_at: claimedAt } }
  );
  if (!claimed[0]) return res.status(200).json({ sent: false });

  const profiles = await db(`profiles?id=eq.${user.id}&select=display_name,username&limit=1`);
  const name = (profiles[0]?.display_name || profiles[0]?.username || '').trim();

  const ok = await sendMail({
    ...ambassadorThanksMail({ name, countryCode: app.country_code, track: app.track }),
    to: user.email,
  });
  if (!ok) {
    await db(`ambassador_applications?id=eq.${app.id}&thanks_emailed_at=eq.${encodeURIComponent(claimedAt)}`, {
      method: 'PATCH',
      body: { thanks_emailed_at: null },
    }).catch((err) => console.error('orders: could not release thanks claim', err));
  }
  return res.status(200).json({ sent: ok });
}

// ---------------------------------------------------------------- dispatcher

async function handler(req, res) {
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
    if (isAdminAction(action)) {
      return await handleAdmin(action, req, res, user, {
        db, toMicro, fromMicro, SUPABASE_URL, SERVICE_ROLE_KEY,
        fetchIncomingTransfers, claimTransfersForOrder, settleOrder,
      });
    }
    if (action === 'create') return await handleCreate(req, res, user);
    if (action === 'status') return await handleStatus(req, res, user);
    if (action === 'check-payment') return await handleCheckPayment(req, res, user);
    if (action === 'cancel') return await handleCancel(req, res, user);
    if (action === 'didit-session') return await handleDiditSession(req, res, user);
    if (action === 'ambassador-thanks') return await handleAmbassadorThanks(req, res, user);
    return res.status(400).json({ error: 'Invalid or missing action (expected create, status, check-payment, cancel, didit-session, or ambassador-thanks)' });
  } catch (err) {
    console.error('orders: unhandled error', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

export default withStats('orders', handler);
