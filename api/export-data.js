// api/export-data.js
// Builds a downloadable JSON export of the current user's personal data.
// Uses the user's own access token as the Authorization header for every
// PostgREST call, so Supabase RLS (owner-only SELECT) applies exactly as
// it would from the browser -- no service-role key needed, no risk of
// this endpoint being used to pull another user's data.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

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

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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
