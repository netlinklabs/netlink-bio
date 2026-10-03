// api/_lib/bio-templates.js
// Visual designs for the Template Gallery (template.html), used by api/bio.js.
//
// How it works: api/bio.js adds `tpl-<id>` to <body> (only when the owner's
// tier allows it) and injects templateCss(id) at the end of its <style>, so
// these rules win over the base look. Every template ships a Light and a Dark
// variant and follows the owner's Light/Dark choice (body.theme-dark).
//
// Tier design rules:
//   Basic  = the plain Light / Dark look (no template).
//   Silver = static, colored backgrounds + distinct card shapes (no motion).
//   Gold   = premium effects on top: animation, glass, gradient borders, glow.
//
// Keep ids in sync with TEMPLATE_TIERS (api/bio.js), TEMPLATES (template.html)
// and the bio_templates table.

const v = (o) => Object.entries(o).map(([k, x]) => `${k}:${x};`).join('');

// Builds the body-level variable blocks for Light and Dark.
// Both objects must define the same keys, otherwise Dark would inherit a
// Light value for the missing key.
function theme(id, light, dark) {
  const s = `body.tpl-${id}`;
  return `${s}{${v(light)}}${s}.theme-dark{${v(dark)}}`;
}

// ---------------------------------------------------------------------------
// SILVER (static): colored backgrounds and a distinct card shape each.
// ---------------------------------------------------------------------------

// Ocean: cool blue gradient, big rounded cards with a soft blue shadow.
function silver01() {
  const s = 'body.tpl-silver-01';
  return theme('silver-01',
    { '--nl-bg': '#ecfeff', '--nl-card': '#ffffff', '--nl-text': '#0c4a6e', '--nl-text-muted': '#4b7a94', '--nl-text-muted-2': '#35617a', '--nl-border': 'rgba(14,116,144,.16)',
      background: 'linear-gradient(180deg,#e0f2fe 0%,#ecfeff 55%,#f8fafc 100%)' },
    { '--nl-bg': '#0b2236', '--nl-card': '#12304a', '--nl-text': '#e0f2fe', '--nl-text-muted': '#8fb6d0', '--nl-text-muted-2': '#b6d3e6', '--nl-border': 'rgba(125,211,252,.18)',
      background: 'linear-gradient(180deg,#082f49 0%,#0b2236 55%,#0f172a 100%)' })
  + `${s} .link-card{border-radius:20px;box-shadow:0 8px 20px -8px rgba(14,116,144,.4);}`
  + `${s} .link-card:hover{border-color:#0ea5e9;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(56,189,248,.4);}`;
}

// Sunset: warm pink gradient, pill shaped cards.
function silver02() {
  const s = 'body.tpl-silver-02';
  return theme('silver-02',
    { '--nl-bg': '#fff1f2', '--nl-card': '#ffffff', '--nl-text': '#4c0519', '--nl-text-muted': '#9f5b6b', '--nl-text-muted-2': '#7f3a4b', '--nl-border': 'rgba(244,63,94,.14)',
      background: 'linear-gradient(160deg,#fff1eb 0%,#ffe4ec 55%,#fdf2f8 100%)' },
    { '--nl-bg': '#1f0f1e', '--nl-card': '#35192a', '--nl-text': '#ffe4e6', '--nl-text-muted': '#d6a3b1', '--nl-text-muted-2': '#f2c4cf', '--nl-border': 'rgba(251,113,133,.2)',
      background: 'linear-gradient(160deg,#2a0f1d 0%,#1f0f1e 100%)' })
  + `${s} .link-card{border-radius:32px;padding:14px 22px;box-shadow:0 10px 22px -10px rgba(244,63,94,.5);}`
  + `${s} .link-card:hover{border-color:#fb7185;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(251,113,133,.4);}`;
}

