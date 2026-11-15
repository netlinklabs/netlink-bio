// api/_lib/security.js
// Data for the admin "Security" tab (admin.html, admin-security action, super_admin only).
// Lives in _lib, so it adds no serverless function (api/ is at the Vercel Hobby cap of 12).
//
// Two parts:
//  1. signals: live early warning checks. READ ONLY, every check reads existing tables and fails on
//     its own (level "unknown"), so one broken query never hides the others. Nothing is written.
//  2. controls and gaps: a written summary of the protections that run today. These are constants,
//     checked against the code and the database on CONTROLS_CHECKED. Update them (and the date)
//     whenever a protection is added, removed or changed, the same way LIMITS in usage.js are kept.
//
// Signals are computed when the tab is opened. Nothing is sent automatically yet (see GAPS).
// Thresholds are small on purpose: the user base is small, so a handful of events already matters.

import { isScriptEmail, unusualDomains, maxBurst, fastOrderUsers } from './signup-patterns.js';

export const CONTROLS_CHECKED = '2026-11-15';

export const CONTROLS = [
  {
    area: 'Admin access',
    items: [
      ['Role checked on the server', 'Every admin call reads the caller role from admin_users on the server. The page never decides access.'],
      ['Audit log for every admin write', 'Each admin write is recorded in admin_audit_log with who, role, action and detail.'],
      ['Roles cannot be changed from the app', 'Admin roles are only changed with SQL by a super_admin.'],
    ],
  },
  {
    area: 'Wallet (Netlink Pay)',
    items: [
      ['Session match before wallet actions', 'Send, export and sign check that the browser wallet session matches the signed-in account before anything runs.'],
      ['Wallet SDK is bundled, not loaded from a CDN', 'Wallet code is built into shared/vendor, so a third party CDN cannot swap it.'],
      ['On-chain check of every wallet transaction', 'A daily job confirms each recorded transaction exists on Polygon and that the amount matches.'],
      ['App PIN with lockout', 'The PIN is stored as a hash and checked by the database function verify_app_pin. Too many wrong entries lock the account for a while. The PIN is always asked again before an account deletion request.'],
      ['Identity gate on Send and recovery', 'Sensitive wallet steps ask the account owner to sign in again with the method that opens that wallet.'],
    ],
  },
  {
    area: 'Payments and verification',
    items: [
      ['Didit webhook is signed and fresh', 'The webhook signature is verified with a constant time compare and old timestamps are rejected.'],
      ['Duplicate webhook events are ignored', 'verifications.event_id is unique, so a replayed event cannot create a second record.'],
      ['A payment hash can be claimed once', 'An order cannot claim a transaction hash that another order already claimed.'],
      ['A typed hash cannot take another buyer\'s transfer', 'A transfer matched only by a typed hash is refused when its sender is the payer of another open order or the saved wallet of another account. It stays unmatched for an admin to link.'],
      ['Verification attempt limits', 'Each user has a total and a daily limit on identity verification attempts.'],
    ],
  },
  {
    area: 'Database',
    items: [
      ['Row level security on every public table', 'All public tables have RLS enabled (checked on the date above).'],
      ['Tighter functions and views', 'Anonymous execute is revoked on SECURITY DEFINER functions, public views run as the caller, and function search_path is fixed.'],
      ['Input rules at the database level', 'Link URLs, icons, wallet addresses and order hashes are checked by table constraints, not only by the page.'],
      ['Account deletion with a grace period', 'Deletion is scheduled through deletion_requests and can be cancelled before it runs.'],
    ],
  },
  {
    area: 'Web',
    items: [
      ['Security headers', 'Content Security Policy and X-Content-Type-Options are sent on every page (vercel.json).'],
      ['Bot probe logging', 'Requests for bio pages that do not exist are counted per name, so scanning shows up here.'],
      ['Sign-up pattern signals', 'Script-like email names, unusual new email domains, sign-up bursts and very fast first orders are flagged in the Access group. Monitoring only: no sign-up is blocked by these signals.'],
      ['Rate limit counting for Alchemy', 'HTTP 429 answers from Alchemy are counted, so a throughput problem is visible.'],
    ],
  },
];

