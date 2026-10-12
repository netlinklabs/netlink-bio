// api/_lib/landing-jsonld.js
// Builds the schema.org JSON-LD for a published landing page (api/landing.js).
// Output is one @graph so AI assistants and search engines can read every
// module of the page as structured data:
//
//   WebPage  ->  business node (@type from BUSINESS_TYPE_SCHEMA)
//                  hero/text/imagetext -> name, description, image, logo, slogan
//                  gallery/image       -> image (list)
//                  location            -> address, hasMap
//                  hours               -> openingHoursSpecification
//                  contact             -> telephone, email, contactPoint
//                  social              -> sameAs
//                  cards/products      -> hasOfferCatalog (Offer + Product/Service)
//                  team                -> employee
//                  testimonials        -> review
//                  legal               -> legalName, taxID, identifier
//              FAQPage      (faq modules)
//              VideoObject  (video modules, YouTube only)
//
// Rules this file follows:
//   - Only modules that are not empty produce output (same checks as the
//     renderer in shared/landing-blocks.js), so the JSON-LD never describes
//     something a visitor cannot see.
//   - Properties that are not valid on the page's @type are skipped (Person has
//     no review, employee, openingHoursSpecification or hasMap).
//   - Nothing is guessed: opening hours that cannot be read with certainty,
//     prices that are not numbers and reviews without a name are left out.
//   - No user_id / id of the owner is ever passed in or emitted.

import {
  safeHttpUrl, safeImageUrl, extractYouTubeId, getChannelHref,
  SOCIAL_DEFS, CONTACT_CHANNEL_DEFS, legalItems,
  MAX_GALLERY_IMAGES, MAX_CARD_ITEMS, MAX_HOURS_ROWS, MAX_VIDEO_ITEMS, MAX_FAQ_ITEMS,
  MAX_TESTIMONIALS, MAX_PRODUCTS, MAX_TEAM_MEMBERS, MAX_SOCIAL_LINKS,
} from '../../shared/landing-blocks.js';

// Types that are not a Place: openingHoursSpecification and hasMap are invalid there.
const NOT_A_PLACE = new Set(['Person', 'Organization', 'NGO']);
// Businesses whose "Cards" module is a menu or shop list: items are Products, otherwise Services.
const PRODUCT_TYPES = new Set(['CafeOrCoffeeShop', 'Restaurant', 'Bakery', 'Store', 'Florist']);
const MAX_IMAGES = 10;

// ---------- small helpers ----------

function txt(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 500);
}

function items(data, key) {
  return Array.isArray(data && data[key]) ? data[key].filter((x) => x && typeof x === 'object') : [];
}

function blocksOf(blocks, type) {
  return blocks.filter((b) => b && b.type === type && b.data && typeof b.data === 'object');
}

// ---------- images ----------

// Main image first (logo, else hero), then hero, photo and gallery images in page order.
function collectImages(blocks, primary) {
  const out = [];
  const add = (u) => { const s = safeImageUrl(u); if (s && out.indexOf(s) === -1) out.push(s); };
  add(primary);
  blocks.forEach((b) => {
    const d = b.data || {};
    if (b.type === 'hero') { add(d.image); add(d.imageDesktop); }
    else if (b.type === 'imagetext' || b.type === 'image') add(d.image);
    else if (b.type === 'gallery') items(d, 'images').slice(0, MAX_GALLERY_IMAGES).forEach((g) => add(g.src));
  });
  return out.slice(0, MAX_IMAGES);
}

// ---------- legal info ----------
// Company name -> legalName. Each registration number -> identifier
// (PropertyValue with the label as propertyID). A label that says NPWP or tax id
// also fills taxID, the dedicated schema.org property. These are numbers the
// owner typed in, Netlink does not verify them.

const TAX_LABEL = /^(npwp|tax id|taxid|tin)$/i;

function legalInfo(blocks) {
  const out = { identifiers: [] };
  blocksOf(blocks, 'legal').forEach((b) => {
    const name = txt(b.data.legalName, 160);
    if (name && !out.legalName) out.legalName = name;
    legalItems(b.data).forEach((it) => {
      const label = txt(it.label, 40);
      const number = txt(it.number, 60);
      if (!label || !number) return;
      if (TAX_LABEL.test(label) && !out.taxID) out.taxID = number;
      if (!out.identifiers.some((x) => x.propertyID === label && x.value === number)) {
        out.identifiers.push({ '@type': 'PropertyValue', propertyID: label, value: number });
      }
    });
  });
  return out;
}

// ---------- location ----------