// Forest: soft green, cards with a bold accent bar on the left.
function silver03() {
  const s = 'body.tpl-silver-03';
  return theme('silver-03',
    { '--nl-bg': '#f0fdf4', '--nl-card': '#ffffff', '--nl-text': '#14532d', '--nl-text-muted': '#5a8a6a', '--nl-text-muted-2': '#3f6f50', '--nl-border': 'rgba(22,101,52,.14)',
      background: 'linear-gradient(180deg,#dcfce7 0%,#f0fdf4 45%,#f7fee7 100%)' },
    { '--nl-bg': '#07210f', '--nl-card': '#0f3320', '--nl-text': '#dcfce7', '--nl-text-muted': '#86b79a', '--nl-text-muted-2': '#b3d9c2', '--nl-border': 'rgba(134,239,172,.16)',
      background: 'linear-gradient(180deg,#052e16 0%,#0a1f14 100%)' })
  + `${s} .link-card{border-radius:12px;border-left:6px solid #22c55e;box-shadow:0 6px 16px -10px rgba(22,101,52,.55);}`
  + `${s} .link-card:hover{border-color:#4ade80;border-left-color:#16a34a;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(34,197,94,.4);}`;
}

// Paper Pop: dotted paper, thick outlines and hard offset shadows.
function silver04() {
  const s = 'body.tpl-silver-04';
  return theme('silver-04',
    { '--nl-bg': '#fef9c3', '--nl-card': '#ffffff', '--nl-text': '#111827', '--nl-text-muted': '#4b5563', '--nl-text-muted-2': '#374151', '--nl-border': '#111827',
      background: 'radial-gradient(rgba(17,24,39,.18) 1.2px,transparent 1.2px) 0 0/18px 18px,#fef9c3' },
    { '--nl-bg': '#18181b', '--nl-card': '#27272a', '--nl-text': '#fafafa', '--nl-text-muted': '#a1a1aa', '--nl-text-muted-2': '#d4d4d8', '--nl-border': '#fafafa',
      background: 'radial-gradient(rgba(250,250,250,.12) 1.2px,transparent 1.2px) 0 0/18px 18px,#18181b' })
  + `${s} h1{font-weight:800;}`
  + `${s} .link-card{border:2px solid var(--nl-border);border-radius:12px;box-shadow:4px 4px 0 var(--nl-border);transition:transform .12s,box-shadow .12s;}`
  + `${s} .link-card:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--nl-border);border-color:var(--nl-border);}`
  + `${s} .link-card:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--nl-border);}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px var(--nl-border);}`;
}

// ---------------------------------------------------------------------------
// GOLD (premium): motion, glass, gradient borders and glow.
// ---------------------------------------------------------------------------

// Aurora: drifting blurred light blobs behind frosted glass cards.
function gold01() {
  const s = 'body.tpl-gold-01';
  return theme('gold-01',
    { '--nl-bg': '#f5f3ff', '--nl-card': '#ffffff', '--nl-text': '#1e1b4b', '--nl-text-muted': '#5b5b8a', '--nl-text-muted-2': '#3f3f6e', '--nl-border': 'rgba(255,255,255,.7)', '--nl-placeholder': '#ddd6fe', '--tpl-glass': 'rgba(255,255,255,.6)', '--tpl-aurora-opacity': '.9',
      background: '#f5f3ff' },
    { '--nl-bg': '#080c1c', '--nl-card': '#111936', '--nl-text': '#eef2ff', '--nl-text-muted': '#a8b2e0', '--nl-text-muted-2': '#cdd5f5', '--nl-border': 'rgba(255,255,255,.16)', '--nl-placeholder': '#27305a', '--tpl-glass': 'rgba(15,23,42,.5)', '--tpl-aurora-opacity': '.8',
      background: '#080c1c' })
  + `${s}::before{content:'';position:fixed;inset:-20%;z-index:-1;pointer-events:none;opacity:var(--tpl-aurora-opacity);`
  + 'background:radial-gradient(38% 38% at 18% 22%,rgba(56,189,248,.6),transparent 70%),radial-gradient(34% 34% at 82% 28%,rgba(167,139,250,.65),transparent 70%),radial-gradient(42% 42% at 55% 88%,rgba(52,211,153,.55),transparent 70%);'
  + 'filter:blur(36px);animation:tplk-aurora 20s ease-in-out infinite alternate;}'
  + '@keyframes tplk-aurora{0%{transform:translate3d(-4%,-3%,0) rotate(0deg) scale(1);}50%{transform:translate3d(5%,4%,0) rotate(8deg) scale(1.08);}100%{transform:translate3d(-2%,6%,0) rotate(-6deg) scale(1.02);}}'
  + `${s} .link-card{background:var(--tpl-glass);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);border-radius:18px;box-shadow:0 8px 30px -12px rgba(76,29,149,.4),inset 0 1px 0 rgba(255,255,255,.35);}`
  + `${s} .link-card:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.85);}`
  + `${s}.theme-dark .link-card:hover{border-color:rgba(255,255,255,.4);}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(255,255,255,.75),0 0 28px rgba(139,92,246,.55);}`;
}

