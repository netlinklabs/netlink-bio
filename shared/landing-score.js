// shared/landing-score.js
// AI Score for a landing page, 0 to 100. The page builder shows it under the page URL.
//
// The score is worked out from the JSON-LD that the page would really publish
// (shared/landing-jsonld.js), so what is scored is what AI assistants will read.
// Name, address and services that only hold the demo text of the mockup page
// ("Your Brand", "123 Street Name", "Service Name 1") do not count. Hours do not apply to business types that are not a physical
// place (Organization, NGO), so their points are left out of the total.

import { buildLandingJsonLd, BUSINESS_TYPE_SCHEMA, pageDescription } from './landing-jsonld.js';

const NOT_A_PLACE = new Set(['Person', 'Organization', 'NGO']);

// Sample text that ships with the mockup page and the editor placeholders.
const PLACEHOLDER = /lorem ipsum|dolor sit amet|123 street|street name|your (brand|business|name|headline|tagline)|business name|service name|product name|feature title|tagline goes here|^city,? country$/i;
export function isPlaceholder(text) {
  return PLACEHOLDER.test(String(text || ''));
}

// Description strength, used by the small bar under the Text module and by the score.
export const DESC_MEDIUM_AT = 60;   // characters
export const DESC_STRONG_AT = 160;  // about the length search results show
export function textStrength(text) {
  const t = String(text || '').trim();
  const len = t.length;
  let level = 'empty';
  if (len > 0) level = len >= DESC_STRONG_AT ? 'strong' : len >= DESC_MEDIUM_AT ? 'medium' : 'weak';
  return { level, length: len, pct: Math.min(100, Math.round((len / DESC_STRONG_AT) * 100)) };
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function computeAiScore(state) {
  const s = state || {};
  const blocks = Array.isArray(s.blocks) ? s.blocks : [];
  const schemaType = BUSINESS_TYPE_SCHEMA[s.businessType] || 'LocalBusiness';
  const isPlace = !NOT_A_PLACE.has(schemaType);
  const name = String(s.name || '').trim();
  const description = pageDescription(blocks, String(s.tagline || '').trim());
  const graph = buildLandingJsonLd({
    page: {}, content: s, blocks,
    pageUrl: 'https://netlink.bio/page/' + (s.slug || 'preview'),
    name: name || 'Business Name', tagline: String(s.tagline || ''), description,
    image: s.logoImage || '', schemaType,
  })['@graph'];
  const biz = graph.find((n) => n['@id'] && /#business$/.test(n['@id'])) || {};
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  const hasVideo = graph.some((n) => n['@type'] === 'VideoObject');
  const address = biz.address || {};
  const catalogs = asList(biz.hasOfferCatalog);
  const offers = [];
  catalogs.forEach((c) => asList(c.itemListElement).forEach((o) => offers.push(o)));
  const realOffers = offers.filter((o) => !isPlaceholder(o.itemOffered && o.itemOffered.name));
  const pricedOffers = realOffers.filter((o) => o.price !== undefined);
  const channels = asList(biz.contactPoint).length;
  const desc = textStrength(description);
  const faqCount = faq ? asList(faq.mainEntity).length : 0;
  const extras = [biz.review, biz.employee, hasVideo].filter(Boolean).length;
  const addressOk = (v) => !!v && !isPlaceholder(v);

  const items = [
    { id: 'name', label: 'Business name', max: 10,
      points: name.length >= 2 && !isPlaceholder(name) ? 10 : 0,
      tip: 'Add your real business name in Page Settings.' },
    { id: 'type', label: 'Business type', max: 5,
      points: BUSINESS_TYPE_SCHEMA[s.businessType] ? 5 : 0,
      tip: 'Pick a business type in Page Settings so AI knows what kind of business you are.' },
    { id: 'description', label: 'Business description', max: 10,
      points: desc.level === 'strong' ? 10 : desc.level === 'medium' ? 6 : desc.level === 'weak' ? 2 : 0,
      tip: 'Write at least ' + DESC_STRONG_AT + ' characters in your first Text module: what you do, where and for whom.' },
    { id: 'image', label: 'Photo or logo', max: 8,
      points: asList(biz.image).length ? 8 : 0,
      tip: 'Add a logo, a hero image or a gallery.' },
    { id: 'address', label: 'Street address and city', max: 10,
      points: (addressOk(address.streetAddress) ? 5 : 0) + (addressOk(address.addressLocality) ? 5 : 0),
      tip: 'Fill in both the address and the city in a Location module.' },
    { id: 'country', label: 'Country', max: 5,
      points: address.addressCountry ? 5 : 0,
      tip: 'Choose a country in your Location module.' },
    { id: 'contact', label: 'Contact details', max: 12,
      points: channels >= 2 ? 12 : channels === 1 ? 8 : 0,
      tip: 'Turn on at least two channels (phone, WhatsApp or email) in a Contact module.' },
    { id: 'hours', label: 'Opening hours', max: 10, applies: isPlace,
      points: asList(biz.openingHoursSpecification).length ? 10 : 0,
      tip: 'Add opening hours like "Mon - Fri" and "09:00 - 17:00". Rows that cannot be read are skipped.' },
    { id: 'offers', label: 'Services or products with prices', max: 10,
      points: pricedOffers.length ? 10 : realOffers.length ? 6 : 0,
      tip: 'Add a Cards or Products module. Use numbers for prices, for example 25000.' },
    { id: 'faq', label: 'FAQ', max: 5,
      points: faqCount >= 3 ? 5 : faqCount >= 1 ? 3 : 0,
      tip: 'Add at least 3 questions with answers in an FAQ module.' },
    { id: 'social', label: 'Social links', max: 5,
      points: asList(biz.sameAs).length ? 5 : 0,
      tip: 'Add at least one link in a Social Links module.' },
    { id: 'legal', label: 'Company name and registration number', max: 5,
      points: biz.legalName && (biz.identifier || biz.taxID || biz.vatID) ? 5 : biz.legalName || biz.identifier || biz.taxID || biz.vatID ? 2 : 0,
      tip: 'Add your company name and a registration number in a Legal Info module.' },
    { id: 'extras', label: 'Reviews, team or video', max: 5,
      points: extras >= 2 ? 5 : extras === 1 ? 3 : 0,
      tip: 'Add two of these: Testimonials, Team or Video.' },
  ].map((it) => Object.assign({ applies: true }, it));

  const counted = items.filter((i) => i.applies);
  const max = counted.reduce((n, i) => n + i.max, 0);
  const got = counted.reduce((n, i) => n + i.points, 0);
  return { score: max ? Math.round((got / max) * 100) : 0, items, schemaType, isPlace };
}

export function scoreTier(pct) {
  if (pct < 40) return { color: '#f97316', name: 'Low' };
  if (pct < 70) return { color: '#eab308', name: 'Good' };
  return { color: '#22c55e', name: 'Strong' };
}