function locationInfo(blocks, isPlace) {
  const out = {};
  const withAddress = blocksOf(blocks, 'location').find((b) => txt(b.data.addressLine) || txt(b.data.addressCity));
  if (withAddress) {
    const address = { '@type': 'PostalAddress' };
    const line = txt(withAddress.data.addressLine, 200);
    const city = txt(withAddress.data.addressCity, 200);
    if (line) address.streetAddress = line;
    if (city) address.addressLocality = city;
    out.address = address;
  }
  if (isPlace) {
    const any = blocksOf(blocks, 'location').find((b) => txt(b.data.addressLine) || txt(b.data.addressCity) || safeHttpUrl(b.data.mapLink));
    if (any) {
      const query = [txt(any.data.addressLine, 200), txt(any.data.addressCity, 200)].filter(Boolean).join(', ');
      const map = safeHttpUrl(any.data.mapLink) || (query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query) : '');
      if (map) out.hasMap = map;
    }
  }
  return out;
}

// ---------- opening hours ----------
// Rows are free text ("Mon - Fri" / "09:00 - 17:00", "Senin - Sabtu" / "09.00-17.00").
// A row is converted only when both the days and the times are read with certainty.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ALIASES = {
  monday: 'Monday', mon: 'Monday', senin: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday', selasa: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday', rabu: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', kamis: 'Thursday',
  friday: 'Friday', fri: 'Friday', jumat: 'Friday',
  saturday: 'Saturday', sat: 'Saturday', sabtu: 'Saturday',
  sunday: 'Sunday', sun: 'Sunday', minggu: 'Sunday', ahad: 'Sunday',
};
const EVERY_DAY = /^(daily|everyday|every day|all days|setiap hari|tiap hari|semua hari|7 hari)$/;