// Midnight Gold: black and gold, gold gradient borders, shining name, sweep on hover.
function gold02() {
  const s = 'body.tpl-gold-02';
  return theme('gold-02',
    { '--nl-bg': '#fffbeb', '--nl-card': '#ffffff', '--nl-text': '#3b2f0b', '--nl-text-muted': '#8a7440', '--nl-text-muted-2': '#6b5a2c', '--nl-border': 'rgba(180,134,11,.25)',
      background: 'linear-gradient(180deg,#fff8e1 0%,#fffdf5 50%,#fff4cc 100%)' },
    { '--nl-bg': '#0a0a0a', '--nl-card': '#151515', '--nl-text': '#f5ecd0', '--nl-text-muted': '#b8a878', '--nl-text-muted-2': '#d9cca0', '--nl-border': 'rgba(212,175,55,.28)',
      background: 'radial-gradient(120% 60% at 50% 0%,#2a2208 0%,#0a0a0a 60%)' })
  + `${s} h1{background:linear-gradient(90deg,#b8860b,#f6e27a,#b8860b);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:tplk-shine 5s linear infinite;}`
  + '@keyframes tplk-shine{0%{background-position:0% center;}100%{background-position:200% center;}}'
  + `${s} .link-card{position:relative;overflow:hidden;border:1px solid transparent;border-radius:14px;`
  + 'background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,linear-gradient(135deg,#f6e27a,#b8860b 45%,#f6e27a) border-box;'
  + 'box-shadow:0 8px 24px -12px rgba(184,134,11,.55);transition:transform .15s,box-shadow .25s;}'
  + `${s} .link-card::after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(120deg,transparent,rgba(246,226,122,.35),transparent);transform:skewX(-20deg);transition:left .6s ease;pointer-events:none;}`
  + `${s} .link-card:hover{border-color:transparent;box-shadow:0 0 0 1px rgba(246,226,122,.35),0 12px 30px -10px rgba(212,175,55,.7);}`
  + `${s} .link-card:hover::after{left:130%;}`
  + `${s} .link-icon{border-color:#d4af37;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px #d4af37,0 0 26px rgba(212,175,55,.5);}`;
}

// Neon Grid: tech grid backdrop, glowing neon outlines, pulsing avatar.
function gold03() {
  const s = 'body.tpl-gold-03';
  return theme('gold-03',
    { '--nl-bg': '#eef2ff', '--nl-card': '#ffffff', '--nl-text': '#1e1b4b', '--nl-text-muted': '#5b5f97', '--nl-text-muted-2': '#3f4380', '--nl-border': 'rgba(99,102,241,.3)', '--tpl-neon': '#6366f1', '--tpl-neon2': '#a855f7', '--tpl-glow': 'rgba(99,102,241,.45)',
      background: 'linear-gradient(rgba(99,102,241,.1) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,rgba(99,102,241,.1) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,#eef2ff,#e0e7ff)' },
    { '--nl-bg': '#05060f', '--nl-card': '#0b1020', '--nl-text': '#e0f2fe', '--nl-text-muted': '#7aa7c7', '--nl-text-muted-2': '#a5d8f0', '--nl-border': 'rgba(34,211,238,.35)', '--tpl-neon': '#22d3ee', '--tpl-neon2': '#e879f9', '--tpl-glow': 'rgba(34,211,238,.5)',
      background: 'linear-gradient(rgba(34,211,238,.08) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(90deg,rgba(34,211,238,.08) 1px,transparent 1px) 0 0/32px 32px,linear-gradient(180deg,#05060f,#0a0f24)' })
  + `${s} h1{text-shadow:0 0 14px var(--tpl-glow);}`
  + `${s} .link-card{border:1px solid var(--tpl-neon);border-radius:10px;box-shadow:0 0 14px -2px var(--tpl-glow),inset 0 0 12px -6px var(--tpl-glow);transition:transform .15s,box-shadow .2s,border-color .2s;}`
  + `${s} .link-card:hover{border-color:var(--tpl-neon2);box-shadow:0 0 22px 0 var(--tpl-glow),inset 0 0 16px -4px var(--tpl-glow);}`
  + `${s} .link-icon{border-color:var(--tpl-neon);}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px var(--tpl-neon),0 0 22px var(--tpl-glow);animation:tplk-neon 2.8s ease-in-out infinite alternate;}`
  + '@keyframes tplk-neon{from{box-shadow:0 0 0 3px var(--tpl-neon),0 0 12px var(--tpl-glow);}to{box-shadow:0 0 0 3px var(--tpl-neon2),0 0 30px var(--tpl-glow);}}';
}

