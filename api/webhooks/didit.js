// api/webhooks/didit.js
// Receives real-time KYC/KYB events from Didit and records them in
// public.verifications.
//
// Signature: uses X-Signature-V2, which is NOT a hash of raw bytes --
// it's HMAC-SHA256 over the parsed body re-serialized as canonical JSON
// (keys sorted recursively, compact separators, Unicode preserved,
// whole-valued floats shortened to ints). This matches Didit's official
// Node.js example exactly (docs.didit.me/integration/webhooks).
// X-Signature-Simple is kept as a fallback -- it only authenticates the
// envelope (timestamp/session_id/status/webhook_type), not `decision`,
// which is fine for us since we never read `decision` at all.

import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }, // we parse manually so we control exactly what gets hashed
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

// Match Didit's float normalization: whole-valued floats serialize as ints.
// (Largely a no-op in JS since JSON.parse doesn't retain a float/int
// distinction, but kept for exact parity with Didit's own reference code.)
function shortenFloats(data) {
  if (Array.isArray(data)) return data.map(shortenFloats);
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, shortenFloats(value)])
    );
  }
  if (typeof data === 'number' && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }
  return data;
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySignatureV2(parsedBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const canonical = JSON.stringify(sortKeys(shortenFloats(parsedBody)));
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return timingSafeEqualStrings(expected, signatureHeader);
}

function verifySignatureSimple(parsedBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const canonical = [
    parsedBody.timestamp ?? '',
    parsedBody.session_id ?? '',
    parsedBody.status ?? '',
    parsedBody.webhook_type ?? '',
  ].join(':');
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return timingSafeEqualStrings(expected, signatureHeader);
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

  if (res.ok) return { ok: true };

  const text = await res.text();

  // vendor_data that isn't usable as a real profile reference -- either a
  // foreign-key violation (valid UUID, no matching profile) or an invalid
  // UUID format entirely (Didit's "Try Webhook" sends a plain test string
  // like "test-vendor-data-123", code 22P02). Both are expected for test
  // deliveries and NOT a real failure -- skip gracefully instead of retrying.
  const isUnusableVendorData =
    text.includes('23503') ||        // foreign_key_violation
    text.includes('22P02') ||        // invalid_text_representation (bad uuid)
    text.includes('foreign key') ||
    text.includes('invalid input syntax for type uuid');
  const isDuplicate = res.status === 409 && !isUnusableVendorData;

  if (isDuplicate) return { ok: true, note: 'duplicate event_id, ignored' };
  if (isUnusableVendorData) return { ok: true, note: 'unusable vendor_data, skipped' };

  throw new Error(`Supabase insert failed: ${res.status} ${text}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = await getRawBody(req);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Didit webhook: invalid JSON body', err);
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const timestampHeader = req.headers['x-timestamp'];
  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    console.error('Didit webhook: stale or missing timestamp');
    res.status(401).json({ error: 'Stale timestamp' });
    return;
  }

  const sigV2 = req.headers['x-signature-v2'];
  const sigSimple = req.headers['x-signature-simple'];

  const verified =
    verifySignatureV2(payload, sigV2, DIDIT_WEBHOOK_SECRET) ||
    verifySignatureSimple(payload, sigSimple, DIDIT_WEBHOOK_SECRET);

  if (!verified) {
    console.error('Didit webhook: invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Only "status.updated" carries the session decision info we track.
  // Other event families (transaction.*, travel_rule.*, activity.created,
  // entity events) aren't used by Netlink yet -- acknowledge and skip.
  if (payload.webhook_type !== 'status.updated') {
    res.status(200).json({ received: true, skipped: payload.webhook_type });
    return;
  }

  const profileId = payload.vendor_data; // set to profiles.id when the session was created
  if (!profileId) {
    res.status(200).json({ received: true, note: 'missing vendor_data' }); // 2xx: not retryable
    return;
  }

  const kind = payload.session_kind === 'business' ? 'business' : 'identity';
  const sessionId = payload.business_session_id || payload.session_id || null;

  try {
    const result = await insertVerification({
      event_id: payload.event_id,
      profile_id: profileId,
      kind,
      provider: 'didit',
      provider_session_id: sessionId,
      status: normalizeStatus(payload.status),
      raw_status: payload.status,
    });
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error('Didit webhook: failed to record verification', err);
    res.status(500).json({ error: 'Internal error' }); // 5xx -> Didit will retry
  }
}
