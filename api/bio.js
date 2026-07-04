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

const DEFAULT_SECTIONS_ORDER = ['description', 'youtube', 'links', 'cv', 'donate'];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
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
  const bio = (profile.bio || '').slice(0, 150);
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink-bio.vercel.app/${profile.username}`;
  const youtubeId = extractYouTubeId(profile.youtube_url);
  const walletAddress = profile.wallet_address || '';
  const showCv = profile.show_cv !== false;
  const showDonate = profile.show_donate !== false && !!walletAddress;
  let sectionsOrder = DEFAULT_SECTIONS_ORDER;
  if (Array.isArray(profile.sections_order) && profile.sections_order.length) {
    sectionsOrder = profile.sections_order;
  }

  // ---- JSON-LD (schema.org/Person) ----
  const sameAs = [
    ...links.map((l) => l.url),
    ...(profile.contact_telegram ? [`https://t.me/${profile.contact_telegram.replace(/^@/, '')}`] : []),
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: displayName,
    url: pageUrl,
    ...(bio ? { description: bio } : {}),
    ...(avatar ? { image: avatar } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  // ---- Contact icons row (WhatsApp / Telegram / Email) ----
  const contactIcons = [];
  if (profile.contact_whatsapp) {
    contactIcons.push(`<a class="contact-icon" title="WhatsApp" href="https://wa.me/${escapeHtml(profile.contact_whatsapp.replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener">💬</a>`);
  }
  if (profile.contact_telegram) {
    contactIcons.push(`<a class="contact-icon" title="Telegram" href="https://t.me/${escapeHtml(profile.contact_telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">✈️</a>`);
  }
  if (profile.contact_email) {
    contactIcons.push(`<a class="contact-icon" title="Email" href="mailto:${escapeHtml(profile.contact_email)}">✉️</a>`);
  }
  const contactIconsHtml = contactIcons.length
    ? `<div class="contact-row">${contactIcons.join('')}</div>`
    : '';

  // ---- Section renderers ----
  const sectionRenderers = {
    description: () => (bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''),

    youtube: () => {
      if (!youtubeId) return '';
      return `
      <a class="youtube-frame" href="${escapeHtml(profile.youtube_url)}" target="_blank" rel="noopener">
        <img src="https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg" alt="YouTube video" class="youtube-thumb">
        <span class="youtube-play">&#9658;</span>
      </a>`;
    },

    links: () => {
      if (!links.length) return '';
      return links
        .map(
          (l) => `
          <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="link-card">
            <span class="link-icon">${ICONS[l.icon] || ICONS.link}</span>
            <span class="link-text">
              <span class="link-title">${escapeHtml(l.title)}</span>
              ${l.description ? `<span class="link-desc">${escapeHtml(l.description)}</span>` : ''}
            </span>
          </a>`
        )
        .join('\n');
    },

    cv: () => {
      if (!showCv) return '';
      return `
      <a href="/cv.html" target="_blank" rel="noopener" class="link-card cv-card">
        <span class="link-icon">📄</span>
        <span class="link-text">
          <span class="link-title">View my Professional CV</span>
        </span>
      </a>`;
    },

    donate: () => {
      if (!showDonate) return '';
      return `
      <button type="button" onclick="openDonateModal()" class="link-card donate-card">
        <span class="link-icon">☕</span>
        <span class="link-text">
          <span class="link-title">Donate / Buy me a coffee</span>
        </span>
      </button>`;
    },
  };

  const sectionsHtml = sectionsOrder
    .map((key) => sectionRenderers[key] ? sectionRenderers[key]() : '')
    .filter(Boolean)
    .join('\n');

  const donateModalHtml = showDonate
    ? `
    <div id="donateModal" class="modal-overlay" onclick="if(event.target===this) closeDonateModal()">
      <div class="modal-box">
        <button class="modal-close" onclick="closeDonateModal()">&times;</button>
        <h3>Support ${escapeHtml(displayName)}</h3>
        <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(walletAddress)}" alt="Wallet QR code">
        <p class="wallet-address">${escapeHtml(walletAddress)}</p>
        <button class="copy-btn" onclick="copyWallet()">Copy address</button>
        <p class="wallet-note">EVM wallet &middot; Polygon PoS Network</p>
      </div>
    </div>`
    : '';

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
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">

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
  .handle { text-align:center; color:#64748b; font-size:14px; margin:0 0 14px; }
  .contact-row { display:flex; justify-content:center; gap:10px; margin-bottom:20px; }
  .contact-icon { width:38px; height:38px; border-radius:50%; background:white; border:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; font-size:18px; text-decoration:none; }
  .bio { text-align:center; color:#475569; font-size:14px; margin:0 0 20px; line-height:1.5; }
  .youtube-frame { position:relative; display:block; border-radius:16px; overflow:hidden; margin-bottom:20px; box-shadow:0 10px 25px rgba(0,0,0,0.12); border:1px solid rgba(0,0,0,0.06); }
  .youtube-thumb { width:100%; display:block; }
  .youtube-play { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:56px; height:56px; background:rgba(0,0,0,0.55); border-radius:50%; color:white; font-size:20px; display:flex; align-items:center; justify-content:center; }
  .link-card { display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.08); border-radius:16px; padding:14px 16px; margin-bottom:12px; text-decoration:none; color:#0f172a; transition:transform .15s; width:100%; text-align:left; cursor:pointer; font:inherit; }
  .link-card:hover { transform:translateY(-2px); border-color:#14b8a6; }
  .link-icon { font-size:22px; width:36px; text-align:center; flex-shrink:0; }
  .link-text { display:flex; flex-direction:column; min-width:0; }
  .link-title { font-weight:600; font-size:14px; }
  .link-desc { font-size:12px; color:#64748b; }
  .footer { text-align:center; margin-top:32px; }
  .footer a { color:#94a3b8; font-size:12px; text-decoration:none; }
  .empty { text-align:center; color:#94a3b8; font-size:14px; padding:24px 0; }

  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:100; align-items:center; justify-content:center; padding:20px; }
  .modal-overlay.active { display:flex; }
  .modal-box { background:white; border-radius:20px; padding:28px 24px; max-width:320px; width:100%; text-align:center; position:relative; }
  .modal-close { position:absolute; top:12px; right:16px; border:none; background:none; font-size:22px; color:#94a3b8; cursor:pointer; }
  .modal-box h3 { margin:0 0 16px; font-size:16px; }
  .qr-code { width:180px; height:180px; margin:0 auto 16px; border-radius:12px; }
  .wallet-address { font-size:12px; color:#475569; word-break:break-all; background:#f1f5f9; border-radius:8px; padding:8px 10px; margin-bottom:12px; }
  .copy-btn { width:100%; padding:10px; background:#14b8a6; color:white; border:none; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; margin-bottom:10px; }
  .wallet-note { font-size:11px; color:#94a3b8; margin:0; }
</style>
</head>
<body>
  <div class="wrap">
    ${avatar
      ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
      : `<div class="avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>`}
    <h1>${escapeHtml(displayName)}</h1>
    <p class="handle">@${escapeHtml(profile.username)}</p>
    ${contactIconsHtml}

    ${sectionsHtml || '<p class="empty">This page is still being set up.</p>'}

    <div class="footer">
      <a href="/">netlink.bio &mdash; build your page free</a>
    </div>
  </div>

  ${donateModalHtml}

  <script>
    function openDonateModal() { document.getElementById('donateModal').classList.add('active'); }
    function closeDonateModal() { document.getElementById('donateModal').classList.remove('active'); }
    function copyWallet() {
      navigator.clipboard.writeText(${JSON.stringify(walletAddress)}).then(() => {
        const btn = document.querySelector('.copy-btn');
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = original, 1500);
      });
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
