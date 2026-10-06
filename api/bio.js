// api/bio.js
// Server-rendered public bio page with embedded JSON-LD (schema.org/Person).
// Runs on Vercel's Node.js serverless runtime — data is fetched here, on the
// server, BEFORE any HTML is sent to the browser. This means AI crawlers and
// bots that don't execute JavaScript (e.g. GPTBot) still see the full content
// and structured data, not an empty shell.

import { COUNTRY_NAME_BY_CODE, countryFlag } from './_lib/countries.js';
import { escapeHtml, notFoundPage, jsonForScript, safeHttpUrl } from './_lib/html.js';
import { isDemoProfile } from './_lib/demo-profiles.js';
import { recordEvent } from './_lib/analytics.js';
import { supabaseAuthHeaders } from './_lib/public-db.js';
import { withStats, logBioNotFound } from './_lib/stats.js';
import { waitUntil } from '@vercel/functions';
import { OG_RENDER_VERSION, hasOgColumns, currentStoredOgUrl } from './_lib/og-shared.js';
import { templateCss } from './_lib/bio-templates.js';

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

// ---- Verification badges (Green/Gold/Silver/Black) ----
// Color is computed live from stored facts + current tier, never stored
// directly, so it always reflects live subscription status without any
// extra write whenever a tier changes. Mirrors the same logic used in
// dashboard.html so both surfaces always agree.
function formatBadgeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Gold and Platinum users can hide the "Made with Netlink.bio" watermark
// via the "Hide Footer Link" toggle on privacy.html -- tier alone is no
// longer enough, the toggle must also be on. profiles_bio_public exposes
// hide_footer_link_bio unconditionally (it's not a privacy-sensitive
// field), so it's always present in `profile` here.
function showWatermark(profile) {
  const tier = profile?.tier || 'basic';
  if (tier !== 'gold' && tier !== 'platinum') return true;
  return !profile?.hide_footer_link_bio;
}

function computeBadges(profile) {
  const badges = [];
  const tier = profile.tier || 'basic';
  const tierEligible = tier === 'gold' || tier === 'platinum';

  if (profile.is_black_badge) {
    badges.push({
      color: 'black', label: 'Netlink Special',
      message: 'Awarded directly by the Netlink team as special recognition.',
      date: null,
    });
  }
  // Gold Verified Business stays a Gold/Platinum perk. Identity (KYC) is green for every tier.
  if (profile.business_verified_at) {
    if (tierEligible) {
      badges.push({ color: 'gold', label: 'Verified Business', message: "This business's registration has been manually verified by the Netlink team.", date: profile.business_verified_at });
    } else if (!profile.identity_verified_at) {
      badges.push({ color: 'silver', label: 'Previously Verified', message: "This profile's identity was previously verified by the Netlink team.", date: profile.business_verified_at });
    }
  }
  if (profile.identity_verified_at) {
    badges.push({ color: 'green', label: 'Verified Profile', message: "This profile's identity has been verified by the Netlink team.", date: profile.identity_verified_at });
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
    return `<img src="https://cdn.jsdelivr.net/npm/simple-icons@13.15.0/icons/${slug}.svg" alt="${escapeHtml(iconKey)}" class="brand-svg">`;
  }
  const emojiOnly = { globe: '🌐', mail: '✉️', link: '🔗' };
  if (emojiOnly[iconKey]) return `<span class="emoji-icon">${emojiOnly[iconKey]}</span>`;
  // All other icon keys map directly to a Lucide icon name (lucide-static SVGs via jsDelivr)
  // The key goes straight into the image URL, so only plain icon names are allowed.
  if (!/^[a-z0-9-]{1,40}$/.test(String(iconKey || ''))) return `<span class="emoji-icon">🔗</span>`;
  return `<img src="https://cdn.jsdelivr.net/npm/lucide-static@1.52.0/icons/${iconKey}.svg" alt="${escapeHtml(iconKey)}" class="brand-svg lucide-svg" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'emoji-icon',textContent:'🔗'}))">`;
}

// A profile "has a real CV" when at least one section actually has content --
// same check as api/sitemap.js, kept in sync so bio.js only links to a CV
// URL that would actually resolve to a live, crawlable page.
function hasRealCvContent(cv) {
  if (!cv || typeof cv !== 'object') return false;
  if (typeof cv.summary === 'string' && cv.summary.trim()) return true;
  if (Array.isArray(cv.experience) && cv.experience.length) return true;
  if (Array.isArray(cv.skills) && cv.skills.length) return true;
  if (Array.isArray(cv.education) && cv.education.length) return true;
  return false;
}

