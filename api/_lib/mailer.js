// api/_lib/mailer.js
// Transactional email over SMTP (finance@netlink.bio). Lives in _lib so it does
// not count toward the Vercel Hobby 12-function cap.
//
// Env (Vercel, Production): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Optional: ADMIN_NOTIFY_EMAIL (defaults to SMTP_USER).
// Optional: SMTP_FROM_COMMUNITY, sender for community mail (community@netlink.bio).
// When empty, community mail falls back to SMTP_FROM.
//
// Rules: a failed email must never break a payment or a webhook. Every send is
// fire-and-forget through waitUntil and failures are only logged.
// All copy is English and has no em dash (CLAUDE.md language rules).

import nodemailer from 'nodemailer';
import { waitUntil } from '@vercel/functions';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SITE = 'https://netlink.bio';

let transporter = null;

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    const port = Number(SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sends one email. Resolves true/false, never throws.
export async function sendMail({ to, subject, html, text, from, replyTo }) {
  const t = getTransporter();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      ...(replyTo ? { replyTo } : {}),
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (err) {
    console.error('mailer: send failed', err?.code || '', err?.message || err);
    return false;
  }
}

// Same as sendMail, but does not delay the HTTP response.
export function sendMailBackground(mail) {
  waitUntil(sendMail(mail));
}

export async function getUserEmail(userId) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !userId) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return null;
    return (await r.json())?.email || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- templates

function layout({ preheader, title, intro, rows = [], after, cta, note, signoff, footer = 'Netlink Finance, netlink.bio', footerNote = 'This is an automated message. Questions? Reply to this email.' }) {
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:10px;border-collapse:separate;">${rows
        .map(
          ([k, v], i) =>
            `<tr><td style="padding:10px 14px;color:#6b7280;font-size:13px;${i ? 'border-top:1px solid #e5e7eb;' : ''}">${esc(k)}</td><td style="padding:10px 14px;text-align:right;font-size:14px;color:#111827;font-weight:600;word-break:break-all;${i ? 'border-top:1px solid #e5e7eb;' : ''}">${esc(v)}</td></tr>`
        )
        .join('')}</table>`
    : '';
  const ctaHtml = cta
    ? `<p style="margin:24px 0;"><a href="${esc(cta.url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">${esc(cta.label)}</a></p>`
    : '';
  const afterHtml = after ? `<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${esc(after)}</p>` : '';
  const signoffHtml = signoff
    ? `<p style="margin:24px 0 0;color:#374151;font-size:14px;line-height:1.6;">Best regards,<br><strong style="color:#111827;">${esc(signoff.name)}</strong><br>${esc(signoff.title)}</p>`
    : '';
  const noteHtml = note ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">${esc(note)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="padding:20px 28px;background:#0f172a;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">Netlink</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${esc(title)}</h1>
<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-line;">${esc(intro)}</p>
${rowsHtml}${afterHtml}${ctaHtml}${signoffHtml}${noteHtml}
</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;color:#9ca3af;font-size:12px;line-height:1.5;">${esc(footer)}<br>${esc(footerNote)}</td></tr>
</table></td></tr></table></body></html>`;
  const lines = [title, '', intro, ''];
  rows.forEach(([k, v]) => lines.push(`${k}: ${v}`));
  if (after) lines.push('', after);
  if (cta) lines.push('', `${cta.label}: ${cta.url}`);
  if (signoff) lines.push('', 'Best regards,', signoff.name, signoff.title);
  if (note) lines.push('', note);
  lines.push('', footer);
  return { html, text: lines.join('\n') };
}

function fmtUsdc(v) {
  const n = Number(v);
  return `${Number.isFinite(n) ? n.toFixed(2) : v} USDC`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
}

const TIER_NAME = { silver: 'Silver', gold: 'Gold' };

