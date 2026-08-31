// api/landing.js
// Public-facing renderer for page-builder.html landing pages, served at
// netlink.bio/page/:slug (see vercel.json rewrite). Same pattern as
// api/bio.js and api/cv.js: fetch from Supabase with the anon key
// (RLS's "Public can view published landing pages" policy restricts rows
// to is_published = true), then render server-side HTML.
//
// Only the columns actually needed are requested in `select=` -- this is
// a base-table query (not a public view like profiles_bio_public), so we
// deliberately never select `id` or `user_id` to avoid exposing them.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

function notFoundPage(slug) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Page not found — Netlink.bio</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;text-align:center;padding:80px 20px;color:#334155}</style>
</head><body>
<h1>No page found for "${escapeHtml(slug)}"</h1>
<p><a href="/">Create your own free page &rarr;</a></p>
</body></html>`;
}

// Per-business-type default section labels, matching page-builder.html's
// businessData table (only the label fields are needed server side -- the
// actual name/tagline/hero copy always comes from the saved content).
const BUSINESS_TITLES = {
  cafe: { aboutTitle: 'Our Story', servicesTitle: 'Featured Menu', locationTitle: 'Location', galleryTitle: 'Gallery' },
  salon: { aboutTitle: 'About Us', servicesTitle: 'Services', locationTitle: 'Studio Location', galleryTitle: 'Our Work' },
  property: { aboutTitle: 'Company Profile', servicesTitle: 'Our Projects', locationTitle: 'Project Locations', galleryTitle: 'Portfolio' },
  umkm: { aboutTitle: 'About Our Store', servicesTitle: 'Product Categories', locationTitle: 'Store Address', galleryTitle: 'Featured Products' },
  professional: { aboutTitle: 'About Me', servicesTitle: 'Consulting Services', locationTitle: 'Office / Meeting Point', galleryTitle: 'Results' },
  creator: { aboutTitle: 'About Me', servicesTitle: 'Collaboration', locationTitle: 'Based In', galleryTitle: 'Content' },
  author: { aboutTitle: 'My Journey', servicesTitle: 'Books & Services', locationTitle: 'Events', galleryTitle: 'Books' },
  educator: { aboutTitle: 'About The Course', servicesTitle: 'Courses', locationTitle: 'Workshop Venue', galleryTitle: 'Classroom' },
  restaurant: { aboutTitle: 'Our Story', servicesTitle: 'Menu', locationTitle: 'Restaurant Location', galleryTitle: 'Dishes' },
  hotel: { aboutTitle: 'About Us', servicesTitle: 'Rooms', locationTitle: 'Address', galleryTitle: 'Gallery' },
  fitness: { aboutTitle: 'Our Mission', servicesTitle: 'Membership', locationTitle: 'Gym Location', galleryTitle: 'Facilities' },
  yoga: { aboutTitle: 'Our Philosophy', servicesTitle: 'Classes', locationTitle: 'Studio', galleryTitle: 'Studio' },
  clinic: { aboutTitle: 'About Us', servicesTitle: 'Services', locationTitle: 'Clinic Address', galleryTitle: 'Facility' },
  photography: { aboutTitle: 'Our Approach', servicesTitle: 'Packages', locationTitle: 'Studio', galleryTitle: 'Portfolio' },
  event: { aboutTitle: 'Who We Are', servicesTitle: 'Packages', locationTitle: 'Office', galleryTitle: 'Events' },
  travel: { aboutTitle: 'Our Story', servicesTitle: 'Destinations', locationTitle: 'Office', galleryTitle: 'Destinations' },
  laundry: { aboutTitle: 'About Us', servicesTitle: 'Services', locationTitle: 'Outlet', galleryTitle: 'Process' },
  repair: { aboutTitle: 'Our Expertise', servicesTitle: 'Repairs', locationTitle: 'Service Center', galleryTitle: 'Workshop' },
  bakery: { aboutTitle: 'Our Story', servicesTitle: 'Menu', locationTitle: 'Bakery', galleryTitle: 'Creations' },
  florist: { aboutTitle: 'Our Passion', servicesTitle: 'Collections', locationTitle: 'Shop', galleryTitle: 'Arrangements' },
  barbershop: { aboutTitle: 'Our Craft', servicesTitle: 'Services', locationTitle: 'Shop', galleryTitle: 'Styles' },
  coworking: { aboutTitle: 'Our Space', servicesTitle: 'Plans', locationTitle: 'Location', galleryTitle: 'Space' },
  workshop: { aboutTitle: 'Our Studio', servicesTitle: 'Workshops', locationTitle: 'Studio', galleryTitle: 'Creations' },
  consulting: { aboutTitle: 'Our Firm', servicesTitle: 'Services', locationTitle: 'Office', galleryTitle: 'Clients' },
  freelance: { aboutTitle: 'About Me', servicesTitle: 'Services', locationTitle: 'Remote / Worldwide', galleryTitle: 'Portfolio' },
  musician: { aboutTitle: 'About Me', servicesTitle: 'Music & Bookings', locationTitle: 'Based In', galleryTitle: 'Releases' },
  podcaster: { aboutTitle: 'About The Show', servicesTitle: 'Episodes & Sponsorship', locationTitle: 'Recording Studio', galleryTitle: 'Episodes' },
  artist: { aboutTitle: 'About My Art', servicesTitle: 'Commissions', locationTitle: 'Studio', galleryTitle: 'Portfolio' },
  trainer: { aboutTitle: 'About Me', servicesTitle: 'Programs', locationTitle: 'Training Location', galleryTitle: 'Transformations' },
  agent: { aboutTitle: 'About Me', servicesTitle: 'Listings', locationTitle: 'Coverage Area', galleryTitle: 'Featured Properties' },
  tutor: { aboutTitle: 'About Me', servicesTitle: 'Subjects & Rates', locationTitle: 'Available Areas', galleryTitle: 'Student Results' },
  nonprofit: { aboutTitle: 'Our Mission', servicesTitle: 'Our Programs', locationTitle: 'Operating Areas', galleryTitle: 'Impact' },
};
const DEFAULT_TITLES = { aboutTitle: 'About', servicesTitle: 'Offerings', locationTitle: 'Location', galleryTitle: 'Gallery' };

const CONTACT_CHANNEL_DEFS = [
  { key: 'whatsapp', label: 'Chat on WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { key: 'telegram', label: 'Message on Telegram', icon: 'fa-brands fa-telegram' },
  { key: 'line', label: 'Add on LINE', icon: 'fa-brands fa-line' },
  { key: 'wechat', label: 'WeChat', icon: 'fa-brands fa-weixin' },
  { key: 'phone', label: 'Call Us', icon: 'fa-solid fa-phone' },
  { key: 'email', label: 'Email Us', icon: 'fa-solid fa-envelope' },
];

function getChannelHref(key, value) {
  if (key === 'whatsapp') return 'https://wa.me/' + value.replace(/[^0-9]/g, '');
  if (key === 'telegram') return 'https://t.me/' + value.replace(/^[@~]/, '').trim();
  if (key === 'line') return 'https://line.me/ti/p/~' + value.replace(/^[@~]/, '').trim();
  if (key === 'phone') return 'tel:' + value.replace(/[^0-9+]/g, '');
  if (key === 'email') return 'mailto:' + value.trim();
  return '#';
}

function formatPrice(value, currency) {
  if (!value || isNaN(value)) return value ? escapeHtml(String(value)) : 'Free';
  try {
    return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return escapeHtml(String(value));
  }
}

// Shared visual CSS, trimmed down from page-builder.html's preview styles
// -- editor-only chrome (sidebar, edit toggle, modals, drag/drop upload
// areas) is intentionally left out; this is a read-only public page.
const PAGE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; overflow-x: hidden; }
#previewArea { width: 100%; margin: 0; background: white; min-height: 100vh; position: relative; }
.section-inner { max-width: 800px; margin: 0 auto; width: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.hidden { display: none !important; }

.page-header { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid #f0f0f0; padding: 12px 24px; }
.header-brand { display: flex; align-items: center; gap: 12px; }
.logo-box { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; overflow: hidden; flex-shrink: 0; }
.logo-box img { width: 100%; height: 100%; object-fit: cover; }
.logo-box.landscape { width: auto; min-width: 90px; max-width: 170px; height: 40px; border-radius: 8px; padding: 0 6px; }
.logo-box.landscape img { width: auto; height: 100%; object-fit: contain; }
.header-text h1 { font-size: 15px; font-weight: 700; color: #212121; line-height: 1.2; }
.header-text p { font-size: 12px; color: #999; }

.about-section, .gallery-section, .services-section, .location-section, .hours-section, .contact-section, .image-section { padding: 40px 24px; }
.section-title { font-size: 18px; font-weight: 700; color: #212121; margin-bottom: 20px; }

.hero-section { position: relative; height: 380px; overflow: hidden; }
.hero-bg { position: absolute; inset: 0; background: linear-gradient(135deg, #D4A574 0%, #E8953A 100%); }
.hero-bg img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); z-index: 2; pointer-events: none; }
.hero-content-wrap { position: absolute; inset: 0; z-index: 3; display: flex; align-items: flex-end; padding: 32px 24px; }
.hero-content { color: white; width: 100%; }
.hero-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); width: fit-content; margin-bottom: 12px; }
.hero-title { font-size: 32px; font-weight: 700; margin-bottom: 12px; line-height: 1.2; }
.hero-subtitle { font-size: 15px; color: rgba(255,255,255,0.9); margin-bottom: 20px; max-width: 600px; }
.hero-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.btn-primary { padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; display: inline-block; }
.btn-secondary { padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.3); color: white; cursor: pointer; text-decoration: none; display: inline-block; }
.btn-secondary:hover { background: rgba(255,255,255,0.25); }

.about-section { background: white; }
.about-content { display: flex; align-items: flex-start; gap: 20px; }
.about-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.about-icon svg { width: 28px; height: 28px; }
.about-text h3 { font-size: 18px; font-weight: 700; color: #212121; margin-bottom: 8px; }
.about-text p { font-size: 15px; color: #555; line-height: 1.7; white-space: pre-wrap; }

.gallery-section { background: #f8f8f8; }
.gallery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.gallery-item { aspect-ratio: 1; border-radius: 16px; overflow: hidden; position: relative; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

.services-section { background: #f5f0eb; }
#servicesGrid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.service-card { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; border: 1px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.service-info h4 { font-size: 16px; font-weight: 700; color: #212121; margin-bottom: 4px; }
.service-info p { font-size: 13px; color: #777; line-height: 1.5; }

.image-section { background: white; }
#additionalImageContainer { width: 100%; border-radius: 16px; overflow: hidden; background: #f0f0f0; }
#additionalImageContainer img { width: 100%; height: auto; display: block; }

.location-section { background: white; }
.map-container { height: 220px; border-radius: 16px; overflow: hidden; background: #e0e0e0; position: relative; }
.direction-btn { width: 100%; margin-top: 16px; padding: 14px; border-radius: 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; text-decoration: none; }

.hours-section { background: #f8f8f8; }
.hours-card { background: white; border-radius: 16px; padding: 24px; border: 1px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.hours-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; }
.hours-row:not(:last-child) { border-bottom: 1px solid #f0f0f0; }
.hours-row span:first-child { font-size: 14px; color: #666; }
.hours-row span:last-child { font-size: 14px; font-weight: 600; color: #212121; }
.hours-status { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: #4CAF50; }
.hours-status span { font-size: 13px; color: #4CAF50; font-weight: 600; }

.contact-section { background: white; }
.contact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.contact-btn { padding: 16px; border-radius: 16px; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; border: none; text-decoration: none; }
.wa-btn { color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.phone-btn { background: transparent; border: 2px solid; }

.page-footer { padding: 32px 24px; text-align: center; background: #f8f8f8; border-top: 1px solid #f0f0f0; }
.page-footer p, .page-footer a { font-size: 13px; color: #999; font-weight: 500; text-decoration: none; }

#lightbox { display: none; position: fixed; inset: 0; z-index: 100; background: rgba(10,10,10,0.95); backdrop-filter: blur(8px); align-items: center; justify-content: center; }
#lightbox.active { display: flex; }
.lightbox-content { position: relative; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; align-items: center; }
.lightbox-img-wrap { display: flex; align-items: center; justify-content: center; max-width: 100%; max-height: 80vh; }
.lightbox-img-wrap img { max-width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px; }
.lightbox-close { position: absolute; top: -50px; right: 0; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; color: white; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.lightbox-nav { display: flex; align-items: center; gap: 24px; margin-top: 20px; }
.lightbox-nav button { width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; color: white; font-size: 20px; cursor: pointer; }
.lightbox-counter { color: rgba(255,255,255,0.8); font-size: 15px; font-weight: 500; min-width: 70px; text-align: center; }

@media (min-width: 768px) {
    .gallery-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
    #servicesGrid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .hero-section { height: 440px; }
    .hero-title { font-size: 40px; }
    .hero-subtitle { font-size: 16px; }
}
@media (min-width: 1024px) {
    .gallery-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
    #servicesGrid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .hero-section { height: 500px; }
    .hero-title { font-size: 48px; }
    .hero-subtitle { font-size: 18px; }
    .about-section, .gallery-section, .services-section, .location-section, .hours-section, .contact-section, .image-section { padding: 60px 40px; }
    .map-container { height: 300px; }
    .direction-btn { width: fit-content; padding: 14px 32px; margin: 20px auto 0; }
}
`;

