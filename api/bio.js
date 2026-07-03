// api/bio.js
// Server-rendered public bio page with embedded JSON-LD (schema.org/Person).
// Runs on Vercel's Node.js serverless runtime — data is fetched here, on the
// server, BEFORE any HTML is sent to the browser. This means AI crawlers and
// bots that don't execute JavaScript (e.g. GPTBot) still see the full content
// and structured data, not an empty shell.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

const ICONS = {
  instagram: '📷', twitter: '🐦', facebook: '📘', linkedin: '💼',
  youtube: '▶️', globe: '🌐', mail: '✉️', link: '🔗',
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

function notFoundPage(username) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Profile not found — Netlink.bio</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;text-align:center;padding:80px 20px;color:#334155}</style>
</head><body>
<h1>@${escapeHtml(username)} isn't on Netlink.bio</h1>
<p><a href="/">Create your own free page &rarr;</a></p>
</body></html>`;
}

export default async function handler(req, res) {
  const username = (req.query.username || '').toLowerCase().trim();

  if (!username) {
    res.status(400).send('Missing username');
    return;
  }

  let profile, links;
  try {
    const profiles = await supabaseGet(
      `profiles?username=eq.${encodeURIComponent(username)}&select=*`
    );
    if (!profiles.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage(username));
      return;
    }
    profile = profiles[0];

    links = await supabaseGet(
      `links?user_id=eq.${profile.id}&is_active=eq.true&select=*&order=position.asc`
    );
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this profile.');
    return;
  }

  const displayName = profile.display_name || profile.username;
  const bio = profile.bio || '';
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink-bio.vercel.app/u/${profile.username}`;

  // ---- JSON-LD (schema.org/Person) ----
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: displayName,
    url: pageUrl,
    ...(bio ? { description: bio } : {}),
    ...(avatar ? { image: avatar } : {}),
    ...(links.length ? { sameAs: links.map((l) => l.url) } : {}),
  };

  // ---- Links HTML ----
  const linksHtml = links
    .map(
      (l) => `
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener"
         class="link-card">
        <span class="link-icon">${ICONS[l.icon] || ICONS.link}</span>
        <span class="link-text">
          <span class="link-title">${escapeHtml(l.title)}</span>
          ${l.description ? `<span class="link-desc">${escapeHtml(l.description)}</span>` : ''}
        </span>
      </a>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(displayName)} (@${escapeHtml(profile.username)}) — Netlink.bio</title>
<meta name="description" content="${escapeHtml(bio || `${displayName}'s links, on Netlink.bio`)}">

<!-- Open Graph -->
<meta property="og:title" content="${escapeHtml(displayName)} — Netlink.bio">
<meta property="og:description" content="${escapeHtml(bio)}">
${avatar ? `<meta property="og:image" content="${escapeHtml(avatar)}">` : ''}
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="profile">

<!-- JSON-LD structured data for AI / search crawlers -->
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
  .font-poppins { font-family: 'Poppins', sans-serif; }
  body { margin:0; background:#f8fafc; color:#0f172a; min-height:100vh; }
  .wrap { max-width: 480px; margin: 0 auto; padding: 48px 20px; }
  .avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; margin:0 auto 16px; display:block; background:#e2e8f0; }
  .avatar-fallback { width:96px; height:96px; border-radius:50%; margin:0 auto 16px; background:linear-gradient(135deg,#14b8a6,#0d9488); display:flex; align-items:center; justify-content:center; color:white; font-size:36px; font-weight:700; }
  h1 { text-align:center; font-family:'Poppins',sans-serif; font-size:22px; margin:0 0 4px; }
  .handle { text-align:center; color:#64748b; font-size:14px; margin:0 0 16px; }
  .bio { text-align:center; color:#475569; font-size:14px; margin:0 0 28px; line-height:1.5; }
  .link-card { display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.08); border-radius:16px; padding:14px 16px; margin-bottom:12px; text-decoration:none; color:#0f172a; transition:transform .15s; }
  .link-card:hover { transform:translateY(-2px); border-color:#14b8a6; }
  .link-icon { font-size:22px; width:36px; text-align:center; flex-shrink:0; }
  .link-text { display:flex; flex-direction:column; min-width:0; }
  .link-title { font-weight:600; font-size:14px; }
  .link-desc { font-size:12px; color:#64748b; }
  .footer { text-align:center; margin-top:32px; }
  .footer a { color:#94a3b8; font-size:12px; text-decoration:none; }
  .empty { text-align:center; color:#94a3b8; font-size:14px; padding:24px 0; }
</style>
</head>
<body>
  <div class="wrap">
    ${avatar
      ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
      : `<div class="avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>`}
    <h1>${escapeHtml(displayName)}</h1>
    <p class="handle">@${escapeHtml(profile.username)}</p>
    ${bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''}

    ${links.length ? linksHtml : '<p class="empty">No links yet.</p>'}

    <div class="footer">
      <a href="/">netlink.bio &mdash; build your page free</a>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}