// Item name on invoices and receipts. Plan orders carry the plan in meta
// ({ tier, kind: 'new' | 'upgrade', months: 1 | 3 | 6 | 12 }).
function itemLabel(o) {
  if (o.type === 'plan') {
    const tier = TIER_NAME[o.meta?.tier] || 'Plan';
    if (o.meta?.kind === 'upgrade') return `Upgrade to ${tier}`;
    const n = Number(o.meta?.months) || 1;
    return `${tier} plan, ${n} month${n === 1 ? '' : 's'}`;
  }
  return { kyc: 'Identity verification (KYC)' }[o.type] || o.type;
}

function orderRows(o) {
  return [
    ['Order', o.order_no],
    ['Item', itemLabel(o)],
    ['Amount', fmtUsdc(o.amount_usdc)],
  ];
}

const checkoutUrl = (o) => `${SITE}/checkout?order=${o.id}`;

export function invoiceMail(o) {
  return {
    subject: `Invoice ${o.order_no} from Netlink`,
    ...layout({
      preheader: `Invoice ${o.order_no}, ${fmtUsdc(o.amount_usdc)}`,
      title: 'Your invoice',
      intro: 'Thank you for your order. Send the exact amount in USDC on the Polygon network to the address below before the invoice expires.',
      rows: [
        ...orderRows(o),
        ['Network', 'Polygon (USDC)'],
        ['Pay to', o.pay_to_address],
        ['Pay from', o.payer_address],
        ['Expires', fmtDate(o.expires_at)],
      ],
      cta: { label: 'Open my order', url: checkoutUrl(o) },
      note: 'Pay only from the sender wallet shown above. Payments from other wallets are not matched automatically.',
    }),
  };
}

export function reminderMail(o) {
  return {
    subject: `Reminder: invoice ${o.order_no} expires soon`,
    ...layout({
      preheader: `Your invoice expires ${fmtDate(o.expires_at)}`,
      title: 'Your invoice expires soon',
      intro: 'We have not received your payment yet. Your invoice expires within about 24 hours. After that you will need to create a new order.',
      rows: [...orderRows(o), ['Pay to', o.pay_to_address], ['Expires', fmtDate(o.expires_at)]],
      cta: { label: 'Pay now', url: checkoutUrl(o) },
      note: 'If you already paid, you can ignore this email. Payments are detected automatically.',
    }),
  };
}

// extra.activeUntil (plan orders): the date the plan now runs until. Without it
// the mail says the plan will be active shortly (activation is retried).
export function receiptMail(o, extra = {}) {
  let intro = 'We received your payment. You can start your identity verification now.';
  let cta = { label: 'Start verification', url: `${SITE}/identity` };
  if (o.type === 'plan') {
    const tier = TIER_NAME[o.meta?.tier] || 'plan';
    intro = extra.activeUntil
      ? `We received your payment. Your ${tier} plan is active until ${fmtDate(extra.activeUntil)}.`
      : 'We received your payment. Your plan will be active shortly. If it is not active within a few minutes, reply to this email with your order number.';
    cta = { label: 'Open my account', url: `${SITE}/dashboard` };
  }
  return {
    subject: `Receipt for order ${o.order_no}`,
    ...layout({
      preheader: `Payment received for ${o.order_no}`,
      title: 'Payment received',
      intro,
      rows: [
        ...orderRows(o),
        ['Paid', fmtUsdc(o.paid_amount)],
        ['Paid at', fmtDate(o.paid_at)],
        ...(o.paid_tx_hash ? [['Transaction', o.paid_tx_hash]] : []),
      ],
      cta,
    }),
  };
}