function parseDays(label) {
  const s = String(label || '').toLowerCase()
    .replace(/['’`.]/g, '')
    .replace(/\b(?:s\/d|sd|sampai|hingga|until|through|thru|to)\b/g, '-')
    .replace(/\s+/g, ' ').trim();
  if (!s) return [];
  if (EVERY_DAY.test(s)) return DAYS.slice();
  const found = [];
  const add = (d) => { if (found.indexOf(d) === -1) found.push(d); };
  const parts = s.split(/\s*(?:,|&|\/|\bdan\b|\band\b)\s*/);
  for (const part of parts) {
    if (part.indexOf('-') !== -1 || part.indexOf('–') !== -1 || part.indexOf('—') !== -1) {
      const ends = part.split(/\s*[-–—]\s*/);
      if (ends.length !== 2) return [];
      const a = DAY_ALIASES[ends[0].trim()];
      const b = DAY_ALIASES[ends[1].trim()];
      if (!a || !b) return [];
      let i = DAYS.indexOf(a);
      const j = DAYS.indexOf(b);
      add(DAYS[i]);
      while (i !== j) { i = (i + 1) % 7; add(DAYS[i]); }
    } else {
      const d = DAY_ALIASES[part.trim()];
      if (!d) return [];
      add(d);
    }
  }
  return found;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function parseTime(time) {
  const s = String(time || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/\b24\s*(jam|hours?|hrs?)\b|24\s*\/\s*7/.test(s)) return { opens: '00:00', closes: '23:59' };
  if (/\b(tutup|closed|libur|off)\b/.test(s)) return null;
  const m = s.match(/(\d{1,2})[:.](\d{2})\s*(?:-|–|—|to|sampai|s\/d|sd|until)\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h1 = +m[1], m1 = +m[2], h2 = +m[3], m2 = +m[4];
  if (h1 > 23 || m1 > 59 || m2 > 59 || h2 > 24 || (h2 === 24 && m2 !== 0)) return null;
  return { opens: pad2(h1) + ':' + pad2(m1), closes: h2 === 24 ? '23:59' : pad2(h2) + ':' + pad2(m2) };
}

function openingHours(blocks) {
  const out = [];
  blocksOf(blocks, 'hours').forEach((b) => {
    items(b.data, 'rows').slice(0, MAX_HOURS_ROWS).forEach((r) => {
      const days = parseDays(r.label);
      const t = parseTime(r.time);
      if (days.length && t) out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: t.opens, closes: t.closes });
    });
  });
  return out;
}

// ---------- contact ----------

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CHANNEL_NAMES = { whatsapp: 'WhatsApp', telegram: 'Telegram', line: 'LINE', phone: 'Phone', email: 'Email' };

function contactInfo(blocks) {
  let phone = '';
  let whatsapp = '';
  let email = '';
  const points = [];
  blocksOf(blocks, 'contact').forEach((b) => {
    const channels = b.data.channels && typeof b.data.channels === 'object' ? b.data.channels : {};
    CONTACT_CHANNEL_DEFS.forEach((def) => {
      const c = channels[def.key];
      if (!c || !c.checked) return;
      const v = txt(c.value, 200);
      if (!v) return;
      const point = { '@type': 'ContactPoint', contactType: 'customer service', name: CHANNEL_NAMES[def.key] };
      if (def.key === 'phone') {
        const n = v.replace(/[^0-9+]/g, '');
        if (n.replace(/\D/g, '').length < 6) return;
        phone = phone || n;
        point.telephone = n;
      } else if (def.key === 'email') {
        if (!EMAIL_RE.test(v)) return;
        email = email || v;
        point.email = v;
      } else if (def.key === 'whatsapp') {
        const digits = v.replace(/\D/g, '');
        if (digits.length < 6) return;
        whatsapp = whatsapp || '+' + digits;
        point.url = getChannelHref('whatsapp', v);
      } else if (def.key === 'telegram' || def.key === 'line') {
        if (!v.replace(/^[@~]/, '').trim()) return;
        point.url = getChannelHref(def.key, v);
      } else {
        return; // WeChat has no public link
      }
      if (point.url && !safeHttpUrl(point.url)) return;
      points.push(point);
    });
  });
  return { telephone: phone || whatsapp, email, points };
}

// ---------- social ----------

function socialUrls(blocks) {
  const out = [];
  blocksOf(blocks, 'social').forEach((b) => {
    items(b.data, 'links')
      .filter((l) => SOCIAL_DEFS.some((d) => d.key === l.platform) && safeHttpUrl(l.url))
      .slice(0, MAX_SOCIAL_LINKS)
      .forEach((l) => { const u = safeHttpUrl(l.url); if (out.indexOf(u) === -1) out.push(u); });
  });
  return out.slice(0, MAX_SOCIAL_LINKS);
}

// ---------- offers (cards + products) ----------

function priceOf(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || isNaN(raw)) return null;
  const n = Number(raw);
  return isFinite(n) && n >= 0 ? String(n) : null;
}

function buildOffer(it, kind, currency, pageUrl) {
  const item = { '@type': kind, name: txt(it.title, 120) || txt(it.desc, 80) };
  const desc = txt(it.desc, 500);
  if (desc) item.description = desc;
  const img = safeImageUrl(it.image);
  if (img) item.image = img;
  const offer = { '@type': 'Offer', itemOffered: item, url: safeHttpUrl(it.buttonUrl) || pageUrl };
  const price = priceOf(it.price);
  if (price !== null) { offer.price = price; offer.priceCurrency = currency; }
  return offer;
}

function offerCatalogs(blocks, currency, schemaType, pageUrl) {
  const out = [];
  const cardKind = PRODUCT_TYPES.has(schemaType) ? 'Product' : 'Service';
  const add = (b, list, kind) => {
    if (!list.length) return;
    out.push({
      '@type': 'OfferCatalog',
      name: txt(b.data.title, 120) || 'Offers',
      itemListElement: list.map((it) => buildOffer(it, kind, currency, pageUrl)),
    });
  };
  blocksOf(blocks, 'cards').forEach((b) => {
    add(b, items(b.data, 'items').filter((it) => txt(it.title) || txt(it.desc)).slice(0, MAX_CARD_ITEMS), cardKind);
  });
  blocksOf(blocks, 'products').forEach((b) => {
    add(b, items(b.data, 'items').filter((it) => txt(it.title)).slice(0, MAX_PRODUCTS), 'Product');
  });
  return out;
}

// ---------- team + reviews (not valid on Person) ----------

function teamMembers(blocks) {
  const out = [];
  blocksOf(blocks, 'team').forEach((b) => {
    items(b.data, 'items').filter((it) => txt(it.name)).slice(0, MAX_TEAM_MEMBERS).forEach((it) => {
      const p = { '@type': 'Person', name: txt(it.name, 80) };
      if (txt(it.role)) p.jobTitle = txt(it.role, 100);
      const photo = safeImageUrl(it.photo);
      if (photo) p.image = photo;
      out.push(p);
    });
  });
  return out.slice(0, MAX_TEAM_MEMBERS);
}

// No aggregateRating on purpose: reviews written on the business's own page
// are self-serving, so only the individual reviews are described.
function reviewList(blocks) {
  const out = [];
  blocksOf(blocks, 'testimonials').forEach((b) => {
    items(b.data, 'items').filter((it) => txt(it.text) && txt(it.name)).slice(0, MAX_TESTIMONIALS).forEach((it) => {
      const r = { '@type': 'Review', author: { '@type': 'Person', name: txt(it.name, 80) }, reviewBody: txt(it.text, 800) };
      const rating = parseInt(it.rating, 10);
      if (rating >= 1 && rating <= 5) r.reviewRating = { '@type': 'Rating', ratingValue: rating, bestRating: 5, worstRating: 1 };
      out.push(r);
    });
  });
  return out.slice(0, MAX_TESTIMONIALS);
}

// ---------- faq + video ----------

function faqQuestions(blocks) {
  const out = [];
  blocksOf(blocks, 'faq').forEach((b) => {
    items(b.data, 'items').filter((it) => txt(it.q) && txt(it.a)).slice(0, MAX_FAQ_ITEMS).forEach((it) => {
      out.push({ '@type': 'Question', name: txt(it.q, 200), acceptedAnswer: { '@type': 'Answer', text: txt(it.a, 2000) } });
    });
  });
  return out.slice(0, MAX_FAQ_ITEMS);
}

// YouTube only (same rule as the renderer). uploadDate is not stored, so it is not invented.
function videoNodes(blocks, pageUrl, fallbackName) {
  const out = [];
  const seen = [];
  blocksOf(blocks, 'video').forEach((b) => {
    items(b.data, 'items').filter((it) => txt(it.url, 2000)).slice(0, MAX_VIDEO_ITEMS).forEach((it) => {
      const id = extractYouTubeId(it.url);
      if (!id || seen.indexOf(id) !== -1) return;
      seen.push(id);
      const title = txt(it.title, 150) || fallbackName + ' video';
      out.push({
        '@type': 'VideoObject',
        '@id': pageUrl + '#video-' + id,
        name: title,
        description: title,
        thumbnailUrl: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        embedUrl: 'https://www.youtube.com/embed/' + id,
        url: 'https://www.youtube.com/watch?v=' + id,
      });
    });
  });
  return out.slice(0, MAX_VIDEO_ITEMS);
}

// ---------- main ----------

export function buildLandingJsonLd({ page, content, blocks, pageUrl, name, tagline, description, image, schemaType }) {
  const c = content || {};
  const list = (Array.isArray(blocks) ? blocks : []).filter((b) => b && typeof b === 'object');
  const isPerson = schemaType === 'Person';
  const isPlace = !NOT_A_PLACE.has(schemaType);
  const currency = /^[A-Z]{3}$/.test(String(c.currentCurrency || '').toUpperCase()) ? String(c.currentCurrency).toUpperCase() : 'IDR';
  const businessId = pageUrl + '#business';
  const pageId = pageUrl + '#webpage';
  const slogan = txt(tagline, 160);

  const images = collectImages(list, image);
  const logo = safeImageUrl(c.logoImage);
  const videos = videoNodes(list, pageUrl, name);
  const questions = faqQuestions(list);

  // ---- business node ----
  const biz = { '@type': schemaType, '@id': businessId, name, url: pageUrl };
  if (description) biz.description = description;
  if (images.length) biz.image = images.length === 1 ? images[0] : images;
  if (logo && !isPerson) biz.logo = logo;
  if (slogan) { if (isPerson) biz.jobTitle = slogan; else biz.slogan = slogan; }

  Object.assign(biz, locationInfo(list, isPlace));

  if (isPlace) {
    const hours = openingHours(list);
    if (hours.length) biz.openingHoursSpecification = hours;
  }

  const contact = contactInfo(list);
  if (contact.telephone) biz.telephone = contact.telephone;
  if (contact.email) biz.email = contact.email;
  if (contact.points.length) biz.contactPoint = contact.points;

  if (!isPerson) {
    const legal = legalInfo(list);
    if (legal.legalName) biz.legalName = legal.legalName;
    if (legal.taxID) biz.taxID = legal.taxID;
    if (legal.identifiers.length) biz.identifier = legal.identifiers.length === 1 ? legal.identifiers[0] : legal.identifiers;
  }

  const sameAs = socialUrls(list);
  if (sameAs.length) biz.sameAs = sameAs;

  const catalogs = offerCatalogs(list, currency, schemaType, pageUrl);
  if (catalogs.length) biz.hasOfferCatalog = catalogs.length === 1 ? catalogs[0] : catalogs;

  if (!isPerson) {
    const team = teamMembers(list);
    if (team.length) biz.employee = team;
    const reviews = reviewList(list);
    if (reviews.length) biz.review = reviews;
  }

  // ---- web page node ----
  const webpage = {
    '@type': 'WebPage',
    '@id': pageId,
    url: pageUrl,
    name: slogan ? name + ', ' + slogan : name,
    about: { '@id': businessId },
    mainEntity: { '@id': businessId },
  };
  if (description) webpage.description = description;
  const modified = Date.parse(page && page.updated_at);
  if (!isNaN(modified)) webpage.dateModified = new Date(modified).toISOString();
  if (images.length) webpage.primaryImageOfPage = { '@type': 'ImageObject', url: images[0] };
  if (videos.length) webpage.video = videos.map((v) => ({ '@id': v['@id'] }));

  const graph = [webpage, biz];

  if (questions.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': pageUrl + '#faq',
      url: pageUrl,
      name: name + ' FAQ',
      isPartOf: { '@id': pageId },
      about: { '@id': businessId },
      mainEntity: questions,
    });
  }
  videos.forEach((v) => graph.push(v));

  return { '@context': 'https://schema.org', '@graph': graph };
}
