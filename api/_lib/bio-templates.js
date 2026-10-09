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

// Navy Executive: formal navy and white, square cards with a navy accent bar.
function silver05() {
  const s = 'body.tpl-silver-05';
  return theme('silver-05',
    { '--nl-bg': '#f1f5f9', '--nl-card': '#ffffff', '--nl-text': '#0f172a', '--nl-text-muted': '#475569', '--nl-text-muted-2': '#334155', '--nl-border': 'rgba(30,58,138,.16)',
      background: 'linear-gradient(180deg,#e2e8f0 0%,#f1f5f9 50%,#f8fafc 100%)' },
    { '--nl-bg': '#0b1220', '--nl-card': '#111c33', '--nl-text': '#e2e8f0', '--nl-text-muted': '#94a3b8', '--nl-text-muted-2': '#cbd5e1', '--nl-border': 'rgba(147,197,253,.18)',
      background: 'linear-gradient(180deg,#0f1b33 0%,#0b1220 100%)' })
  + `${s} .link-card{border-radius:4px;border-left:5px solid #1e3a8a;box-shadow:0 4px 12px -8px rgba(15,23,42,.45);}`
  + `${s} .link-card:hover{border-color:#3b82f6;border-left-color:#1d4ed8;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(30,58,138,.45);}`;
}

// Graphite: calm grey and bone white, flat cards with a thin outline and no shadow.
function silver06() {
  const s = 'body.tpl-silver-06';
  return theme('silver-06',
    { '--nl-bg': '#f5f5f4', '--nl-card': '#ffffff', '--nl-text': '#1c1917', '--nl-text-muted': '#57534e', '--nl-text-muted-2': '#44403c', '--nl-border': 'rgba(28,25,23,.16)',
      background: 'linear-gradient(180deg,#fafaf9 0%,#f5f5f4 100%)' },
    { '--nl-bg': '#171717', '--nl-card': '#262626', '--nl-text': '#fafafa', '--nl-text-muted': '#a3a3a3', '--nl-text-muted-2': '#d4d4d4', '--nl-border': 'rgba(255,255,255,.16)',
      background: 'linear-gradient(180deg,#1c1c1c 0%,#141414 100%)' })
  + `${s} .link-card{border-radius:8px;border:1px solid var(--nl-border);box-shadow:none;}`
  + `${s} .link-card:hover{border-color:#78716c;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(68,64,60,.35);}`;
}

// Ivory Classic: cream paper with fine old gold outlines.
function silver07() {
  const s = 'body.tpl-silver-07';
  return theme('silver-07',
    { '--nl-bg': '#fefce8', '--nl-card': '#fffdf7', '--nl-text': '#422006', '--nl-text-muted': '#8a6d3b', '--nl-text-muted-2': '#6b4f1d', '--nl-border': 'rgba(161,98,7,.35)',
      background: 'linear-gradient(180deg,#fffbeb 0%,#fefce8 55%,#fef9e7 100%)' },
    { '--nl-bg': '#1c1409', '--nl-card': '#2a1f0e', '--nl-text': '#fef3c7', '--nl-text-muted': '#c9a96a', '--nl-text-muted-2': '#e6cf9c', '--nl-border': 'rgba(217,119,6,.4)',
      background: 'linear-gradient(180deg,#241a0b 0%,#1c1409 100%)' })
  + `${s} .link-card{border-radius:8px;border:1px solid var(--nl-border);box-shadow:0 6px 14px -10px rgba(161,98,7,.5);}`
  + `${s} .link-card:hover{border-color:#b45309;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(180,83,9,.4);}`;
}

// Lavender: soft purple, medium rounded cards with a faint purple shadow.
function silver08() {
  const s = 'body.tpl-silver-08';
  return theme('silver-08',
    { '--nl-bg': '#faf5ff', '--nl-card': '#ffffff', '--nl-text': '#3b0764', '--nl-text-muted': '#7e5a9b', '--nl-text-muted-2': '#5e3a7e', '--nl-border': 'rgba(147,51,234,.15)',
      background: 'linear-gradient(180deg,#f3e8ff 0%,#faf5ff 55%,#fdf4ff 100%)' },
    { '--nl-bg': '#1a1030', '--nl-card': '#2a1a4a', '--nl-text': '#f3e8ff', '--nl-text-muted': '#b9a0d6', '--nl-text-muted-2': '#d8c4ee', '--nl-border': 'rgba(192,132,252,.2)',
      background: 'linear-gradient(180deg,#22123f 0%,#1a1030 100%)' })
  + `${s} .link-card{border-radius:16px;box-shadow:0 8px 18px -10px rgba(147,51,234,.45);}`
  + `${s} .link-card:hover{border-color:#a855f7;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(168,85,247,.35);}`;
}