export const GAPS = [
  ['No automatic alerts yet', 'These signals only show when someone opens this tab. A daily check that emails a super_admin when a signal turns red would close this gap.'],
  ['Admin sign-in has no second factor', 'MFA (AAL2) is not enforced for admin actions yet. Add it before more people get admin access.'],
  ['Content Security Policy allows inline scripts', 'script-src includes unsafe-inline, which weakens protection against injected scripts. Removing it needs the inline scripts to move to files.'],
  ['Thresholds are fixed guesses', 'The numbers that turn a signal yellow or red are set for today\'s small user base. Review them as traffic grows.'],
];

const DAY = 86400000;
const ORDER = { ok: 0, unknown: 1, warn: 2, bad: 3 };

// level for a plain count: warn at warnAt, bad at badAt (badAt optional)
const byCount = (n, warnAt, badAt) => (badAt && n >= badAt ? 'bad' : n >= warnAt ? 'warn' : 'ok');

export async function securitySummary(SUPABASE_URL, SERVICE_ROLE_KEY) {
  const H = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const today = iso(now).slice(0, 10);
  const since24h = encodeURIComponent(iso(now - DAY));
  const since7d = encodeURIComponent(iso(now - 7 * DAY));
  const since8d = encodeURIComponent(iso(now - 8 * DAY));
  const since30d = encodeURIComponent(iso(now - 30 * DAY));
  const day8 = iso(now - 7 * DAY).slice(0, 10); // today plus the 7 days before it
  const nowQ = encodeURIComponent(iso(now));

  const rest = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`);
    return r.json();
  };
  // Exact row count for a filter (HEAD request, no rows transferred).
  const count = async (table, filter) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&${filter}`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } });
    if (!r.ok) throw new Error(`${table} ${r.status}`);
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    if (!m) throw new Error(`${table} count missing`);
    return Number(m[1]);
  };

  // The newest accounts of the last 7 days (up to 50) with their email, for the sign-up pattern
  // signals. Loaded once and shared. The email is optional: if it cannot be read, the time based
  // signals still work. Emails never leave this function (signals only show counts and domains).
  let signupsPromise = null;
  const recentSignups = () => {
    if (!signupsPromise) {
      signupsPromise = (async () => {
        const rows = await rest(`profiles?select=id,created_at&created_at=gte.${since7d}&order=created_at.desc&limit=50`);
        return Promise.all(rows.map(async (p) => {
          let email = null;
          try {
            const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${p.id}`, { headers: H });
            if (r.ok) email = (await r.json())?.email || null;
          } catch (e) { /* email stays null */ }
          return { id: p.id, created_at: p.created_at, email };
        }));
      })();
    }
    return signupsPromise;
  };

  // Runs one check. fn returns { level, value, detail }, an error becomes level "unknown".
  const signals = [];
  const check = async (id, group, label, rule, fn, go) => {
    try {
      const out = await fn();
      signals.push({ id, group, label, rule, go: go || null, ...out });
    } catch (e) {
      console.error('security check failed', id, e.message);
      signals.push({ id, group, label, rule, go: go || null, level: 'unknown', value: 'n/a', detail: 'Could not load this check.' });
    }
  };

  // A daily figure against the average of the 7 days before it.
  const vsAverage = (todayN, prevTotal, minN, warnFactor, badMin, badFactor) => {
    const avg = prevTotal / 7;
    const level = todayN >= badMin && todayN > badFactor * avg ? 'bad' : todayN >= minN && todayN > warnFactor * avg ? 'warn' : 'ok';
    return { level, avg };
  };
  const avgText = (a) => (a < 10 ? a.toFixed(1) : String(Math.round(a)));

  await Promise.all([
    // ---------------------------------------------------------------- Money
    check('payments_open', 'Money', 'Payments waiting for review', 'Yellow at 1, red at 5 or more.', async () => {
      const n = await count('order_payments', 'match_status=in.(unmatched,late)&order_id=is.null');
      return { level: byCount(n, 1, 5), value: n, detail: 'USDC seen on chain that is not linked to an order. Review them in Finance, Payments.' };
    }, 'payments'),

    check('hash_no_payment', 'Money', 'Typed hash without a payment, 7 days', 'Yellow at 1, red at 3 or more.', async () => {
      const n = await count('orders', `claimed_tx_hash=not.is.null&status=in.(awaiting_payment,underpaid,expired)&created_at=gte.${since7d}`);
      return { level: byCount(n, 1, 3), value: n, detail: 'Orders where a buyer typed a transaction hash but no matching payment arrived. A made-up hash is a typical probe of the payment check.' };
    }, 'orders'),

    check('hash_sender_mismatch', 'Money', 'Paid by a sender other than the payer, 30 days', 'Yellow at 1 or more.', async () => {
      const pays = await rest(`order_payments?select=order_id,from_address&match_status=eq.matched&order_id=not.is.null&occurred_at=gte.${since30d}&limit=1000`);
      const ids = [...new Set(pays.map((p) => p.order_id))];
      const payerOf = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const rows = await rest(`orders?select=id,payer_address&id=in.(${ids.slice(i, i + 100).join(',')})`);
        for (const r of rows) payerOf.set(r.id, String(r.payer_address || '').toLowerCase());
      }
      const n = pays.filter((p) => {
        const payer = payerOf.get(p.order_id);
        return payer && payer !== String(p.from_address || '').toLowerCase();
      }).length;
      return { level: byCount(n, 1), value: n, detail: 'Payments assigned by a typed hash or linked by an admin where the sender differs from the order payer address. Expected for exchange withdrawals. Check that the sender is the buyer.' };
    }, 'orders'),

    check('orders_underpaid', 'Money', 'Partially paid orders', 'Yellow at 1 or more.', async () => {
      const n = await count('orders', 'status=eq.underpaid');
      return { level: byCount(n, 1), value: n, detail: 'Orders that received less than the amount due.' };
    }, 'orders'),

    // ---------------------------------------------------------------- Wallet
    check('wallet_amount_mismatch', 'Wallet', 'Amount does not match the chain', 'Red at 1 or more.', async () => {
      const n = await count('wallet_transactions', 'status=eq.success&onchain_amount_status=eq.mismatch');
      return { level: n > 0 ? 'bad' : 'ok', value: n, detail: 'Recorded wallet transactions whose amount differs from the amount on Polygon. All time.' };
    }),

    check('wallet_not_on_chain', 'Wallet', 'Transactions not found on chain', 'Red at 1 or more.', async () => {
      const n = await count('wallet_transactions', 'status=eq.success&onchain_verified=eq.false&onchain_check_attempts=gte.5');
      return { level: n > 0 ? 'bad' : 'ok', value: n, detail: 'Recorded as successful but still not confirmed on Polygon after 5 checks.' };
    }),

    check('wallet_failed', 'Wallet', 'Failed wallet transactions, 24 hours', 'Yellow at 5 and 3 times the daily average, red at 20 and 5 times.', async () => {
      const [n, prev] = await Promise.all([
        count('wallet_transactions', `status=eq.failed&created_at=gte.${since24h}`),
        count('wallet_transactions', `status=eq.failed&created_at=gte.${since8d}&created_at=lt.${since24h}`),
      ]);
      const { level, avg } = vsAverage(n, prev, 5, 3, 20, 5);
      return { level, value: n, detail: `Daily average over the 7 days before: ${avgText(avg)}.` };
    }),

    // ---------------------------------------------------------------- Access
    check('pin_lockouts', 'Access', 'App PIN lockouts right now', 'Yellow at 1, red at 3 or more.', async () => {
      const [locked, failing] = await Promise.all([
        count('profiles', `app_pin_locked_until=gt.${nowQ}`),
        count('profiles', 'app_pin_failed_attempts=gte.3'),
      ]);
      return { level: byCount(locked, 1, 3), value: locked, detail: `Accounts locked after wrong PIN entries. ${failing} account${failing === 1 ? '' : 's'} with 3 or more failed attempts in a row.` };
    }),

    check('signups', 'Access', 'New accounts, 24 hours', 'Yellow at 5 and 3 times the daily average, red at 20 and 5 times.', async () => {
      const [n, prev] = await Promise.all([
        count('profiles', `created_at=gte.${since24h}`),
        count('profiles', `created_at=gte.${since8d}&created_at=lt.${since24h}`),
      ]);
      const { level, avg } = vsAverage(n, prev, 5, 3, 20, 5);
      return { level, value: n, detail: `Daily average over the 7 days before: ${avgText(avg)}. A sudden jump can be a bot sign-up run.` };
    }),

    // Sign-up pattern signals. Monitoring only, nothing is blocked (see api/_lib/signup-patterns.js).
    check('signup_script_email', 'Access', 'Script-like email names, 7 days', 'Yellow at 1, red at 3 or more.', async () => {
      const list = await recentSignups();
      const n = list.filter((s) => isScriptEmail(s.email)).length;
      return { level: byCount(n, 1, 3), value: n, detail: 'Email names made of a few letters and 9 or more digits, like a sign-up script makes. A real user can match by chance, so look at the account first.' };
    }, 'signups'),

    check('signup_new_domain', 'Access', 'Unusual new email domain, 24 hours', 'Yellow at 1 or more.', async () => {
      const list = await recentSignups();
      const found = unusualDomains(list, now);
      const names = found.slice(0, 3).map((d) => `${d.domain} (${d.count})`).join(', ');
      return { level: byCount(found.length, 1), value: found.length, detail: found.length ? `Domains outside the big mailbox providers with 2 or more new accounts and none before: ${names}.` : 'No domain outside the big mailbox providers has 2 or more new accounts today.' };
    }, 'signups'),

    check('signup_burst', 'Access', 'Most sign-ups in one hour, last 24 hours', 'Yellow at 3, red at 6 or more.', async () => {
      const list = await recentSignups();
      const n = maxBurst(list, now);
      return { level: byCount(n, 3, 6), value: n, detail: 'The most accounts created inside any 60 minute stretch. Catches a short bot run that the daily count misses.' };
    }, 'signups'),

    check('signup_fast_order', 'Access', 'Order placed within 30 minutes of sign-up, 7 days', 'Yellow at 1 or more.', async () => {
      const list = await recentSignups();
      const orders = await rest(`orders?select=user_id,created_at&created_at=gte.${since7d}&limit=200`);
      const n = fastOrderUsers(new Map(list.map((s) => [s.id, s.created_at])), orders);
      return { level: byCount(n, 1), value: n, detail: 'Accounts that opened an order very soon after signing up. A buyer can do this too, so check the account and the order before acting.' };
    }, 'orders'),

    check('kyc_declined', 'Access', 'Identity checks declined, 7 days', 'Yellow at 3, red at 10 or more.', async () => {
      const n = await count('verifications', `status=eq.declined&created_at=gte.${since7d}`);
      return { level: byCount(n, 3, 10), value: n, detail: 'Many declines in a short time can mean someone is trying fake documents.' };
    }),

    check('shared_wallets', 'Access', 'Wallet address used by more than one account', 'Yellow at 1 or more.', async () => {
      const rows = await rest('profiles?select=wallet_address&wallet_address=not.is.null&limit=5000');
      const seen = new Map();
      for (const r of rows) {
        const a = String(r.wallet_address || '').toLowerCase();
        if (a) seen.set(a, (seen.get(a) || 0) + 1);
      }
      const n = [...seen.values()].filter((c) => c > 1).length;
      return { level: byCount(n, 1), value: n, detail: 'The same wallet saved on several accounts can point to duplicate or linked accounts.' };
    }),

    check('deletions', 'Access', 'Account deletion requests, 7 days', 'Yellow at 5 or more.', async () => {
      const n = await count('deletion_requests', `created_at=gte.${since7d}`);
      return { level: byCount(n, 5), value: n, detail: 'A burst of deletion requests can mean accounts are being taken over.' };
    }),

    // ---------------------------------------------------------------- Admin
    check('admin_writes', 'Admin', 'Admin actions, 24 hours', 'Yellow above 30.', async () => {
      const n = await count('admin_audit_log', `created_at=gte.${since24h}`);
      return { level: n > 30 ? 'warn' : 'ok', value: n, detail: 'Writes recorded in the audit log. Open the Audit log tab to see who did what.' };
    }, 'audit'),

    check('admin_accounts', 'Admin', 'Active admin accounts', 'Yellow above 3.', async () => {
      const rows = await rest('admin_users?select=user_id&is_active=eq.true&limit=200');
      const n = new Set(rows.map((r) => r.user_id)).size;
      return { level: n > 3 ? 'warn' : 'ok', value: n, detail: 'Accounts with at least one active admin role. Admin sign-in has no second factor yet, so keep this number small.' };
    }),

    // ---------------------------------------------------------------- Traffic
    check('bio_probes', 'Traffic', 'Bot probes on bio pages, today', 'Yellow at 50 and 3 times the daily average, red at 500 and 5 times.', async () => {
      const rows = [];
      for (let page = 0; page < 4; page++) {
        const part = await rest(`bio_not_found_daily?select=day,username,count&day=gte.${day8}&limit=1000&offset=${page * 1000}`);
        rows.push(...part);
        if (part.length < 1000) break;
      }
      let t = 0; let prev = 0;
      for (const r of rows) {
        if (/^[a-z0-9_]{3,20}$/.test(r.username)) continue; // a valid looking name is not a probe
        if (r.day === today) t += Number(r.count) || 0; else prev += Number(r.count) || 0;
      }
      const { level, avg } = vsAverage(t, prev, 50, 3, 500, 5);
      return { level, value: t, detail: `Requests for names that cannot be real usernames, such as wp-admin or .env. Daily average over the 7 days before: ${avgText(avg)}.` };
    }),

    check('api_5xx', 'Traffic', 'Server errors, today (UTC)', 'Yellow at 5 errors and 2% of requests, red at 10%.', async () => {
      const rows = await rest(`api_request_stats?select=day,status_class,count&day=eq.${today}&limit=200`);
      let total = 0; let e5 = 0;
      for (const r of rows) { const c = Number(r.count) || 0; total += c; if (r.status_class === '5xx') e5 += c; }
      const rate = total ? (e5 / total) * 100 : 0;
      const level = e5 >= 5 && rate >= 10 ? 'bad' : e5 >= 5 && rate >= 2 ? 'warn' : 'ok';
      return { level, value: e5, detail: `${total ? rate.toFixed(1) : '0'}% of ${total} counted API requests today.` };
    }),

    check('api_4xx', 'Traffic', 'Rejected requests (4xx), today (UTC)', 'Yellow at 50 and 3 times the daily average, red at 500 and 5 times.', async () => {
      const rows = await rest(`api_request_stats?select=day,status_class,count&day=gte.${day8}&status_class=eq.4xx&limit=2000`);
      let t = 0; let prev = 0;
      for (const r of rows) { const c = Number(r.count) || 0; if (r.day === today) t += c; else prev += c; }
      const { level, avg } = vsAverage(t, prev, 50, 3, 500, 5);
      return { level, value: t, detail: `Calls refused for bad input, no sign-in or no permission. Daily average over the 7 days before: ${avgText(avg)}.` };
    }),

    check('alchemy_429', 'Traffic', 'Alchemy rate limit hits, today (UTC)', 'Yellow at 1 or more.', async () => {
      const rows = await rest(`third_party_usage_daily?select=count&provider=eq.alchemy&metric=eq.429&day=eq.${today}&limit=5`);
      const n = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
      return { level: byCount(n, 1), value: n, detail: 'Alchemy refused calls because the request rate was too high. Wallet balances and checks may be slow.' };
    }),
  ]);

  // Keep a stable, readable order: group order first, then worst first inside a group.
  const GROUPS = ['Money', 'Wallet', 'Access', 'Admin', 'Traffic'];
  signals.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || ORDER[b.level] - ORDER[a.level]);

  const counts = { bad: 0, warn: 0, ok: 0, unknown: 0 };
  for (const s of signals) counts[s.level] += 1;
  const overall = counts.bad ? 'bad' : counts.warn ? 'warn' : counts.unknown ? 'partial' : 'ok';

  return {
    generated_at: new Date().toISOString(),
    overall,
    counts,
    groups: GROUPS,
    signals,
    controls: CONTROLS.map((c) => ({ area: c.area, items: c.items.map(([label, detail]) => ({ label, detail })) })),
    controls_checked: CONTROLS_CHECKED,
    gaps: GAPS.map(([label, detail]) => ({ label, detail })),
  };
}
