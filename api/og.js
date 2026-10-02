// api/og.js
// Dynamically generates the Open Graph preview image shown when a
// bio or CV link is shared on Facebook, WhatsApp, Telegram, etc.
//
// Node runtime (not Edge): @vercel/og (Satori + resvg) only outputs PNG, and a
// PNG of a photo banner is ~1MB+, which WhatsApp and Meta's scraper reject or
// time out on ("image could not be processed"). We render the PNG, then
// convert it to JPEG with sharp (~100-200KB). Region is pinned to Sydney (next
// to Supabase) in vercel.json.

import { OG_LOGO_DATA_URI } from './_lib/og-logo.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

// Small helper so we can build the element tree without a JSX build step.
function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length <= 1 ? children[0] : children } };
}

// Single highest-priority badge label for the OG image -- Business takes
// priority over personal identity, matching the two examples specified.
// When a badge applies, it REPLACES the @username / job-title subtitle
// line entirely (not shown alongside it).
function computeBadgeLabel(profile) {
  if (!profile) return null;
  if (profile.business_verified_at) return 'Verified Business';
  if (profile.identity_verified_at) return 'Verified Profile';
  if (profile.is_black_badge) return 'Netlink Special';
  return null;
}

// Header banner (Silver+) is only used for the bio card. Same rules as
// effectiveBannerUrl() in api/bio.js: tier must still be Silver/Gold and the
// URL must point at our own public banners bucket.
const BANNER_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/banners/`;
const BANNER_TIERS = ['silver', 'gold'];
const BANNER_MAX_BYTES = 1024 * 1024;

// Brand logo (white wordmark on transparent background, 1300x400) used at
// top-right. Rendered at 220x68 (about 18% of the 1200px card): it stays
// legible when WhatsApp/Facebook shrink the card to a ~300px thumbnail.
const LOGO_W = 220;
const LOGO_H = Math.round(LOGO_W * 400 / 1300); // 68, keeps the 1300:400 ratio

// Shared by the banner and avatar prefetch: short timeout so a slow image
// host cannot make the whole card miss WhatsApp's crawler deadline.
const IMG_FETCH_TIMEOUT_MS = 2500;
const BANNER_FETCH_TIMEOUT_MS = 3000;

function toDataUri(buf, type) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(bin)}`;
}

// Avatar prefetched in parallel with the banner. On any problem returns the
// original URL so Satori behaves exactly as before.
async function loadAvatar(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMG_FETCH_TIMEOUT_MS) });
    if (!res.ok) return url;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return url;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return url;
    return toDataUri(buf, type);
  } catch (e) {
    return url;
  }
}

// Fetch the banner and return it as a data URI, or '' on any problem so the
// card falls back to the normal gradient instead of failing to render.
// True when this profile should get a banner background (same checks as
// loadBannerDataUri) so a missing result can be recognised as a failure.
function wantsBanner(profile) {
  return !!profile && BANNER_TIERS.includes(profile.tier) && (profile.banner_url || '').startsWith(BANNER_URL_PREFIX);
}

async function fetchBannerOnce(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(BANNER_FETCH_TIMEOUT_MS) });
  if (!res.ok) return '';
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return '';
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > BANNER_MAX_BYTES) return '';
  return toDataUri(buf, type);
}

async function loadBannerDataUri(profile) {
  if (!wantsBanner(profile)) return '';
  const url = profile.banner_url;
  // One retry, but only after a fast failure (network blip). A timeout is not
  // retried: that would push the response past the crawler's own deadline.
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const out = await fetchBannerOnce(url);
      if (out) return out;
    } catch (e) { /* fall through to retry decision */ }
    if (Date.now() - started > 1000) break;
  }
  return '';
}

async function fetchProfile(username) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles_bio_public?username=eq.${encodeURIComponent(username)}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