export default async function handler(req, res) {
  const slug = (req.query.slug || '').toLowerCase().trim();
  if (!slug) { res.status(400).send('Missing slug'); return; }

  let page;
  try {
    const rows = await supabaseGet(
      `landing_pages?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=slug,title,business_type,content,updated_at`
    );
    if (!rows.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage(slug));
      return;
    }
    page = rows[0];
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this page.');
    return;
  }

  const c = page.content || {};
  const businessName = c.name || page.title || 'Business Name';
  const tagline = c.tagline || '';
  const headline = c.headline || businessName;
  const subtitle = c.subtitle || '';
  const desc = c.desc || '';
  const primary = c.primary || '#5D4037';
  const currency = c.currentCurrency || 'IDR';
  const modules = c.modules || {};
  const titles = BUSINESS_TITLES[c.businessType] || DEFAULT_TITLES;
  const pageUrl = `https://netlink.bio/page/${page.slug}`;

  // ---- Header / logo ----
  const logoInner = c.logoImage
    ? `<img src="${escapeHtml(c.logoImage)}" alt="${escapeHtml(businessName)}">`
    : escapeHtml((businessName || 'B').charAt(0).toUpperCase());
  const logoClass = c.logoShape === 'landscape' ? 'logo-box landscape' : 'logo-box';
  const headerTextClass = c.showLogoText === false ? 'header-text sr-only' : 'header-text';
  const headerHtml = `
<header class="page-header">
<div class="section-inner" style="display: flex; align-items: center; justify-content: space-between;">
<div class="header-brand">
<div class="${logoClass}" style="background: ${c.logoImage ? 'transparent' : escapeHtml(primary)};">${logoInner}</div>
<div class="${headerTextClass}">
<h1>${escapeHtml(businessName)}</h1>
${tagline ? `<p>${escapeHtml(tagline)}</p>` : ''}
</div>
</div>
</div>
</header>`;

  // ---- Hero ----
  let heroHtml = '';
  if (modules.hero !== false) {
    const heroBgHtml = c.heroImage
      ? `<img src="${escapeHtml(c.heroImage)}" alt="${escapeHtml(businessName)}">`
      : '';
    heroHtml = `
<section class="hero-section">
<div class="hero-bg">${heroBgHtml}</div>
<div class="hero-overlay"></div>
<div class="hero-content-wrap">
<div class="section-inner hero-content">
<h1 class="hero-title">${escapeHtml(headline)}</h1>
${subtitle ? `<p class="hero-subtitle">${escapeHtml(subtitle)}</p>` : ''}
<div class="hero-buttons">
${modules.services !== false ? `<button class="btn-primary" style="background:#FFF8E1;color:${escapeHtml(primary)};" onclick="document.getElementById('servicesModule')?.scrollIntoView({behavior:'smooth'})">View Menu</button>` : ''}
${modules.location !== false ? `<button class="btn-secondary" onclick="document.getElementById('locationModule')?.scrollIntoView({behavior:'smooth'})">Location</button>` : ''}
</div>
</div>
</div>
</section>`;
  }

  // ---- About ----
  let aboutHtml = '';
  if (modules.about !== false && desc) {
    aboutHtml = `
<section class="about-section">
<div class="section-inner about-content">
<div class="about-icon" style="background: ${escapeHtml(primary)}15;">
<svg style="color: ${escapeHtml(primary)};" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
</div>
<div class="about-text">
<h3>${escapeHtml(titles.aboutTitle)}</h3>
<p>${escapeHtml(desc)}</p>
</div>
</div>
</section>`;
  }

  // ---- Gallery ----
  const galleryImages = Array.isArray(c.galleryImages) ? c.galleryImages.filter((g) => g && g.src) : [];
  let galleryHtml = '';
  if (modules.gallery !== false && galleryImages.length) {
    const items = galleryImages
      .map(
        (img, i) =>
          `<div class="gallery-item" onclick="openLightbox(${i})"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(businessName)} photo ${i + 1}" loading="lazy"></div>`
      )
      .join('');
    galleryHtml = `
<section id="galleryModule" class="gallery-section">
<div class="section-inner">
<h3 class="section-title">${escapeHtml(titles.galleryTitle)}</h3>
<div class="gallery-grid">${items}</div>
</div>
</section>`;
  }

  // ---- Services / Offers ----
  const offers = Array.isArray(c.offers) ? c.offers : [];
  let servicesHtml = '';
  if (modules.services !== false && offers.length) {
    const cards = offers
      .map(
        (offer) => `
<div class="service-card">
<div style="width: 56px; height: 56px; border-radius: 12px; background: ${escapeHtml(primary)}15; color: ${escapeHtml(primary)}; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
<i class="${escapeHtml(offer.icon || 'fa-solid fa-star')}"></i>
</div>
<div class="service-info" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 56px; width: 100%;">
<div>
<h4>${escapeHtml(offer.title || '')}</h4>
<p>${escapeHtml(offer.desc || '')}</p>
</div>
<div style="text-align: right; margin-top: 10px;">
<span style="color: ${escapeHtml(primary)}; font-size: 14px; font-weight: 700;">${formatPrice(offer.price, currency)}</span>
</div>
</div>
</div>`
      )
      .join('');
    servicesHtml = `
<section id="servicesModule" class="services-section">
<div class="section-inner">
<h3 class="section-title">${escapeHtml(titles.servicesTitle)}</h3>
<div id="servicesGrid">${cards}</div>
</div>
</section>`;
  }

  // ---- Additional image ----
  let imageHtml = '';
  if (modules.image !== false && c.additionalImage) {
    imageHtml = `
<section class="image-section">
<div class="section-inner">
<div id="additionalImageContainer"><img src="${escapeHtml(c.additionalImage)}" alt="${escapeHtml(businessName)}"></div>
</div>
</section>`;
  }

  // ---- Location ----
  let locationHtml = '';
  if (modules.location !== false && (c.addressLine || c.addressCity)) {
    const mapQuery = [c.addressLine, c.addressCity].filter(Boolean).join(', ') || 'Indonesia';
    const mapEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
    const mapsLink = c.mapLink || 'https://maps.google.com/';
    locationHtml = `
<section id="locationModule" class="location-section">
<div class="section-inner">
<h3 class="section-title">${escapeHtml(titles.locationTitle)}</h3>
<div class="map-container">
<iframe src="${escapeHtml(mapEmbedSrc)}" style="width: 100%; height: 100%; border: 0;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
</div>
<div style="text-align: center; margin-top: 14px;">
${c.addressLine ? `<p style="font-size: 15px; font-weight: 700; color: #212121;">${escapeHtml(c.addressLine)}</p>` : ''}
${c.addressCity ? `<span style="font-size: 13px; color: #777;">${escapeHtml(c.addressCity)}</span>` : ''}
</div>
<a href="${escapeHtml(mapsLink)}" target="_blank" rel="noopener" class="direction-btn" style="background: ${escapeHtml(primary)}15; color: ${escapeHtml(primary)};"><i class="fa-solid fa-map-location-dot"></i> Open in Maps</a>
${c.closingText ? `<p style="margin-top: 20px; font-size: 14px; color: #666; line-height: 1.7; font-style: italic; text-align: center;">${escapeHtml(c.closingText)}</p>` : ''}
</div>
</section>`;
  }

  // ---- Hours (generic placeholder -- matches the builder, which has no
  // per-day hours editor yet) ----
  let hoursHtml = '';
  if (modules.hours === true) {
    hoursHtml = `
<section class="hours-section">
<div class="section-inner">
<h3 class="section-title">Opening Hours</h3>
<div class="hours-card">
<div class="hours-row"><span>Mon - Fri</span><span>07:00 - 22:00</span></div>
<div class="hours-row"><span>Sat - Sun</span><span>08:00 - 23:00</span></div>
<div class="hours-status"><div class="status-dot"></div><span>Open now</span></div>
</div>
</div>
</section>`;
  }

  // ---- Contact ----
  const contactChannels = c.contactChannels || {};
  const activeChannels = CONTACT_CHANNEL_DEFS.filter((ch) => {
    const saved = contactChannels[ch.key];
    return saved && saved.checked && saved.value && String(saved.value).trim();
  });
  let contactHtml = '';
  if (modules.contact !== false) {
    let grid;
    if (!activeChannels.length) {
      grid = '<p style="grid-column: 1 / -1; text-align: center; color: #999; font-size: 13px;">No contact channel set up yet.</p>';
    } else {
      grid = activeChannels
        .map((ch, i) => {
          const value = String(contactChannels[ch.key].value).trim();
          const isPrimary = i === 0;
          if (ch.key === 'wechat') {
            return `<button type="button" class="contact-btn wa-btn" style="background:${escapeHtml(primary)};" data-wechat-id="${escapeHtml(value)}" onclick="copyWeChatId(this.dataset.wechatId)"><i class="${ch.icon}" style="font-size:18px;"></i> WeChat: ${escapeHtml(value)}</button>`;
          }
          const href = getChannelHref(ch.key, value);
          const btnClass = isPrimary ? 'contact-btn wa-btn' : 'contact-btn phone-btn';
          const style = isPrimary ? `background:${escapeHtml(primary)};` : `border-color:${escapeHtml(primary)};color:${escapeHtml(primary)};`;
          return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="${btnClass}" style="${style}"><i class="${ch.icon}" style="font-size:18px;"></i> ${ch.label}</a>`;
        })
        .join('');
    }
    contactHtml = `
<section class="contact-section">
<div class="section-inner">
<h3 class="section-title">Contact Us</h3>
<div class="contact-grid">${grid}</div>
</div>
</section>`;
  }

  // ---- JSON-LD (schema.org/LocalBusiness) ----
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: businessName,
    url: pageUrl,
    ...(desc ? { description: desc } : {}),
    ...(c.logoImage ? { image: c.logoImage } : {}),
    ...(c.addressLine || c.addressCity
      ? { address: { '@type': 'PostalAddress', streetAddress: c.addressLine || '', addressLocality: c.addressCity || '' } }
      : {}),
  };

  const lightboxHtml = galleryImages.length
    ? `
<div id="lightbox" onclick="closeLightbox(event)">
<div class="lightbox-content" onclick="event.stopPropagation()">
<button class="lightbox-close" onclick="closeLightbox()">&times;</button>
<div class="lightbox-img-wrap"><img id="lightboxImg" src="" alt="Gallery"></div>
<div class="lightbox-nav">
<button onclick="prevLightbox()">&#10094;</button>
<span class="lightbox-counter" id="lightboxCounter">1 / ${galleryImages.length}</span>
<button onclick="nextLightbox()">&#10095;</button>
</div>
</div>
</div>`
    : '';

  const lightboxScript = galleryImages.length
    ? `
<script>
const galleryImages = ${JSON.stringify(galleryImages.map((g) => g.src))};
let lightboxIndex = 0;
function openLightbox(index) {
  lightboxIndex = index;
  document.getElementById('lightboxImg').src = galleryImages[lightboxIndex];
  document.getElementById('lightboxCounter').textContent = (lightboxIndex + 1) + ' / ' + galleryImages.length;
  document.getElementById('lightbox').classList.add('active');
}
function closeLightbox(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('lightbox').classList.remove('active');
}
function prevLightbox() {
  lightboxIndex = (lightboxIndex - 1 + galleryImages.length) % galleryImages.length;
  document.getElementById('lightboxImg').src = galleryImages[lightboxIndex];
  document.getElementById('lightboxCounter').textContent = (lightboxIndex + 1) + ' / ' + galleryImages.length;
}
function nextLightbox() {
  lightboxIndex = (lightboxIndex + 1) % galleryImages.length;
  document.getElementById('lightboxImg').src = galleryImages[lightboxIndex];
  document.getElementById('lightboxCounter').textContent = (lightboxIndex + 1) + ' / ' + galleryImages.length;
}
</script>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(businessName)}${tagline ? ` — ${escapeHtml(tagline)}` : ''} | Netlink.bio</title>
<meta name="description" content="${escapeHtml(desc || `${businessName} on Netlink.bio`)}">
<meta property="og:title" content="${escapeHtml(businessName)}">
<meta property="og:description" content="${escapeHtml(desc || tagline)}">
${c.logoImage ? `<meta property="og:image" content="${escapeHtml(c.logoImage)}">` : ''}
<meta property="og:url" content="${pageUrl}">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
${lightboxHtml}
<div id="previewArea">
${headerHtml}
${heroHtml}
${aboutHtml}
${galleryHtml}
${servicesHtml}
${imageHtml}
${locationHtml}
${hoursHtml}
${contactHtml}
<footer class="page-footer">
<div class="section-inner">
<a href="https://netlink.bio" target="_blank" rel="noopener">Made with Netlink.bio</a>
</div>
</footer>
</div>
${lightboxScript}
<script>
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

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
