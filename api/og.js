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
import { supabaseAuthHeaders } from './_lib/public-db.js';
import { SUPABASE_URL, computeBadgeLabel, wantsBanner, computeOgHash, ogStorageUrl, hasOgColumns } from './_lib/og-shared.js';

const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

// Small helper so we can build the element tree without a JSX build step.
function h(type, props, ...children) {
  return { type, props: { ...props, children: children.length <= 1 ? children[0] : children } };
}

// computeBadgeLabel() and wantsBanner() live in ./_lib/og-shared.js (shared with
// api/bio.js, which needs the same hash).
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

async function fetchBannerOnce(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(BANNER_FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > BANNER_MAX_BYTES) return null;
  return buf;
}

// Returns the banner as a ready-to-use 1200x630 background (cover-cropped and
// darkened by 55%, same look as a flat 55% black overlay), or null on any
// problem so the card falls back to the gradient. The photo is processed with
// sharp, NOT by Satori/resvg: resvg scaling a photo cost ~1s of CPU per render.
async function loadBannerBackground(profile, sharp) {
  if (!wantsBanner(profile)) return null;
  const url = profile.banner_url;
  let raw = null;
  // One retry, but only after a fast failure (network blip). A timeout is not
  // retried: that would push the response past the crawler's own deadline.
  for (let attempt = 0; attempt < 2 && !raw; attempt++) {
    const started = Date.now();
    try { raw = await fetchBannerOnce(url); } catch (e) { /* retry decision below */ }
    if (!raw && Date.now() - started > 1000) break;
  }
  if (!raw) return null;
  try {
    return await sharp(raw)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.45 })
      .toBuffer();
  } catch (e) {
    console.error('[og] banner decode failed', e && e.message);
    return null;
  }
}

