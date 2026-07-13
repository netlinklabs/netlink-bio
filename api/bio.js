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

// ---- Verification badges (Green/Gold/Silver/Black) ----
// Color is computed live from stored facts + current tier, never stored
// directly, so it always reflects live subscription status without any
// extra write whenever a tier changes. Mirrors the same logic used in
// dashboard.html so both surfaces always agree.
function formatBadgeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function computeBadges(profile) {
  const badges = [];
  const tier = profile.tier || 'basic';
  const tierEligible = tier === 'gold' || tier === 'platinum';

  if (profile.is_black_badge) {
    badges.push({
      color: 'black', label: 'Netlink Special',
      message: 'Awarded directly by the Netlink.bio team as special recognition.',
      date: null,
    });
  }
  if (profile.business_verified_at) {
    badges.push(tierEligible
      ? { color: 'gold', label: 'Verified Business', message: "This business's registration has been manually verified by the Netlink.bio team.", date: profile.business_verified_at }
      : { color: 'silver', label: 'Previously Verified', message: "This profile's identity was previously verified by the Netlink.bio team.", date: profile.business_verified_at });
  }
  if (profile.identity_verified_at) {
    badges.push(tierEligible
      ? { color: 'green', label: 'Verified Person', message: "This profile's identity has been manually verified by the Netlink.bio team.", date: profile.identity_verified_at }
      : { color: 'silver', label: 'Previously Verified', message: "This profile's identity was previously verified by the Netlink.bio team.", date: profile.identity_verified_at });
  }
  return badges;
}

function badgeDotsHtml(profile) {
  const badges = computeBadges(profile);
  if (!badges.length) return '';
  return `<span class="badge-row">${badges.map((b, i) => `
      <button type="button" class="badge-dot badge-${b.color}" onclick="openBadgeModal(${i})" title="${escapeHtml(b.label)}">&#10003;</button>`).join('')}</span>`;
}

