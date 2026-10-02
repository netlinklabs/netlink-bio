// api/_lib/og-shared.js
// Shared by api/og.js (renders the OG card) and api/bio.js (decides which
// og:image URL to put in the page). Both MUST compute the same hash for the
// same profile, so the inputs live in one place.
//
// Pre-rendered OG images: the finished JPEG is stored in the public `og`
// bucket as `{user_id}/{hash}.jpg`, and profiles.og_image_url /
// profiles.og_image_hash record it. When the hash still matches the profile,
// bio.js points og:image straight at that static file (no render, so social
// crawlers get an instant answer). When it does not match, the dynamic
// /api/og URL is used and the image is generated in the background.

import { createHash } from 'node:crypto';

export const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';

// Bump when the OG card design or behaviour changes: every profile gets a fresh
// dynamic URL (&r=N) and a new hash, so stored images are regenerated too.
export const OG_RENDER_VERSION = 5;

// Header banner (Silver+) is only used for the bio card. Same rules as
// effectiveBannerUrl() in api/bio.js: tier must still be Silver/Gold and the
// URL must point at our own public banners bucket.
export const BANNER_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/banners/`;
export const BANNER_TIERS = ['silver', 'gold'];

export const OG_BUCKET_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/og/`;

// Single highest-priority badge label for the OG image -- Business takes
// priority over personal identity. When a badge applies, it REPLACES the
// @username / job-title subtitle line entirely (not shown alongside it).
export function computeBadgeLabel(profile) {
  if (!profile) return null;
  if (profile.business_verified_at) return 'Verified Business';
  if (profile.identity_verified_at) return 'Verified Profile';
  if (profile.is_black_badge) return 'Netlink Special';
  return null;
}

// True when this profile should get a banner background (Silver/Gold and a URL
// inside our own banners bucket).
export function wantsBanner(profile) {
  return !!profile && BANNER_TIERS.includes(profile.tier) && (profile.banner_url || '').startsWith(BANNER_URL_PREFIX);
}

// Fingerprint of everything the bio OG card shows. Any change (name, avatar,
// banner, badge, tier dropping below Silver, design version) gives a new hash.
export function computeOgHash(profile) {
  const input = JSON.stringify([
    OG_RENDER_VERSION,
    profile.username || '',
    profile.display_name || '',
    profile.avatar_url || '',
    wantsBanner(profile) ? profile.banner_url : '',
    computeBadgeLabel(profile) || '',
  ]);
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

// The only URL a stored image may have for this profile and hash. Comparing
// against it (instead of trusting the column) means a user editing their own
// og_image_url cannot point og:image anywhere else.
export function ogStorageUrl(profileId, hash) {
  return `${OG_BUCKET_PREFIX}${profileId}/${hash}.jpg`;
}

// True when the profile row carries the og_* columns at all (the view exposes
// them). Lets the code stay harmless until the database is updated.
export function hasOgColumns(profile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, 'og_image_hash');
}

// Returns the stored static image URL when it is current for this profile,
// otherwise ''.
export function currentStoredOgUrl(profile) {
  if (!hasOgColumns(profile) || !profile.id) return '';
  const hash = computeOgHash(profile);
  const expected = ogStorageUrl(profile.id, hash);
  return profile.og_image_hash === hash && profile.og_image_url === expected ? expected : '';
}
