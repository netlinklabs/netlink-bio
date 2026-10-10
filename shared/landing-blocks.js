// shared/landing-blocks.js
// Single source of truth for rendering Landing Page blocks. Used by BOTH:
//   - api/landing.js  (public page at netlink.bio/page/:slug, server side)
//   - page-builder.html (live preview in the editor, browser side)
// so the editor preview and the published page can never drift apart.
//
// Plain ES module, no imports, no DOM access: it only turns saved content
// into HTML strings. Every user-provided value is escaped here.
//
// Content shape (v2):
//   { v: 2, name, tagline, businessType, primary, currentCurrency,
//     logoImage, logoShape, showLogoText,
//     blocks: [ { id, type, data }, ... ] }   <- array order = page order

export const MAX_BLOCKS = 20;
export const MAX_GALLERY_IMAGES = 10;
export const MAX_CARD_ITEMS = 20;
export const MAX_HOURS_ROWS = 10;
export const MAX_VIDEO_ITEMS = 13;   // same as the Gold limit on the link in bio page
export const MAX_FAQ_ITEMS = 20;
export const MAX_TESTIMONIALS = 12;
export const MAX_PRODUCTS = 12;
export const MAX_PRODUCT_PHOTOS = 3; // main photo (cropped 1:1 on the card) + 2 more shown in the popup
export const MAX_TEAM_MEMBERS = 12;
export const MAX_SOCIAL_LINKS = 12;

// Used by the editor's Add Module modal and by the module list.
export const BLOCK_TYPES = [
  { type: 'hero', label: 'Hero', icon: 'fa-solid fa-panorama', desc: 'Big banner with headline and button' },
  { type: 'text', label: 'Text', icon: 'fa-solid fa-align-left', desc: 'Title and paragraph' },
  { type: 'imagetext', label: 'Image + Text', icon: 'fa-solid fa-table-columns', desc: 'Photo next to a short text' },
  { type: 'gallery', label: 'Gallery', icon: 'fa-solid fa-images', desc: '2 to 4 column photo grid' },
  { type: 'cards', label: 'Cards', icon: 'fa-solid fa-grip', desc: 'Menu, services or features with prices' },
  { type: 'image', label: 'Full Image', icon: 'fa-solid fa-image', desc: 'One wide image' },
  { type: 'location', label: 'Location', icon: 'fa-solid fa-location-dot', desc: 'Map, address and directions' },
  { type: 'hours', label: 'Opening Hours', icon: 'fa-solid fa-clock', desc: 'Days and times' },
  { type: 'contact', label: 'Contact', icon: 'fa-solid fa-address-book', desc: 'WhatsApp, phone, email and more' },
  { type: 'video', label: 'Video', icon: 'fa-brands fa-youtube', desc: 'YouTube videos, tap to play' },
  { type: 'faq', label: 'FAQ', icon: 'fa-solid fa-circle-question', desc: 'Questions and answers' },
  { type: 'testimonials', label: 'Testimonials', icon: 'fa-solid fa-quote-left', desc: 'Reviews from happy clients' },
  { type: 'products', label: 'Products', icon: 'fa-solid fa-tags', desc: 'Packages or products with detail popup' },
  { type: 'social', label: 'Social Links', icon: 'fa-solid fa-share-nodes', desc: 'Instagram, TikTok, YouTube and more' },
  { type: 'cta', label: 'Call to Action', icon: 'fa-solid fa-bullhorn', desc: 'Big message with one button' },
  { type: 'team', label: 'Team', icon: 'fa-solid fa-users', desc: 'People with photo, name and role' },
  { type: 'wallet', label: 'Wallet Card', icon: 'fa-solid fa-wallet', desc: 'Receive USDC donations or payments' },
  { type: 'divider', label: 'Divider', icon: 'fa-solid fa-grip-lines', desc: 'Line, dots or empty space' },
];

export const SOCIAL_DEFS = [
  { key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { key: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok' },
  { key: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
  { key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook' },
  { key: 'x', label: 'X (Twitter)', icon: 'fa-brands fa-twitter' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin' },
  { key: 'telegram', label: 'Telegram', icon: 'fa-brands fa-telegram' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { key: 'pinterest', label: 'Pinterest', icon: 'fa-brands fa-pinterest' },
  { key: 'github', label: 'GitHub', icon: 'fa-brands fa-github' },
  { key: 'spotify', label: 'Spotify', icon: 'fa-brands fa-spotify' },
  { key: 'website', label: 'Website', icon: 'fa-solid fa-globe' },
];

export const CONTACT_CHANNEL_DEFS = [
  { key: 'whatsapp', label: 'Chat on WhatsApp', icon: 'fa-brands fa-whatsapp' },
  { key: 'telegram', label: 'Message on Telegram', icon: 'fa-brands fa-telegram' },
  { key: 'line', label: 'Add on LINE', icon: 'fa-brands fa-line' },
  { key: 'wechat', label: 'WeChat', icon: 'fa-brands fa-weixin' },
  { key: 'phone', label: 'Call Us', icon: 'fa-solid fa-phone' },
  { key: 'email', label: 'Email Us', icon: 'fa-solid fa-envelope' },
];

// ---------- small safe helpers ----------

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHttpUrl(value) {
  const v = String(value || '').trim();
  if (!v || v.length > 2000) return '';
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? v : '';
  } catch (e) {
    return '';
  }
}

export function safeCssColor(value, fallback) {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|hsl)a?\(\s*[0-9.%\s,/-]+\)$/i.test(v)) return v;
  return fallback;
}

// Image URLs: https only. The editor preview (opts.preview) may also show a
// freshly picked photo as a base64 data URL before it is uploaded.
export function safeImageUrl(value, preview) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (preview && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s.slice(0, 40))) return s;
  return s.slice(0, 8).toLowerCase() === 'https://' && s.length <= 2000 ? s : '';
}

export function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
}

function safeIcon(value) {
  const v = String(value || '').trim();
  return /^fa-(solid|regular|brands) fa-[a-z0-9-]{1,40}$/.test(v) ? v : 'fa-solid fa-star';
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) !== -1 ? value : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value, max) {
  return String(value == null ? '' : value).slice(0, max || 2000);
}

// Same pattern as api/bio.js (link in bio): only YouTube links are accepted.
export function extractYouTubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function hexBrightness(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return null;
  return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000;
}

// CSS variables shared by every block. Put the returned string in the
// style="" of the element that wraps the blocks (#previewArea).
export function pageVars(content) {
  const primary = safeCssColor((content || {}).primary, '#5D4037');
  const b = hexBrightness(primary);
  const tint = b === null ? 'rgba(0,0,0,0.05)' : primary + '15';
  const onPrimary = b !== null && b >= 150 ? '#212121' : '#FFFFFF';
  return '--primary:' + primary + ';--tint:' + tint + ';--on-primary:' + onPrimary + ';';
}

export function formatPrice(value, currency) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (isNaN(raw)) return escapeHtml(raw.slice(0, 40));
  if (Number(raw) === 0) return 'Free';
  try {
    return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(raw));
  } catch (e) {
    return escapeHtml(raw.slice(0, 40));
  }
}

export function getChannelHref(key, value) {
  const v = String(value || '');
  if (key === 'whatsapp') return 'https://wa.me/' + v.replace(/[^0-9]/g, '');
  if (key === 'telegram') return 'https://t.me/' + encodeURIComponent(v.replace(/^[@~]/, '').trim());
  if (key === 'line') return 'https://line.me/ti/p/~' + encodeURIComponent(v.replace(/^[@~]/, '').trim());
  if (key === 'phone') return 'tel:' + v.replace(/[^0-9+]/g, '');
  if (key === 'email') return 'mailto:' + v.trim();
  return '#';
}

