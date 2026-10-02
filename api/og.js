// api/og.js
// Dynamically generates the Open Graph preview image shown when a
// bio or CV link is shared on Facebook, WhatsApp, Telegram, etc.
// Runs on Vercel's Edge Runtime (required by @vercel/og / Satori).

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

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
const LOGO_PATH = '/assets/netlinkbio-darkBG.png';
const LOGO_W = 220;
const LOGO_H = Math.round(LOGO_W * 400 / 1300); // 68, keeps the 1300:400 ratio

async function loadLogoDataUri(origin) {
  try {
    const res = await fetch(origin + LOGO_PATH);
    if (!res.ok) return '';
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/png') return '';
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 512 * 1024) return '';
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return `data:image/png;base64,${btoa(bin)}`;
  } catch (e) {
    return '';
  }
}

// Fetch the banner and return it as a data URI, or '' on any problem so the
// card falls back to the normal gradient instead of failing to render.
async function loadBannerDataUri(profile) {
  try {
    if (!profile || !BANNER_TIERS.includes(profile.tier)) return '';
    const url = profile.banner_url || '';
    if (!url.startsWith(BANNER_URL_PREFIX)) return '';
    const res = await fetch(url);
    if (!res.ok) return '';
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > BANNER_MAX_BYTES) return '';
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return `data:${type};base64,${btoa(bin)}`;
  } catch (e) {
    return '';
  }
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

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const username = (searchParams.get('username') || '').toLowerCase().trim();
  const type = searchParams.get('type') === 'cv' ? 'cv' : 'bio';

  const profile = username ? await fetchProfile(username) : null;

  const displayName = profile?.display_name || profile?.username || 'Netlink.bio';
  const avatar = profile?.avatar_url || '';
  const subtitle = type === 'cv'
    ? (profile?.cv_data?.title || 'View Professional CV')
    : (profile?.username ? `@${profile.username}` : 'One Link For Everything');
  const badgeLabel = computeBadgeLabel(profile);
  // Bio card only; Basic and CV keep the gradient background.
  const banner = type === 'bio' ? await loadBannerDataUri(profile) : '';
  const logo = await loadLogoDataUri(origin);

  return new ImageResponse(
    h('div', {
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
    ),
    { width: 1200, height: 630 }
  );
}