// Strips known tracking params (utm_*, igsh/igshid, fbclid, gclid, mc_cid,
// mc_eid, si, ref) from a URL before it goes into JSON-LD's sameAs, so the
// same profile doesn't produce a different sameAs value depending on which
// share flow a visitor's link came from. Only sameAs is cleaned -- the
// clickable link rendered on the page (linksHtml, built from `links`
// directly) is left exactly as the user entered it. Functional params
// (e.g. YouTube's ?v=) aren't in the blacklist, so they pass through
// untouched. Falls back to the original string if it isn't a parseable URL.
const SAME_AS_TRACKING_PARAMS = new Set(['igsh', 'igshid', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'si', 'ref']);
function cleanSameAsUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || SAME_AS_TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Template Gallery (Silver and Gold only). Keep ids and tiers in sync with the
// bio_templates table and TEMPLATES in template.html. Each template adds a
// `tpl-<id>` class to <body>; its design lives in api/_lib/bio-templates.js
// (templateCss), injected at the end of the page <style>.
const TEMPLATE_TIERS = {
  'silver-01': 'silver', 'silver-02': 'silver', 'silver-03': 'silver', 'silver-04': 'silver',
  'gold-01': 'gold', 'gold-02': 'gold', 'gold-03': 'gold',
  'gold-04': 'gold', 'gold-05': 'gold', 'gold-06': 'gold',
};
const TIER_RANK = { basic: 0, silver: 1, gold: 2 };
const BANNER_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/banners/`;

// Returns the template id only if it exists AND the owner's current tier still
// qualifies (covers downgrades after the template was chosen). Otherwise null.
function effectiveTemplateId(profile) {
  const id = profile.template_id;
  const need = id && TEMPLATE_TIERS[id];
  if (!need) return null;
  return (TIER_RANK[profile.tier] || 0) >= TIER_RANK[need] ? id : null;
}

// Header banner is Silver+ and must point at our own banners bucket.
function effectiveBannerUrl(profile) {
  if ((TIER_RANK[profile.tier] || 0) < TIER_RANK.silver) return '';
  const url = profile.banner_url || '';
  return url.startsWith(BANNER_URL_PREFIX) ? url : '';
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseAuthHeaders(path, SUPABASE_KEY),
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

async function handler(req, res) {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!username) { res.status(400).send('Missing username'); return; }

  let profile, links, videos = [];
  try {
    const profiles = await supabaseGet(`profiles_bio_public?username=eq.${encodeURIComponent(username)}&select=*`);
    if (!profiles.length) {
      logBioNotFound(username);
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage({
        title: 'Profile not found',
        heading: `@${escapeHtml(username)} isn't on Netlink`,
        message: 'This profile doesn’t exist or may have been removed.',
      }));
      return;
    }
    profile = profiles[0];
    links = await supabaseGet(`links?user_id=eq.${profile.id}&is_active=eq.true&select=*&order=position.asc`);
    // Video cards live in profile_videos. A failure here must never take the
    // whole page down (e.g. table not migrated yet), so fall back to the
    // legacy single youtube_* columns.
    try {
      videos = await supabaseGet(`profile_videos?user_id=eq.${profile.id}&select=*&order=position.asc`);
    } catch (videoErr) {
      console.error(videoErr);
      videos = profile.youtube_url ? [{ url: profile.youtube_url, title: profile.youtube_title, is_featured: false }] : [];
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this profile.');
    return;
  }

  const displayName = profile.display_name || profile.username;
  const countryCode = profile.country_code || '';
  const countryName = countryCode ? (COUNTRY_NAME_BY_CODE[countryCode] || countryCode) : '';
  const bio = (profile.bio || '').slice(0, 500);
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink.bio/${profile.username}`;
  const walletAddress = profile.wallet_address || '';
  const showCv = profile.show_cv !== false;
  const showDonate = profile.show_donate === true && !!walletAddress;
  const iconShape = profile.link_icon_shape === 'rounded' ? 'rounded' : 'circle';
  const themePreset = profile.theme_preset === 'dark' ? 'dark' : 'light';
  const templateId = effectiveTemplateId(profile);
  const bannerUrl = effectiveBannerUrl(profile);
  // Cache-buster for the OG image: social platforms and the CDN cache
  // /api/og for a long time, so the banner's upload timestamp (?t=...) is
  // passed along. Empty for Basic, so their OG URL stays exactly as before.
  const ogVersionMatch = bannerUrl && bannerUrl.match(/[?&]t=(\d+)/);
  // OG_RENDER_VERSION (in _lib/og-shared.js): bump when the OG card design or
  // behaviour changes, so every profile gets a fresh URL (WhatsApp and others
  // cache a failed fetch for days).
  const ogVersion = `&r=${OG_RENDER_VERSION}` + (ogVersionMatch ? `&v=${ogVersionMatch[1]}` : '');
  const ogDynamicUrl = `https://netlink.bio/api/og?username=${encodeURIComponent(profile.username)}&type=bio${ogVersion}`;
  // Pre-rendered image: when the og bucket holds a current JPEG for this
  // profile, point og:image straight at it (instant for crawlers, no render).
  // Otherwise use the dynamic URL and ask /api/og to generate the stored image
  // in the background, so the next share is static. hasOgColumns() keeps this
  // inert until profiles_bio_public exposes og_image_hash / og_image_url.
  const ogStoredUrl = currentStoredOgUrl(profile);
  const ogImageUrl = ogStoredUrl || ogDynamicUrl;
  if (!ogStoredUrl && hasOgColumns(profile)) {
    waitUntil(fetch(`${ogDynamicUrl}&store=1`, { signal: AbortSignal.timeout(20000) }).catch(() => {}));
  }

  // ---- JSON-LD (schema.org/Person) ----
  // @id must be byte-identical to the one api/cv.js emits for the same
  // username, so both pages resolve to the same Person entity in a graph.
  const personId = `${pageUrl}#person`;
  const sameAsRaw = [
    ...links.map((l) => l.url),
    ...(profile.contact_telegram ? [`https://t.me/${profile.contact_telegram.replace(/^@/, '')}`] : []),
    // Same "has a real CV" check as api/sitemap.js -- only link to the CV
    // when it would actually render as a live, crawlable page.
    ...(showCv && hasRealCvContent(profile.cv_data) ? [`https://netlink.bio/cv/${profile.username}`] : []),
  ];
  const sameAs = [...new Set(sameAsRaw.map(cleanSameAsUrl))];
  const personNode = {
    '@type': 'Person',
    '@id': personId,
    name: displayName,
    url: pageUrl,
    ...(bio ? { description: bio } : {}),
    ...(avatar ? { image: avatar } : {}),
    ...(profile.country_code ? { address: { '@type': 'PostalAddress', addressCountry: profile.country_code } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  // ProfilePage wraps the Person as its mainEntity, per Google's Profile
  // Page structured data guidance -- @id-referenced (not duplicated inline)
  // since both nodes live in the same @graph. No dateCreated/dateModified:
  // profiles_bio_public has no updated_at column (see CHANGELOG.md).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${pageUrl}#profilepage`,
        url: pageUrl,
        mainEntity: { '@id': personId },
      },
      personNode,
    ],
  };

  // ---- Contact icons row (WhatsApp / Telegram / Email) ----
  const contactIcons = [];
  // Gated by Privacy Settings (identity.html) -- all default ON, same as
  // the always-shown behavior these replaced.
  if (profile.contact_whatsapp && profile.show_phone_bio !== false) {
    contactIcons.push(`<a class="contact-icon" title="WhatsApp" href="https://wa.me/${escapeHtml(profile.contact_whatsapp.replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener">${iconHtml('whatsapp')}</a>`);
  }
  if (profile.contact_telegram && profile.show_telegram_bio !== false) {
    contactIcons.push(`<a class="contact-icon" title="Telegram" href="https://t.me/${escapeHtml(profile.contact_telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">${iconHtml('telegram')}</a>`);
  }
  if (profile.contact_email && profile.show_email_bio !== false) {
    contactIcons.push(`<a class="contact-icon" title="Email" href="mailto:${escapeHtml(profile.contact_email)}">${iconHtml('mail')}</a>`);
  }
  const contactIconsHtml = contactIcons.length ? `<div class="contact-row">${contactIcons.join('')}</div>` : '';

  // ---- Video cards (Basic 1, Silver 5, Gold 13) ----
  // Limits mirror the enforce_video_limit() DB trigger; slicing here also
  // covers downgrades (extra videos are hidden, not deleted).
  const VIDEO_LIMITS = { basic: 1, silver: 5, gold: 13, platinum: 13 };
  const videoLimit = VIDEO_LIMITS[profile.tier] ?? 1;
  const visibleVideos = (videos || []).filter((v) => v && v.url).slice(0, videoLimit);
  // Layout choice is Silver+; Basic and single-video profiles are always standard.
  const videoLayout = (profile.tier !== 'basic' && visibleVideos.length > 1 && ['grid', 'flexible'].includes(profile.video_layout))
    ? profile.video_layout : 'standard';
  // Which cards span the full width: none in standard (single column anyway),
  // none in grid, only the featured one in flexible.
  const featuredIndex = videoLayout === 'flexible' ? visibleVideos.findIndex((v) => v.is_featured === true) : -1;

  const videoCardsHtml = visibleVideos.map((v, i) => {
    const vidId = extractYouTubeId(v.url);
    const vidTitle = (v.title || '').trim() || 'Watch my video';
    if (!vidId) {
      // Not a recognizable YouTube link: show as a regular link card.
      return `
      <a href="${escapeHtml(safeHttpUrl(v.url) || '#')}" target="_blank" rel="noopener" class="link-card" onclick="trackClick(null)">
        <span class="link-icon ${iconShape}">${iconHtml('youtube')}</span>
        <span class="link-text"><span class="link-title">${escapeHtml(vidTitle)}</span></span>
      </a>`;
    }
    const meta = v.channel_name ? `YouTube &middot; ${escapeHtml(v.channel_name)}` : 'YouTube';
    return `
      <div class="vid-card${i === featuredIndex ? ' vid-full' : ''}">
        <button type="button" class="vid-thumb" aria-label="Play video: ${escapeHtml(vidTitle)}" data-vid="${vidId}" onclick="playVideo(this)">
          <img src="https://i.ytimg.com/vi/${vidId}/hq720.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${vidId}/hqdefault.jpg'">
          <span class="vid-play">&#9658;</span>
          <span class="vid-overlay">
            <span class="vid-title">${escapeHtml(vidTitle)}</span>
            <span class="vid-meta">${meta}</span>
          </span>
        </button>
      </div>`;
  }).join('\n');
  const youtubeHtml = videoCardsHtml
    ? `<div class="vid-wrap vid-${videoLayout}">${videoCardsHtml}</div>`
    : '';

  // ---- Links list ----
  const linksHtml = links.map((l) => `
      <a href="${escapeHtml(safeHttpUrl(l.url) || '#')}" target="_blank" rel="noopener" class="link-card" data-link-id="${escapeHtml(l.id)}" onclick="trackClick(this.dataset.linkId)">
        <span class="link-icon ${iconShape}">${iconHtml(l.icon)}</span>
        <span class="link-text">
          <span class="link-title">${escapeHtml(l.title)}</span>
          ${l.description ? `<span class="link-desc">${escapeHtml(l.description)}</span>` : ''}
        </span>
      </a>`).join('\n');

  // ---- CV card ----
  const cvHtml = showCv ? `
      <a href="/cv/${profile.username}" target="_blank" rel="noopener" class="link-card cv-card" onclick="trackClick(null)">
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
<title>${escapeHtml(displayName)} | Netlink</title>
<meta name="description" content="${escapeHtml(bio || `${displayName}'s links on Netlink`)}">

