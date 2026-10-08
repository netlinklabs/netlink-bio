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

import { sendMail, invoiceMail, getUserEmail, ambassadorStatusMail } from './mailer.js';
import { notifyUser } from './notify.js';
import { usageSummary } from './usage.js';
const SAMPLE_ADDR = '0x0000000000000000000000000000000000000000';

const READ_ROLES = ['super_admin', 'finance', 'support', 'kyc_reviewer'];
const FINANCE_ROLES = ['super_admin', 'finance'];

// Ambassador program (public.ambassador_applications). Support can read, only super_admin can review.
const AMBASSADOR_READ_ROLES = ['super_admin', 'support'];
const AMBASSADOR_WRITE_ROLES = ['super_admin'];
const AMBASSADOR_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'revoked'];
// Allowed status changes. The database trigger enforces the same flow as a second line of defence.
const AMBASSADOR_FLOW = {
  pending: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['revoked'],
  rejected: [],
  revoked: [],
};

// NET reward claims (public.rewards). Finance reads the list to pay claims out; this file only reads.
const REWARD_STATUSES = ['pending', 'claimed'];
const REWARD_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const NET_CONTRACT = '0x0e893B239094A5c573373d44CF1C7D03576b95cb'; // NET token on Polygon

const ACTION_ROLES = {
  'admin-me': null, // any signed-in user; returns an empty role list for non-admins
  'admin-overview': FINANCE_ROLES,
  'admin-usage': FINANCE_ROLES,
  'admin-404-log': FINANCE_ROLES,
  'admin-orders': READ_ROLES,
  'admin-order': READ_ROLES,
  'admin-payments': FINANCE_ROLES,
  'admin-sync': FINANCE_ROLES,
  'admin-link-payment': FINANCE_ROLES,
  'admin-ignore-payment': FINANCE_ROLES,
  'admin-accept-late': FINANCE_ROLES,
  'admin-ambassadors': AMBASSADOR_READ_ROLES,
  'admin-ambassador': AMBASSADOR_READ_ROLES,
  'admin-ambassador-update': AMBASSADOR_WRITE_ROLES,
  'admin-rewards': FINANCE_ROLES,
  'admin-rewards-detect': FINANCE_ROLES,
  'admin-rewards-confirm': FINANCE_ROLES,
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

// Like cleanNote but keeps line breaks (used for the free-text admin notes on an application).
function cleanMultiline(v, max = 2000) {
  return String(v || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
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
    meta: {
      ...(o.meta && (o.meta.test || o.meta.comped) ? { test: !!o.meta.test, comped: !!o.meta.comped } : {}),
      // Plan orders: what was bought and until when it was granted (null until activated).
      ...(o.type === 'plan' && o.meta ? { plan: { tier: o.meta.tier || null, kind: o.meta.kind || 'new', months: o.meta.months || null, active_until: o.meta.granted_until || null } } : {}),
    },
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
        if (data.pay) {
          data.pay.tx_volume_series = gd.tx_volume || null;
          data.pay.fee_income = gd.fee_synced ? gd.fee_income || [] : null; // null = not synced yet
          data.pay.fee_unmatched = gd.fee_unmatched || 0;
        }
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

  // ---------------------------------------------------------- admin-404-log
  // Bio page 404s per username (public.bio_not_found_daily, written by api/bio.js). Read on demand
  // from the Overview tab. Aggregated here because PostgREST cannot group. "probe" = the name does
  // not match the username rule ([a-z0-9_]{3,20}), which is what bots scanning random paths look like.
  if (action === 'admin-404-log') {
    const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const rows = [];
    for (let page = 0; page < 4; page++) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bio_not_found_daily?select=day,username,count&day=gte.${since}&order=day.asc,username.asc&limit=1000&offset=${page * 1000}`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if (!r.ok) {
        console.error('admin-404-log read failed', r.status, await r.text().catch(() => ''));
        return res.status(500).json({ error: 'Could not load the 404 log' });
      }
      const part = await r.json();
      rows.push(...part);
      if (part.length < 1000) break;
    }
    const isProbe = (name) => !/^[a-z0-9_]{3,20}$/.test(name);
    const byName = new Map();
    const byDay = new Map();
    let total = 0;
    let probeTotal = 0;
    for (const row of rows) {
      const n = Number(row.count) || 0;
      total += n;
      byDay.set(row.day, (byDay.get(row.day) || 0) + n);
      const cur = byName.get(row.username) || { username: row.username, count: 0, days: 0, probe: isProbe(row.username) };
      cur.count += n;
      cur.days += 1;
      byName.set(row.username, cur);
      if (cur.probe) probeTotal += n;
    }
    const top = [...byName.values()].sort((a, b) => b.count - a.count).slice(0, 30);
    return res.status(200).json({
      days,
      since,
      total,
      distinct: byName.size,
      probe_total: probeTotal,
      per_day: [...byDay.entries()].map(([day, count]) => ({ day, count })),
      top,
      truncated: rows.length >= 4000,
    });
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

  // Status counts for the ambassador tab badge and filter labels (one cheap query).
  const ambassadorCounts = async () => {
    const all = await db('ambassador_applications?select=status&limit=1000');
    const out = Object.fromEntries(AMBASSADOR_STATUSES.map((x) => [x, 0]));
    all.forEach((r) => { if (out[r.status] !== undefined) out[r.status] += 1; });
    return out;
  };

  // ---------------------------------------------------------- ambassador applications
  const adminAmbassador = (a, p) => ({
    id: a.id,
    user_id: a.user_id,
    status: a.status,
    season: a.season,
    country_code: a.country_code,
    city: a.city,
    track: a.track,
    social_links: a.social_links || [],
    audience_size: a.audience_size,
    motivation: a.motivation,
    contribution_plan: a.contribution_plan,
    admin_notes: a.admin_notes || '',
    created_at: a.created_at,
    updated_at: a.updated_at,
    reviewed_at: a.reviewed_at,
    user: p
      ? {
          username: p.username, display_name: p.display_name, net_id: p.net_id, referral_code: p.referral_code,
          tier: p.tier, identity_status: p.identity_verification_status, joined_at: p.created_at,
        }
      : null,
  });
  const AMBASSADOR_PROFILE_COLS = 'id,username,display_name,net_id,referral_code,tier,identity_verification_status,created_at';

  // admin-ambassadors: list with optional filters (status, country, username search) and status counts.
  if (action === 'admin-ambassadors') {
    const st = AMBASSADOR_STATUSES.includes(req.query.status) ? req.query.status : '';
    const country = /^[A-Za-z]{2}$/.test(req.query.country || '') ? String(req.query.country).toUpperCase() : '';
    const q = String(req.query.q || '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase().slice(0, 30);
    let filter = '';
    if (st) filter += `&status=eq.${st}`;
    if (country) filter += `&country_code=eq.${country}`;
    if (q) {
      const found = await db(`profiles?username=ilike.*${q}*&select=id&limit=50`);
      const ids = found.map((p) => p.id);
      const counts = await ambassadorCounts();
      if (!ids.length) return res.status(200).json({ applications: [], counts });
      filter += `&user_id=in.(${ids.join(',')})`;
    }
    const [rows, counts] = await Promise.all([
      db(`ambassador_applications?select=*&order=created_at.desc&limit=${clampLimit(req.query.limit)}${filter}`),
      ambassadorCounts(),
    ]);
    const userIds = [...new Set(rows.map((a) => a.user_id))];
    const profiles = userIds.length ? await db(`profiles?id=in.(${userIds.join(',')})&select=${AMBASSADOR_PROFILE_COLS}`) : [];
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    return res.status(200).json({ applications: rows.map((a) => adminAmbassador(a, byId[a.user_id])), counts });
  }

  // admin-ambassador: one application with the applicant's account details.
  if (action === 'admin-ambassador') {
    const id = req.query.id;
    if (!UUID_RE.test(id || '')) return res.status(400).json({ error: 'Invalid application id' });
    const rows = await db(`ambassador_applications?id=eq.${id}&select=*&limit=1`);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Application not found' });
    const [profiles, authUser] = await Promise.all([
      db(`profiles?id=eq.${a.user_id}&select=${AMBASSADOR_PROFILE_COLS}&limit=1`),
      fetch(`${SUPABASE_URL}/auth/v1/admin/users/${a.user_id}`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    return res.status(200).json({ application: adminAmbassador(a, profiles[0] || null), email: authUser?.email || null });
  }

  // admin-ambassador-update: (a) change status with a required note, or (b) save the admin notes text.
  if (action === 'admin-ambassador-update') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const id = req.body?.id;
    if (!UUID_RE.test(id || '')) return res.status(400).json({ error: 'Invalid application id' });
    const rows = await db(`ambassador_applications?id=eq.${id}&select=*&limit=1`);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Application not found' });
    const profileOf = async () => (await db(`profiles?id=eq.${a.user_id}&select=${AMBASSADOR_PROFILE_COLS}&limit=1`))[0] || null;

    const to = req.body?.status;
    if (to) {
      if (!AMBASSADOR_STATUSES.includes(to)) return res.status(400).json({ error: 'Invalid status' });
      if (!(AMBASSADOR_FLOW[a.status] || []).includes(to)) {
        return res.status(409).json({ error: `An application that is ${a.status.replace('_', ' ')} cannot be moved to ${to.replace('_', ' ')}` });
      }
      const note = cleanNote(req.body?.note);
      if (!note) return res.status(400).json({ error: 'A note is required' });
      const line = `${new Date().toISOString().slice(0, 10)} ${to}: ${note}`;
      const notes = [a.admin_notes, line].filter(Boolean).join('\n');
      if (notes.length > 2000) return res.status(400).json({ error: 'The admin notes are full. Shorten them first, then try again.' });
      // status=eq.<current> keeps the change atomic if two admins act at once.
      const moved = await db(`ambassador_applications?id=eq.${a.id}&status=eq.${a.status}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: to, admin_notes: notes },
      });
      if (!moved[0]) return res.status(409).json({ error: 'This application was just changed by someone else. Reload and try again.' });
      const profile = await profileOf();
      // Approved and rejected also email the applicant (their own auth email).
      // A failed email never undoes the status change, it is only recorded.
      let emailed = null;
      const mail = ambassadorStatusMail(to, {
        name: (profile?.display_name || profile?.username || '').trim(),
        countryCode: a.country_code,
        track: a.track,
      });
      if (mail) {
        const email = await getUserEmail(a.user_id);
        emailed = email ? await sendMail({ ...mail, to: email }) : false;
      }
      await audit('ambassador_status', null, { application_id: a.id, from: a.status, to, note, ...(mail ? { emailed } : {}) });
      return res.status(200).json({ application: adminAmbassador(moved[0], profile), email_sent: emailed });
    }

    if (typeof req.body?.admin_notes === 'string') {
      const notes = cleanMultiline(req.body.admin_notes, 2000);
      const saved = await db(`ambassador_applications?id=eq.${a.id}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { admin_notes: notes || null },
      });
      if (!saved[0]) return res.status(409).json({ error: 'Could not save the notes' });
      await audit('ambassador_notes', null, { application_id: a.id, length: notes.length });
      return res.status(200).json({ application: adminAmbassador(saved[0], await profileOf()) });
    }

    return res.status(400).json({ error: 'Nothing to update' });
  }

  // ---------------------------------------------------------- admin-rewards
  // Read only. Lists NET reward claims with the claimant's current wallet (read from profiles at
  // request time, so an address changed after claiming is picked up). Optional filters: status
  // (pending or claimed), reward_type, username search. Counts always cover all claims.
  if (action === 'admin-rewards') {
    const st = REWARD_STATUSES.includes(req.query.status) ? req.query.status : '';
    const type = /^[a-z0-9_]{1,40}$/.test(req.query.reward_type || '') ? req.query.reward_type : '';
    const q = String(req.query.q || '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase().slice(0, 30);

    const [allRows, programs] = await Promise.all([
      db('rewards?select=status,amount&limit=1000'),
      db('reward_programs?select=reward_type,quota,amount_per_claim,is_active'),
    ]);
    const counts = { total: allRows.length, pending: 0, claimed: 0, pending_amount: 0 };
    allRows.forEach((r) => {
      if (r.status === 'pending') { counts.pending += 1; counts.pending_amount += Number(r.amount) || 0; }
      else if (r.status === 'claimed') counts.claimed += 1;
    });

    let filter = '';
    if (st) filter += `&status=eq.${st}`;
    if (type) filter += `&reward_type=eq.${type}`;
    if (q) {
      const found = await db(`profiles?username=ilike.*${q}*&select=id&limit=50`);
      const ids = found.map((p) => p.id);
      if (!ids.length) return res.status(200).json({ rewards: [], counts, programs });
      filter += `&user_id=in.(${ids.join(',')})`;
    }
    const rows = await db(`rewards?select=id,user_id,reward_type,status,amount,tx_hash,claimed_at,created_at&order=created_at.asc&limit=1000${filter}`);

    // Profiles in chunks so the request URL stays short.
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const profiles = [];
    for (let i = 0; i < userIds.length; i += 100) {
      const chunk = userIds.slice(i, i + 100);
      profiles.push(...(await db(`profiles?id=in.(${chunk.join(',')})&select=id,username,display_name,wallet_address`)));
    }
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    return res.status(200).json({
      counts,
      programs,
      rewards: rows.map((r) => {
        const p = byId[r.user_id];
        return {
          id: r.id,
          reward_type: r.reward_type,
          status: r.status,
          amount: Number(r.amount) || 0,
          tx_hash: r.tx_hash || null,
          claimed_at: r.claimed_at,
          created_at: r.created_at,
          user: p ? { username: p.username, display_name: p.display_name, wallet_address: p.wallet_address || null } : null,
        };
      }),
    });
  }

  // ---------------------------------------------------------- admin-rewards-detect / admin-rewards-confirm
  // Matches unpaid NET claims to real transfers sent from the reward wallet (env REWARD_WALLET_ADDRESS)
  // on Polygon. Detect only reads. Confirm repeats the same lookup on the server and writes the
  // status, tx hash and time itself: the page only sends claim ids, so a hash is never typed in.
  // A claim matches when a NET transfer went to the claimant's current wallet, for exactly the
  // claim amount, after the claim was created. Each transfer is used for one claim only.
  const rewardError = (status, message) => Object.assign(new Error(message), { status });
  const detectRewardPayments = async () => {
    const wallet = String(process.env.REWARD_WALLET_ADDRESS || '').trim();
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    if (!REWARD_ADDR_RE.test(wallet) || !alchemyKey) throw rewardError(400, 'The reward wallet is not configured on the server');

    const pending = await db('rewards?select=id,user_id,amount,created_at&status=eq.pending&order=created_at.asc&limit=1000');
    const userIds = [...new Set(pending.map((r) => r.user_id))];
    const profiles = [];
    for (let i = 0; i < userIds.length; i += 100) {
      const chunk = userIds.slice(i, i + 100);
      profiles.push(...(await db(`profiles?id=in.(${chunk.join(',')})&select=id,username,wallet_address`)));
    }
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    if (!pending.length) return { wallet, matches: [], unmatched: [] };

    let transfers;
    try {
      const r = await fetch(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers',
          params: [{ fromAddress: wallet, contractAddresses: [NET_CONTRACT], category: ['erc20'], order: 'desc', maxCount: '0x3e8', withMetadata: true, excludeZeroValue: true }],
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
      transfers = j.result?.transfers || [];
    } catch (err) {
      console.error('admin-rewards: alchemy lookup failed', err.message);
      throw rewardError(502, 'Could not read the blockchain right now. Try again in a minute.');
    }

    const used = new Set();
    const matches = [];
    const unmatched = [];
    for (const rw of pending) {
      const p = byId[rw.user_id];
      const username = p?.username || null;
      const addr = String(p?.wallet_address || '').toLowerCase();
      if (!REWARD_ADDR_RE.test(addr)) { unmatched.push({ reward_id: rw.id, username, reason: 'No valid wallet' }); continue; }
      const want = Number(rw.amount);
      const hit = transfers.find((t) => !used.has(t.uniqueId)
        && String(t.to || '').toLowerCase() === addr
        && Math.abs(Number(t.value) - want) < 1e-6
        && new Date(t.metadata?.blockTimestamp) >= new Date(rw.created_at));
      if (!hit) { unmatched.push({ reward_id: rw.id, username, reason: 'No matching transfer found' }); continue; }
      used.add(hit.uniqueId);
      matches.push({ reward_id: rw.id, username, amount: want, to: hit.to, tx_hash: hit.hash, paid_at: hit.metadata.blockTimestamp });
    }
    return { wallet, matches, unmatched };
  };

  if (action === 'admin-rewards-detect') {
    try {
      return res.status(200).json(await detectRewardPayments());
    } catch (err) {
      return res.status(err.status || 502).json({ error: err.status ? err.message : 'Could not check payments right now' });
    }
  }

  if (action === 'admin-rewards-confirm') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const ids = Array.isArray(req.body?.reward_ids) ? req.body.reward_ids : [];
    if (!ids.length || ids.length > 200 || !ids.every((id) => UUID_RE.test(String(id)))) {
      return res.status(400).json({ error: 'Choose between 1 and 200 claims' });
    }
    let detected;
    try {
      detected = await detectRewardPayments();
    } catch (err) {
      return res.status(err.status || 502).json({ error: err.status ? err.message : 'Could not check payments right now' });
    }
    const wanted = new Set(ids);
    const done = [];
    for (const m of detected.matches.filter((x) => wanted.has(x.reward_id))) {
      // status=eq.pending keeps this safe if two admins confirm at the same time.
      const rows = await db(`rewards?id=eq.${m.reward_id}&status=eq.pending`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'claimed', tx_hash: m.tx_hash, claimed_at: m.paid_at },
      });
      if (rows[0]) {
        done.push(m);
        // In-app notification. Unique link per claim keeps it from repeating. Never blocks the payout.
        await notifyUser(rows[0].user_id, {
          type: 'reward',
          title: 'Your NET reward has been sent',
          body: `${m.amount} NET was sent to your wallet.`,
          icon: 'gift',
          link: `/reward?paid=${m.reward_id}`,
        });
      }
    }
    if (done.length) {
      await audit('reward_paid', null, {
        count: done.length,
        total_net: done.reduce((s, m) => s + m.amount, 0),
        tx_hashes: [...new Set(done.map((m) => m.tx_hash))],
        reward_ids: done.map((m) => m.reward_id),
      });
    }
    return res.status(200).json({ confirmed: done.length, skipped: ids.length - done.length });
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