// To the team mailbox when a paid plan order could not be activated.
export function planActivationFailedMail(o, reason) {
  return {
    subject: `[Netlink] Plan not activated ${o.order_no}`,
    ...layout({
      preheader: `${o.order_no} is paid but the plan is not active`,
      title: 'Plan activation failed',
      intro: 'An order was paid but the plan could not be activated automatically. It is retried each time the customer opens the order. If it keeps failing, check the account and the reason below.',
      rows: [...orderRows(o), ['Reason', String(reason || 'unknown').slice(0, 200)]],
      after: `Manual retry in the Supabase SQL editor: select public.fulfill_plan_order('${o.id}');`,
      cta: { label: 'Open admin', url: `${SITE}/admin` },
    }),
  };
}

// Plan expiry mails (sent by the daily job in api/_lib/plan-expiry.js).
// daysLeft is 7 or 3. The renew link goes to the plans page.
export function planExpiringMail(tier, daysLeft, expiresAt) {
  const name = TIER_NAME[tier] || 'plan';
  return {
    subject: `Your ${name} plan ends in ${daysLeft} days`,
    ...layout({
      preheader: `Renew before ${fmtDate(expiresAt)} to keep your ${name} features`,
      title: `Your ${name} plan ends in ${daysLeft} days`,
      intro: `Your ${name} plan is active until ${fmtDate(expiresAt)}. Renew before then to keep all your features. Renewing adds time after your current end date, so you lose nothing.`,
      rows: [['Plan', name], ['Active until', fmtDate(expiresAt)]],
      cta: { label: 'Renew my plan', url: `${SITE}/plans` },
      note: 'After the end date you have 7 days to renew. After that your account returns to Basic. Your data is kept and nothing is deleted.',
    }),
  };
}

export function planEndedMail(tier) {
  const name = TIER_NAME[tier] || 'plan';
  return {
    subject: `Your ${name} plan has ended`,
    ...layout({
      preheader: 'Your account is now on the Basic plan',
      title: `Your ${name} plan has ended`,
      intro: `Your account is now on the Basic plan. Features above the Basic limits are hidden, not deleted. Renew any time to get them back. Your username does not change.`,
      cta: { label: 'Renew my plan', url: `${SITE}/plans` },
    }),
  };
}

export function kycResultMail(status) {
  const map = {
    approved: {
      title: 'Identity verified',
      intro: 'Your identity is verified. Your verified badge is now active on your Netlink account.',
      cta: { label: 'Open my account', url: `${SITE}/dashboard` },
    },
    declined: {
      title: 'Verification rejected',
      intro: 'We could not verify your identity. If you think this is a mistake, reply to this email and our team will help.',
      cta: { label: 'View details', url: `${SITE}/identity` },
    },
    resubmission_needed: {
      title: 'Please resubmit your documents',
      intro: 'We could not verify your documents. Please submit them again. Use clear photos and make sure all corners are visible.',
      cta: { label: 'Resubmit documents', url: `${SITE}/identity` },
    },
  };
  const m = map[status];
  if (!m) return null;
  return { subject: `Netlink: ${m.title}`, ...layout({ preheader: m.title, ...m }) };
}

export function adminPaidMail(o, userEmail) {
  return {
    subject: `[Netlink] Order paid ${o.order_no}`,
    ...layout({
      preheader: `${o.order_no} paid`,
      title: 'New paid order',
      intro: 'An order was paid and matched automatically.',
      rows: [
        ...orderRows(o),
        ['Customer', userEmail || o.user_id],
        ['Paid', fmtUsdc(o.paid_amount)],
        ['Transaction', o.paid_tx_hash || 'n/a'],
      ],
      cta: { label: 'Open admin', url: `${SITE}/admin` },
    }),
  };
}

// Community mail: sent from community@netlink.bio (SMTP_FROM_COMMUNITY).
const COMMUNITY_REPLY_TO = 'community@netlink.bio';
const AMBASSADOR_TRACKS = { growth: 'Growth', content: 'Content', community: 'Community', influence: 'Influence' };

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

