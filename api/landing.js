// api/landing.js
// Public-facing renderer for page-builder.html landing pages, served at
// netlink.bio/page/:slug (see vercel.json rewrite). Same pattern as
// api/bio.js and api/cv.js: fetch from the `landing_pages_public` view
// with the anon key -- the view already scopes rows to is_published =
// true and joins in the owning profile's tier/hide_footer_link_landing
// (profiles itself is RLS-locked to auth.uid() = id, so it can't be
// read anonymously; the view is what makes an anonymous read possible).
//
// Only the columns actually needed are requested in `select=`. user_id
// is included only to attribute the view_landing analytics event
// server-side -- it must never be rendered into the HTML/JSON-LD output.

import { escapeHtml, notFoundPage, jsonForScript } from './_lib/html.js';
import { recordEvent } from './_lib/analytics.js';
import { supabaseAuthHeaders } from './_lib/public-db.js';
import { sitemapHandler } from './_lib/sitemap.js';
import { withStats } from './_lib/stats.js';
import {
  MAX_BLOCKS, BLOCKS_CSS, LIGHTBOX_HTML, LIGHTBOX_JS, PRODUCT_MODAL_HTML, BLOCKS_JS,
  renderHeader, renderBlocks, pageVars, safeImageUrl,
} from '../shared/landing-blocks.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseAuthHeaders(path, SUPABASE_KEY),
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

// Same schema.org @type mapping as page-builder.html's businessTypeSchema
// (client-side JSON-LD preview while editing) -- copied verbatim so the
// publicly rendered page matches what the editor already promises via
// llms.txt/business-page.html ("tagged with the correct schema type
// automatically"). Keep these two lists in sync if either changes.
const BUSINESS_TYPE_SCHEMA = {
  cafe: 'CafeOrCoffeeShop', restaurant: 'Restaurant', bakery: 'Bakery',
  salon: 'BeautySalon', barbershop: 'HairSalon', yoga: 'ExerciseGym', fitness: 'ExerciseGym',
  clinic: 'MedicalClinic', property: 'RealEstateAgent', agent: 'RealEstateAgent',
  umkm: 'Store', florist: 'Florist', hotel: 'LodgingBusiness', travel: 'TravelAgency',
  event: 'Organization', laundry: 'DryCleaningOrLaundry', repair: 'ProfessionalService',
  coworking: 'LocalBusiness', workshop: 'EducationalOrganization', consulting: 'ProfessionalService',
  professional: 'ProfessionalService', nonprofit: 'NGO', web3: 'Organization',
  creator: 'Person', freelance: 'Person', author: 'Person', educator: 'Person',
  musician: 'Person', podcaster: 'Person', artist: 'Person', trainer: 'Person', tutor: 'Person',
  photography: 'ProfessionalService',
};

// Gold and Platinum owners can hide the "Made with Netlink.bio" watermark
// via the "Hide Footer Link" toggle on privacy.html -- tier alone isn't
// enough, the toggle must also be on. Mirrors api/bio.js's/api/cv.js's
// showWatermark(). landing_pages_public exposes tier/hide_footer_link_landing
// unconditionally (neither is privacy-sensitive), so both are always
// present on `page` here.
function showWatermark(page) {
  const tier = page?.tier || 'basic';
  if (tier !== 'gold' && tier !== 'platinum') return true;
  return !page?.hide_footer_link_landing;
}

