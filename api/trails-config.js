// api/trails-config.js
// Serves the Trails (Sequence) client key from a Vercel env var so it is not
// hardcoded in the repo and can be rotated without editing HTML.
// NOTE: the Trails widget runs in the browser, so this key is still visible to
// the client by design. Restrict it to netlink.bio in the Trails/Sequence
// dashboard (allowed domains) -- that is the real protection.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const apiKey = process.env.TRAILS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfiguration: missing Trails API key' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ apiKey });
}
