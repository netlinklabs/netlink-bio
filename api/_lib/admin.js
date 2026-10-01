// api/_lib/admin.js
// Admin actions for orders, served through api/orders.js (?action=admin-*).
// Lives in _lib so it does not count toward the Vercel Hobby 12-function cap.
//
// Security model:
//  - The caller must be signed in (checked by api/orders.js) AND have an active
//    row in public.admin_users with a role allowed for the action. Roles are
//    checked here on the server on every call, never trusted from the page.
//  - Reads and writes use the service role, so every action is scoped in code.
//  - Every write is recorded in public.admin_audit_log (append-only).
//  - kyc_reviewer sees only kyc/kyb orders and never sees payments or wallets
//    of the finance flow; support is read-only on orders.
//  - Admin roles are never changed from here (SQL by super_admin only).
//  - MFA (AAL2) is not enforced yet; add it here before opening admin to more people.

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ORDER_STATUSES = ['awaiting_payment', 'underpaid', 'paid', 'expired', 'late_payment', 'cancelled', 'refunded'];
const SETTLEABLE = ['awaiting_payment', 'underpaid', 'expired', 'late_payment'];

import { sendMail, invoiceMail } from './mailer.js';
import { usageSummary } from './usage.js';
const SAMPLE_ADDR = '0x0000000000000000000000000000000000000000';

const READ_ROLES = ['super_admin', 'finance', 'support', 'kyc_reviewer'];
const FINANCE_ROLES = ['super_admin', 'finance'];

const ACTION_ROLES = {
  'admin-me': null, // any signed-in user; returns an empty role list for non-admins
  'admin-overview': FINANCE_ROLES,
  'admin-usage': FINANCE_ROLES,
  'admin-orders': READ_ROLES,
  'admin-order': READ_ROLES,
  'admin-payments': FINANCE_ROLES,
  'admin-sync': FINANCE_ROLES,
  'admin-link-payment': FINANCE_ROLES,
  'admin-ignore-payment': FINANCE_ROLES,
  'admin-accept-late': FINANCE_ROLES,
  'admin-audit': ['super_admin'],
  'admin-test-email': ['super_admin'],
};

export function isAdminAction(action) {
  return Object.prototype.hasOwnProperty.call(ACTION_ROLES, action);
}

function clampLimit(v, def = 50, max = 100) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
}

