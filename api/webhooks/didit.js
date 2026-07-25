// api/webhooks/didit.js
// Receives real-time KYC/KYB events from Didit and records them in
// public.verifications. Uses the raw-bytes X-Signature (not the V2
// canonical-JSON variant) because we capture the body ourselves before
// any parsing/re-encoding happens -- this satisfies the exact condition
// Didit's docs give for X-Signature being safe to use ("works only if
// your stack does not re-encode the body").

import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }, // we need the raw bytes for signature verification
};

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET;

const MAX_TIMESTAMP_SKEW_SECONDS = 300; // 5 minutes, per Didit docs

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader || !DIDIT_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', DIDIT_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

// Normalize Didit's exact status strings into our own provider-agnostic
// vocabulary. This is the ONLY place that needs to change if we ever
// add/swap a KYC provider.
function normalizeStatus(diditStatus) {
  const map = {
    'Approved': 'approved',
    'Declined': 'declined',
    'In Review': 'pending',
    'In Progress': 'pending',
    'Not Started': 'not_started',
    'Abandoned': 'abandoned',
    'Expired': 'expired',
    'Kyc Expired': 'expired',
    'Resubmitted': 'resubmission_needed',
    'Awaiting User': 'pending',
  };
  return map[diditStatus] || 'pending';
}

async function insertVerification(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/verifications`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      // Duplicate event_id (retry) -> silently ignored, not an error.
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Supabase insert failed: ${res.status} ${text}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = await getRawBody(req);

  const signature = req.headers['x-signature'];
  const timestampHeader = req.headers['x-timestamp'];

  if (!verifySignature(rawBody, signature)) {
    console.error('Didit webhook: invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    console.error('Didit webhook: stale or missing timestamp');
    res.status(401).json({ error: 'Stale timestamp' });
    return;
  }

  // Respond fast -- process after we know signature+timestamp are good.
  // (Parsing/DB write here is cheap enough to stay inline for now; if it
  // ever gets heavier, move this to a queue and return 200 immediately.)
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Didit webhook: invalid JSON body', err);
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Only "status.updated" carries the session decision info we track.
  // Other event families (transaction.*, travel_rule.*, activity.created)
  // aren't used by Netlink yet -- acknowledge and skip.
  if (payload.webhook_type !== 'status.updated') {
    res.status(200).json({ received: true, skipped: payload.webhook_type });
    return;
  }

  const profileId = payload.vendor_data; // set to profiles.id when the session was created
  if (!profileId) {
    console.error('Didit webhook: missing vendor_data (profile id)');
    res.status(200).json({ received: true, error: 'missing vendor_data' }); // 2xx: not retryable
    return;
  }

  const kind = payload.session_kind === 'business' ? 'business' : 'identity';
  const sessionId = payload.business_session_id || payload.session_id || null;

  try {
    await insertVerification({
      event_id: payload.event_id,
      profile_id: profileId,
      kind,
      provider: 'didit',
      provider_session_id: sessionId,
      status: normalizeStatus(payload.status),
      raw_status: payload.status,
    });
  } catch (err) {
    console.error('Didit webhook: failed to record verification', err);
    res.status(500).json({ error: 'Internal error' }); // 5xx -> Didit will retry
    return;
  }

  res.status(200).json({ received: true });
}
