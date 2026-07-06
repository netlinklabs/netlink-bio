// api/bio.js
// Server-rendered public bio page with embedded JSON-LD (schema.org/Person).
// Runs on Vercel's Node.js serverless runtime — data is fetched here, on the
// server, BEFORE any HTML is sent to the browser. This means AI crawlers and
// bots that don't execute JavaScript (e.g. GPTBot) still see the full content
// and structured data, not an empty shell.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

// Brand logos via jsDelivr's simple-icons package — reliable, heavily-cached CDN.
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iconHtml(iconKey) {
  const slug = BRAND_SLUGS[iconKey];
  if (slug) {
    return `<img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg" alt="${escapeHtml(iconKey)}" class="brand-svg">`;
  }
  const emojiOnly = { globe: '🌐', mail: '✉️', link: '🔗' };
  if (emojiOnly[iconKey]) return `<span class="emoji-icon">${emojiOnly[iconKey]}</span>`;
  // All other icon keys map directly to a Lucide icon name (lucide-static SVGs via jsDelivr)
  return `<img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${iconKey}.svg" alt="${escapeHtml(iconKey)}" class="brand-svg lucide-svg" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'emoji-icon',textContent:'🔗'}))">`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
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
  if (!username) { res.status(400).send('Missing username'); return; }

  let profile, links;
  try {
    const profiles = await supabaseGet(`profiles?username=eq.${encodeURIComponent(username)}&select=*`);
    if (!profiles.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage(username));
      return;
    }
    profile = profiles[0];
    links = await supabaseGet(`links?user_id=eq.${profile.id}&is_active=eq.true&select=*&order=position.asc`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this profile.');
    return;
  }

  const displayName = profile.display_name || profile.username;
  const bio = (profile.bio || '').slice(0, 500);
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink-bio.vercel.app/${profile.username}`;
  const walletAddress = profile.wallet_address || '';
  const showCv = profile.show_cv !== false;
  const showDonate = profile.show_donate === true && !!walletAddress;
  const iconShape = profile.link_icon_shape === 'rounded' ? 'rounded' : 'circle';

  const youtubeUrl = profile.youtube_url || '';
  const youtubeTitle = profile.youtube_title || 'Watch my video';
  const youtubeId = extractYouTubeId(youtubeUrl);
  const showYoutubeThumb = profile.show_youtube_thumbnail !== false;

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
    contactIcons.push(`<a class="contact-icon" title="WhatsApp" href="https://wa.me/${escapeHtml(profile.contact_whatsapp.replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener">${iconHtml('whatsapp')}</a>`);
  }
  if (profile.contact_telegram) {
    contactIcons.push(`<a class="contact-icon" title="Telegram" href="https://t.me/${escapeHtml(profile.contact_telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">${iconHtml('telegram')}</a>`);
  }
  if (profile.contact_email) {
    contactIcons.push(`<a class="contact-icon" title="Email" href="mailto:${escapeHtml(profile.contact_email)}">${iconHtml('mail')}</a>`);
  }
  const contactIconsHtml = contactIcons.length ? `<div class="contact-row">${contactIcons.join('')}</div>` : '';

  // ---- YouTube section (single video, thumbnail toggle) ----
  let youtubeHtml = '';
  if (youtubeUrl) {
    if (showYoutubeThumb && youtubeId) {
      youtubeHtml = `
      <a class="youtube-frame" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">
        <img src="https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg" alt="${escapeHtml(youtubeTitle)}" class="youtube-thumb">
        <span class="youtube-play">&#9658;</span>
        <span class="youtube-caption">${escapeHtml(youtubeTitle)}</span>
      </a>`;
    } else {
      youtubeHtml = `
      <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener" class="link-card">
        <span class="link-icon ${iconShape}">${iconHtml('youtube')}</span>
        <span class="link-text"><span class="link-title">${escapeHtml(youtubeTitle)}</span></span>
      </a>`;
    }
  }

  // ---- Links list ----
  const linksHtml = links.map((l) => `
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="link-card">
        <span class="link-icon ${iconShape}">${iconHtml(l.icon)}</span>
        <span class="link-text">
          <span class="link-title">${escapeHtml(l.title)}</span>
          ${l.description ? `<span class="link-desc">${escapeHtml(l.description)}</span>` : ''}
        </span>
      </a>`).join('\n');

  // ---- CV card ----
  const cvHtml = showCv ? `
      <a href="/cv.html" target="_blank" rel="noopener" class="link-card cv-card">
        <span class="link-icon ${iconShape}"><span class="emoji-icon">📄</span></span>
        <span class="link-text"><span class="link-title">View my Professional CV</span></span>
      </a>` : '';

  // ---- Donate card + modal ----
  const donateHtml = showDonate ? `
      <button type="button" onclick="openDonateModal()" class="donate-card">
        <span class="donate-icon"><img src="/assets/usdc-logo.png" alt="USDC"></span>
        <span class="donate-text">
          <span class="donate-title">Receive Crypto Payments</span>
          <span class="donate-subtitle">USDC &middot; Polygon Network</span>
        </span>
      </button>` : '';

  const donateModalHtml = showDonate ? `
    <div id="donateModal" class="modal-overlay" onclick="if(event.target===this) closeDonateModal()">
      <div class="modal-box">
        <button class="modal-close" onclick="closeDonateModal()">&times;</button>
        <h3>Support ${escapeHtml(displayName)}</h3>
        <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(walletAddress)}" alt="Wallet QR code">
        <p class="wallet-address">${escapeHtml(walletAddress)}</p>
        <button class="copy-btn" onclick="copyWallet()">Copy address</button>
        <p class="wallet-note">EVM wallet &middot; Polygon PoS Network</p>
      </div>
    </div>` : '';

  const bodyContent = [
    bio ? `<p class="bio">${escapeHtml(bio)}</p>` : '',
    youtubeHtml,
    linksHtml,
    cvHtml,
    donateHtml,
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(displayName)} (@${escapeHtml(profile.username)}) — Netlink.bio</title>
<meta name="description" content="${escapeHtml(bio || `${displayName}'s links, on Netlink.bio`)}">

