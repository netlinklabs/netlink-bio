// api/_lib/mailer.js
// Transactional email over SMTP (finance@netlink.bio). Lives in _lib so it does
// not count toward the Vercel Hobby 12-function cap.
//
// Env (Vercel, Production): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Optional: ADMIN_NOTIFY_EMAIL (defaults to SMTP_USER).
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
export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
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

function layout({ preheader, title, intro, rows = [], cta, note }) {
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
  const noteHtml = note ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">${esc(note)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="padding:20px 28px;background:#0f172a;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">Netlink</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${esc(title)}</h1>
<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${esc(intro)}</p>
${rowsHtml}${ctaHtml}${noteHtml}
</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;color:#9ca3af;font-size:12px;line-height:1.5;">Netlink Finance, netlink.bio<br>This is an automated message. Questions? Reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
  const lines = [title, '', intro, ''];
  rows.forEach(([k, v]) => lines.push(`${k}: ${v}`));
  if (cta) lines.push('', `${cta.label}: ${cta.url}`);
  if (note) lines.push('', note);
  lines.push('', 'Netlink Finance, netlink.bio');
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

const TYPE_LABEL = { kyc: 'Identity verification (KYC)' };

function orderRows(o) {
  return [
    ['Order', o.order_no],
    ['Item', TYPE_LABEL[o.type] || o.type],
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

export function receiptMail(o) {
  return {
    subject: `Receipt for order ${o.order_no}`,
    ...layout({
      preheader: `Payment received for ${o.order_no}`,
      title: 'Payment received',
      intro: 'We received your payment. You can start your identity verification now.',
      rows: [
        ...orderRows(o),
        ['Paid', fmtUsdc(o.paid_amount)],
        ['Paid at', fmtDate(o.paid_at)],
        ...(o.paid_tx_hash ? [['Transaction', o.paid_tx_hash]] : []),
      ],
      cta: { label: 'Start verification', url: `${SITE}/identity` },
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