// Base page CSS. Block styles (hero, gallery, cards, ...) come from
// shared/landing-blocks.js so this page and the editor preview stay identical.
const PAGE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; overflow-x: hidden; }
#previewArea { width: 100%; margin: 0; background: white; min-height: 100vh; position: relative; }
.hidden { display: none !important; }
.page-footer { padding: 32px 24px; text-align: center; background: #f8f8f8; border-top: 1px solid #f0f0f0; }
.page-footer p, .page-footer a { font-size: 13px; color: #999; font-weight: 500; text-decoration: none; }
.page-footer .legal-footer { margin-top: 10px; }
.page-footer .legal-footer a { font-size: 11px; color: #999; text-decoration: none; }
.page-footer .legal-footer span { font-size: 11px; color: #999; padding: 0 4px; }
${BLOCKS_CSS}
`;

async function handler(req, res) {
  if (req.query.action === 'sitemap') return sitemapHandler(req, res);
  const slug = (req.query.slug || '').toLowerCase().trim();
  if (!slug) { res.status(400).send('Missing slug'); return; }

  let page;
  try {
    // user_id is included here only to attribute the view_landing analytics
    // event server-side (Gold tier stats) -- it must never be rendered into
    // the HTML/JSON-LD output below, same rule this file already followed
    // for id/user_id before analytics existed. tier/hide_footer_link_landing
    // are used only by showWatermark() below.
    const rows = await supabaseGet(
      `landing_pages_public?slug=eq.${encodeURIComponent(slug)}&select=slug,title,business_type,content,updated_at,user_id,tier,hide_footer_link_landing`
    );
    if (!rows.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage({
        title: 'Page not found',
        heading: `No page found for "${escapeHtml(slug)}"`,
        message: 'This page doesn’t exist or may have been unpublished.',
      }));
      return;
    }
    page = rows[0];
    // Landing Page is a Gold feature. When the owner's plan has ended (tier is back to Basic or
    // Silver) the page data is kept, but the public page is switched off with a neutral notice.
    // It comes back by itself when the owner is on Gold again.
    if (page.tier !== 'gold') {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage({
        title: 'Page not active',
        heading: 'This page is not active',
        message: 'This page is currently unavailable. Please contact the page owner.',
        code: '',
      }));
      return;
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this page.');
    return;
  }

  const c = page.content || {};
  const businessName = c.name || page.title || 'Business Name';
  const tagline = c.tagline || '';
  const content = { ...c, name: businessName };
  const blocks = Array.isArray(c.blocks) ? c.blocks.slice(0, MAX_BLOCKS).filter((b) => b && typeof b === 'object') : [];
  const pageUrl = `https://netlink.bio/page/${page.slug}`;

  // Meta description: first text-like block, else the tagline.
  const textBlock = blocks.find((b) => (b.type === 'text' || b.type === 'imagetext') && b.data && String(b.data.body || '').trim());
  const desc = textBlock ? String(textBlock.data.body).trim().slice(0, 300) : tagline;

  const headerHtml = renderHeader(content);
  const blocksHtml = renderBlocks(content);
  const hasGallery = blocks.some((b) => b.type === 'gallery');
  // Video cards (tap to play) and the product detail popup need a little shared script.
  const hasInteractive = blocks.some((b) => b.type === 'video' || b.type === 'products');
  const hasProducts = blocks.some((b) => b.type === 'products');

  const heroBlock = blocks.find((b) => b.type === 'hero' && b.data && safeImageUrl(b.data.image));
  const ogImage = safeImageUrl(c.logoImage) || (heroBlock ? safeImageUrl(heroBlock.data.image) : '');

  // ---- JSON-LD (schema.org) ----
  // @type comes from BUSINESS_TYPE_SCHEMA, keyed by the `business_type`
  // column -- falls back to 'LocalBusiness'. Only fields that are valid on
  // every schema type (including Person) are set, so no per-type branching.
  const locBlock = blocks.find((b) => b.type === 'location' && b.data && (b.data.addressLine || b.data.addressCity));
  const schemaType = BUSINESS_TYPE_SCHEMA[page.business_type] || 'LocalBusiness';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: businessName,
    url: pageUrl,
    ...(desc ? { description: desc } : {}),
    ...(ogImage ? { image: ogImage } : {}),
    ...(locBlock
      ? { address: { '@type': 'PostalAddress', streetAddress: locBlock.data.addressLine || '', addressLocality: locBlock.data.addressCity || '' } }
      : {}),
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(businessName)}${tagline ? `, ${escapeHtml(tagline)}` : ''} | Netlink</title>
<meta name="description" content="${escapeHtml(desc || `${businessName} on Netlink`)}">
<meta property="og:title" content="${escapeHtml(businessName)}">
<meta property="og:description" content="${escapeHtml(desc || tagline)}">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<meta property="og:url" content="${pageUrl}">
${blocksHtml.trim() ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script type="application/ld+json">${jsonForScript(jsonLd)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
${hasGallery ? LIGHTBOX_HTML : ''}
${hasProducts ? PRODUCT_MODAL_HTML : ''}
<div id="previewArea" style="${escapeHtml(pageVars(c))}">
${headerHtml}
${blocksHtml}
<footer class="page-footer">
<div class="section-inner">
${showWatermark(page) ? `<a href="https://netlink.bio" target="_blank" rel="noopener">Made with Netlink</a>` : ''}
<div class="legal-footer">
<a href="/privacy-policy" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="mailto:contact@netlink.bio" target="_blank" rel="noopener">Report</a>
</div>
</div>
</footer>
</div>
${hasGallery ? `<script>${LIGHTBOX_JS}</script>` : ''}
${hasInteractive ? `<script>${BLOCKS_JS}</script>` : ''}
<script>
// Fire-and-forget click tracking (Gold Landing Page stats). Resolved by
// slug server-side, same pattern as api/bio.js's trackClick.
function trackClick() {
  const payload = JSON.stringify({ slug: ${jsonForScript(page.slug)}, referrer: document.referrer, utmSource: new URLSearchParams(location.search).get('utm_source') });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/track-event', new Blob([payload], { type: 'application/json' }));
  } else {
    fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }
}

function copyWeChatId(id) {
  navigator.clipboard.writeText(id).then(() => {
    alert('WeChat ID "' + id + '" copied! Search this ID inside the WeChat app to add.');
  }).catch(() => {
    alert('WeChat ID: ' + id + ' (search this inside the WeChat app to add).');
  });
}
</script>
</body>
</html>`;

  recordEvent({ userId: page.user_id, eventType: 'view_landing', referrer: req.headers.referer || '', req });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=120');
  res.status(200).send(html);
}

export default withStats('landing', handler);
