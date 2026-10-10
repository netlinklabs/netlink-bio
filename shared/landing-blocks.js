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

export const MAX_BLOCKS = 30;
export const MAX_GALLERY_IMAGES = 10;
export const MAX_CARD_ITEMS = 20;
export const MAX_HOURS_ROWS = 10;

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
    case 'imagetext': return { title: '', body: '', image: '', imagePosition: 'left', buttonLabel: '', buttonUrl: '', bg: 'white' };
    case 'gallery': return { title: 'Gallery', images: [], columns: 3, bg: 'soft' };
    case 'cards': return { title: 'Our Services', columns: 2, bg: 'tint', items: [{ title: '', desc: '', price: '', icon: 'fa-solid fa-star' }] };
    case 'image': return { image: '', caption: '', bg: 'white' };
    case 'location': return { title: 'Location', addressLine: '', addressCity: '', mapLink: '', closingText: '', bg: 'white' };
    case 'hours': return { title: 'Opening Hours', rows: [{ label: 'Mon - Fri', time: '09:00 - 17:00' }], bg: 'soft' };
    case 'contact': return {
      title: 'Contact Us', bg: 'white',
      channels: CONTACT_CHANNEL_DEFS.reduce((acc, ch) => { acc[ch.key] = { checked: false, value: '' }; return acc; }, {}),
    };
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
      bg = '<picture><source media="(min-width: 1024px)" srcset="' + escapeHtml(imgD) + '"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(ctx.name) + '"></picture>';
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
    const imgHtml = img ? '<div class="it-img"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(str(d.title, 200) || ctx.name) + '" loading="lazy"></div>' : '';
    const body = str(d.body, 5000).trim();
    const textHtml = (str(d.title).trim() || body || btn)
      ? '<div class="it-text">' + (str(d.title).trim() ? '<h3 class="it-title">' + escapeHtml(str(d.title, 200)) + '</h3>' : '') +
        (body ? '<p class="text-body">' + escapeHtml(body) + '</p>' : '') + btn + '</div>'
      : '';
    return wrap(block, d, '<div class="it-wrap ' + pos + '">' + imgHtml + textHtml + '</div>');
  },

  gallery(block, d, ctx) {
    const cols = clampInt(d.columns, 2, 4, 3);
    const items = galleryImages(d, ctx.preview).map((g, i) =>
      '<div class="gallery-item" data-g="' + escapeHtml(block.id) + '" onclick="openLightbox(this)"><img src="' +
      escapeHtml(safeImageUrl(g.src, ctx.preview)) + '" alt="' + escapeHtml(ctx.name) + ' photo ' + (i + 1) + '" loading="lazy"></div>'
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

export function renderBlocks(content, opts) {
  const blocks = Array.isArray((content || {}).blocks) ? content.blocks.slice(0, MAX_BLOCKS) : [];
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
.blk-hero.hero-cropped { height: auto; aspect-ratio: 1 / 1; min-height: 320px; max-height: 560px; }
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
.it-title { font-size: 20px; font-weight: 700; color: #212121; margin-bottom: 10px; }

.gallery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.gallery-item { aspect-ratio: 1; border-radius: 16px; overflow: hidden; position: relative; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

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

@media (min-width: 768px) {
  .gallery-grid { grid-template-columns: repeat(var(--cols, 3), 1fr); gap: 16px; }
  .cards-grid { grid-template-columns: repeat(var(--cols, 2), 1fr); gap: 16px; }
  .blk-hero { height: 440px; }
  .blk-hero.h-compact { height: 340px; }
  .blk-hero.h-tall { height: 620px; }
  .hero-title { font-size: 40px; }
  .hero-subtitle { font-size: 16px; }
  .it-wrap { flex-direction: row; align-items: center; gap: 32px; }
  .it-wrap.right { flex-direction: row-reverse; }
  .it-img, .it-text { flex: 1; min-width: 0; }
}
@media (min-width: 1024px) {
  .gallery-grid { gap: 20px; }
  .cards-grid { gap: 20px; }
  .blk-hero { height: 500px; }
  .blk-hero.h-compact { height: 400px; }
  .blk-hero.h-tall { height: 720px; }
  .blk-hero.hero-cropped { aspect-ratio: 12 / 5; min-height: 0; max-height: 640px; }
  .hero-title { font-size: 48px; }
  .hero-subtitle { font-size: 18px; }
  .blk { padding: 60px 40px; }
  .blk-hero { padding: 0; }
  .map-container { height: 300px; }
  .direction-btn { width: fit-content; padding: 14px 32px; margin: 20px auto 0; }
}
`;