function cleanNote(v, max = 500) {
  return String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Exact row count of public.wallet_transactions for a PostgREST filter (HEAD request, no rows
// transferred). Used for the on-chain verification summary in the admin overview.
async function countWalletTx(SUPABASE_URL, SERVICE_ROLE_KEY, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/wallet_transactions?select=id&${filter}`, {
    method: 'HEAD',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: 'count=exact' },
  });
  if (!r.ok) throw new Error(`count failed ${r.status}`);
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  if (!m) throw new Error('count missing');
  return Number(m[1]);
}

// All-time summary of the daily on-chain checks (api/_lib/verify-wallet-tx.js and
// api/_lib/verify-wallet-amount.js). `flagged` is rows that hit MAX_ATTEMPTS there (not found on
// Polygon, or reverted on-chain). The amount_* figures count verified rows by the result of the
// amount comparison; amount_pending is verified rows not compared yet. Returns null on any error
// so a problem here never breaks the rest of the overview.
async function onchainSummary(SUPABASE_URL, SERVICE_ROLE_KEY) {
  try {
    const ok = 'status=eq.success';
    const count = (f) => countWalletTx(SUPABASE_URL, SERVICE_ROLE_KEY, f);
    const [total, verified, flagged, notSeen, amountMatch, amountMismatch, amountUnchecked] = await Promise.all([
      count(ok),
      count(`${ok}&onchain_verified=eq.true`),
      count(`${ok}&onchain_verified=eq.false&onchain_check_attempts=gte.5`),
      count(`${ok}&onchain_verified=eq.true&onchain_check_note=ilike.*not%20seen*`),
      count(`${ok}&onchain_amount_status=eq.match`),
      count(`${ok}&onchain_amount_status=eq.mismatch`),
      count(`${ok}&onchain_amount_status=eq.unchecked`),
    ]);
    return {
      total, verified, flagged, not_seen: notSeen, pending: Math.max(0, total - verified - flagged),
      amount_match: amountMatch, amount_mismatch: amountMismatch, amount_unchecked: amountUnchecked,
      amount_pending: Math.max(0, verified - amountMatch - amountMismatch - amountUnchecked),
    };
  } catch (err) {
    console.error('onchain summary failed', err.message);
    return null;
  }
}

export async function handleAdmin(action, req, res, user, ctx) {
  const { db, toMicro, fromMicro, SUPABASE_URL, SERVICE_ROLE_KEY } = ctx;
  res.setHeader('Cache-Control', 'no-store');

  // ---- who is this, and what may they do
  const roleRows = await db(`admin_users?user_id=eq.${user.id}&is_active=eq.true&select=role`);
  const roles = roleRows.map((r) => r.role);
  const allowed = ACTION_ROLES[action];
  if (action === 'admin-me') {
    const out = { roles };
    if (roles.some((r) => FINANCE_ROLES.includes(r))) {
      const open = await db('order_payments?match_status=in.(unmatched,late)&order_id=is.null&select=id&limit=100');
      out.unmatched_payments = open.length;
    }
    return res.status(200).json(out);
  }
  const usedRole = allowed.find((r) => roles.includes(r));
  if (!usedRole) return res.status(403).json({ error: 'You do not have access to this action' });
  const seesAllTypes = roles.some((r) => ['super_admin', 'finance', 'support'].includes(r));
  const canSeePayments = roles.some((r) => FINANCE_ROLES.includes(r));

  const audit = (act, orderId, detail) =>
    db('admin_audit_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { admin_id: user.id, admin_role: usedRole, action: act, order_id: orderId || null, detail: detail || {} },
    }).catch((e) => console.error('admin: audit log write failed', act, e.message));

  const adminOrder = (o, p) => ({
    id: o.id,
    order_no: o.order_no,
    type: o.type,
    status: o.status,
    amount_usdc: fromMicro(toMicro(o.amount_usdc)),
    paid_amount: fromMicro(toMicro(o.paid_amount)),
    pay_method: o.pay_method,
    payer_address: o.payer_address,
    paid_tx_hash: o.paid_tx_hash,
    expires_at: o.expires_at,
    paid_at: o.paid_at,
    fulfilled_at: o.fulfilled_at,
    created_at: o.created_at,
    meta: o.meta && (o.meta.test || o.meta.comped) ? { test: !!o.meta.test, comped: !!o.meta.comped } : {},
    user: p ? { username: p.username, display_name: p.display_name, identity_status: p.identity_verification_status } : null,
  });

  const adminPayment = (p, orderNo) => ({
    id: p.id,
    tx_hash: p.tx_hash,
    from_address: p.from_address,
    amount: fromMicro(toMicro(p.amount)),
    occurred_at: p.occurred_at,
    match_status: p.match_status,
    order_id: p.order_id,
    order_no: orderNo || null,
    admin_note: p.admin_note,
  });

  // ---------------------------------------------------------- admin-overview
  // One SQL function (public.admin_overview) does all the counting on the database side.
  // Supabase Free plan limits are constants here; update them if the plan changes.
  if (action === 'admin-overview') {
    const range = ['today', '7d', '30d', '1y', 'month', 'year'].includes(req.query.range) ? req.query.range : '7d';
    // month = YYYY-MM, year = YYYY (calendar periods used by the printable report)
    const period = String(req.query.period || '');
    if (range === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ error: 'Invalid month' });
    if (range === 'year' && !/^\d{4}$/.test(period)) return res.status(400).json({ error: 'Invalid year' });
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_overview`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_range: range, p_period: range === 'month' || range === 'year' ? period : null }),
    });
    if (!rows.ok) {
      console.error('admin-overview rpc failed', rows.status, await rows.text().catch(() => ''));
      return res.status(500).json({ error: 'Could not load the overview' });
    }
    const data = await rows.json();
    data.limits = { db_bytes: 500 * 1024 * 1024, storage_bytes: 1024 * 1024 * 1024, plan: 'Supabase Free' };
    if (data.pay) data.pay.onchain = await onchainSummary(SUPABASE_URL, SERVICE_ROLE_KEY);
    // Growth series for the printed report charts (total users per bucket, volume rows per bucket).
    // Optional: if this call fails the overview still loads and the report skips those two charts.
    try {
      const unit = data.unit === 'hour' || data.unit === 'month' ? data.unit : 'day';
      const g = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_growth_series`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_unit: unit, p_buckets: data.buckets || [] }),
      });
      if (g.ok) {
        const gd = await g.json();
        if (data.users) data.users.series_total = gd.users_cum || null;
        if (data.pay) data.pay.tx_volume_series = gd.tx_volume || null;
      } else console.error('admin_growth_series failed', g.status);
    } catch (e) { console.error('admin_growth_series error', e.message); }
    return res.status(200).json(data);
  }

  // ---------------------------------------------------------- admin-usage
  // Third party usage against plan limits (api/_lib/usage.js). Not range based, and kept out of
  // the printable report. Each source fails on its own (null), so one problem hides one tile only.
  if (action === 'admin-usage') {
    return res.status(200).json(await usageSummary());
  }

  // ---------------------------------------------------------- admin-orders
  if (action === 'admin-orders') {
    const status = req.query.status;
    const q = String(req.query.q || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 20);
    let filter = '';
    if (status && ORDER_STATUSES.includes(status)) filter += `&status=eq.${status}`;
    if (q) filter += `&order_no=ilike.*${q}*`;
    if (!seesAllTypes) filter += '&type=in.(kyc,kyb)';
    const orders = await db(`orders?select=*&order=created_at.desc&limit=${clampLimit(req.query.limit)}${filter}`);
    const ids = [...new Set(orders.map((o) => o.user_id))];
    const profiles = ids.length
      ? await db(`profiles?id=in.(${ids.join(',')})&select=id,username,display_name,identity_verification_status`)
      : [];
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    return res.status(200).json({ orders: orders.map((o) => adminOrder(o, byId[o.user_id])) });
  }

  // ---------------------------------------------------------- admin-order
  if (action === 'admin-order') {
    const id = req.query.order_id;
    if (!UUID_RE.test(id || '')) return res.status(400).json({ error: 'Invalid order id' });
    const rows = await db(`orders?id=eq.${id}&select=*&limit=1`);
    const o = rows[0];
    if (!o || (!seesAllTypes && !['kyc', 'kyb'].includes(o.type))) return res.status(404).json({ error: 'Order not found' });

    const [profiles, sessions, verifs, authUser] = await Promise.all([
      db(`profiles?id=eq.${o.user_id}&select=username,display_name,identity_verification_status,wallet_address&limit=1`),
      db(`kyc_sessions?order_id=eq.${o.id}&select=didit_session_id,created_at&order=created_at.desc`),
      db(`verifications?profile_id=eq.${o.user_id}&kind=eq.identity&select=status,raw_status,provider_session_id,created_at&order=created_at.desc&limit=10`),
      fetch(`${SUPABASE_URL}/auth/v1/admin/users/${o.user_id}`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const p = profiles[0] || null;
    const out = {
      order: adminOrder(o, p),
      email: authUser?.email || null,
      wallet_address: p?.wallet_address || null,
      sessions,
      verifications: verifs,
    };
    if (canSeePayments) {
      const pays = await db(`order_payments?order_id=eq.${o.id}&select=*&order=occurred_at.desc`);
      out.payments = pays.map((x) => adminPayment(x, o.order_no));
    }
    return res.status(200).json(out);
  }

  // ---------------------------------------------------------- admin-payments
  if (action === 'admin-payments') {
    const st = ['unmatched', 'late', 'ignored', 'matched'].includes(req.query.status) ? req.query.status : 'unmatched';
    const pays = await db(`order_payments?match_status=eq.${st}&select=*&order=occurred_at.desc&limit=${clampLimit(req.query.limit)}`);
    const oids = [...new Set(pays.map((x) => x.order_id).filter(Boolean))];
    const orders = oids.length ? await db(`orders?id=in.(${oids.join(',')})&select=id,order_no`) : [];
    const noById = Object.fromEntries(orders.map((o) => [o.id, o.order_no]));
    return res.status(200).json({ payments: pays.map((x) => adminPayment(x, noById[x.order_id])) });
  }

  // ---------------------------------------------------------- admin-sync
  // Pulls the latest incoming USDC transfers, records them, then tries to match every open order.
  if (action === 'admin-sync') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const transfers = await ctx.fetchIncomingTransfers();
    if (transfers.length) {
      await db('order_payments?on_conflict=tx_hash,log_index', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        body: transfers,
      });
    }
    const open = await db('orders?status=in.(awaiting_payment,underpaid)&select=*&limit=100');
    let changed = 0;
    for (const o of open) {
      await ctx.claimTransfersForOrder(o);
      const after = await ctx.settleOrder(o);
      if (after && after.status !== o.status) changed += 1;
    }
    const left = await db('order_payments?match_status=in.(unmatched,late)&order_id=is.null&select=id&limit=100');
    await audit('sync', null, { transfers_seen: transfers.length, open_orders: open.length, orders_changed: changed });
    return res.status(200).json({ transfers_seen: transfers.length, open_orders: open.length, orders_changed: changed, unmatched_payments: left.length });
  }

  // ---------------------------------------------------------- admin-link-payment
  if (action === 'admin-link-payment') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { payment_id: paymentId, order_id: orderId } = req.body || {};
    const note = cleanNote(req.body?.note);
    if (!UUID_RE.test(paymentId || '') || !UUID_RE.test(orderId || '')) return res.status(400).json({ error: 'Invalid payment or order id' });
    if (!note) return res.status(400).json({ error: 'A note is required' });

    const [pays, orders] = await Promise.all([
      db(`order_payments?id=eq.${paymentId}&select=*&limit=1`),
      db(`orders?id=eq.${orderId}&select=*&limit=1`),
    ]);
    const pay = pays[0];
    const order = orders[0];
    if (!pay || !order) return res.status(404).json({ error: 'Payment or order not found' });
    if (pay.order_id) return res.status(409).json({ error: 'This payment is already linked to an order' });
    if (!SETTLEABLE.includes(order.status)) {
      return res.status(409).json({ error: 'This order can no longer receive payments. Handle it as a refund or credit.' });
    }
    // order_id=is.null keeps the claim atomic if two admins act at once.
    const claimed = await db(`order_payments?id=eq.${pay.id}&order_id=is.null`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { order_id: order.id, match_status: 'matched', admin_note: note },
    });
    if (!claimed[0]) return res.status(409).json({ error: 'This payment was just linked by someone else' });
    const after = await ctx.settleOrder(order);
    await audit('link_payment', order.id, { payment_id: pay.id, tx_hash: pay.tx_hash, amount: pay.amount, note, order_status: after?.status || order.status });
    return res.status(200).json({ order: adminOrder(after || order, null) });
  }

  // ---------------------------------------------------------- admin-ignore-payment
  if (action === 'admin-ignore-payment') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const paymentId = req.body?.payment_id;
    const note = cleanNote(req.body?.note);
    if (!UUID_RE.test(paymentId || '')) return res.status(400).json({ error: 'Invalid payment id' });
    if (!note) return res.status(400).json({ error: 'A note is required' });
    const rows = await db(`order_payments?id=eq.${paymentId}&order_id=is.null&match_status=eq.unmatched`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { match_status: 'ignored', admin_note: note },
    });
    if (!rows[0]) return res.status(409).json({ error: 'Only unmatched payments can be ignored' });
    await audit('ignore_payment', null, { payment_id: rows[0].id, tx_hash: rows[0].tx_hash, amount: rows[0].amount, note });
    return res.status(200).json({ payment: adminPayment(rows[0], null) });
  }

  // ---------------------------------------------------------- admin-accept-late
  // The user paid after the order expired. Accept it: those transfers count as on time.
  if (action === 'admin-accept-late') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const orderId = req.body?.order_id;
    const note = cleanNote(req.body?.note);
    if (!UUID_RE.test(orderId || '')) return res.status(400).json({ error: 'Invalid order id' });
    if (!note) return res.status(400).json({ error: 'A note is required' });
    const rows = await db(`orders?id=eq.${orderId}&status=eq.late_payment&select=*&limit=1`);
    const order = rows[0];
    if (!order) return res.status(409).json({ error: 'Only orders in late payment can be accepted' });
    const moved = await db(`order_payments?order_id=eq.${order.id}&match_status=eq.late`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { match_status: 'matched', admin_note: note },
    });
    const after = await ctx.settleOrder(order);
    await audit('accept_late', order.id, { payments: moved.map((m) => m.tx_hash), note, order_status: after?.status || order.status });
    return res.status(200).json({ order: adminOrder(after || order, null) });
  }

  // ---------------------------------------------------------- admin-audit
  if (action === 'admin-audit') {
    const rows = await db(`admin_audit_log?select=*&order=created_at.desc&limit=${clampLimit(req.query.limit)}`);
    const ids = [...new Set(rows.map((r) => r.admin_id))];
    const profiles = ids.length ? await db(`profiles?id=in.(${ids.join(',')})&select=id,username`) : [];
    const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.username]));
    return res.status(200).json({
      entries: rows.map((r) => ({
        id: r.id, admin: nameById[r.admin_id] || r.admin_id, role: r.admin_role,
        action: r.action, order_id: r.order_id, detail: r.detail, created_at: r.created_at,
      })),
    });
  }

  // ---------------------------------------------------------- admin-test-email
  // Sends a sample invoice to the caller's own address to check SMTP setup.
  if (action === 'admin-test-email') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!user.email) return res.status(400).json({ error: 'Your account has no email address' });
    const sample = {
      id: '00000000-0000-0000-0000-000000000000', order_no: 'NL-TEST-000000', type: 'kyc', amount_usdc: '2.500000',
      pay_to_address: SAMPLE_ADDR, payer_address: SAMPLE_ADDR, expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    };
    const mail = invoiceMail(sample);
    const ok = await sendMail({ ...mail, subject: `[Test] ${mail.subject}`, to: user.email });
    await audit('test_email', null, { to: user.email, ok });
    if (!ok) return res.status(502).json({ error: 'Email could not be sent. Check the SMTP settings in Vercel.' });
    return res.status(200).json({ ok: true, to: user.email });
  }

  return res.status(400).json({ error: 'Unknown admin action' });
}