<meta property="og:title" content="${escapeHtml(displayName)} — Netlink.bio">
<meta property="og:description" content="${escapeHtml(bio)}">
${avatar ? `<meta property="og:image" content="${escapeHtml(avatar)}">` : ''}
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="profile">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
  body { margin:0; background:#f8fafc; color:#0f172a; min-height:100vh; }
  .wrap { max-width: 480px; margin: 0 auto; padding: 48px 20px; }
  .avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; margin:0 auto 16px; display:block; background:#e2e8f0; }
  .avatar-fallback { width:96px; height:96px; border-radius:50%; margin:0 auto 16px; background:linear-gradient(135deg,#14b8a6,#0d9488); display:flex; align-items:center; justify-content:center; color:white; font-size:36px; font-weight:700; }
  h1 { text-align:center; font-family:'Poppins',sans-serif; font-size:22px; margin:0 0 4px; }
  .handle { text-align:center; color:#64748b; font-size:14px; margin:0 0 14px; }
  .contact-row { display:flex; justify-content:center; gap:10px; margin-bottom:20px; }
  .contact-icon { width:38px; height:38px; border-radius:50%; background:white; border:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; text-decoration:none; padding:9px; }
  .contact-icon .brand-svg { width:100%; height:100%; }
  .bio { text-align:center; color:#475569; font-size:14px; margin:0 0 20px; line-height:1.5; white-space:pre-wrap; }
  .youtube-frame { position:relative; display:block; border-radius:16px; overflow:hidden; margin-bottom:12px; box-shadow:0 10px 25px rgba(0,0,0,0.12); border:1px solid rgba(0,0,0,0.06); }
  .youtube-thumb { width:100%; display:block; }
  .youtube-play { position:absolute; top:40%; left:50%; transform:translate(-50%,-50%); width:56px; height:56px; background:rgba(0,0,0,0.55); border-radius:50%; color:white; font-size:20px; display:flex; align-items:center; justify-content:center; }
  .youtube-caption { display:block; padding:10px 14px; font-size:13px; font-weight:600; background:white; }
  .link-card { display:flex; align-items:center; gap:12px; background:white; border:1px solid rgba(0,0,0,0.08); border-radius:16px; padding:14px 16px; margin-bottom:12px; text-decoration:none; color:#0f172a; transition:transform .15s; width:100%; text-align:left; cursor:pointer; font:inherit; }
  .link-card:hover { transform:translateY(-2px); border-color:#14b8a6; }
  .link-icon { width:36px; height:36px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:white; border:1px solid rgba(0,0,0,0.08); padding:8px; }
  .link-icon.circle { border-radius:50%; }
  .link-icon.rounded { border-radius:10px; }
  .link-icon .brand-svg { width:100%; height:100%; }
  .link-icon .emoji-icon { font-size:18px; }
  .link-text { display:flex; flex-direction:column; min-width:0; }
  .link-title { font-weight:600; font-size:14px; }
  .link-desc { font-size:12px; color:#64748b; }

  /* Donate / Receive Crypto Payment — taller, coin-style icon, USDC accent */
  .donate-card { display:flex; align-items:center; gap:14px; background:white; border:1.5px solid #2775CA33; border-radius:18px; padding:18px 18px; margin-bottom:12px; width:100%; text-align:left; cursor:pointer; font:inherit; color:#0f172a; transition:transform .15s; box-shadow:0 4px 14px rgba(39,117,202,0.08); }
  .donate-card:hover { transform:translateY(-2px); border-color:#2775CA; }
  .donate-icon { width:56px; height:56px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:white; border:1px solid rgba(0,0,0,0.08); box-shadow:0 2px 6px rgba(0,0,0,0.08); overflow:hidden; }
  .donate-icon img { width:100%; height:100%; object-fit:cover; }
  .donate-text { display:flex; flex-direction:column; min-width:0; }
  .donate-title { font-weight:700; font-size:15px; }
  .donate-subtitle { font-size:12px; color:#2775CA; font-weight:500; margin-top:2px; }

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

    ${bodyContent || '<p class="empty">This page is still being set up.</p>'}

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