<meta property="og:title" content="${escapeHtml(displayName)} | Netlink">
<meta property="og:description" content="${escapeHtml(bio)}">
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(displayName)} on Netlink">
<meta property="og:site_name" content="Netlink">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">
<link rel="apple-touch-icon" href="/assets/netlinkbio-icon.png">
${isDemoProfile(profile.username)
  // Demo/mockup profile (api/_lib/demo-profiles.js): keep it out of search
  // indexes and don't describe it to crawlers/AI as a real Person.
  ? '<meta name="robots" content="noindex, nofollow">'
  : `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`}

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --nl-bg: #f8fafc;
    --nl-card: #ffffff;
    --nl-text: #0f172a;
    --nl-text-muted: #64748b;
    --nl-text-muted-2: #475569;
    --nl-border: rgba(0,0,0,0.08);
    --nl-placeholder: #e2e8f0;
    --nl-modal-close-bg: #f1f5f9;
    --nl-input-bg: #f1f5f9;
    --nl-share-btn-text: #333;
    --nl-icon-bg: #ffffff;
    --nl-icon-border: rgba(0,0,0,0.08);
    --nl-donate-bg: #ffffff;
    --nl-donate-title-bg: linear-gradient(90deg, #0f172a, #0f172a);
    --nl-donate-subtitle-color: #64748b;
    --nl-donate-icon-border: rgba(0,0,0,0.08);
    --nl-donate-badge-bg: #f1f5f9;
    --nl-donate-wrap-bg: rgba(0,0,0,0.08);
  }
  body.theme-dark {
    --nl-bg: #0f172a;
    --nl-card: #1e293b;
    --nl-text: #f1f5f9;
    --nl-text-muted: #94a3b8;
    --nl-text-muted-2: #cbd5e1;
    --nl-border: rgba(255,255,255,0.08);
    --nl-placeholder: #334155;
    --nl-modal-close-bg: #334155;
    --nl-input-bg: #334155;
    --nl-share-btn-text: #f1f5f9;
    --nl-icon-bg: #f8fafc;
    --nl-icon-border: rgba(0,0,0,0.08);
    --nl-donate-bg: linear-gradient(160deg, #0d0d0f 0%, #1c1c1e 45%, #2a2a2e 100%);
    --nl-donate-title-bg: linear-gradient(90deg, #A9A9AE, #F5F5F7, #A9A9AE);
    --nl-donate-subtitle-color: #c9c9ce;
    --nl-donate-icon-border: rgba(255,255,255,0.6);
    --nl-donate-badge-bg: #D6D6DA;
    --nl-donate-wrap-bg: linear-gradient(135deg, rgba(200,200,205,0.9), rgba(200,200,205,0.15) 40%, rgba(200,200,205,0.9));
  }
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
  body { margin:0; background:var(--nl-bg); color:var(--nl-text); min-height:100vh; }
  .wrap { max-width: 480px; margin: 0 auto; padding: 20px 20px 48px; }
  .page-topbar { max-width: 480px; margin: 0 auto; padding: 16px 20px 0; display: flex; align-items: center; justify-content: space-between; }
  .topbar-logo { display: flex; align-items: center; }
  .topbar-logo img { width: 36px; height: 36px; border-radius: 8px; display: block; }
  .topbar-share-btn { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--nl-card); box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: none; cursor: pointer; color: var(--nl-share-btn-text); flex-shrink: 0; }
  /* Header banner (only rendered for Silver+ with a banner). Flush to the top
     of the page, no radius. Phones and tablets: full viewport width. Desktop:
     same width as the content column. The logo and share button float over it
     with circle backgrounds so they stay readable on any image. */
  body.has-banner { position:relative; }
  .bio-banner { width:100%; aspect-ratio:3 / 1; overflow:hidden; background:var(--nl-placeholder); }
  .bio-banner img { width:100%; height:100%; object-fit:cover; display:block; }
  body.has-banner .page-topbar { position:absolute; top:0; left:0; right:0; z-index:5; max-width:none; }
  /* Circle buttons over the banner: card color at 50% opacity, per theme. */
  body.has-banner { --nl-topbar-btn-bg: rgba(255,255,255,0.5); }
  body.has-banner.theme-dark { --nl-topbar-btn-bg: rgba(30,41,59,0.5); }
  body.has-banner .topbar-logo { width:36px; height:36px; border-radius:50%; justify-content:center; background:var(--nl-topbar-btn-bg); box-shadow:0 1px 3px rgba(0,0,0,0.25); }
  body.has-banner .topbar-logo img { width:22px; height:22px; border-radius:0; }
  body.has-banner .topbar-share-btn { background:var(--nl-topbar-btn-bg); box-shadow:0 1px 3px rgba(0,0,0,0.25); }
  @media (min-width:1025px) {
    .bio-banner { max-width:480px; margin:0 auto; }
    body.has-banner .page-topbar { max-width:480px; margin:0 auto; }
  }
  .wrap.has-banner { padding-top:0; }
  /* With a banner, the avatar sits half over the banner's bottom edge. The ring
     uses the page background so it separates cleanly in Light and Dark. */
  .wrap.has-banner .avatar, .wrap.has-banner .avatar-fallback { position:relative; z-index:1; margin-top:-48px; border:4px solid var(--nl-bg); }
  .avatar { width:96px; height:96px; border-radius:50%; object-fit:cover; margin:0 auto 16px; display:block; background:var(--nl-placeholder); }
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
  .badge-modal-box { position:relative; background:var(--nl-card); width:100%; max-width:480px; border-radius:24px 24px 0 0; padding:14px 24px 36px; box-shadow:0 -10px 30px rgba(0,0,0,0.2); animation: badge-slide-up 0.25s cubic-bezier(0.16,1,0.3,1); }
  @keyframes badge-slide-up { from { transform:translateY(100%); } to { transform:translateY(0); } }
  .badge-modal-handle { display:block; width:36px; height:4px; border-radius:99px; background:var(--nl-placeholder); margin:0 auto 20px; }
  .badge-modal-close { position:absolute; top:16px; right:18px; width:30px; height:30px; border-radius:50%; border:none; background:var(--nl-modal-close-bg); color:var(--nl-text-muted); font-size:16px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .badge-modal-avatar-wrap { position:relative; width:64px; height:64px; margin-bottom:16px; }
  .badge-modal-avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; display:block; background:var(--nl-placeholder); }
  .badge-modal-avatar-fallback { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,#14b8a6,#0d9488); display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700; }
  .badge-modal-avatar-check { position:absolute; bottom:-2px; right:-2px; width:24px; height:24px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; color:white; font-size:11px; box-sizing:content-box; }
  .badge-modal-title { font-family:'Poppins',sans-serif; font-size:19px; font-weight:700; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
  .badge-modal-message { font-size:14px; color:var(--nl-text-muted-2); line-height:1.6; margin:0 0 12px; }
  .badge-modal-date { font-size:12px; color:var(--nl-text-muted); margin:0; }
  .handle { text-align:center; color:var(--nl-text-muted); font-size:14px; margin:0 0 4px; }
  .country-row { text-align:center; color:var(--nl-text-muted); font-size:14px; margin:0 0 14px; }
  .contact-row { display:flex; justify-content:center; gap:10px; margin-bottom:20px; }
  .contact-icon { width:38px; height:38px; border-radius:50%; background:var(--nl-icon-bg); border:1px solid var(--nl-icon-border); display:flex; align-items:center; justify-content:center; text-decoration:none; padding:9px; }
  .contact-icon .brand-svg { width:100%; height:100%; }
  .bio { text-align:center; color:var(--nl-text-muted-2); font-size:14px; margin:0 0 20px; line-height:1.5; white-space:pre-wrap; }
  /* Video cards: 16:9 thumbnail, bottom gradient overlay, plays inline */
  .vid-wrap { display:grid; grid-template-columns:1fr; gap:12px; margin-bottom:12px; }
  .vid-wrap.vid-grid, .vid-wrap.vid-flexible { grid-template-columns:1fr 1fr; }
  .vid-card { position:relative; min-width:0; border-radius:16px; overflow:hidden; background:#000; box-shadow:0 10px 25px rgba(0,0,0,0.12); border:1px solid var(--nl-border); }
  .vid-card.vid-full, .vid-card.playing { grid-column:1 / -1; }
  .vid-thumb { position:relative; display:block; width:100%; aspect-ratio:16 / 9; padding:0; margin:0; border:0; background:#000; cursor:pointer; overflow:hidden; font:inherit; color:#fff; }
  .vid-thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
  .vid-play { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:52px; height:52px; background:rgba(0,0,0,0.55); border-radius:50%; color:#fff; font-size:18px; display:flex; align-items:center; justify-content:center; padding-left:3px; box-sizing:border-box; }
  .vid-overlay { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column; gap:2px; padding:32px 14px 12px; text-align:left; background:linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%); }
  .vid-title { font-weight:700; font-size:14px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .vid-meta { font-size:12px; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vid-card iframe { display:block; width:100%; aspect-ratio:16 / 9; border:0; }
  /* Half-width cards get slightly smaller type and play button */
  .vid-grid .vid-card:not(.vid-full):not(.playing) .vid-play,
  .vid-flexible .vid-card:not(.vid-full):not(.playing) .vid-play { width:38px; height:38px; font-size:14px; }
  .vid-grid .vid-card:not(.vid-full):not(.playing) .vid-overlay,
  .vid-flexible .vid-card:not(.vid-full):not(.playing) .vid-overlay { padding:24px 10px 8px; }
  .vid-grid .vid-card:not(.vid-full):not(.playing) .vid-title,
  .vid-flexible .vid-card:not(.vid-full):not(.playing) .vid-title { font-size:12px; }
  .vid-grid .vid-card:not(.vid-full):not(.playing) .vid-meta,
  .vid-flexible .vid-card:not(.vid-full):not(.playing) .vid-meta { font-size:10px; }
  .link-card { display:flex; align-items:center; gap:12px; background:var(--nl-card); border:1px solid var(--nl-border); border-radius:16px; padding:14px 16px; margin-bottom:12px; text-decoration:none; color:var(--nl-text); transition:transform .15s; width:100%; text-align:left; cursor:pointer; font:inherit; }
  .link-card:hover { transform:translateY(-2px); border-color:#14b8a6; }
  .link-icon { width:36px; height:36px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--nl-icon-bg); border:1px solid var(--nl-icon-border); padding:8px; }
  .link-icon.circle { border-radius:50%; }
  .link-icon.rounded { border-radius:10px; }
  .link-icon .brand-svg { width:100%; height:100%; }
  .link-icon .emoji-icon { font-size:18px; }
  .link-text { display:flex; flex-direction:column; min-width:0; }
  .link-title { font-weight:600; font-size:14px; }
  .link-desc { font-size:12px; color:var(--nl-text-muted); }

  /* Donate / Receive Crypto Payment — taller, coin-style icon, USDC accent */
  /* Donate / Receive Crypto Payment — premium gold-on-dark "killer feature" card */
  .donate-card-wrap { margin-bottom:12px; }
  .donate-card { position:relative; overflow:hidden; display:flex; align-items:center; gap:14px; background:var(--nl-donate-bg); border-radius:17.5px; padding:18px; width:100%; text-align:left; cursor:pointer; font:inherit; transition:transform .2s, box-shadow .2s; border:1px solid var(--nl-border); }
  .donate-card:hover { transform:translateY(-2px); border-color:#14b8a6; }
  .donate-shimmer { position:absolute; top:0; left:-60%; width:50%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,0.15), transparent); transform:skewX(-20deg); animation:shimmer-sweep 3.2s ease-in-out infinite; pointer-events:none; }
  @keyframes shimmer-sweep { 0% { left:-60%; } 55% { left:130%; } 100% { left:130%; } }
  .donate-icon-ring { position:relative; flex-shrink:0; width:60px; height:60px; display:flex; align-items:center; justify-content:center; border-radius:50%; }
  .donate-icon-ring::before { content:''; position:absolute; inset:0; border-radius:50%; box-shadow:0 0 0 0 rgba(200,200,205,0.5); animation:icon-pulse 2.2s ease-out infinite; }
  @keyframes icon-pulse { 0% { box-shadow:0 0 0 0 rgba(200,200,205,0.45); } 70% { box-shadow:0 0 0 10px rgba(200,200,205,0); } 100% { box-shadow:0 0 0 0 rgba(200,200,205,0); } }
  .donate-icon { position:relative; width:56px; height:56px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:white; border:1px solid var(--nl-donate-icon-border); overflow:hidden; z-index:1; }
  .donate-icon img { width:100%; height:100%; object-fit:cover; }
  .donate-text { display:flex; flex-direction:column; min-width:0; position:relative; z-index:1; }
  .donate-badges { display:flex; gap:6px; margin-bottom:4px; }
  .donate-badge { font-size:10px; font-weight:700; color:#0d0d0f; background:var(--nl-donate-badge-bg); border-radius:999px; padding:2px 8px; letter-spacing:0.2px; }
  .donate-title {
    font-family:'Poppins',sans-serif; font-weight:600; font-size:15px; letter-spacing:0.3px;
    background:var(--nl-donate-title-bg); background-size:200% auto; color:transparent;
    -webkit-background-clip:text; background-clip:text; animation:gold-shine 3s linear infinite;
  }
  @keyframes gold-shine { 0% { background-position:0% center; } 100% { background-position:200% center; } }
  .donate-subtitle { font-size:12px; color:var(--nl-donate-subtitle-color); font-weight:500; margin-top:3px; }

  .footer { text-align:center; margin-top:32px; }
  .footer a { color:var(--nl-text-muted); font-size:12px; text-decoration:none; }
  .legal-footer { text-align:center; margin-top:8px; }
  .legal-footer a { color:var(--nl-text-muted); font-size:11px; text-decoration:none; }
  .legal-footer span { color:var(--nl-text-muted); font-size:11px; padding:0 4px; }
  .empty { text-align:center; color:var(--nl-text-muted); font-size:14px; padding:24px 0; }

  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:100; align-items:center; justify-content:center; padding:20px; }
  .modal-overlay.active { display:flex; }
  .modal-box { background:var(--nl-card); color:var(--nl-text); border-radius:20px; padding:28px 24px; max-width:320px; width:100%; text-align:center; position:relative; }
  .modal-close { position:absolute; top:12px; right:16px; border:none; background:none; font-size:22px; color:var(--nl-text-muted); cursor:pointer; }
  .modal-box h3 { margin:0 0 16px; font-size:16px; }
  .qr-code { width:180px; height:180px; margin:0 auto 16px; border-radius:12px; }
  .wallet-address { font-size:12px; color:var(--nl-text-muted-2); word-break:break-all; background:var(--nl-input-bg); border-radius:8px; padding:8px 10px; margin-bottom:12px; }
  .copy-btn { width:100%; padding:10px; background:#14b8a6; color:white; border:none; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; margin-bottom:10px; }
  .wallet-note { font-size:11px; color:var(--nl-text-muted); margin:0; }

  /* Donate modal gets its own dark glassmorphism treatment */
  .donate-modal-box { background:rgba(24,24,27,0.85); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.12); color:#f1f1f3; }
  .donate-modal-box h3 { color:#E5E4E2; }
  .donate-modal-box .modal-close { color:#a1a1aa; }
  .donate-modal-box .qr-frame { background:white; padding:12px; border-radius:16px; display:inline-block; margin-bottom:16px; }
  .donate-modal-box .qr-code { margin:0; }
  .donate-modal-box .wallet-address { background:rgba(255,255,255,0.08); color:#d4d4d8; }
  .donate-modal-box .copy-btn { background:#D6D6DA; color:#1c1c1e; font-weight:700; }
  .donate-modal-box .wallet-note { color:#a1a1aa; }
  ${templateCss(templateId)}
</style>
</head>
<body class="theme-${themePreset}${templateId ? ` tpl-${templateId}` : ''}${bannerUrl ? ' has-banner' : ''}">
  <header class="page-topbar">
    <a href="https://netlink.bio" class="topbar-logo" title="Netlink"><img src="/assets/netlinkbio-icon.png" alt="Netlink"></a>
    <button type="button" class="topbar-share-btn" onclick="shareProfile(event)" title="Share this page">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
    </button>
  </header>
  ${bannerUrl ? `<div class="bio-banner"><img src="${escapeHtml(bannerUrl)}" alt="" width="1500" height="500"></div>` : ''}
  <div class="wrap${bannerUrl ? ' has-banner' : ''}">
    ${avatar
      ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
      : `<div class="avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>`}
    <h1 class="name-row">${escapeHtml(displayName)}${badgeDotsHtml(profile)}</h1>
    <p class="handle">@${escapeHtml(profile.username)}</p>
    ${countryName ? `<p class="country-row">${countryFlag(countryCode)} ${escapeHtml(countryName)}</p>` : ''}
    ${contactIconsHtml}

    ${bodyContent || '<p class="empty">This page is still being set up.</p>'}

    ${showWatermark(profile) ? `
    <div class="footer">
      <a href="/">Netlink | Build Your Page Free</a>
    </div>` : ''}
    <div class="legal-footer">
      <a href="/privacy-policy" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="mailto:contact@netlink.bio" target="_blank" rel="noopener">Report</a>
    </div>
  </div>

  ${donateModalHtml}
  ${badgeModalsHtml(profile)}

  <script>
    // Fire-and-forget click tracking (Silver+ Click Analytics). sendBeacon
    // doesn't block the outbound navigation the <a> click is about to do;
    // fetch(..., {keepalive:true}) is the fallback for older browsers.
    function trackClick(linkId) {
      const payload = JSON.stringify({ username: ${jsonForScript(profile.username)}, linkId, referrer: document.referrer, utmSource: new URLSearchParams(location.search).get('utm_source') });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track-event', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
    }

    function playVideo(btn) {
      const id = btn.dataset.vid;
      if (!id) return;
      trackClick(null);
      const card = btn.parentNode;
      const frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&playsinline=1';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.title = 'YouTube video player';
      card.classList.add('playing');
      card.replaceChild(frame, btn);
    }

    function shareProfile(event) {
      const shareData = { title: ${jsonForScript(displayName)}, url: ${jsonForScript(pageUrl)} };
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
      navigator.clipboard.writeText(${jsonForScript(walletAddress)}).then(() => {
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

  // Registered via waitUntil() inside recordEvent -- runs in the background,
  // doesn't delay the response.
  recordEvent({ userId: profile.id, eventType: 'view_bio', referrer: req.headers.referer || '', req });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=120');
  res.status(200).send(html);
}

export default withStats('bio', handler);
