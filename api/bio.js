// api/bio.js
// Server-rendered public bio page with embedded JSON-LD (schema.org/Person).
// Runs on Vercel's Node.js serverless runtime — data is fetched here, on the
// server, BEFORE any HTML is sent to the browser.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

const BRAND_SLUGS = {
  instagram: 'instagram', x: 'x', twitter: 'x', facebook: 'facebook', linkedin: 'linkedin',
  youtube: 'youtube', tiktok: 'tiktok', whatsapp: 'whatsapp', telegram: 'telegram',
  threads: 'threads', pinterest: 'pinterest', snapchat: 'snapchat', twitch: 'twitch',
  discord: 'discord', spotify: 'spotify', soundcloud: 'soundcloud', applemusic: 'applemusic',
  github: 'github', behance: 'behance', dribbble: 'dribbble', medium: 'medium',
  reddit: 'reddit', paypal: 'paypal', patreon: 'patreon', vimeo: 'vimeo', netflix: 'netflix',
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function iconHtml(slug) {
  const brand = BRAND_SLUGS[slug.toLowerCase()] || 'link';
  return `<img src="https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/${brand}.svg" alt="${slug}">`;
}

// Handler utama untuk merender halaman
export default async function handler(req, res) {
  const { username } = req.query;
  
  // Fetch data profile dari Supabase
  const { data: profiles, error } = await fetch(`${SUPABASE_URL}/rest/v1/profiles?username=eq.${username}&select=*`, {
    headers: { apikey: SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  }).then(r => r.json());

  if (error || !profiles || profiles.length === 0) {
    return res.status(404).send('Profile not found');
  }

  const profile = profiles[0];
  const avatar = profile.avatar_url;
  const displayName = profile.display_name || profile.username;
  const walletAddress = profile.wallet_address;

  // Logika perbaikan Shape Icon di sini
  const iconShape = (profile.link_icon_shape === 'rounded') ? 'rounded' : 'circle';

  // Fetch links
  const { data: links } = await fetch(`${SUPABASE_URL}/rest/v1/links?user_id=eq.${profile.id}&order=position.asc`, {
    headers: { apikey: SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  }).then(r => r.json());

  const linksHtml = links.map((l) => `
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="link-card">
        <span class="link-icon ${iconShape}">${iconHtml(l.icon)}</span>
        <span class="link-title">${escapeHtml(l.title)}</span>
      </a>`).join('\n');

  // Render HTML final
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html>
    <head>
      <title>${displayName} | Netlink.bio</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        .avatar { width: 100px; height: 100px; border-radius: 50%; }
        .link-card { display: flex; align-items: center; padding: 10px; margin: 10px auto; border: 1px solid #ccc; width: 300px; border-radius: 8px; text-decoration: none; color: #333; }
        .link-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; margin-right: 15px; overflow: hidden; }
        .link-icon.circle { border-radius: 50%; }
        .link-icon.rounded { border-radius: 8px; }
        .link-icon img { width: 24px; height: 24px; }
      </style>
    </head>
    <body>
      ${avatar ? `<img class="avatar" src="${avatar}">` : ''}
      <h1>${displayName}</h1>
      <div class="links-container">${linksHtml}</div>
    </body>
    </html>
  `);
}