function badgeModalsHtml(profile) {
  const badges = computeBadges(profile);
  if (!badges.length) return '';
  const displayName = profile.display_name || profile.username || '';
  const avatar = profile.avatar_url || '';
  const avatarHtml = avatar
    ? `<img class="badge-modal-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
    : `<div class="badge-modal-avatar badge-modal-avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase() || '?')}</div>`;

  return badges.map((b, i) => `
    <div id="badgeModal${i}" class="badge-modal-overlay" onclick="if(event.target===this) closeBadgeModal(${i})">
      <div class="badge-modal-box">
        <span class="badge-modal-handle"></span>
        <button class="badge-modal-close" onclick="closeBadgeModal(${i})">&times;</button>
        <div class="badge-modal-avatar-wrap">
          ${avatarHtml}
          <span class="badge-modal-avatar-check badge-${b.color}">&#10003;</span>
        </div>
        <h3 class="badge-modal-title">&#9989; ${escapeHtml(b.label)}</h3>
        <p class="badge-modal-message">${escapeHtml(b.message)}</p>
        ${b.date ? `<p class="badge-modal-date">Verified since ${formatBadgeDate(b.date)}</p>` : ''}
      </div>
    </div>`).join('\n');
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
      <a href="/cv/${profile.username}" target="_blank" rel="noopener" class="link-card cv-card">
        <span class="link-icon ${iconShape}"><span class="emoji-icon">📄</span></span>
        <span class="link-text"><span class="link-title">View my Professional CV</span></span>
      </a>` : '';

  // ---- Donate card + modal ----
  const donateHtml = showDonate ? `
      <div class="donate-card-wrap">
        <button type="button" onclick="openDonateModal()" class="donate-card">
          <span class="donate-shimmer"></span>
          <span class="donate-icon-ring"><span class="donate-icon"><img src="/assets/usdc-logo.png" alt="USDC"></span></span>
          <span class="donate-text">
            <span class="donate-badges">
              <span class="donate-badge">&#9889; Instant</span>
              <span class="donate-badge">Tap to pay</span>
            </span>
            <span class="donate-title">Receive Crypto Payment</span>
            <span class="donate-subtitle">USDC &middot; Polygon Network</span>
          </span>
        </button>
      </div>` : '';

  const donateModalHtml = showDonate ? `
    <div id="donateModal" class="modal-overlay" onclick="if(event.target===this) closeDonateModal()">
      <div class="modal-box donate-modal-box">
        <button class="modal-close" onclick="closeDonateModal()">&times;</button>
        <h3>Support ${escapeHtml(displayName)}</h3>
        <div class="qr-frame"><img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(walletAddress)}" alt="Wallet QR code"></div>
        <p class="wallet-address">${escapeHtml(walletAddress)}</p>
        <button class="copy-btn" onclick="copyWallet()">Copy address</button>
        <p class="wallet-note">Polygon (PoS) Network</p>
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
<meta property="og:image" content="https://netlink-bio.vercel.app/api/og?username=${encodeURIComponent(profile.username)}&type=bio">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
  body { margin:0; background:#f8fafc; color:#0f172a; min-height:100vh; }
  .wrap { max-width: 480px; margin: 0 auto; padding: 20px 20px 48px; }
  .page-topbar { max-width: 480px; margin: 0 auto; padding: 16px 20px 0; display: flex; align-items: center; justify-content: space-between; }
  .topbar-logo { display: flex; align-items: center; }
  .topbar-logo img { width: 36px; height: 36px; border-radius: 8px; display: block; }
  .topbar-share-btn { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: none; cursor: pointer; color: #333; flex-shrink: 0; }
  .avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; margin:0 auto 16px; display:block; background:#e2e8f0; }
  .avatar-fallback { width:96px; height:96px; border-radius:50%; margin:0 auto 16px; background:linear-gradient(135deg,#14b8a6,#0d9488); display:flex; align-items:center; justify-content:center; color:white; font-size:36px; font-weight:700; }
  h1 { text-align:center; font-family:'Poppins',sans-serif; font-size:22px; margin:0 0 4px; }
  .name-row { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; }
  .badge-row { display:inline-flex; align-items:center; gap:4px; }
  .badge-dot { width:18px; height:18px; border-radius:50%; border:none; padding:0; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; line-height:1; cursor:pointer; flex-shrink:0; }
  .badge-green { background:#10b981; }
  .badge-gold { background:#f59e0b; }
  .badge-silver { background:#94a3b8; }
  .badge-black { background:#18181b; }

  /* Verification badge modal -- bottom sheet, Linktree-style */
  .badge-modal-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:100; align-items:flex-end; justify-content:center; }
  .badge-modal-overlay.active { display:flex; animation: badge-fade-in 0.2s ease-out; }
  @keyframes badge-fade-in { from { opacity:0; } to { opacity:1; } }
  .badge-modal-box { position:relative; background:white; width:100%; max-width:480px; border-radius:24px 24px 0 0; padding:14px 24px 36px; box-shadow:0 -10px 30px rgba(0,0,0,0.2); animation: badge-slide-up 0.25s cubic-bezier(0.16,1,0.3,1); }
  @keyframes badge-slide-up { from { transform:translateY(100%); } to { transform:translateY(0); } }
  .badge-modal-handle { display:block; width:36px; height:4px; border-radius:99px; background:#e2e8f0; margin:0 auto 20px; }
  .badge-modal-close { position:absolute; top:16px; right:18px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; color:#64748b; font-size:16px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .badge-modal-avatar-wrap { position:relative; width:64px; height:64px; margin-bottom:16px; }
  .badge-modal-avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; display:block; background:#e2e8f0; }
  .badge-modal-avatar-fallback { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,#14b8a6,#0d9488); display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700; }
  .badge-modal-avatar-check { position:absolute; bottom:-2px; right:-2px; width:24px; height:24px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; color:white; font-size:11px; box-sizing:content-box; }
  .badge-modal-title { font-family:'Poppins',sans-serif; font-size:19px; font-weight:700; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
  .badge-modal-message { font-size:14px; color:#475569; line-height:1.6; margin:0 0 12px; }
  .badge-modal-date { font-size:12px; color:#94a3b8; margin:0; }
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
  /* Donate / Receive Crypto Payment — premium gold-on-dark "killer feature" card */
  .donate-card-wrap { padding:1.5px; border-radius:19px; margin-bottom:12px; background:linear-gradient(135deg, rgba(200,200,205,0.9), rgba(200,200,205,0.15) 40%, rgba(200,200,205,0.9)); }
  .donate-card { position:relative; overflow:hidden; display:flex; align-items:center; gap:14px; background:linear-gradient(160deg, #0d0d0f 0%, #1c1c1e 45%, #2a2a2e 100%); border-radius:17.5px; padding:18px; width:100%; text-align:left; cursor:pointer; font:inherit; transition:transform .2s, box-shadow .2s; }
  .donate-card:hover { transform:translateY(-4px); box-shadow:0 14px 30px rgba(200,200,205,0.3); }
  .donate-shimmer { position:absolute; top:0; left:-60%; width:50%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,0.15), transparent); transform:skewX(-20deg); animation:shimmer-sweep 3.2s ease-in-out infinite; pointer-events:none; }
  @keyframes shimmer-sweep { 0% { left:-60%; } 55% { left:130%; } 100% { left:130%; } }
  .donate-icon-ring { position:relative; flex-shrink:0; width:60px; height:60px; display:flex; align-items:center; justify-content:center; border-radius:50%; }
  .donate-icon-ring::before { content:''; position:absolute; inset:0; border-radius:50%; box-shadow:0 0 0 0 rgba(200,200,205,0.5); animation:icon-pulse 2.2s ease-out infinite; }
  @keyframes icon-pulse { 0% { box-shadow:0 0 0 0 rgba(200,200,205,0.45); } 70% { box-shadow:0 0 0 10px rgba(200,200,205,0); } 100% { box-shadow:0 0 0 0 rgba(200,200,205,0); } }
  .donate-icon { position:relative; width:56px; height:56px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:white; border:1px solid rgba(255,255,255,0.6); overflow:hidden; z-index:1; }
  .donate-icon img { width:100%; height:100%; object-fit:cover; }
  .donate-text { display:flex; flex-direction:column; min-width:0; position:relative; z-index:1; }
  .donate-badges { display:flex; gap:6px; margin-bottom:4px; }
  .donate-badge { font-size:10px; font-weight:700; color:#0d0d0f; background:#D6D6DA; border-radius:999px; padding:2px 8px; letter-spacing:0.2px; }
  .donate-title {
    font-family:'Poppins',sans-serif; font-weight:600; font-size:15px; letter-spacing:0.3px;
    background:linear-gradient(90deg, #A9A9AE, #F5F5F7, #A9A9AE); background-size:200% auto; color:transparent;
    -webkit-background-clip:text; background-clip:text; animation:gold-shine 3s linear infinite;
  }
  @keyframes gold-shine { 0% { background-position:0% center; } 100% { background-position:200% center; } }
  .donate-subtitle { font-size:12px; color:#c9c9ce; font-weight:500; margin-top:3px; }

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

  /* Donate modal gets its own dark glassmorphism treatment */
  .donate-modal-box { background:rgba(24,24,27,0.85); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.12); color:#f1f1f3; }
  .donate-modal-box h3 { color:#E5E4E2; }
  .donate-modal-box .modal-close { color:#a1a1aa; }
  .donate-modal-box .qr-frame { background:white; padding:12px; border-radius:16px; display:inline-block; margin-bottom:16px; }
  .donate-modal-box .qr-code { margin:0; }
  .donate-modal-box .wallet-address { background:rgba(255,255,255,0.08); color:#d4d4d8; }
  .donate-modal-box .copy-btn { background:#D6D6DA; color:#1c1c1e; font-weight:700; }
  .donate-modal-box .wallet-note { color:#a1a1aa; }
</style>
</head>
<body>
  <header class="page-topbar">
    <a href="https://netlink.bio" class="topbar-logo" title="Netlink.bio"><img src="/assets/netlinkbio-icon.png" alt="Netlink.bio"></a>
    <button type="button" class="topbar-share-btn" onclick="shareProfile(event)" title="Share this page">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
    </button>
  </header>
  <div class="wrap">
    ${avatar
      ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
      : `<div class="avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>`}
    <h1 class="name-row">${escapeHtml(displayName)}${badgeDotsHtml(profile)}</h1>
    <p class="handle">@${escapeHtml(profile.username)}</p>
    ${contactIconsHtml}

    ${bodyContent || '<p class="empty">This page is still being set up.</p>'}

    <div class="footer">
      <a href="/">netlink.bio &mdash; build your page free</a>
    </div>
  </div>

  ${donateModalHtml}
  ${badgeModalsHtml(profile)}

  <script>
    function shareProfile(event) {
      const shareData = { title: ${JSON.stringify(displayName)}, url: ${JSON.stringify(pageUrl)} };
      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareData.url).then(() => {
          const btn = event.currentTarget;
          const original = btn.innerHTML;
          btn.textContent = 'Copied!';
          setTimeout(() => btn.innerHTML = original, 1500);
        });
      }
    }

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

    function closeAllBadgePopups() {
      document.querySelectorAll('.badge-modal-overlay').forEach(m => m.classList.remove('active'));
    }
    function openBadgeModal(idx) {
      closeAllBadgePopups();
      document.getElementById('badgeModal' + idx).classList.add('active');
    }
    function closeBadgeModal(idx) {
      document.getElementById('badgeModal' + idx).classList.remove('active');
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