// ---------- default data for a newly added block ----------

export function defaultBlockData(type) {
  switch (type) {
    case 'hero': return { image: '', imageDesktop: '', headline: '', subtitle: '', badge: '', buttonLabel: '', buttonUrl: '', align: 'left' };
    case 'text': return { title: 'About', body: '', align: 'left', bg: 'white' };
    case 'imagetext': return { title: '', body: '', image: '', imageSquare: false, imagePosition: 'left', buttonLabel: '', buttonUrl: '', bg: 'white' };
    case 'gallery': return { title: 'Gallery', images: [], columns: 3, bg: 'soft' };
    case 'cards': return { title: 'Our Services', columns: 2, bg: 'tint', items: [{ title: '', desc: '', price: '', icon: 'fa-solid fa-star' }] };
    case 'image': return { image: '', caption: '', bg: 'white' };
    case 'location': return { title: 'Location', addressLine: '', addressCity: '', mapLink: '', closingText: '', bg: 'white' };
    case 'hours': return { title: 'Opening Hours', rows: [{ label: 'Mon - Fri', time: '09:00 - 17:00' }], bg: 'soft' };
    case 'contact': return {
      title: 'Contact Us', bg: 'white',
      channels: CONTACT_CHANNEL_DEFS.reduce((acc, ch) => { acc[ch.key] = { checked: false, value: '' }; return acc; }, {}),
    };
    case 'video': return { title: 'Videos', layout: 'single', bg: 'white', items: [{ url: '', title: '', channel: '' }] };
    case 'faq': return { title: 'Frequently Asked Questions', bg: 'white', items: [{ q: '', a: '' }] };
    case 'testimonials': return { title: 'What clients say', bg: 'soft', items: [{ name: '', role: '', text: '', rating: 5, photo: '' }] };
    case 'products': return { title: 'Our Packages', columns: 2, bg: 'white', items: [{ title: '', price: '', desc: '', image: '', imageFull: '', moreImages: [], buttonLabel: '', buttonUrl: '' }] };
    case 'social': return { title: 'Follow us', align: 'center', bg: 'white', links: [{ platform: 'instagram', url: '' }] };
    case 'cta': return { headline: '', text: '', buttonLabel: '', buttonUrl: '', style: 'brand', align: 'center' };
    case 'team': return { title: 'Our Team', columns: 4, bg: 'white', items: [{ name: '', role: '', photo: '' }] };
    case 'wallet': return { title: 'Receive Crypto Payment', desc: 'USDC on Polygon Network', address: '', bg: 'white' };
    case 'divider': return { style: 'line', size: 'medium' };
    default: return {};
  }
}

// ---------- empty checks (public page skips empty blocks) ----------

function cardItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && (str(it.title).trim() || str(it.desc).trim())).slice(0, MAX_CARD_ITEMS);
}
function hourRows(d) {
  return (Array.isArray(d.rows) ? d.rows : []).filter((r) => r && (str(r.label).trim() || str(r.time).trim())).slice(0, MAX_HOURS_ROWS);
}
function activeChannels(d) {
  const ch = d.channels || {};
  return CONTACT_CHANNEL_DEFS.filter((def) => ch[def.key] && ch[def.key].checked && str(ch[def.key].value).trim());
}
function galleryImages(d, preview) {
  return (Array.isArray(d.images) ? d.images : []).filter((g) => g && safeImageUrl(g.src, preview)).slice(0, MAX_GALLERY_IMAGES);
}

function videoItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && str(it.url, 2000).trim()).slice(0, MAX_VIDEO_ITEMS);
}
function faqItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && str(it.q).trim() && str(it.a).trim()).slice(0, MAX_FAQ_ITEMS);
}
function testimonialItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && str(it.text).trim()).slice(0, MAX_TESTIMONIALS);
}
function productItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && str(it.title).trim()).slice(0, MAX_PRODUCTS);
}
function teamItems(d) {
  return (Array.isArray(d.items) ? d.items : []).filter((it) => it && str(it.name).trim()).slice(0, MAX_TEAM_MEMBERS);
}
// EVM address (Polygon): 0x followed by 40 hex characters.
export function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function socialLinks(d) {
  return (Array.isArray(d.links) ? d.links : []).filter((l) => l && SOCIAL_DEFS.some((def) => def.key === l.platform) && safeHttpUrl(l.url)).slice(0, MAX_SOCIAL_LINKS);
}

function isEmpty(block, preview) {
  const d = block.data || {};
  switch (block.type) {
    case 'hero': return !str(d.headline).trim() && !safeImageUrl(d.image, preview);
    case 'text': return !str(d.body).trim();
    case 'imagetext': return !str(d.body).trim() && !safeImageUrl(d.image, preview);
    case 'gallery': return galleryImages(d, preview).length === 0;
    case 'cards': return cardItems(d).length === 0;
    case 'image': return !safeImageUrl(d.image, preview);
    case 'location': return !str(d.addressLine).trim() && !str(d.addressCity).trim() && !str(d.mapLink).trim();
    case 'hours': return hourRows(d).length === 0;
    case 'contact': return activeChannels(d).length === 0;
    case 'video': return videoItems(d).length === 0;
    case 'faq': return faqItems(d).length === 0;
    case 'testimonials': return testimonialItems(d).length === 0;
    case 'products': return productItems(d).length === 0;
    case 'social': return socialLinks(d).length === 0;
    case 'cta': return !str(d.headline).trim() && !str(d.text).trim();
    case 'team': return teamItems(d).length === 0;
    case 'wallet': return !isWalletAddress(d.address);
    case 'divider': return false;
    default: return true;
  }
}

const EMPTY_HINTS = {
  hero: 'Hero: add a headline or an image.',
  text: 'Text: add some text.',
  imagetext: 'Image + Text: add an image or some text.',
  gallery: 'Gallery: add photos.',
  cards: 'Cards: add at least one item.',
  image: 'Full Image: add an image.',
  location: 'Location: add an address.',
  hours: 'Opening Hours: add at least one row.',
  contact: 'Contact: turn on a channel and fill it in.',
  video: 'Video: paste a YouTube link.',
  faq: 'FAQ: add a question and an answer.',
  testimonials: 'Testimonials: add at least one review.',
  products: 'Products: add at least one item with a title.',
  social: 'Social Links: add a link.',
  cta: 'Call to Action: add a headline or text.',
  team: 'Team: add at least one person.',
  wallet: 'Wallet Card: add a valid wallet address (0x...).',
};

// ---------- block renderers ----------

function titleHtml(d) {
  const t = str(d.title, 200).trim();
  return t ? '<h3 class="section-title">' + escapeHtml(t) + '</h3>' : '';
}

function wrap(block, d, inner, extraClass) {
  const bg = oneOf(d.bg, ['white', 'soft', 'tint'], 'white');
  return '<section class="blk blk-' + block.type + ' bg-' + bg + (extraClass ? ' ' + extraClass : '') + '" data-block-id="' + escapeHtml(block.id) + '">' +
    '<div class="section-inner">' + inner + '</div></section>';
}

function linkButton(label, url, cls) {
  const l = str(label, 60).trim();
  const u = safeHttpUrl(url);
  if (!l || !u) return '';
  return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener" class="' + cls + '" onclick="trackClick()">' + escapeHtml(l) + '</a>';
}