const FALLBACK_IMAGE = '/assets/netlink-og.png';
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
// A card that lost its banner (host slow/failing) must not be pinned in caches.
const CACHE_DEGRADED = 'public, max-age=30, s-maxage=30';

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, 'https://netlink.bio');
    const username = (searchParams.get('username') || '').toLowerCase().trim();
    const type = searchParams.get('type') === 'cv' ? 'cv' : 'bio';

    const profile = username ? await fetchProfile(username) : null;

    const displayName = profile?.display_name || profile?.username || 'Netlink.bio';
    const subtitle = type === 'cv'
      ? (profile?.cv_data?.title || 'View Professional CV')
      : (profile?.username ? `@${profile.username}` : 'One Link For Everything');
    const badgeLabel = computeBadgeLabel(profile);
    // Banner and avatar are fetched in parallel; bio card only for the banner.
    const [banner, avatar] = await Promise.all([
      type === 'bio' ? loadBannerDataUri(profile) : '',
      loadAvatar(profile?.avatar_url || ''),
    ]);
    const logo = OG_LOGO_DATA_URI;
    const degraded = type === 'bio' && wantsBanner(profile) && !banner;

    // Dynamic imports: @vercel/og is ESM-only and this file may be transpiled
    // to CommonJS by the platform.
    const { ImageResponse } = await import('@vercel/og');
    const element = buildCard({ banner, avatar, logo, displayName, subtitle, badgeLabel });
    const png = Buffer.from(await new ImageResponse(element, { width: 1200, height: 630 }).arrayBuffer());

    let body = png;
    let contentType = 'image/png';
    let cache = degraded ? CACHE_DEGRADED : CACHE_OK;
    try {
      const sharp = (await import('sharp')).default;
      body = await sharp(png)
        .flatten({ background: '#1D4ED8' })
        .jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer();
      contentType = 'image/jpeg';
    } catch (e) {
      console.error('[og] jpeg conversion failed, sending PNG', e && e.message);
      cache = CACHE_DEGRADED;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Cache-Control', cache);
    res.end(body);
  } catch (e) {
    // Never leave a crawler with an error: send the static brand image.
    console.error('[og] render failed, redirecting to static image', e && e.message);
    res.statusCode = 302;
    res.setHeader('Location', FALLBACK_IMAGE);
    res.setHeader('Cache-Control', CACHE_DEGRADED);
    res.end();
  }
}

function buildCard({ banner, avatar, logo, displayName, subtitle, badgeLabel }) {
  return h('div', {
      style: {
        height: '100%', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center',
        padding: '0 90px', background: 'linear-gradient(135deg, #2DD4BF 0%, #1D4ED8 100%)', position: 'relative',
      },
    },
      // Silver/Gold banner as cover background, darkened (flat 55% black) so
      // the white text stays readable on any image.
      banner
        ? h('img', {
            src: banner, width: 1200, height: 630,
            style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' },
          })
        : null,
      banner
        ? h('div', {
            style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, background: 'rgba(0,0,0,0.55)', display: 'flex' },
          })
        : null,
      // Logo, top-right with breathing room (not flush against the corner).
      // Falls back to the old icon + text if the image cannot be loaded.
      logo
        ? h('img', { src: logo, width: LOGO_W, height: LOGO_H, style: { position: 'absolute', top: 44, right: 56, width: LOGO_W, height: LOGO_H } })
        : h('div', { style: { position: 'absolute', top: 56, right: 64, display: 'flex', alignItems: 'center' } },
            h('div', {
              style: {
                width: 46, height: 46, borderRadius: 12, background: '#14b8a6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14,
              },
            }, h('span', { style: { color: 'white', fontSize: 26, fontWeight: 700 } }, 'n')),
            h('span', { style: { color: 'white', fontSize: 28, fontWeight: 700 } }, 'Netlink.bio')
          ),
      // Avatar
      avatar
        ? h('img', {
            src: avatar, width: 220, height: 220,
            style: { borderRadius: '50%', border: '6px solid rgba(255,255,255,0.6)', objectFit: 'cover' },
          })
        : h('div', {
            style: {
              width: 220, height: 220, borderRadius: '50%', border: '6px solid rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 90, color: 'white', fontWeight: 700,
            },
          }, displayName.charAt(0).toUpperCase()),
      // Text
      h('div', { style: { display: 'flex', flexDirection: 'column', marginLeft: 60 } },
        h('div', { style: { fontSize: 62, fontWeight: 800, color: 'white', lineHeight: 1.1, display: 'flex' } }, displayName),
        badgeLabel
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, fontSize: 32, fontWeight: 700, color: 'white' } },
              h('span', { style: { display: 'flex', fontSize: 34 } }, '✅'),
              h('span', { style: { display: 'flex' } }, badgeLabel)
            )
          : h('div', { style: { fontSize: 32, color: 'rgba(255,255,255,0.88)', marginTop: 14, display: 'flex' } }, subtitle)
      )
    );
}
