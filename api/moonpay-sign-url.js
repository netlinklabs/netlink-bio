// api/moonpay-sign-url.js
// Generates a signed, IP-matched MoonPay widget URL server-side so the
// MoonPay secret key never appears in client-side code.
//
// Implements MoonPay's IP address matching requirement -- see:
// https://dev.moonpay.com/widget/on-ramp/customization/ip-matching
//
// MOONPAY_SECRET_KEY must be set in Vercel's environment variables.
// Never commit it or expose it to the client.

import crypto from 'crypto';

const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY;
const MOONPAY_WIDGET_BASE = 'https://buy.moonpay.com';

// Strips port/brackets and unmaps IPv4-mapped IPv6 addresses to plain
// IPv4. Not a full RFC 5952 normalizer -- MoonPay's requirement is just a
// consistent, canonical-enough form to hash reliably, not a spec-perfect one.
function canonicalizeIp(rawIp) {
  if (!rawIp) return null;
  let ip = rawIp.trim();

  // Bracketed IPv6 host, with or without a trailing port -- "[::1]:1234" or "[::1]"
  const bracketMatch = ip.match(/^\[(.+)\]:\d+$/) || ip.match(/^\[(.+)\]$/);
  if (bracketMatch) {
    ip = bracketMatch[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    // Plain IPv4 with a trailing port, e.g. "1.2.3.4:5678"
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }

  ip = ip.toLowerCase();

  // IPv4-mapped IPv6, e.g. "::ffff:1.2.3.4" -> "1.2.3.4"
  const mappedMatch = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedMatch) {
    ip = mappedMatch[1];
  }

  // IPv4: dotted-quad, no leading zeros on any octet.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    ip = ip.split('.').map((octet) => String(parseInt(octet, 10))).join('.');
  }

  return ip;
}

function getClientIp(req) {
  const trueClientIp = req.headers['true-client-ip'];
  if (trueClientIp) return Array.isArray(trueClientIp) ? trueClientIp[0] : trueClientIp;

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const first = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return first.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || null;
}

function hmacBase64(secret, input) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64');
}

export default async function handler(req, res) {
  try {
    if (!MOONPAY_SECRET_KEY) {
      console.error('Missing MOONPAY_SECRET_KEY');
      res.status(500).json({ error: 'Server misconfiguration: missing MoonPay secret key' });
      return;
    }

    const {
      walletAddress,
      baseCurrencyAmount,
      baseCurrencyCode = 'idr',
      defaultCurrencyCode = 'usdc_polygon',
      apiKey,
    } = req.query;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: 'Invalid or missing walletAddress' });
      return;
    }
    const amount = Number(baseCurrencyAmount);
    if (!baseCurrencyAmount || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid or missing baseCurrencyAmount' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'Missing apiKey' });
      return;
    }

    const canonicalIp = canonicalizeIp(getClientIp(req));
    if (!canonicalIp) {
      res.status(400).json({ error: 'Could not determine client IP address' });
      return;
    }

    const allowedIpAddress = hmacBase64(MOONPAY_SECRET_KEY, canonicalIp);

    const queryString = [
      `apiKey=${encodeURIComponent(apiKey)}`,
      `currencyCode=${encodeURIComponent(defaultCurrencyCode)}`,
      `baseCurrencyCode=${encodeURIComponent(baseCurrencyCode)}`,
      `baseCurrencyAmount=${encodeURIComponent(amount)}`,
      `walletAddress=${encodeURIComponent(walletAddress)}`,
      `allowedIpAddress=${encodeURIComponent(allowedIpAddress)}`,
    ].join('&');

    const signature = hmacBase64(MOONPAY_SECRET_KEY, queryString);
    const signedUrl = `${MOONPAY_WIDGET_BASE}?${queryString}&signature=${encodeURIComponent(signature)}`;

    res.status(200).json({ signedUrl });
  } catch (err) {
    console.error('moonpay-sign-url failed:', err);
    res.status(500).json({ error: 'Failed to generate signed MoonPay URL' });
  }
}
