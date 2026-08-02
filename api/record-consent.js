// api/record-consent.js
// Proxies consent acceptance so the IP address is captured server-side
// (from request headers) rather than trusted from the browser. Forwards
// the user's own access token to the record_consent RPC, so it still
// runs as that user (auth.uid() inside the function resolves correctly)
// -- this endpoint cannot record a consent for anyone else.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const { consent_type, version } = req.body || {};
  if (!consent_type || !version) {
    res.status(400).json({ error: 'consent_type and version are required' });
    return;
  }

  const ip = getClientIp(req);

  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_consent`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_consent_type: consent_type,
        p_version: version,
        p_ip_address: ip,
      }),
    });

    if (!rpcRes.ok) {
      const body = await rpcRes.text();
      throw new Error(`record_consent RPC failed (${rpcRes.status}): ${body}`);
    }

    const consentId = await rpcRes.json();
    res.status(200).json({ id: consentId });
  } catch (err) {
    console.error('Record consent failed:', err);
    res.status(502).json({ error: 'Failed to record consent' });
  }
}