// Royal Glass: shifting jewel-tone gradient, floating light orbs, frosted cards.
function gold04() {
  const s = 'body.tpl-gold-04';
  return theme('gold-04',
    { '--nl-bg': '#f5f3ff', '--nl-card': '#ffffff', '--nl-text': '#2e1065', '--nl-text-muted': '#6d5a9a', '--nl-text-muted-2': '#4c3a80', '--nl-border': 'rgba(255,255,255,.7)', '--tpl-glass': 'rgba(255,255,255,.55)', '--tpl-flow': 'linear-gradient(135deg,#ddd6fe,#fbcfe8,#bae6fd,#ddd6fe)',
      background: '#f5f3ff' },
    { '--nl-bg': '#1e1b4b', '--nl-card': '#2a2563', '--nl-text': '#f5f3ff', '--nl-text-muted': '#c4b5fd', '--nl-text-muted-2': '#ddd6fe', '--nl-border': 'rgba(255,255,255,.2)', '--tpl-glass': 'rgba(255,255,255,.1)', '--tpl-flow': 'linear-gradient(135deg,#312e81,#6d28d9,#be185d,#312e81)',
      background: '#1e1b4b' })
  + `${s}::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--tpl-flow);background-size:300% 300%;animation:tplk-shift 16s ease infinite;}`
  + `${s}::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle 160px at 15% 25%,rgba(255,255,255,.35),transparent 70%),radial-gradient(circle 220px at 85% 70%,rgba(255,255,255,.28),transparent 70%);animation:tplk-float 12s ease-in-out infinite alternate;}`
  + '@keyframes tplk-shift{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}'
  + '@keyframes tplk-float{from{transform:translate3d(-2%,-2%,0);}to{transform:translate3d(3%,4%,0);}}'
  + `${s} .link-card{background:var(--tpl-glass);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border-radius:22px;box-shadow:0 10px 32px -14px rgba(46,16,101,.55);}`
  + `${s} .link-card:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.9);}`
  + `${s}.theme-dark .link-card:hover{border-color:rgba(255,255,255,.45);}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(255,255,255,.8),0 0 30px rgba(167,139,250,.65);}`;
}