// Thank-you email right after an ambassador application is submitted.
export function ambassadorThanksMail({ name, countryCode, track }) {
  const community = process.env.SMTP_FROM_COMMUNITY;
  return {
    subject: 'Thank you for applying to the Netlink Ambassador Program',
    ...(community ? { from: community, replyTo: COMMUNITY_REPLY_TO } : {}),
    ...layout({
      preheader: 'We received your application.',
      title: 'Thank you for applying',
      intro: `Hi ${name || 'there'},\n\nThank you for applying to the Netlink Ambassador Program. We appreciate that you want to help Netlink grow and contribute to its community.`,
      rows: [
        ['Application', 'Pilot Season 1'],
        ['Country', countryName(countryCode)],
        ['Track', AMBASSADOR_TRACKS[track] || track],
        ['Status', 'Submitted'],
      ],
      after: 'The Netlink team reviews every application manually, based on your bio page, your CV and your answers. If we move forward, we will contact you through your Netlink account. You can check your status at any time.',
      cta: { label: 'View my application', url: `${SITE}/ambassador` },
      signoff: { name: 'Alex L Setiawan', title: 'Community & Growth Lead, Netlink' },
      note: 'Submitting an application does not guarantee approval, and program benefits may change.',
      footer: 'Netlink Community, netlink.bio',
      footerNote: 'This is an automated message. You can reply to this email.',
    }),
  };
}

// Sent when an admin approves or rejects an ambassador application.
// Other status changes (under review, revoked) send nothing on purpose.
export function ambassadorStatusMail(status, { name, countryCode, track }) {
  const community = process.env.SMTP_FROM_COMMUNITY;
  const sender = community ? { from: community, replyTo: COMMUNITY_REPLY_TO } : {};
  const signoff = { name: 'Alex L Setiawan', title: 'Community & Growth Lead, Netlink' };
  const footer = { footer: 'Netlink Community, netlink.bio', footerNote: 'This is an automated message. You can reply to this email.' };
  const hi = `Hi ${name || 'there'},\n\n`;

  if (status === 'approved') {
    return {
      subject: 'Welcome to the Netlink Ambassador Program',
      ...sender,
      ...layout({
        preheader: 'Your application was approved.',
        title: 'Welcome aboard',
        intro: `${hi}Congratulations! Your application to the Netlink Ambassador Program has been approved. Thank you for wanting to help Netlink grow and contribute to its community.`,
        rows: [
          ['Application', 'Pilot Season 1'],
          ['Country', countryName(countryCode)],
          ['Track', AMBASSADOR_TRACKS[track] || track],
          ['Status', 'Approved'],
        ],
        after: 'We will contact you with the next steps. You can check your status at any time.',
        cta: { label: 'View my status', url: `${SITE}/ambassador` },
        signoff,
        note: 'Pilot program details and benefits may change. Ambassador status can be ended by the Netlink team at any time.',
        ...footer,
      }),
    };
  }

  if (status === 'rejected') {
    return {
      subject: 'Update on your Netlink Ambassador application',
      ...sender,
      ...layout({
        preheader: 'An update on your application.',
        title: 'Your application update',
        intro: `${hi}Thank you for applying to the Netlink Ambassador Program. We appreciate that you wanted to help Netlink grow.`,
        rows: [
          ['Application', 'Pilot Season 1'],
          ['Status', 'Not selected'],
        ],
        after: 'After reviewing your application, we are not able to move forward with it in this pilot season. We are keeping the pilot small, so we cannot accept every applicant. You are welcome to keep using Netlink and to share it with your community.',
        signoff,
        ...footer,
      }),
    };
  }

  return null;
}

// ---------------------------------------------------------------- senders

// To the customer, resolved from auth.users by user id.
export function emailUser(userId, mail) {
  if (!mail) return;
  waitUntil(
    (async () => {
      const to = await getUserEmail(userId);
      if (to) await sendMail({ ...mail, to });
    })()
  );
}

// To the team mailbox.
export function emailAdmin(mail) {
  const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;
  if (mail && to) sendMailBackground({ ...mail, to });
}
