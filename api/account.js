// api/account.js
// Consolidates api/export-data.js and api/record-consent.js behind one
// file, dispatched by ?action=export|consent -- Vercel Hobby plan caps a
// deployment at 12 Serverless Functions, and the project was over that
// limit. Each action's request params, response shape, headers, and
// error handling are copied over unchanged from the original file; this
// is a routing consolidation only, not a behavior change.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

function getAccessToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

async function supabaseGet(path, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase query failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ==================== action=export (ex api/export-data.js) ====================
// Builds a downloadable JSON export of the current user's personal data.
// Uses the user's own access token as the Authorization header for every
// PostgREST call, so Supabase RLS (owner-only SELECT) applies exactly as
// it would from the browser -- no service-role key needed, no risk of
// this endpoint being used to pull another user's data.

async function handleExport(req, res) {
  const accessToken = getAccessToken(req);

  if (!accessToken) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  try {
    // Validate the token and get the user's own id -- also confirms the
    // token is genuine and not expired before we run any queries with it.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    const user = await userRes.json();

    // Every query below is scoped with the user's own token, so RLS
    // (owner-only SELECT) enforces the id/user_id/owner_id filter server
    // side too -- the eq filters here are for query efficiency, not the
    // sole security boundary.
    const [profile, consents, deletionRequests, contacts] = await Promise.all([
      supabaseGet(`profiles?id=eq.${user.id}&select=*`, accessToken),
      supabaseGet(`user_consents?user_id=eq.${user.id}&select=*&order=accepted_at.desc`, accessToken),
      supabaseGet(`deletion_requests?user_id=eq.${user.id}&select=*&order=requested_at.desc`, accessToken),
      supabaseGet(`contacts?owner_id=eq.${user.id}&select=*`, accessToken),
    ]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      profile: profile[0] || null,
      consents,
      deletion_requests: deletionRequests,
      contacts,
      note: 'On-chain wallet transactions are public blockchain data and are not included here -- view them via PolygonScan using your wallet address.',
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="netlink-data-export.json"');
    res.status(200).send(JSON.stringify(exportPayload, null, 2));
  } catch (err) {
    console.error('Export data failed:', err);
    res.status(502).json({ error: 'Failed to build data export' });
  }
}

// ==================== action=consent (ex api/record-consent.js) ====================
// Proxies consent acceptance so the IP address is captured server-side
// (from request headers) rather than trusted from the browser. Forwards
// the user's own access token to the record_consent RPC, so it still
// runs as that user (auth.uid() inside the function resolves correctly)
// -- this endpoint cannot record a consent for anyone else.

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

async function handleConsent(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = getAccessToken(req);
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

export default async function handler(req, res) {
  const action = req.query.action;
  if (action === 'export') return handleExport(req, res);
  if (action === 'consent') return handleConsent(req, res);
  res.status(400).json({ error: 'Invalid or missing action (expected export or consent)' });
}