// Rose Gold Luxe: warm rose gold, border that spins like polished metal on hover.
function gold05() {
  const s = 'body.tpl-gold-05';
  return '@property --tpl-angle{syntax:"<angle>";initial-value:0deg;inherits:false;}'
  + theme('gold-05',
    { '--nl-bg': '#fff7f5', '--nl-card': '#ffffff', '--nl-text': '#4a2420', '--nl-text-muted': '#a07068', '--nl-text-muted-2': '#7a4c46', '--nl-border': 'rgba(217,142,130,.3)',
      background: 'linear-gradient(180deg,#fff1ec 0%,#ffe4de 60%,#fff7f5 100%)' },
    { '--nl-bg': '#1c1013', '--nl-card': '#2a1a1d', '--nl-text': '#ffe9e4', '--nl-text-muted': '#d4a8a0', '--nl-text-muted-2': '#efc9c2', '--nl-border': 'rgba(244,199,184,.25)',
      background: 'linear-gradient(180deg,#2a1519 0%,#170d10 100%)' })
  + `${s} h1{background:linear-gradient(90deg,#d98e82,#f9d6cc,#d98e82);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:tplk-shine 6s linear infinite;}`
  + '@keyframes tplk-shine{0%{background-position:0% center;}100%{background-position:200% center;}}'
  + `${s} .link-card{border:1.5px solid transparent;border-radius:18px;`
  + 'background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,conic-gradient(from var(--tpl-angle),#f4c7b8,#e8a598,#fff1ec,#d98e82,#f4c7b8) border-box;'
  + 'box-shadow:0 10px 26px -14px rgba(217,142,130,.75);}'
  + `${s} .link-card:hover{border-color:transparent;animation:tplk-spin 3s linear infinite;box-shadow:0 14px 30px -12px rgba(217,142,130,.95);}`
  + '@keyframes tplk-spin{to{--tpl-angle:360deg;}}'
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px #e8a598,0 0 24px rgba(232,165,152,.55);}`;
}

// Holographic: iridescent drifting background, rainbow border that flows on hover.
function gold06() {
  const s = 'body.tpl-gold-06';
  return theme('gold-06',
    { '--nl-bg': '#faf5ff', '--nl-card': '#ffffff', '--nl-text': '#27214d', '--nl-text-muted': '#6a6598', '--nl-text-muted-2': '#4a4577', '--nl-border': 'rgba(255,255,255,.7)', '--tpl-holo-bg': 'linear-gradient(120deg,#fbc2eb 0%,#a6c1ee 25%,#c2ffd8 50%,#ffd6a5 75%,#fbc2eb 100%)', '--tpl-holo-opacity': '.85',
      background: '#faf5ff' },
    { '--nl-bg': '#0d0a1f', '--nl-card': '#17122e', '--nl-text': '#f3f0ff', '--nl-text-muted': '#b3a8e6', '--nl-text-muted-2': '#d3ccf5', '--nl-border': 'rgba(255,255,255,.16)', '--tpl-holo-bg': 'linear-gradient(120deg,#1b1035 0%,#0f2a4a 25%,#10332f 50%,#34163a 75%,#1b1035 100%)', '--tpl-holo-opacity': '1',
      background: '#0d0a1f' })
  + `${s}::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:var(--tpl-holo-opacity);background:var(--tpl-holo-bg);background-size:300% 300%;animation:tplk-shift 14s linear infinite;}`
  + '@keyframes tplk-shift{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}'
  + `${s} .link-card{border:1.5px solid transparent;border-radius:16px;`
  + 'background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,linear-gradient(120deg,#ff9a9e,#a18cd1,#84fab0,#fbc2eb,#ff9a9e) border-box;background-size:auto,300% 100%;'
  + 'box-shadow:0 10px 28px -14px rgba(161,140,209,.7);}'
  + `${s} .link-card:hover{border-color:transparent;animation:tplk-holo 2.5s linear infinite;}`
  + '@keyframes tplk-holo{from{background-position:0 0,0% 0;}to{background-position:0 0,300% 0;}}'
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px #a18cd1,0 0 24px rgba(161,140,209,.6);}`;
}

const BUILDERS = {
  'silver-01': silver01, 'silver-02': silver02, 'silver-03': silver03, 'silver-04': silver04,
  'gold-01': gold01, 'gold-02': gold02, 'gold-03': gold03,
  'gold-04': gold04, 'gold-05': gold05, 'gold-06': gold06,
};

// People who prefer reduced motion get the same look without animation.
const REDUCED_MOTION = '@media (prefers-reduced-motion:reduce){body[class*="tpl-"]::before,body[class*="tpl-"]::after,body[class*="tpl-"] h1,body[class*="tpl-"] .avatar,body[class*="tpl-"] .avatar-fallback,body[class*="tpl-"] .link-card{animation:none !important;}}';

// CSS for one template id, or '' for an unknown id (then the base look stays).
export function templateCss(id) {
  const build = BUILDERS[id];
  return build ? build() + REDUCED_MOTION : '';
}
