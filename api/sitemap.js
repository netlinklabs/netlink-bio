// api/sitemap.js
// Dynamic sitemap.xml -- generated on request (cached at the edge for an
// hour, see Cache-Control below) instead of hand-maintained, so every
// live bio/CV/business page shows up without a redeploy.
//
// Schema notes (verified via Supabase MCP against the live project before
// writing this file):
// - profiles_bio_public and profiles_cv_public (used by api/bio.js and
//   api/cv.js) have NO updated_at column -- the view doesn't select it
//   from the underlying `profiles` table -- so lastmod is omitted for
//   /{username} and /cv/{username} entries.
// - profiles_bio_public has no "published" flag. Any row with a non-empty
//   username is a live, crawlable page: api/bio.js renders it (even an
//   otherwise-empty profile gets a "still being set up" placeholder), so
//   every such row is included. Rows with a null/empty username (a few
//   exist) are skipped since they can't form a valid URL.
// - profiles_cv_public has no explicit "CV published" flag either, and
//   cv_data is never null/empty on the view (looks like a default shape
//   even for unfilled profiles). To avoid flooding the sitemap with empty
//   CV shells, a row is only included when cv_data has real content: a
//   non-empty summary, or a non-empty experience/skills/education array.
// - landing_pages.slug / is_published / updated_at match the columns
//   api/landing.js already relies on.
//
// Same security note as api/landing.js: never select id/user_id.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

const STATIC_PAGES = [
  '/', '/link-in-bio', '/digital-cv', '/business-page', '/netlink-pay',
  '/verification', '/about', '/contact', '/faq', '/investor', '/changelog',
  '/privacy-policy', '/terms', '/terms-of-use', '/username-policy',
];

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, { lastmod, changefreq, priority } = {}) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod.slice(0, 10))}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

// A profile "has a real CV" when at least one section actually has
// content -- cv_data is never null/empty on the view even for accounts
// that never touched the CV builder, so presence alone isn't a signal.
function hasRealCvContent(cv) {
  if (!cv || typeof cv !== 'object') return false;
  if (typeof cv.summary === 'string' && cv.summary.trim()) return true;
  if (Array.isArray(cv.experience) && cv.experience.length) return true;
  if (Array.isArray(cv.skills) && cv.skills.length) return true;
  if (Array.isArray(cv.education) && cv.education.length) return true;
  return false;
}

export default async function handler(req, res) {
  const entries = STATIC_PAGES.map((path) =>
    urlEntry(`https://netlink.bio${path}`, { changefreq: 'monthly', priority: path === '/' ? '1.0' : '0.8' })
  );

  const [bioResult, cvResult, landingResult] = await Promise.allSettled([
    supabaseGet('profiles_bio_public?select=username'),
    supabaseGet('profiles_cv_public?select=username,cv_data'),
    supabaseGet('landing_pages?is_published=eq.true&select=slug,updated_at'),
  ]);

  if (bioResult.status === 'fulfilled') {
    for (const profile of bioResult.value) {
      if (!profile.username) continue;
      entries.push(urlEntry(`https://netlink.bio/${profile.username}`));
    }
  } else {
    console.error('sitemap: failed to load profiles_bio_public', bioResult.reason);
  }

  if (cvResult.status === 'fulfilled') {
    for (const profile of cvResult.value) {
      if (!profile.username || !hasRealCvContent(profile.cv_data)) continue;
      entries.push(urlEntry(`https://netlink.bio/cv/${profile.username}`));
    }
  } else {
    console.error('sitemap: failed to load profiles_cv_public', cvResult.reason);
  }

  if (landingResult.status === 'fulfilled') {
    for (const page of landingResult.value) {
      if (!page.slug) continue;
      entries.push(urlEntry(`https://netlink.bio/page/${page.slug}`, { lastmod: page.updated_at }));
    }
  } else {
    console.error('sitemap: failed to load landing_pages', landingResult.reason);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).send(xml);
}
