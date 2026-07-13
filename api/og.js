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

// Same priority/colors as the badge system in bio.js / cv.js / dashboard.html
// (Black > Business > Person), just simplified to colors only -- the OG
// image doesn't need labels or popups, just a quick visual trust signal.
function computeBadgeColors(profile) {
  if (!profile) return [];
  const tier = profile.tier || 'basic';
  const tierEligible = tier === 'gold' || tier === 'platinum';
  const colors = [];
  if (profile.is_black_badge) colors.push('#18181b');
  if (profile.business_verified_at) colors.push(tierEligible ? '#f59e0b' : '#94a3b8');
  if (profile.identity_verified_at) colors.push(tierEligible ? '#10b981' : '#94a3b8');
  return colors;
}

async function fetchProfile(username) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get('username') || '').toLowerCase().trim();
  const type = searchParams.get('type') === 'cv' ? 'cv' : 'bio';

  const profile = username ? await fetchProfile(username) : null;

  const displayName = profile?.display_name || profile?.username || 'Netlink.bio';
  const avatar = profile?.avatar_url || '';
  const subtitle = type === 'cv'
    ? (profile?.cv_data?.title || 'View Professional CV')
    : (profile?.username ? `@${profile.username}` : 'One Link For Everything');
  const badgeColors = computeBadgeColors(profile);

  return new ImageResponse(
    h('div', {
      style: {
        height: '100%', width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center',
        padding: '0 90px', background: 'linear-gradient(135deg, #2DD4BF 0%, #1D4ED8 100%)', position: 'relative',
      },
    },
      // Logo, top-right with breathing room (not flush against the corner)
      h('div', { style: { position: 'absolute', top: 56, right: 64, display: 'flex', alignItems: 'center' } },
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
        ...(badgeColors.length ? [
          h('div', { style: { display: 'flex', gap: 10, marginTop: 16 } },
            ...badgeColors.map((color) =>
              h('div', {
                style: {
                  width: 30, height: 30, borderRadius: '50%', background: color,
                  border: '2px solid rgba(255,255,255,0.85)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                },
              }, h('span', { style: { color: 'white', fontSize: 16, fontWeight: 900, display: 'flex' } }, '✓'))
            )
          )
        ] : []),
        h('div', { style: { fontSize: 32, color: 'rgba(255,255,255,0.88)', marginTop: 14, display: 'flex' } }, subtitle)
      )
    ),
    { width: 1200, height: 630 }
  );
}