// Mint: fresh teal and white, wide pill cards with a soft shadow.
function silver09() {
  const s = 'body.tpl-silver-09';
  return theme('silver-09',
    { '--nl-bg': '#f0fdfa', '--nl-card': '#ffffff', '--nl-text': '#134e4a', '--nl-text-muted': '#5b8a85', '--nl-text-muted-2': '#3f6e69', '--nl-border': 'rgba(13,148,136,.16)',
      background: 'linear-gradient(180deg,#ccfbf1 0%,#f0fdfa 50%,#f8fffe 100%)' },
    { '--nl-bg': '#04201d', '--nl-card': '#0b3330', '--nl-text': '#ccfbf1', '--nl-text-muted': '#85bdb6', '--nl-text-muted-2': '#b0dcd6', '--nl-border': 'rgba(94,234,212,.18)',
      background: 'linear-gradient(180deg,#052e2b 0%,#04201d 100%)' })
  + `${s} .link-card{border-radius:40px;padding:14px 24px;box-shadow:0 8px 18px -10px rgba(13,148,136,.45);}`
  + `${s} .link-card:hover{border-color:#2dd4bf;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(45,212,191,.4);}`;
}

// Coral: bright warm orange, big rounded cards with a thick coral outline.
function silver10() {
  const s = 'body.tpl-silver-10';
  return theme('silver-10',
    { '--nl-bg': '#fff7ed', '--nl-card': '#ffffff', '--nl-text': '#431407', '--nl-text-muted': '#9a5b3a', '--nl-text-muted-2': '#7c3f20', '--nl-border': '#fb923c',
      background: 'linear-gradient(160deg,#ffedd5 0%,#fff7ed 55%,#fffbf5 100%)' },
    { '--nl-bg': '#1f0e07', '--nl-card': '#3a1c10', '--nl-text': '#ffedd5', '--nl-text-muted': '#d4a283', '--nl-text-muted-2': '#efc5a8', '--nl-border': 'rgba(251,146,60,.65)',
      background: 'linear-gradient(160deg,#2a1208 0%,#1f0e07 100%)' })
  + `${s} .link-card{border:2px solid var(--nl-border);border-radius:24px;box-shadow:0 8px 18px -12px rgba(234,88,12,.55);}`
  + `${s} .link-card:hover{border-color:#ea580c;}`
  + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 4px rgba(251,146,60,.45);}`;
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

// ---------------------------------------------------------------------------
// GOLD 07-30: built from a few light "families" so every template follows the
// same performance rules:
//   - at most ONE moving layer (a fixed ::before/::after), moved with
//     transform or opacity only (no moving blur);
//   - other motion only on the avatar or on card hover;
//   - everything that moves is covered by REDUCED_MOTION below.
// Each family reads the palette vars (--tpl-a, --tpl-b, --tpl-c, --tpl-glow,
// --tpl-glass, --tpl-flow, --tpl-sweep), so Light and Dark share the same CSS.
// ---------------------------------------------------------------------------

// Palette: Light and Dark must use the same keys (see theme()).
const P = (bg, card, text, m, m2, border, glass, a, b, glow, bgcss, extra) => Object.assign({
  '--nl-bg': bg, '--nl-card': card, '--nl-text': text, '--nl-text-muted': m, '--nl-text-muted-2': m2, '--nl-border': border,
  '--tpl-glass': glass, '--tpl-a': a, '--tpl-b': b, '--tpl-glow': glow, background: bgcss,
}, extra || {});

const avatar = (s, pulse) => pulse
  ? `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px var(--tpl-a),0 0 22px var(--tpl-glow);animation:tplk-fpulse 3s ease-in-out infinite alternate;}`
    + '@keyframes tplk-fpulse{from{box-shadow:0 0 0 3px var(--tpl-a),0 0 12px var(--tpl-glow);}to{box-shadow:0 0 0 3px var(--tpl-b),0 0 30px var(--tpl-glow);}}'
  : `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px var(--tpl-a),0 0 24px var(--tpl-glow);}`;

const glassCard = (s, r) => `${s} .link-card{background:var(--tpl-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:${r};box-shadow:0 10px 30px -14px var(--tpl-glow);}`
  + `${s} .link-card:hover{transform:translateY(-3px);border-color:var(--nl-text-muted);}`;

const FAMILY = {
  // Gradient name that shines, gradient border, light sweep on hover.
  shine(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s} h1{background:linear-gradient(90deg,var(--tpl-a),var(--tpl-b),var(--tpl-a));background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:tplk-fshine 5s linear infinite;}`
      + '@keyframes tplk-fshine{0%{background-position:0% center;}100%{background-position:200% center;}}'
      + `${s} .link-card{position:relative;overflow:hidden;border:1px solid transparent;border-radius:${o.r};background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,linear-gradient(135deg,var(--tpl-b),var(--tpl-a) 45%,var(--tpl-b)) border-box;box-shadow:0 8px 24px -12px var(--tpl-glow);transition:transform .15s,box-shadow .25s;}`
      + `${s} .link-card::after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(120deg,transparent,var(--tpl-glow),transparent);transform:skewX(-20deg);transition:left .6s ease;pointer-events:none;}`
      + `${s} .link-card:hover{border-color:transparent;box-shadow:0 12px 30px -10px var(--tpl-glow);}`
      + `${s} .link-card:hover::after{left:130%;}`
      + `${s} .link-icon{border-color:var(--tpl-a);}`
      + avatar(s, o.pulse);
  },
  // Neon outline with glow; the avatar pulses.
  glow(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s} h1{text-shadow:0 0 14px var(--tpl-glow);}`
      + `${s} .link-card{border:1px solid var(--tpl-a);border-radius:${o.r};box-shadow:0 0 14px -2px var(--tpl-glow),inset 0 0 12px -6px var(--tpl-glow);transition:transform .15s,box-shadow .2s,border-color .2s;}`
      + `${s} .link-card:hover{border-color:var(--tpl-b);box-shadow:0 0 22px 0 var(--tpl-glow),inset 0 0 16px -4px var(--tpl-glow);}`
      + `${s} .link-icon{border-color:var(--tpl-a);}`
      + avatar(s, true);
  },
  // One huge gradient layer that turns very slowly, frosted cards on top.
  flow(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;left:50%;top:50%;width:300vmax;height:300vmax;margin:-150vmax 0 0 -150vmax;z-index:-1;pointer-events:none;background:var(--tpl-flow);will-change:transform;animation:tplk-fflow ${o.dur} linear infinite;}`
      + '@keyframes tplk-fflow{to{transform:rotate(360deg);}}'
      + glassCard(s, o.r)
      + (o.edge ? `${s} .link-card{border:1px solid var(--tpl-a);}` : '')
      + avatar(s, false);
  },
  // Soft color clouds that drift, frosted cards on top.
  orbs(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;inset:-15%;z-index:-1;pointer-events:none;will-change:transform;background:radial-gradient(40% 40% at 18% 22%,var(--tpl-a),transparent 70%),radial-gradient(38% 38% at 82% 30%,var(--tpl-b),transparent 70%),radial-gradient(44% 44% at 55% 88%,var(--tpl-glow),transparent 70%);animation:tplk-forb ${o.dur} ease-in-out infinite alternate;}`
      + '@keyframes tplk-forb{from{transform:translate3d(-3%,-2%,0) scale(1);}to{transform:translate3d(3%,3%,0) scale(1.08);}}'
      + glassCard(s, o.r)
      + `${s} .avatar,${s} .avatar-fallback{box-shadow:0 0 0 3px rgba(255,255,255,.75),0 0 26px var(--tpl-glow);}`;
  },
  // Gradient border that spins like polished metal on hover.
  spin(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return '@property --tpl-angle{syntax:"<angle>";initial-value:0deg;inherits:false;}'
      + theme(id, L, D)
      + `${s} .link-card{border:1.5px solid transparent;border-radius:${o.r};background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,conic-gradient(from var(--tpl-angle),var(--tpl-a),var(--tpl-b),var(--tpl-a),var(--tpl-b),var(--tpl-a)) border-box;box-shadow:0 10px 26px -14px var(--tpl-glow);}`
      + `${s} .link-card:hover{border-color:transparent;animation:tplk-fspin 3s linear infinite;box-shadow:0 14px 30px -12px var(--tpl-glow);}`
      + '@keyframes tplk-fspin{to{--tpl-angle:360deg;}}'
      + avatar(s, false);
  },
  // Rainbow border that flows on hover.
  holo(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s} .link-card{border:1.5px solid transparent;border-radius:${o.r};background:linear-gradient(var(--nl-card),var(--nl-card)) padding-box,linear-gradient(120deg,var(--tpl-a),var(--tpl-b),var(--tpl-c),var(--tpl-a)) border-box;background-size:auto,300% 100%;box-shadow:0 10px 28px -14px var(--tpl-glow);}`
      + `${s} .link-card:hover{border-color:transparent;animation:tplk-fholo 2.5s linear infinite;}`
      + '@keyframes tplk-fholo{from{background-position:0 0,0% 0;}to{background-position:0 0,300% 0;}}'
      + avatar(s, false);
  },
  // Grid lines that slide slowly, frosted cards.
  grid(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;inset:-48px 0 0 0;z-index:-1;pointer-events:none;will-change:transform;background:linear-gradient(var(--tpl-glow) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,var(--tpl-glow) 1px,transparent 1px) 0 0/48px 48px;animation:tplk-fgrid 8s linear infinite;}`
      + '@keyframes tplk-fgrid{to{transform:translate3d(0,48px,0);}}'
      + glassCard(s, o.r)
      + `${s} .link-card{border:1px solid var(--tpl-a);}`
      + avatar(s, false);
  },
  // Still stars plus a second layer that twinkles (opacity only).
  stars(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(1.5px 1.5px at 20px 30px,var(--tpl-a),transparent),radial-gradient(1px 1px at 90px 70px,var(--tpl-a),transparent),radial-gradient(1.5px 1.5px at 150px 120px,var(--tpl-a),transparent),radial-gradient(1px 1px at 60px 160px,var(--tpl-a),transparent);background-size:180px 200px;}`
      + `${s}::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(2px 2px at 40px 100px,var(--tpl-b),transparent),radial-gradient(2px 2px at 130px 20px,var(--tpl-b),transparent),radial-gradient(1.5px 1.5px at 100px 180px,var(--tpl-b),transparent);background-size:220px 240px;animation:tplk-ftwinkle 4s ease-in-out infinite alternate;}`
      + '@keyframes tplk-ftwinkle{from{opacity:.15;}to{opacity:1;}}'
      + `${s} .link-card{border-radius:${o.r};box-shadow:0 10px 28px -14px var(--tpl-glow);transition:transform .15s,border-color .2s;}`
      + `${s} .link-card:hover{transform:translateY(-2px);border-color:var(--tpl-b);}`
      + avatar(s, false);
  },
  // Two soft wave bands at the top that slide sideways.
  waves(id, L, D, o) {
    const s = `body.tpl-${id}`;
    const wave = 'radial-gradient(ellipse 60px 40px at 50% 100%,';
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;left:0;top:0;width:calc(100% + 120px);height:56px;z-index:-1;pointer-events:none;will-change:transform;background:${wave}var(--tpl-a) 0 98%,transparent 100%) 0 100%/120px 40px repeat-x;animation:tplk-fwave 14s linear infinite;}`
      + `${s}::after{content:'';position:fixed;left:0;top:14px;width:calc(100% + 120px);height:56px;z-index:-1;pointer-events:none;will-change:transform;background:${wave}var(--tpl-b) 0 98%,transparent 100%) 0 100%/120px 40px repeat-x;animation:tplk-fwave 20s linear infinite reverse;}`
      + '@keyframes tplk-fwave{from{transform:translate3d(0,0,0);}to{transform:translate3d(-120px,0,0);}}'
      + `${s} .link-card{border-radius:${o.r};box-shadow:0 10px 24px -12px var(--tpl-glow);transition:transform .15s,border-color .2s;}`
      + `${s} .link-card:hover{transform:translateY(-2px);border-color:var(--tpl-a);}`
      + avatar(s, false);
  },
  // About 8 petals fall slowly, one tall layer moved with transform.
  petals(id, L, D, o) {
    const s = `body.tpl-${id}`;
    const p = (x, y, c) => `radial-gradient(ellipse 7px 4.5px at ${x}% ${y}%,var(${c}) 90%,transparent)`;
    return theme(id, L, D)
      + `${s}::before{content:'';position:fixed;left:0;top:-100%;width:100%;height:200%;z-index:-1;pointer-events:none;will-change:transform;opacity:.75;background:${p(15, 10, '--tpl-a')},${p(45, 35, '--tpl-b')},${p(72, 60, '--tpl-a')},${p(90, 85, '--tpl-b')};background-size:100% 25%;animation:tplk-fpetal 28s linear infinite;}`
      + '@keyframes tplk-fpetal{from{transform:translate3d(0,0,0);}to{transform:translate3d(0,50%,0);}}'
      + `${s} .link-card{border-radius:${o.r};box-shadow:0 10px 26px -14px var(--tpl-glow);transition:transform .15s,border-color .2s;}`
      + `${s} .link-card:hover{transform:translateY(-2px);border-color:var(--tpl-a);}`
      + avatar(s, false);
  },
  // Static pastel glass with a glossy sweep on hover.
  candy(id, L, D, o) {
    const s = `body.tpl-${id}`;
    return theme(id, L, D)
      + `${s} .link-card{position:relative;overflow:hidden;background:var(--tpl-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:${o.r};box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 10px 26px -12px var(--tpl-glow);transition:transform .15s;}`
      + `${s} .link-card::after{content:'';position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(120deg,transparent,var(--tpl-sweep),transparent);transform:skewX(-20deg);transition:left .6s ease;pointer-events:none;}`
      + `${s} .link-card:hover{transform:translateY(-2px);}`
      + `${s} .link-card:hover::after{left:130%;}`
      + avatar(s, false);
  },
};

// id: [family, options, Light palette, Dark palette]
const GOLD_NEW = {
  // Luxe group
  'gold-07': ['shine', { r: '14px' },
    P('#f8fafc', '#ffffff', '#0f172a', '#64748b', '#475569', 'rgba(148,163,184,.4)', 'rgba(255,255,255,.7)', '#475569', '#94a3b8', 'rgba(100,116,139,.4)', 'linear-gradient(180deg,#f8fafc,#e2e8f0)'),
    P('#0b0f17', '#141a26', '#f1f5f9', '#94a3b8', '#cbd5e1', 'rgba(203,213,225,.25)', 'rgba(20,26,38,.6)', '#94a3b8', '#f8fafc', 'rgba(226,232,240,.4)', 'linear-gradient(180deg,#111827,#05070b)')],
  'gold-08': ['shine', { r: '14px' },
    P('#ecfdf5', '#ffffff', '#052e1f', '#5b8a76', '#3d6b58', 'rgba(5,150,105,.25)', 'rgba(255,255,255,.7)', '#047857', '#b8860b', 'rgba(212,175,55,.45)', 'linear-gradient(180deg,#ecfdf5,#d1fae5)'),
    P('#04130e', '#0a2018', '#e6fbf1', '#86b9a3', '#b5dccb', 'rgba(212,175,55,.3)', 'rgba(10,32,24,.6)', '#d4af37', '#34d399', 'rgba(212,175,55,.45)', 'radial-gradient(120% 60% at 50% 0%,#0d3a29,#04130e 60%)')],
  'gold-09': ['glow', { r: '12px' },
    P('#f1f5f9', '#ffffff', '#0f172a', '#64748b', '#475569', 'rgba(15,23,42,.18)', 'rgba(255,255,255,.7)', '#0f172a', '#64748b', 'rgba(15,23,42,.25)', 'linear-gradient(180deg,#f8fafc,#e2e8f0)'),
    P('#000000', '#0b0b0d', '#fafafa', '#a1a1aa', '#d4d4d8', 'rgba(255,255,255,.14)', 'rgba(11,11,13,.6)', '#52525b', '#ffffff', 'rgba(255,255,255,.35)', '#000000')],
  'gold-10': ['shine', { r: '20px', pulse: true },
    P('#fdf8ef', '#ffffff', '#4a3a22', '#9a8564', '#75633f', 'rgba(184,148,106,.3)', 'rgba(255,255,255,.7)', '#a07c4a', '#e8cf9f', 'rgba(200,165,110,.45)', 'linear-gradient(180deg,#fdf8ef,#f7ead2)'),
    P('#1a1510', '#261f17', '#f7ead2', '#c4ae88', '#e3d0aa', 'rgba(232,207,159,.28)', 'rgba(38,31,23,.6)', '#e8cf9f', '#fff3d6', 'rgba(232,207,159,.4)', 'linear-gradient(180deg,#241c13,#15110c)')],
  'gold-11': ['shine', { r: '12px' },
    P('#fff5ee', '#ffffff', '#431f0e', '#9a6a50', '#78452a', 'rgba(194,110,60,.3)', 'rgba(255,255,255,.7)', '#b45309', '#ea9a6a', 'rgba(194,110,60,.45)', 'linear-gradient(180deg,#fff1e6,#ffe2cc)'),
    P('#1a0f0a', '#2a1810', '#ffe8d9', '#d0a58c', '#ecc6ad', 'rgba(234,154,106,.3)', 'rgba(42,24,16,.6)', '#ea9a6a', '#ffd2b3', 'rgba(234,154,106,.4)', 'radial-gradient(120% 60% at 50% 0%,#3a1c0f,#1a0f0a 60%)')],
  // Futuristic group
  'gold-12': ['glow', { r: '10px' },
    P('#fdf4ff', '#ffffff', '#2e1065', '#7a5a99', '#5b3d78', 'rgba(217,70,239,.35)', 'rgba(255,255,255,.7)', '#c026d3', '#0891b2', 'rgba(192,38,211,.35)', 'linear-gradient(180deg,#fdf4ff,#ecfeff)'),
    P('#07030f', '#110820', '#fce7ff', '#c49ad6', '#e5c4f2', 'rgba(34,211,238,.35)', 'rgba(17,8,32,.6)', '#e879f9', '#22d3ee', 'rgba(232,121,249,.5)', '#07030f')],
  'gold-13': ['spin', { r: '12px' },
    P('#ecfdf5', '#ffffff', '#052e1f', '#4f8570', '#356652', 'rgba(16,185,129,.3)', 'rgba(255,255,255,.7)', '#059669', '#0d9488', 'rgba(16,185,129,.4)', 'radial-gradient(circle,rgba(16,185,129,.35) 2px,transparent 3px) 0 0/48px 48px,linear-gradient(90deg,rgba(16,185,129,.12) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(rgba(16,185,129,.12) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(180deg,#ecfdf5,#d1fae5)'),
    P('#03120c', '#08241a', '#dcfce7', '#7fb89e', '#a9dcc2', 'rgba(52,211,153,.3)', 'rgba(8,36,26,.6)', '#34d399', '#a7f3d0', 'rgba(52,211,153,.4)', 'radial-gradient(circle,rgba(52,211,153,.4) 2px,transparent 3px) 0 0/48px 48px,linear-gradient(90deg,rgba(52,211,153,.1) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(rgba(52,211,153,.1) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(180deg,#03120c,#061e15)')],
  'gold-14': ['grid', { r: '16px' },
    P('#f5f3ff', '#ffffff', '#2e1065', '#6d5a9a', '#4c3a80', 'rgba(124,58,237,.3)', 'rgba(255,255,255,.65)', '#7c3aed', '#2563eb', 'rgba(99,102,241,.22)', 'linear-gradient(180deg,#f5f3ff,#e0e7ff)'),
    P('#0a0820', '#14103a', '#ede9fe', '#a79bd6', '#cdc4f0', 'rgba(139,92,246,.4)', 'rgba(20,16,58,.55)', '#8b5cf6', '#38bdf8', 'rgba(139,92,246,.28)', 'linear-gradient(180deg,#0a0820,#120d33)')],
  'gold-15': ['stars', { r: '16px' },
    P('#eef2ff', '#ffffff', '#1e1b4b', '#5b5f97', '#3f4380', 'rgba(99,102,241,.25)', 'rgba(255,255,255,.7)', 'rgba(79,70,229,.7)', 'rgba(168,85,247,.7)', 'rgba(99,102,241,.35)', 'linear-gradient(180deg,#e0e7ff,#f5f3ff)'),
    P('#030617', '#0b1230', '#e8edff', '#8e9bd0', '#bcc6ee', 'rgba(147,197,253,.25)', 'rgba(11,18,48,.7)', '#ffffff', '#bae6fd', 'rgba(147,197,253,.4)', 'radial-gradient(120% 70% at 50% 0%,#101a3a,#030617 70%)')],
  'gold-16': ['orbs', { r: '18px', dur: '70s' },
    P('#f5f3ff', '#ffffff', '#2e1065', '#6d5a9a', '#4c3a80', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.6)', 'rgba(167,139,250,.6)', 'rgba(96,165,250,.55)', 'rgba(216,180,254,.55)', '#f5f3ff'),
    P('#04030f', '#0d0a24', '#ede9fe', '#a79bd6', '#cdc4f0', 'rgba(255,255,255,.14)', 'rgba(13,10,36,.55)', 'rgba(109,40,217,.55)', 'rgba(29,78,216,.5)', 'rgba(168,85,247,.4)', '#04030f')],
  // Creative group
  'gold-17': ['orbs', { r: '30px', dur: '40s' },
    P('#fffaf5', '#ffffff', '#4a2c3a', '#9a7285', '#7a5266', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.65)', 'rgba(251,182,206,.7)', 'rgba(167,216,245,.7)', 'rgba(253,224,171,.7)', '#fffaf5'),
    P('#181220', '#241a30', '#f6e8f2', '#bfa0b4', '#e0c6d6', 'rgba(255,255,255,.14)', 'rgba(36,26,48,.6)', 'rgba(190,100,140,.45)', 'rgba(80,130,190,.45)', 'rgba(200,150,80,.35)', '#181220')],
  'gold-18': ['candy', { r: '24px' },
    P('#fff0f5', '#ffffff', '#4a1d3a', '#a0728f', '#7d4f6c', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.55)', '#f472b6', '#60a5fa', 'rgba(244,114,182,.45)', 'linear-gradient(135deg,#ffd1dc,#d1e8ff,#e0ffd1)', { '--tpl-sweep': 'rgba(255,255,255,.8)' }),
    P('#1d1328', '#2a1c3a', '#fbe8ff', '#c4a0d6', '#e3c6f0', 'rgba(255,255,255,.16)', 'rgba(255,255,255,.1)', '#f472b6', '#818cf8', 'rgba(244,114,182,.35)', 'linear-gradient(135deg,#3b1f4a,#1f3350,#1f4a3a)', { '--tpl-sweep': 'rgba(255,255,255,.3)' })],
  'gold-19': ['flow', { r: '20px', dur: '90s' },
    P('#fff7ed', '#ffffff', '#4a1d2a', '#a06a72', '#7d4a52', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.55)', '#fb923c', '#f472b6', 'rgba(244,114,182,.4)', '#fff7ed', { '--tpl-flow': 'linear-gradient(135deg,#fdba74,#fb7185,#c084fc,#fdba74)' }),
    P('#1a0a14', '#2a1220', '#ffe8f0', '#cfa0b4', '#efc6d6', 'rgba(255,255,255,.14)', 'rgba(42,18,32,.55)', '#fb923c', '#f472b6', 'rgba(244,114,182,.35)', '#1a0a14', { '--tpl-flow': 'linear-gradient(135deg,#7c2d12,#9f1239,#581c87,#7c2d12)' })],
  'gold-20': ['waves', { r: '18px' },
    P('#ecfeff', '#ffffff', '#0c4a6e', '#4b7a94', '#35617a', 'rgba(14,116,144,.2)', 'rgba(255,255,255,.7)', 'rgba(14,165,233,.35)', 'rgba(6,182,212,.3)', 'rgba(14,116,144,.4)', 'linear-gradient(180deg,#e0f2fe,#ecfeff 40%,#f8fafc)'),
    P('#04182b', '#0a2a45', '#e0f2fe', '#8fb6d0', '#b6d3e6', 'rgba(125,211,252,.2)', 'rgba(10,42,69,.6)', 'rgba(56,189,248,.28)', 'rgba(14,116,144,.4)', 'rgba(56,189,248,.3)', 'linear-gradient(180deg,#082f49,#04182b 50%,#030f1c)')],
  'gold-21': ['petals', { r: '20px' },
    P('#fff1f5', '#ffffff', '#4c0519', '#a0606f', '#7f3a4b', 'rgba(244,114,182,.25)', 'rgba(255,255,255,.7)', '#f9a8c0', '#fbcfe8', 'rgba(244,114,182,.4)', 'linear-gradient(180deg,#fff1f5,#ffe4ec)'),
    P('#1a0d16', '#2a1624', '#ffe4ee', '#d0a0b8', '#efc6d6', 'rgba(244,114,182,.25)', 'rgba(42,22,36,.6)', '#f472b6', '#fbcfe8', 'rgba(244,114,182,.35)', 'linear-gradient(180deg,#220f1c,#1a0d16)')],
  // Extra group
  'gold-22': ['shine', { r: '16px' },
    P('#eff6ff', '#ffffff', '#0b1f4d', '#5a76a8', '#3b5588', 'rgba(37,99,235,.25)', 'rgba(255,255,255,.7)', '#1d4ed8', '#60a5fa', 'rgba(37,99,235,.4)', 'linear-gradient(180deg,#eff6ff,#dbeafe)'),
    P('#050b1f', '#0b1636', '#e6efff', '#8da8d8', '#b8cdf0', 'rgba(96,165,250,.3)', 'rgba(11,22,54,.6)', '#60a5fa', '#bfdbfe', 'rgba(96,165,250,.45)', 'radial-gradient(120% 60% at 50% 0%,#0f2358,#050b1f 60%)')],
  'gold-23': ['spin', { r: '16px' },
    P('#fff1f2', '#ffffff', '#4c0519', '#a0606f', '#7f3a4b', 'rgba(190,18,60,.25)', 'rgba(255,255,255,.7)', '#be123c', '#fb7185', 'rgba(190,18,60,.4)', 'linear-gradient(180deg,#fff1f2,#ffe4e6)'),
    P('#1a050a', '#2a0b13', '#ffe4e8', '#d09aa6', '#f0c0c8', 'rgba(251,113,133,.3)', 'rgba(42,11,19,.6)', '#fb7185', '#fecdd3', 'rgba(251,113,133,.4)', 'radial-gradient(120% 60% at 50% 0%,#3a0a16,#1a050a 60%)')],
  'gold-24': ['glow', { r: '8px' },
    P('#fff7fb', '#ffffff', '#3b0a2a', '#9a5b80', '#7a3a62', 'rgba(219,39,119,.3)', 'rgba(255,255,255,.7)', '#db2777', '#ca8a04', 'rgba(219,39,119,.3)', 'linear-gradient(rgba(219,39,119,.08) 1px,transparent 1px) 0 0/36px 36px,linear-gradient(90deg,rgba(219,39,119,.08) 1px,transparent 1px) 0 0/36px 36px,linear-gradient(180deg,#fff7fb,#fde7f3)'),
    P('#0a0612', '#140a22', '#ffe8f5', '#c49ab6', '#e5c4d8', 'rgba(255,45,149,.35)', 'rgba(20,10,34,.6)', '#ff2d95', '#fde047', 'rgba(255,45,149,.5)', 'linear-gradient(rgba(255,45,149,.09) 1px,transparent 1px) 0 0/36px 36px,linear-gradient(90deg,rgba(255,45,149,.09) 1px,transparent 1px) 0 0/36px 36px,linear-gradient(180deg,#0a0612,#150a24)')],
  'gold-25': ['flow', { r: '16px', dur: '60s' },
    P('#faf5ff', '#ffffff', '#3b0764', '#8a6aa8', '#6a4a88', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.55)', '#a855f7', '#f97316', 'rgba(168,85,247,.4)', '#faf5ff', { '--tpl-flow': 'linear-gradient(135deg,#c4b5fd,#fdba74,#f0abfc,#c4b5fd)' }),
    P('#12041f', '#1e0b30', '#f5e8ff', '#bf9fd6', '#dcc4f0', 'rgba(255,255,255,.14)', 'rgba(30,11,48,.55)', '#c084fc', '#fb923c', 'rgba(192,132,252,.35)', '#12041f', { '--tpl-flow': 'linear-gradient(135deg,#3b0764,#7c2d12,#831843,#3b0764)' })],
  'gold-26': ['orbs', { r: '20px', dur: '45s' },
    P('#fffbeb', '#ffffff', '#451a03', '#a07848', '#7d5a2c', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.62)', 'rgba(253,186,116,.7)', 'rgba(252,211,77,.6)', 'rgba(251,146,60,.5)', '#fffbeb'),
    P('#1c1008', '#2a1a0e', '#ffefd9', '#cfaa80', '#ecc9a0', 'rgba(255,255,255,.14)', 'rgba(42,26,14,.58)', 'rgba(234,88,12,.4)', 'rgba(202,138,4,.35)', 'rgba(190,18,60,.3)', '#1c1008')],
  'gold-27': ['orbs', { r: '18px', dur: '55s' },
    P('#f0f9ff', '#ffffff', '#0c4a6e', '#4b7a94', '#35617a', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.6)', 'rgba(125,211,252,.6)', 'rgba(165,243,252,.6)', 'rgba(196,181,253,.5)', '#f0f9ff'),
    P('#04121c', '#0a2030', '#e0f7ff', '#86b4c8', '#b0d6e6', 'rgba(255,255,255,.14)', 'rgba(10,32,48,.58)', 'rgba(34,211,238,.3)', 'rgba(52,211,153,.3)', 'rgba(129,140,248,.35)', '#04121c')],
  'gold-28': ['flow', { r: '14px', dur: '80s', edge: true },
    P('#fff5f0', '#ffffff', '#450a0a', '#a06a5e', '#7d443a', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.6)', '#c2410c', '#ea580c', 'rgba(234,88,12,.4)', '#fff5f0', { '--tpl-flow': 'linear-gradient(135deg,#fecaca,#fed7aa,#fda4af,#fecaca)' }),
    P('#1a0505', '#2a0c0a', '#ffe8e0', '#d0a095', '#efc4b8', 'rgba(255,255,255,.12)', 'rgba(42,12,10,.55)', '#ea580c', '#f97316', 'rgba(234,88,12,.45)', '#1a0505', { '--tpl-flow': 'linear-gradient(135deg,#450a0a,#9a3412,#7f1d1d,#450a0a)' })],
  'gold-29': ['orbs', { r: '18px', dur: '60s' },
    P('#f0fdf4', '#ffffff', '#052e16', '#5b8a6c', '#3d6b4f', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.6)', 'rgba(134,239,172,.55)', 'rgba(190,242,100,.45)', 'rgba(45,212,191,.4)', '#f0fdf4'),
    P('#03120a', '#0a2214', '#dcfce7', '#86b89a', '#b0dcc0', 'rgba(255,255,255,.12)', 'rgba(10,34,20,.58)', 'rgba(22,163,74,.3)', 'rgba(13,148,136,.3)', 'rgba(101,163,13,.25)', '#03120a')],
  'gold-30': ['holo', { r: '20px' },
    P('#fdf2f8', '#ffffff', '#4a1042', '#a0609a', '#7a3a74', 'rgba(236,72,153,.25)', 'rgba(255,255,255,.7)', '#ec4899', '#8b5cf6', 'rgba(236,72,153,.4)', 'linear-gradient(180deg,#fdf2f8,#ede9fe)', { '--tpl-c': '#fb923c' }),
    P('#14081f', '#201030', '#fbe8ff', '#c49ad6', '#e5c4f2', 'rgba(236,72,153,.3)', 'rgba(32,16,48,.6)', '#f472b6', '#a78bfa', 'rgba(244,114,182,.4)', 'linear-gradient(180deg,#1a0a2a,#14081f)', { '--tpl-c': '#fdba74' })],
};

// One BUILDERS entry per GOLD_NEW row.
const goldNewBuilders = Object.fromEntries(Object.entries(GOLD_NEW).map(([id, [fam, opt, L, D]]) => [id, () => FAMILY[fam](id, L, D, opt)]));

const BUILDERS = {
  'silver-01': silver01, 'silver-02': silver02, 'silver-03': silver03, 'silver-04': silver04,
  'silver-05': silver05, 'silver-06': silver06, 'silver-07': silver07,
  'silver-08': silver08, 'silver-09': silver09, 'silver-10': silver10,
  'gold-01': gold01, 'gold-02': gold02, 'gold-03': gold03,
  'gold-04': gold04, 'gold-05': gold05, 'gold-06': gold06,
  ...goldNewBuilders,
};

// People who prefer reduced motion get the same look without animation.
const REDUCED_MOTION = '@media (prefers-reduced-motion:reduce){body[class*="tpl-"]::before,body[class*="tpl-"]::after,body[class*="tpl-"] h1,body[class*="tpl-"] .avatar,body[class*="tpl-"] .avatar-fallback,body[class*="tpl-"] .link-card{animation:none !important;}}';

// CSS for one template id, or '' for an unknown id (then the base look stays).
export function templateCss(id) {
  const build = BUILDERS[id];
  return build ? build() + REDUCED_MOTION : '';
}