async function fetchProfile(username) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles_bio_public?username=eq.${encodeURIComponent(username)}&select=*`,
    { headers: supabaseAuthHeaders('profiles_bio_public', SUPABASE_KEY) }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

const FALLBACK_IMAGE = '/assets/netlink-og.png';
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
// A card that lost its banner (host slow/failing) must not be pinned in caches.
const CACHE_DEGRADED = 'public, max-age=30, s-maxage=30';

// Renders the card for a profile and returns the finished image plus what the
// caller needs for caching/storing decisions. `ms` collects stage timings.
async function renderCard(profile, type, ms) {
  const lap = (k, since) => { ms[k] = Date.now() - since; };
  const displayName = profile?.display_name || profile?.username || 'Netlink.bio';
  const subtitle = type === 'cv'
    ? (profile?.cv_data?.title || 'View Professional CV')
    : (profile?.username ? `@${profile.username}` : 'One Link For Everything');
  const badgeLabel = computeBadgeLabel(profile);

  // Dynamic imports: @vercel/og is ESM-only and this file may be transpiled
  // to CommonJS by the platform.
  const sharp = (await import('sharp')).default;

  // Banner (bio card only) and avatar are fetched in parallel.
  let t = Date.now();
  const [bannerBg, avatar] = await Promise.all([
    type === 'bio' ? loadBannerBackground(profile, sharp) : null,
    loadAvatar(profile?.avatar_url || ''),
  ]);
  lap('assets', t);
  const degraded = type === 'bio' && wantsBanner(profile) && !bannerBg;

  // With a banner the card is drawn on a transparent background and
  // composited over the photo by sharp; otherwise it carries the gradient.
  t = Date.now();
  const { ImageResponse } = await import('@vercel/og');
  const element = buildCard({ transparent: !!bannerBg, avatar, logo: OG_LOGO_DATA_URI, displayName, subtitle, badgeLabel });
  const png = Buffer.from(await new ImageResponse(element, { width: 1200, height: 630 }).arrayBuffer());
  lap('satori', t);

  let body = png;
  let contentType = 'image/png';
  let cache = degraded ? CACHE_DEGRADED : CACHE_OK;
  t = Date.now();
  try {
    const base = bannerBg
      ? sharp(bannerBg).composite([{ input: png }])
      : sharp(png).flatten({ background: '#1D4ED8' });
    body = await base
      .jpeg({ quality: 80, mozjpeg: false, chromaSubsampling: '4:2:0' })
      .toBuffer();
    contentType = 'image/jpeg';
  } catch (e) {
    console.error('[og] jpeg conversion failed, sending PNG', e && e.message);
    cache = CACHE_DEGRADED;
  }
  lap('jpeg', t);
  return { body, contentType, cache, degraded, banner: !!bannerBg };
}

// Pre-render: renders the bio card once and keeps the JPEG in the public `og`
// bucket ({user_id}/{hash}.jpg), then records it on profiles.og_image_url /
// og_image_hash so api/bio.js can point og:image at the static file. Triggered
// in the background by api/bio.js (?store=1) when the stored image is missing
// or out of date. Needs SUPABASE_SERVICE_ROLE_KEY. Returns a short status
// string for the logs. A degraded card (banner failed to load) is never stored.
async function storeOgImage(username) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return 'no-service-key';
  const profile = await fetchProfile(username);
  if (!profile || !hasOgColumns(profile)) return 'no-profile-or-columns';

  const hash = computeOgHash(profile);
  const url = ogStorageUrl(profile.id, hash);
  if (profile.og_image_hash === hash && profile.og_image_url === url) return 'current';

  const r = await renderCard(profile, 'bio', {});
  if (r.degraded || r.contentType !== 'image/jpeg') return 'degraded';

  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/og/${profile.id}/${hash}.jpg`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: r.body,
    signal: AbortSignal.timeout(8000),
  });
  if (!up.ok) {
    console.error('[og-store] upload failed', up.status, (await up.text()).slice(0, 200));
    return 'upload-failed';
  }

  const patch = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ og_image_url: url, og_image_hash: hash }),
    signal: AbortSignal.timeout(5000),
  });
  if (!patch.ok) {
    console.error('[og-store] profile update failed', patch.status, (await patch.text()).slice(0, 200));
    return 'profile-update-failed';
  }

  // Remove the previous image so the bucket holds one file per profile.
  const old = profile.og_image_hash;
  if (old && old !== hash && /^[0-9a-f]{16}$/.test(old)) {
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/object/og/${profile.id}/${old}.jpg`, {
        method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5000),
      });
    } catch (e) { /* leftover file is harmless */ }
  }
  return 'stored';
}

export default async function handler(req, res) {
  const t0 = Date.now();
  const ms = {};
  try {
    const { searchParams } = new URL(req.url, 'https://netlink.bio');
    const username = (searchParams.get('username') || '').toLowerCase().trim();
    const type = searchParams.get('type') === 'cv' ? 'cv' : 'bio';

    // Background pre-render request from api/bio.js. Never cached.
    if (searchParams.get('store') === '1') {
      const status = (type === 'bio' && username) ? await storeOgImage(username) : 'skipped';
      console.log('[og-store] ' + JSON.stringify({ u: username, status, ms: Date.now() - t0 }));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ status }));
      return;
    }

    let t = Date.now();
    const profile = username ? await fetchProfile(username) : null;
    ms.profile = Date.now() - t;

    const r = await renderCard(profile, type, ms);
    ms.total = Date.now() - t0;
    console.log('[og-timing] ' + JSON.stringify({ u: username, type, banner: r.banner, kb: Math.round(r.body.length / 1024), ms }));

    res.statusCode = 200;
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Length', String(r.body.length));
    res.setHeader('Cache-Control', r.cache);
    res.end(r.body);
  } catch (e) {
    // Never leave a crawler with an error: send the static brand image.
    console.error('[og] render failed, redirecting to static image', e && e.message);
    res.statusCode = 302;
    res.setHeader('Location', FALLBACK_IMAGE);
    res.setHeader('Cache-Control', CACHE_DEGRADED);
    res.end();
  }
}

// Inline check icon (replaces the emoji, which @vercel/og fetched from a CDN on
// every cold render).
const CHECK_ICON = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#22c55e"/><path d="M9 17.5l5.5 5.5L25 11.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
).toString('base64');

function buildCard({ transparent, avatar, logo, displayName, subtitle, badgeLabel }) {
  return h('div', {
      style: {
        height: '100%', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center',
        padding: '0 90px', position: 'relative',
        ...(transparent ? {} : { background: 'linear-gradient(135deg, #2DD4BF 0%, #1D4ED8 100%)' }),
      },
    },
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
              h('img', { src: CHECK_ICON, width: 34, height: 34 }),
              h('span', { style: { display: 'flex' } }, badgeLabel)
            )
          : h('div', { style: { fontSize: 32, color: 'rgba(255,255,255,0.88)', marginTop: 14, display: 'flex' } }, subtitle)
      )
    );
}