const RENDERERS = {
  hero(block, d, ctx) {
    const img = safeImageUrl(d.image, ctx.preview);
    const align = oneOf(d.align, ['left', 'center'], 'left');
    const badge = str(d.badge, 60).trim();
    const sub = str(d.subtitle, 300).trim();
    const btn = linkButton(d.buttonLabel, d.buttonUrl, 'btn-primary');
    const imgD = safeImageUrl(d.imageDesktop, ctx.preview);
    // Cropped mode: the person cropped one image for phones and tablets (square) and one for
    // desktop (wide) when uploading, so the banner shows exactly what they chose on both.
    // Older heroes only have `image`; they keep the legacy fixed height + focus point rendering.
    const cropped = !!(img && imgD);
    let bg, cls;
    if (cropped) {
      cls = 'blk blk-hero hero-cropped';
      bg = '<picture><source media="(min-width: 768px)" srcset="' + escapeHtml(imgD) + '"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(ctx.name) + '"></picture>';
    } else {
      const fx = clampInt(d.focusX, 0, 100, 50);
      const fy = clampInt(d.focusY, 0, 100, 50);
      const height = oneOf(d.height, ['compact', 'standard', 'tall'], 'standard');
      cls = 'blk blk-hero h-' + height;
      bg = img ? '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(ctx.name) + '" style="object-position:' + fx + '% ' + fy + '%">' : '';
    }
    return '<section class="' + cls + '" data-block-id="' + escapeHtml(block.id) + '">' +
      '<div class="hero-bg">' + bg + '</div>' +
      '<div class="hero-overlay"></div>' +
      '<div class="hero-content-wrap ' + align + '"><div class="section-inner hero-content">' +
      (badge ? '<span class="hero-badge">' + escapeHtml(badge) + '</span>' : '') +
      (str(d.headline).trim() ? '<h1 class="hero-title">' + escapeHtml(str(d.headline, 200)) + '</h1>' : '') +
      (sub ? '<p class="hero-subtitle">' + escapeHtml(sub) + '</p>' : '') +
      (btn ? '<div class="hero-buttons">' + btn + '</div>' : '') +
      '</div></div></section>';
  },

  text(block, d) {
    const align = oneOf(d.align, ['left', 'center'], 'left');
    return wrap(block, d, titleHtml(d) + '<p class="text-body ' + align + '">' + escapeHtml(str(d.body, 5000)) + '</p>');
  },

  imagetext(block, d, ctx) {
    const img = safeImageUrl(d.image, ctx.preview);
    const pos = oneOf(d.imagePosition, ['left', 'right'], 'left');
    const btn = linkButton(d.buttonLabel, d.buttonUrl, 'btn-solid');
    // imageSquare: the person cropped the photo to 1:1 when uploading (older photos keep their own shape).
    const imgHtml = img ? '<div class="it-img' + (d.imageSquare === true ? ' sq' : '') + '"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(str(d.title, 200) || ctx.name) + '" loading="lazy"></div>' : '';
    const body = str(d.body, 5000).trim();
    const textHtml = (str(d.title).trim() || body || btn)
      ? '<div class="it-text">' + (str(d.title).trim() ? '<h3 class="it-title">' + escapeHtml(str(d.title, 200)) + '</h3>' : '') +
        (body ? '<p class="text-body">' + escapeHtml(body) + '</p>' : '') + btn + '</div>'
      : '';
    return wrap(block, d, '<div class="it-wrap ' + pos + '">' + imgHtml + textHtml + '</div>');
  },

  gallery(block, d, ctx) {
    const cols = clampInt(d.columns, 2, 4, 3);
    const imgs = galleryImages(d, ctx.preview);
    const last = imgs.length - 1;
    // A short last row gets its last photo stretched to fill it (phone has 2 columns, desktop has `cols`).
    // Alone in its row it gets a wide ratio; with neighbours it simply stretches to their height.
    const fill = (n, c) => {
      const rem = n % c;
      if (rem === 0) return null;
      return rem === 1 ? { span: c, ratio: c + ' / 1' } : { span: c - rem + 1, ratio: 'auto' };
    };
    const fm = fill(imgs.length, 2);
    const fd = fill(imgs.length, cols);
    const lastStyle = (fm ? '--sm:' + fm.span + ';--am:' + fm.ratio + ';' : '') + (fd ? '--sd:' + fd.span + ';--ad:' + fd.ratio + ';' : '');
    const items = imgs.map((g, i) => {
      const isFill = i === last && lastStyle;
      return '<div class="gallery-item' + (isFill ? ' gl' : '') + '"' + (isFill ? ' style="' + lastStyle + '"' : '') +
        ' data-g="' + escapeHtml(block.id) + '" onclick="openLightbox(this)"><img src="' +
        escapeHtml(safeImageUrl(g.src, ctx.preview)) + '" alt="' + escapeHtml(ctx.name) + ' photo ' + (i + 1) + '" loading="lazy"></div>';
    }
    ).join('');
    return wrap(block, d, titleHtml(d) + '<div class="gallery-grid" style="--cols:' + cols + ';">' + items + '</div>');
  },

  cards(block, d, ctx) {
    const cols = clampInt(d.columns, 1, 3, 2);
    const cards = cardItems(d).map((it) => {
      const price = formatPrice(it.price, ctx.currency);
      return '<div class="service-card"><div class="service-icon"><i class="' + escapeHtml(safeIcon(it.icon)) + '"></i></div>' +
        '<div class="service-info"><div>' +
        (str(it.title).trim() ? '<h4>' + escapeHtml(str(it.title, 120)) + '</h4>' : '') +
        (str(it.desc).trim() ? '<p>' + escapeHtml(str(it.desc, 400)) + '</p>' : '') +
        '</div>' + (price ? '<div class="service-price">' + price + '</div>' : '') + '</div></div>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="cards-grid" style="--cols:' + cols + ';">' + cards + '</div>');
  },

  image(block, d, ctx) {
    const img = safeImageUrl(d.image, ctx.preview);
    const cap = str(d.caption, 300).trim();
    return wrap(block, d, '<div class="full-image"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(cap || ctx.name) + '" loading="lazy"></div>' +
      (cap ? '<p class="image-caption">' + escapeHtml(cap) + '</p>' : ''));
  },

  location(block, d) {
    const line = str(d.addressLine, 200).trim();
    const city = str(d.addressCity, 200).trim();
    const query = [line, city].filter(Boolean).join(', ') || 'Indonesia';
    const mapSrc = 'https://www.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed';
    const mapsLink = safeHttpUrl(d.mapLink) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
    const closing = str(d.closingText, 300).trim();
    return wrap(block, d, titleHtml(d) +
      '<div class="map-container"><iframe src="' + escapeHtml(mapSrc) + '" style="width:100%;height:100%;border:0;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
      '<div class="address-box">' + (line ? '<p class="address-line">' + escapeHtml(line) + '</p>' : '') + (city ? '<span class="address-city">' + escapeHtml(city) + '</span>' : '') + '</div>' +
      '<a href="' + escapeHtml(mapsLink) + '" target="_blank" rel="noopener" class="direction-btn" onclick="trackClick()"><i class="fa-solid fa-map-location-dot"></i> Open in Maps</a>' +
      (closing ? '<p class="closing-text">' + escapeHtml(closing) + '</p>' : ''));
  },

  hours(block, d) {
    const rows = hourRows(d).map((r) => '<div class="hours-row"><span>' + escapeHtml(str(r.label, 60)) + '</span><span>' + escapeHtml(str(r.time, 60)) + '</span></div>').join('');
    return wrap(block, d, titleHtml(d) + '<div class="hours-card">' + rows + '</div>');
  },

  contact(block, d) {
    const ch = d.channels || {};
    const buttons = activeChannels(d).map((def, i) => {
      const value = str(ch[def.key].value, 200).trim();
      const cls = i === 0 ? 'contact-btn wa-btn' : 'contact-btn phone-btn';
      if (def.key === 'wechat') {
        return '<button type="button" class="' + cls + '" data-wechat-id="' + escapeHtml(value) + '" onclick="copyWeChatId(this.dataset.wechatId); trackClick();"><i class="' + def.icon + '"></i> WeChat: ' + escapeHtml(value) + '</button>';
      }
      return '<a href="' + escapeHtml(getChannelHref(def.key, value)) + '" target="_blank" rel="noopener" class="' + cls + '" onclick="trackClick()"><i class="' + def.icon + '"></i> ' + def.label + '</a>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="contact-grid">' + buttons + '</div>');
  },

  // Same look and behavior as the video cards on the link in bio page (YouTube only, tap to play).
  video(block, d) {
    const list = videoItems(d);
    const layout = list.length > 1 && d.layout === 'grid' ? 'grid' : 'single';
    const cards = list.map((v) => {
      const id = extractYouTubeId(v.url);
      const title = str(v.title, 150).trim() || 'Watch video';
      if (!id) {
        const href = safeHttpUrl(v.url);
        return href ? '<a class="vid-link" href="' + escapeHtml(href) + '" target="_blank" rel="noopener" onclick="trackClick()"><i class="fa-brands fa-youtube"></i> ' + escapeHtml(title) + '</a>' : '';
      }
      const meta = str(v.channel, 100).trim();
      return '<div class="vid-card"><button type="button" class="vid-thumb" aria-label="Play video: ' + escapeHtml(title) + '" data-vid="' + id + '" onclick="playVideo(this)">' +
        '<img src="https://i.ytimg.com/vi/' + id + '/hq720.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg\'">' +
        '<span class="vid-play">&#9658;</span><span class="vid-overlay"><span class="vid-title">' + escapeHtml(title) + '</span>' +
        '<span class="vid-meta">YouTube' + (meta ? ' &middot; ' + escapeHtml(meta) : '') + '</span></span></button></div>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="vid-grid ' + layout + '">' + cards + '</div>');
  },

  faq(block, d) {
    const rows = faqItems(d).map((it) =>
      '<details class="faq-item"><summary>' + escapeHtml(str(it.q, 200)) + '</summary><p>' + escapeHtml(str(it.a, 2000)) + '</p></details>'
    ).join('');
    return wrap(block, d, titleHtml(d) + '<div class="faq-list">' + rows + '</div>');
  },

  testimonials(block, d, ctx) {
    const cards = testimonialItems(d).map((it) => {
      const photo = safeImageUrl(it.photo, ctx.preview);
      const name = str(it.name, 80).trim();
      const role = str(it.role, 100).trim();
      const rating = clampInt(it.rating, 0, 5, 0);
      const stars = rating ? '<div class="tm-stars" aria-label="' + rating + ' out of 5 stars">' + '<i class="fa-solid fa-star"></i>'.repeat(rating) + '</div>' : '';
      const avatar = photo ? '<img class="tm-avatar" src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" loading="lazy">'
        : (name ? '<span class="tm-avatar tm-initial">' + escapeHtml(name.charAt(0).toUpperCase()) + '</span>' : '');
      return '<figure class="tm-card">' + stars + '<blockquote>' + escapeHtml(str(it.text, 800)) + '</blockquote>' +
        ((avatar || name) ? '<figcaption>' + avatar + '<span><b>' + escapeHtml(name) + '</b>' + (role ? '<em>' + escapeHtml(role) + '</em>' : '') + '</span></figcaption>' : '') + '</figure>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="tm-grid">' + cards + '</div>');
  },

  // Cards with a square photo. Tapping a card opens a popup with the full photo, title, price, full text and button.
  products(block, d, ctx) {
    const cols = clampInt(d.columns, 1, 3, 2);
    const cards = productItems(d).map((it, i) => {
      const img = safeImageUrl(it.image, ctx.preview);
      const price = formatPrice(it.price, ctx.currency);
      const desc = str(it.desc, 1500).trim();
      return '<button type="button" class="pr-card" data-p="' + escapeHtml(block.id) + '" data-i="' + i + '" onclick="openProduct(this)">' +
        (img ? '<span class="pr-img"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(str(it.title, 120)) + '" loading="lazy"></span>' : '') +
        '<span class="pr-body"><span class="pr-title">' + escapeHtml(str(it.title, 120)) + '</span>' +
        (price ? '<span class="pr-price">' + price + '</span>' : '') +
        (desc ? '<span class="pr-desc">' + escapeHtml(desc) + '</span>' : '') +
        '<span class="pr-more">View details</span></span></button>';
    }).join('');
    // Full data for the popup lives in hidden templates, so no extra requests are needed.
    const details = productItems(d).map((it, i) => {
      const main = safeImageUrl(it.imageFull, ctx.preview) || safeImageUrl(it.image, ctx.preview);
      const more = (Array.isArray(it.moreImages) ? it.moreImages : []).map((u) => safeImageUrl(u, ctx.preview)).filter(Boolean);
      const photos = (main ? [main] : []).concat(more).slice(0, MAX_PRODUCT_PHOTOS);
      const alt = escapeHtml(str(it.title, 120));
      const slides = photos.map((u) => '<div class="pd-slide"><img src="' + escapeHtml(u) + '" alt="' + alt + '"></div>').join('');
      const nav = photos.length > 1
        ? '<button type="button" class="pd-nav prev" onclick="pdSlide(this,-1)" aria-label="Previous photo">&#10094;</button><button type="button" class="pd-nav next" onclick="pdSlide(this,1)" aria-label="Next photo">&#10095;</button><span class="pd-count">1 / ' + photos.length + '</span>'
        : '';
      const price = formatPrice(it.price, ctx.currency);
      const btn = linkButton(it.buttonLabel, it.buttonUrl, 'btn-solid');
      return '<template data-pd="' + escapeHtml(block.id) + '-' + i + '">' +
        (photos.length ? '<div class="pd-img"><div class="pd-slides">' + slides + '</div>' + nav + '</div>' : '') +
        '<div class="pd-body"><h3>' + escapeHtml(str(it.title, 120)) + '</h3>' + (price ? '<div class="pd-price">' + price + '</div>' : '') +
        (str(it.desc).trim() ? '<p class="text-body">' + escapeHtml(str(it.desc, 1500)) + '</p>' : '') + btn + '</div></template>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="pr-grid" style="--cols:' + cols + ';">' + cards + '</div>' + details);
  },

  social(block, d) {
    const align = oneOf(d.align, ['left', 'center'], 'center');
    const links = socialLinks(d).map((l) => {
      const def = SOCIAL_DEFS.filter((x) => x.key === l.platform)[0];
      return '<a class="sl-btn" href="' + escapeHtml(safeHttpUrl(l.url)) + '" target="_blank" rel="noopener" aria-label="' + escapeHtml(def.label) + '" title="' + escapeHtml(def.label) + '" onclick="trackClick()"><i class="' + def.icon + '"></i></a>';
    }).join('');
    return wrap(block, d, titleHtml(d) + '<div class="sl-row ' + align + '">' + links + '</div>');
  },

  cta(block, d) {
    const style = oneOf(d.style, ['brand', 'light'], 'brand');
    const align = oneOf(d.align, ['left', 'center'], 'center');
    const btn = linkButton(d.buttonLabel, d.buttonUrl, style === 'brand' ? 'cta-btn on-brand' : 'btn-solid');
    const inner = '<div class="cta-box ' + style + ' ' + align + '">' +
      (str(d.headline).trim() ? '<h3 class="cta-title">' + escapeHtml(str(d.headline, 200)) + '</h3>' : '') +
      (str(d.text).trim() ? '<p class="cta-text">' + escapeHtml(str(d.text, 500)) + '</p>' : '') + btn + '</div>';
    return '<section class="blk blk-cta" data-block-id="' + escapeHtml(block.id) + '"><div class="section-inner">' + inner + '</div></section>';
  },

  team(block, d, ctx) {
    const cards = teamItems(d).map((it) => {
      const photo = safeImageUrl(it.photo, ctx.preview);
      const name = str(it.name, 80).trim();
      const role = str(it.role, 100).trim();
      return '<div class="team-card"><div class="team-photo">' +
        (photo ? '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" loading="lazy">' : '<span>' + escapeHtml(name.charAt(0).toUpperCase()) + '</span>') +
        '</div><h4>' + escapeHtml(name) + '</h4>' + (role ? '<p>' + escapeHtml(role) + '</p>' : '') + '</div>';
    }).join('');
    const cols = clampInt(d.columns, 2, 4, 4);
    return wrap(block, d, titleHtml(d) + '<div class="team-grid" style="--cols:' + cols + ';">' + cards + '</div>');
  },

  wallet(block, d) {
    const addr = String(d.address || '').trim();
    if (!isWalletAddress(addr)) return '';
    const title = str(d.title, 80).trim() || 'Receive Crypto Payment';
    const desc = str(d.desc, 140).trim();
    const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(addr);
    const inner = '<div class="wc-wrap"><button type="button" class="wc-card" onclick="openWallet(this)" aria-haspopup="dialog">' +
      '<span class="wc-shimmer"></span>' +
      '<span class="wc-ring"><span class="wc-icon"><img src="/assets/usdc-logo.png" alt="USDC"></span></span>' +
      '<span class="wc-text"><span class="wc-badges"><span class="wc-badge">&#9889; Instant</span><span class="wc-badge">Tap to pay</span></span>' +
      '<span class="wc-title">' + escapeHtml(title) + '</span>' +
      (desc ? '<span class="wc-desc">' + escapeHtml(desc) + '</span>' : '') + '</span></button>' +
      '<div class="wc-modal" onclick="if(event.target===this)closeWallet(this)"><div class="wc-box" role="dialog" aria-modal="true">' +
      '<button type="button" class="wc-x" onclick="closeWallet(this)" aria-label="Close">&times;</button>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<div class="wc-qr"><img src="' + escapeHtml(qr) + '" alt="Wallet QR code" loading="lazy"></div>' +
      '<p class="wc-addr">' + escapeHtml(addr) + '</p>' +
      '<button type="button" class="wc-copy" data-addr="' + escapeHtml(addr) + '" onclick="copyWalletAddr(this)">Copy address</button>' +
      '<p class="wc-note">Send USDC on the Polygon (PoS) network only.</p></div></div></div>';
    return wrap(block, d, inner);
  },

  divider(block, d) {
    const style = oneOf(d.style, ['line', 'dots', 'space'], 'line');
    const size = oneOf(d.size, ['small', 'medium', 'large'], 'medium');
    const mark = style === 'line' ? '<hr>' : (style === 'dots' ? '<div class="dv-dots"><i></i><i></i><i></i></div>' : '');
    return '<div class="blk-divider ' + style + ' s-' + size + '" data-block-id="' + escapeHtml(block.id) + '">' + mark + '</div>';
  },
};

function makeCtx(content, opts) {
  const c = content || {};
  return {
    preview: !!(opts && opts.preview),
    currency: c.currentCurrency || 'IDR',
    name: str(c.name, 120) || 'Business',
  };
}

// Renders one block. Returns '' for unknown types and (on the public page)
// for blocks that are still empty. In the editor preview an empty block shows
// a dashed hint so the person knows what to fill in.
export function renderBlock(block, content, opts) {
  if (!block || typeof block !== 'object' || !RENDERERS[block.type]) return '';
  const safe = { id: safeId(block.id) || 'x', type: block.type, data: block.data && typeof block.data === 'object' ? block.data : {} };
  const ctx = makeCtx(content, opts);
  if (isEmpty(safe, ctx.preview)) {
    if (!ctx.preview) return '';
    return '<div class="blk-empty" data-block-id="' + escapeHtml(safe.id) + '">' + escapeHtml(EMPTY_HINTS[safe.type] || 'Empty module.') + '</div>';
  }
  return RENDERERS[safe.type](safe, safe.data, ctx);
}

// A page has at most one hero and it always comes first. Extra heroes are dropped.
export function orderBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks.slice(0, MAX_BLOCKS) : [];
  const hero = list.find((b) => b && b.type === 'hero');
  if (!hero) return list;
  return [hero].concat(list.filter((b) => !b || b.type !== 'hero'));
}

export function renderBlocks(content, opts) {
  const blocks = orderBlocks((content || {}).blocks);
  return blocks.map((b) => renderBlock(b, content, opts)).join('\n');
}

export function renderHeader(content, opts) {
  const c = content || {};
  const preview = !!(opts && opts.preview);
  const name = str(c.name, 120).trim() || (preview ? 'Your Business' : 'Business Name');
  const tagline = str(c.tagline, 160).trim();
  const logo = safeImageUrl(c.logoImage, preview);
  const logoInner = logo ? '<img src="' + escapeHtml(logo) + '" alt="' + escapeHtml(name) + '">' : escapeHtml(name.charAt(0).toUpperCase());
  const logoClass = c.logoShape === 'landscape' ? 'logo-box landscape' : 'logo-box';
  const textClass = c.showLogoText === false ? 'header-text sr-only' : 'header-text';
  return '<header class="page-header"><div class="section-inner" style="display:flex;align-items:center;justify-content:space-between;">' +
    '<div class="header-brand"><div class="' + logoClass + '" style="background:' + (logo ? 'transparent' : 'var(--primary)') + ';color:var(--on-primary);">' + logoInner + '</div>' +
    '<div class="' + textClass + '"><h1>' + escapeHtml(name) + '</h1>' + (tagline ? '<p>' + escapeHtml(tagline) + '</p>' : '') + '</div></div></div></header>';
}

// ---------- lightbox (one shared lightbox, works with many galleries) ----------

export const LIGHTBOX_HTML = '<div id="lightbox" onclick="closeLightbox(event)"><div class="lightbox-content" onclick="event.stopPropagation()">' +
  '<button class="lightbox-close" onclick="closeLightbox()" aria-label="Close">&times;</button>' +
  '<div class="lightbox-img-wrap"><img id="lightboxImg" src="" alt="Gallery"></div>' +
  '<div class="lightbox-nav"><button onclick="prevLightbox()" aria-label="Previous">&#10094;</button>' +
  '<span class="lightbox-counter" id="lightboxCounter">1 / 1</span>' +
  '<button onclick="nextLightbox()" aria-label="Next">&#10095;</button></div></div></div>';

export const LIGHTBOX_JS = '(function(){var items=[],idx=0;' +
  'function show(){if(!items.length)return;document.getElementById("lightboxImg").src=items[idx];document.getElementById("lightboxCounter").textContent=(idx+1)+" / "+items.length;}' +
  'window.openLightbox=function(el){var g=el.getAttribute("data-g");var nodes=[].slice.call(document.querySelectorAll(\'.gallery-item[data-g="\'+g+\'"]\'));' +
  'items=nodes.map(function(n){return n.querySelector("img").getAttribute("src");});idx=Math.max(0,nodes.indexOf(el));show();document.getElementById("lightbox").classList.add("active");};' +
  'window.closeLightbox=function(e){if(e&&e.target!==e.currentTarget)return;document.getElementById("lightbox").classList.remove("active");};' +
  'window.prevLightbox=function(){if(!items.length)return;idx=(idx-1+items.length)%items.length;show();};' +
  'window.nextLightbox=function(){if(!items.length)return;idx=(idx+1)%items.length;show();};})();';

// ---------- video player + product popup (shared by the public page and the editor preview) ----------

export const PRODUCT_MODAL_HTML = '<div id="productModal" onclick="closeProduct(event)"><div class="pd-sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' +
  '<button class="pd-close" onclick="closeProduct()" aria-label="Close">&times;</button><div id="productBody"></div></div></div>';

export const BLOCKS_JS = '(function(){' +
  'window.playVideo=function(btn){var id=btn.getAttribute("data-vid");if(!id||!/^[a-zA-Z0-9_-]{11}$/.test(id))return;' +
  'if(window.trackClick)trackClick();var card=btn.parentNode;var f=document.createElement("iframe");' +
  'f.src="https://www.youtube-nocookie.com/embed/"+id+"?autoplay=1&rel=0&playsinline=1";' +
  'f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";f.allowFullscreen=true;f.title="YouTube video player";' +
  'card.classList.add("playing");card.replaceChild(f,btn);};' +
  'window.openProduct=function(el){var key=el.getAttribute("data-p")+"-"+el.getAttribute("data-i");' +
  'var tpl=document.querySelector(\'template[data-pd="\'+key+\'"]\');if(!tpl)return;' +
  'var pa=document.getElementById("previewArea"),pm=document.getElementById("productModal");pm.setAttribute("style",pa?(pa.getAttribute("style")||""):"");' +
  'document.getElementById("productBody").innerHTML=tpl.innerHTML;pm.classList.add("active");' +
  'document.body.style.overflow="hidden";};' +
  'window.closeProduct=function(e){if(e&&e.target&&e.currentTarget&&e.target!==e.currentTarget)return;' +
  'document.getElementById("productModal").classList.remove("active");document.getElementById("productBody").innerHTML="";document.body.style.overflow="";};' +
  'window.pdSlide=function(btn,dir){var s=btn.parentNode.querySelector(".pd-slides");if(s)s.scrollBy({left:dir*s.clientWidth,behavior:"smooth"});};' +
  'document.addEventListener("scroll",function(e){var s=e.target;if(!s||!s.classList||!s.classList.contains("pd-slides"))return;var c=s.parentNode.querySelector(".pd-count");if(c)c.textContent=(Math.round(s.scrollLeft/s.clientWidth)+1)+" / "+s.children.length;},true);' +
  'document.addEventListener("keydown",function(e){if(e.key==="Escape"&&document.getElementById("productModal"))closeProduct();});' +
  'window.openWallet=function(btn){var m=btn.parentNode.querySelector(".wc-modal");if(!m)return;if(window.trackClick)trackClick();m.classList.add("active");};' +
  'window.closeWallet=function(el){var m=el.closest(".wc-modal");if(m)m.classList.remove("active");};' +
  'window.copyWalletAddr=function(btn){var a=btn.getAttribute("data-addr");var done=function(){var o=btn.getAttribute("data-label")||btn.textContent;btn.setAttribute("data-label",o);btn.textContent="Copied!";setTimeout(function(){btn.textContent=o;},1500);};' +
  'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(a).then(done);}else{var t=document.createElement("textarea");t.value=a;document.body.appendChild(t);t.select();try{document.execCommand("copy");done();}catch(e){}document.body.removeChild(t);}};' +
  'document.addEventListener("keydown",function(e){if(e.key==="Escape"){var m=document.querySelector(".wc-modal.active");if(m)m.classList.remove("active");}});' +
  '})();';

// ---------- shared CSS ----------

export const BLOCKS_CSS = `
.section-inner { max-width: 800px; margin: 0 auto; width: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

.page-header { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid #f0f0f0; padding: 12px 24px; }
.header-brand { display: flex; align-items: center; gap: 12px; }
.logo-box { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; overflow: hidden; flex-shrink: 0; }
.logo-box img { width: 100%; height: 100%; object-fit: cover; }
.logo-box.landscape { width: auto; min-width: 90px; max-width: 170px; height: 40px; border-radius: 8px; padding: 0 6px; }
.logo-box.landscape img { width: auto; height: 100%; object-fit: contain; }
.header-text h1 { font-size: 15px; font-weight: 700; color: #212121; line-height: 1.2; }
.header-text p { font-size: 12px; color: #999; }

.blk { padding: 40px 24px; }
.bg-white { background: #ffffff; }
.bg-soft { background: #f8f8f8; }
.bg-tint { background: var(--tint); }
.section-title { font-size: 18px; font-weight: 700; color: #212121; margin-bottom: 20px; }
.text-body { font-size: 15px; color: #555; line-height: 1.7; white-space: pre-wrap; }
.text-body.center { text-align: center; }
.blk-text .section-title { margin-bottom: 12px; }
.blk-empty { margin: 16px 24px; padding: 28px 24px; border: 2px dashed #d8d8d8; border-radius: 12px; text-align: center; color: #999; font-size: 13px; }

.blk-hero { position: relative; height: 380px; overflow: hidden; padding: 0; }
.blk-hero.h-compact { height: 280px; }
.blk-hero.h-tall { height: 520px; }
.blk-hero.hero-cropped { width: 100%; height: auto; aspect-ratio: 1 / 1; min-height: 320px; max-height: 560px; }
.hero-bg picture { display: block; width: 100%; height: 100%; }
.hero-bg { position: absolute; inset: 0; background: linear-gradient(135deg, var(--primary) 0%, #1c1c1c 140%); }
.hero-bg img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.45); z-index: 2; pointer-events: none; }
.hero-content-wrap { position: absolute; inset: 0; z-index: 3; display: flex; align-items: flex-end; padding: 32px 24px; }
.hero-content-wrap.center { align-items: center; text-align: center; }
.hero-content-wrap.center .hero-buttons { justify-content: center; }
.hero-content-wrap.center .hero-subtitle { margin-left: auto; margin-right: auto; }
.hero-content { color: white; width: 100%; }
.hero-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); width: fit-content; margin-bottom: 12px; }
.hero-title { font-size: 32px; font-weight: 700; margin-bottom: 12px; line-height: 1.2; }
.hero-subtitle { font-size: 15px; color: rgba(255,255,255,0.9); margin-bottom: 20px; max-width: 600px; }
.hero-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.btn-primary { padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); cursor: pointer; text-decoration: none; display: inline-block; background: var(--primary); color: var(--on-primary); }
.btn-solid { padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; display: inline-block; background: var(--primary); color: var(--on-primary); margin-top: 16px; }

.it-wrap { display: flex; flex-direction: column; gap: 24px; }
.it-img img { width: 100%; height: auto; display: block; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
.it-img.sq { width: 100%; max-width: 480px; margin: 0 auto; }
.it-title { font-size: 20px; font-weight: 700; color: #212121; margin-bottom: 10px; }

.gallery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.gallery-item { aspect-ratio: 1; border-radius: 16px; overflow: hidden; position: relative; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Last photo of a short row stretches to fill it (set by the renderer through --sm/--am and --sd/--ad). */
.gallery-item.gl { grid-column: span var(--sm, 1); aspect-ratio: var(--am, 1); align-self: stretch; }
.gallery-item.gl img { position: absolute; inset: 0; } /* the photo must not set the height, the row or the ratio does */

.cards-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.service-card { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; border: 1px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.service-icon { width: 56px; height: 56px; border-radius: 12px; background: var(--tint); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.service-info { display: flex; flex-direction: column; justify-content: space-between; min-height: 56px; width: 100%; }
.service-info h4 { font-size: 16px; font-weight: 700; color: #212121; margin-bottom: 4px; }
.service-info p { font-size: 13px; color: #777; line-height: 1.5; }
.service-price { text-align: right; margin-top: 10px; color: var(--primary); font-size: 14px; font-weight: 700; }

.full-image { width: 100%; border-radius: 16px; overflow: hidden; background: #f0f0f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
.full-image img { width: 100%; height: auto; display: block; }
.image-caption { margin-top: 10px; font-size: 13px; color: #777; text-align: center; }

.map-container { height: 220px; border-radius: 16px; overflow: hidden; background: #e0e0e0; position: relative; }
.address-box { text-align: center; margin-top: 14px; }
.address-line { font-size: 15px; font-weight: 700; color: #212121; }
.address-city { font-size: 13px; color: #777; }
.direction-btn { width: 100%; margin-top: 16px; padding: 14px; border-radius: 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; text-decoration: none; background: var(--tint); color: var(--primary); }
.closing-text { margin-top: 20px; font-size: 14px; color: #666; line-height: 1.7; font-style: italic; text-align: center; }

.hours-card { background: white; border-radius: 16px; padding: 12px 24px; border: 1px solid #f0f0f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.hours-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; gap: 16px; }
.hours-row:not(:last-child) { border-bottom: 1px solid #f0f0f0; }
.hours-row span:first-child { font-size: 14px; color: #666; }
.hours-row span:last-child { font-size: 14px; font-weight: 600; color: #212121; text-align: right; }

.contact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.contact-btn { padding: 16px; border-radius: 16px; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; border: none; text-decoration: none; font-family: inherit; }
.contact-btn i { font-size: 18px; }
.wa-btn { background: var(--primary); color: var(--on-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.phone-btn { background: transparent; border: 2px solid var(--primary); color: var(--primary); }

#lightbox { display: none; position: fixed; inset: 0; z-index: 100; background: rgba(10,10,10,0.95); backdrop-filter: blur(8px); align-items: center; justify-content: center; }
#lightbox.active { display: flex; }
.lightbox-content { position: relative; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; align-items: center; }
.lightbox-img-wrap { display: flex; align-items: center; justify-content: center; max-width: 100%; max-height: 80vh; }
.lightbox-img-wrap img { max-width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px; }
.lightbox-close { position: absolute; top: -50px; right: 0; width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; color: white; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.lightbox-nav { display: flex; align-items: center; gap: 24px; margin-top: 20px; }
.lightbox-nav button { width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; color: white; font-size: 20px; cursor: pointer; }
.lightbox-counter { color: rgba(255,255,255,0.8); font-size: 15px; font-weight: 500; min-width: 70px; text-align: center; }

/* video (same look as the link in bio video cards) */
.vid-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.vid-card { position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
.vid-thumb { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: #000; cursor: pointer; font-family: inherit; }
.vid-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vid-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.65); color: #fff; font-size: 22px; display: flex; align-items: center; justify-content: center; padding-left: 4px; }
.vid-overlay { position: absolute; left: 0; right: 0; bottom: 0; padding: 28px 14px 12px; text-align: left; background: linear-gradient(transparent, rgba(0,0,0,0.75)); display: flex; flex-direction: column; gap: 2px; }
.vid-title { color: #fff; font-size: 14px; font-weight: 600; line-height: 1.3; }
.vid-meta { color: rgba(255,255,255,0.75); font-size: 12px; }
.vid-card iframe { width: 100%; height: 100%; border: 0; display: block; }
.vid-link { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 12px; background: #fff; border: 1px solid #f0f0f0; color: #212121; font-weight: 600; font-size: 14px; text-decoration: none; }

/* faq */
.faq-list { display: flex; flex-direction: column; gap: 10px; }
.faq-item { background: #fff; border: 1px solid #f0f0f0; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.faq-item summary { list-style: none; cursor: pointer; padding: 16px 48px 16px 18px; font-size: 15px; font-weight: 600; color: #212121; position: relative; }
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after { content: '+'; position: absolute; right: 18px; top: 50%; transform: translateY(-50%); font-size: 22px; font-weight: 400; color: var(--primary); }
.faq-item[open] summary::after { content: '\\2212'; }
.faq-item p { padding: 0 18px 16px; font-size: 14px; color: #555; line-height: 1.7; white-space: pre-wrap; }

/* testimonials */
.tm-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.tm-card { background: #fff; border: 1px solid #f0f0f0; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); margin: 0; display: flex; flex-direction: column; gap: 12px; }
.tm-stars { color: #f5b301; font-size: 14px; display: flex; gap: 3px; }
.tm-card blockquote { margin: 0; font-size: 14px; color: #444; line-height: 1.7; white-space: pre-wrap; }
.tm-card figcaption { display: flex; align-items: center; gap: 12px; margin-top: auto; }
.tm-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; display: block; }
.tm-initial { display: flex; align-items: center; justify-content: center; background: var(--tint); color: var(--primary); font-weight: 700; }
.tm-card figcaption b { display: block; font-size: 14px; color: #212121; }
.tm-card figcaption em { display: block; font-size: 12px; color: #888; font-style: normal; }

/* products (square photo, detail popup) */
/* Flex instead of grid so a short last row is centered, not left aligned with a hole on the right. */
.pr-grid { --gap: 12px; --n: 2; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gap); }
.pr-grid > .pr-card { flex: 0 0 calc((100% - var(--gap) * (var(--n) - 1)) / var(--n)); min-width: 0; }
.pr-card { display: flex; flex-direction: column; text-align: left; padding: 0; border: 1px solid #f0f0f0; background: #fff; border-radius: 16px; overflow: hidden; cursor: pointer; font-family: inherit; box-shadow: 0 2px 8px rgba(0,0,0,0.03); transition: transform 0.2s, box-shadow 0.2s; }
.pr-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
.pr-img { display: block; aspect-ratio: 1; background: #f0f0f0; }
.pr-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pr-body { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px 14px; flex: 1; }
.pr-title { font-size: 14px; font-weight: 700; color: #212121; line-height: 1.3; }
.pr-price { font-size: 14px; font-weight: 700; color: var(--primary); }
.pr-desc { font-size: 12px; color: #777; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
.pr-more { margin-top: auto; padding-top: 6px; font-size: 12px; font-weight: 600; color: var(--primary); }
#productModal { display: none; position: fixed; inset: 0; z-index: 110; background: rgba(10,10,10,0.7); backdrop-filter: blur(6px); align-items: flex-end; justify-content: center; }
#productModal.active { display: flex; }
.pd-sheet { position: relative; background: #fff; width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; border-radius: 20px 20px 0 0; }
.pd-close { position: absolute; top: 10px; right: 10px; z-index: 2; width: 38px; height: 38px; border-radius: 50%; border: none; background: rgba(0,0,0,0.55); color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.pd-img { background: #f0f0f0; position: relative; }
.pd-slides { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.pd-slides::-webkit-scrollbar { display: none; }
.pd-slide { flex: 0 0 100%; scroll-snap-align: center; display: flex; align-items: center; justify-content: center; }
.pd-slide img { width: 100%; height: auto; max-height: 60vh; object-fit: contain; display: block; }
.pd-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: #fff; font-size: 14px; cursor: pointer; }
.pd-nav.prev { left: 10px; }
.pd-nav.next { right: 10px; }
.pd-count { position: absolute; left: 10px; bottom: 10px; background: rgba(0,0,0,0.55); color: #fff; font-size: 12px; padding: 3px 9px; border-radius: 12px; }
.pd-body { padding: 20px 22px 26px; }
.pd-body h3 { font-size: 20px; font-weight: 700; color: #212121; margin-bottom: 6px; }
.pd-price { font-size: 18px; font-weight: 700; color: var(--primary); margin-bottom: 12px; }

/* social links */
.sl-row { display: flex; flex-wrap: wrap; gap: 12px; }
.sl-row.center { justify-content: center; }
.sl-btn { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--primary); color: var(--on-primary); font-size: 22px; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.blk-social .section-title { text-align: center; }

/* call to action */
.blk-cta { padding-top: 24px; padding-bottom: 24px; background: #fff; }
.cta-box { border-radius: 20px; padding: 36px 24px; }
.cta-box.center { text-align: center; }
.cta-box.brand { background: var(--primary); color: var(--on-primary); }
.cta-box.light { background: var(--tint); color: #212121; }
.cta-title { font-size: 24px; font-weight: 700; line-height: 1.25; margin-bottom: 8px; }
.cta-text { font-size: 15px; line-height: 1.6; opacity: 0.9; max-width: 560px; }
.cta-box.center .cta-text { margin-left: auto; margin-right: auto; }
.cta-btn { display: inline-block; margin-top: 20px; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; background: var(--on-primary); color: var(--primary); }

/* wallet card (receive USDC), colours follow the page brand color */
.wc-wrap { max-width: 520px; margin: 0 auto; }
.wc-card { position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px; width: 100%; padding: 18px; border: 0; border-radius: 18px; background: var(--primary); color: var(--on-primary); text-align: left; cursor: pointer; font: inherit; box-shadow: 0 8px 24px rgba(0,0,0,0.14); transition: transform .2s, box-shadow .2s; }
.wc-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.2); }
.wc-shimmer { position: absolute; top: 0; left: -60%; width: 50%; height: 100%; background: linear-gradient(120deg, transparent, rgba(255,255,255,0.18), transparent); transform: skewX(-20deg); animation: wc-sweep 3.2s ease-in-out infinite; pointer-events: none; }
@keyframes wc-sweep { 0% { left: -60%; } 55% { left: 130%; } 100% { left: 130%; } }
.wc-ring { position: relative; flex-shrink: 0; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.wc-ring::before { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid currentColor; opacity: 0; animation: wc-pulse 2.2s ease-out infinite; }
@keyframes wc-pulse { 0% { transform: scale(0.92); opacity: 0.5; } 70% { transform: scale(1.22); opacity: 0; } 100% { transform: scale(1.22); opacity: 0; } }
.wc-icon { position: relative; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid rgba(255,255,255,0.6); overflow: hidden; z-index: 1; }
.wc-icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wc-text { display: flex; flex-direction: column; min-width: 0; position: relative; z-index: 1; }
.wc-badges { display: flex; gap: 6px; margin-bottom: 5px; flex-wrap: wrap; }
.wc-badge { font-size: 10px; font-weight: 700; border-radius: 999px; padding: 2px 8px; letter-spacing: 0.2px; background: rgba(128,128,128,0.28); background: color-mix(in srgb, var(--on-primary) 18%, transparent); }
.wc-title { font-size: 16px; font-weight: 700; line-height: 1.25; word-break: break-word; }
.wc-desc { font-size: 12.5px; opacity: 0.85; margin-top: 3px; line-height: 1.4; word-break: break-word; }
.wc-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; padding: 20px; }
.wc-modal.active { display: flex; }
.wc-box { position: relative; background: #fff; color: #212121; border-radius: 20px; padding: 28px 24px 22px; max-width: 340px; width: 100%; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
.wc-x { position: absolute; top: 10px; right: 14px; border: 0; background: none; font-size: 24px; line-height: 1; color: #888; cursor: pointer; }
.wc-box h3 { font-size: 17px; font-weight: 700; margin: 0 0 16px; padding: 0 18px; word-break: break-word; }
.wc-qr { display: inline-block; background: #fff; padding: 12px; border-radius: 16px; border: 2px solid var(--primary); margin-bottom: 16px; }
.wc-qr img { display: block; width: 180px; height: 180px; }
.wc-addr { font-size: 12px; color: #555; word-break: break-all; background: #f4f4f5; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
.wc-copy { width: 100%; padding: 11px; border: 0; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 600; font-size: 14px; cursor: pointer; font-family: inherit; }
.wc-note { font-size: 11.5px; color: #777; margin-top: 10px; }
@media (prefers-reduced-motion: reduce) { .wc-shimmer, .wc-ring::before { animation: none; } }

/* team */
.team-grid { --gap: 16px; --n: 2; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gap); }
.team-card { text-align: center; flex: 0 0 calc((100% - var(--gap) * (var(--n) - 1)) / var(--n)); min-width: 0; }
.team-photo { aspect-ratio: 1; border-radius: 16px; overflow: hidden; background: var(--tint); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin-bottom: 10px; }
.team-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.team-card h4 { font-size: 15px; font-weight: 700; color: #212121; }
.team-card p { font-size: 13px; color: #777; margin-top: 2px; }

/* divider */
.blk-divider { background: #fff; padding: 0 24px; display: flex; align-items: center; justify-content: center; }
.blk-divider.s-small { height: 24px; }
.blk-divider.s-medium { height: 48px; }
.blk-divider.s-large { height: 96px; }
.blk-divider hr { width: 100%; max-width: 800px; border: 0; border-top: 1px solid #e3e3e3; margin: 0; }
.dv-dots { display: flex; gap: 8px; }
.dv-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); opacity: 0.6; display: block; }

@media (min-width: 768px) {
  .gallery-grid { grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 16px; }
  .gallery-item.gl { grid-column: span var(--sd, 1); aspect-ratio: var(--ad, 1); }
  .cards-grid { grid-template-columns: repeat(var(--cols, 2), 1fr); gap: 16px; }
  .vid-grid.grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .tm-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .pr-grid { --gap: 16px; --n: var(--cols, 2); }
  .pr-title, .pd-price { font-size: 15px; }
  #productModal { align-items: center; }
  .pd-sheet { border-radius: 20px; }
  .team-grid { --gap: 20px; --n: var(--cols, 4); }
  .cta-box { padding: 48px 40px; }
  .cta-title { font-size: 30px; }
  .blk-hero { height: 440px; }
  /* Cropped hero: wide image and 12:5 box from 768px up, so Desktop site mode (about 980px) fills the full width */
  .blk-hero.hero-cropped { aspect-ratio: 12 / 5; min-height: 0; max-height: 640px; }
  .blk-hero.h-compact { height: 340px; }
  .blk-hero.h-tall { height: 620px; }
  .hero-title { font-size: 40px; }
  .hero-subtitle { font-size: 16px; }
  .it-wrap { flex-direction: row; align-items: center; gap: 32px; }
  .it-wrap.right { flex-direction: row-reverse; }
  .it-img, .it-text { flex: 1; min-width: 0; }
  .it-img.sq { max-width: none; margin: 0; }
}
@media (min-width: 1024px) {
  .gallery-grid { gap: 20px; }
  .cards-grid { gap: 20px; }
  .blk-hero { height: 500px; }
  .blk-hero.h-compact { height: 400px; }
  .blk-hero.h-tall { height: 720px; }
  .hero-title { font-size: 48px; }
  .hero-subtitle { font-size: 18px; }
  .blk { padding: 60px 40px; }
  .blk-hero { padding: 0; }
  .map-container { height: 300px; }
  .direction-btn { width: fit-content; padding: 14px 32px; margin: 20px auto 0; }
}
`;
