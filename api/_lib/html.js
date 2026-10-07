// Shared HTML helpers for server-rendered API routes (bio.js, cv.js, landing.js).
// Previously each file had its own copy of escapeHtml() and notFoundPage() —
// consolidated here so the 404 design only needs to change in one place.

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON for embedding inside an inline <script> (JSON-LD or JS variables).
// Plain JSON.stringify leaves "</script>" intact, so user text like
// "</script><script>alert(1)</script>" would close the tag and run. Escaping
// < > & and the two JS line separators keeps the output valid JSON and valid JS
// while making it impossible to break out of the script element.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Returns the URL only when it is a plain http(s) URL, otherwise ''.
// Used for user-provided links so schemes like javascript: or data: never
// reach an href.
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

// Returns the value only when it looks like a plain CSS colour (hex, rgb(a),
// hsl(a)), otherwise the fallback. Stops values like "red;position:fixed" from
// adding extra CSS declarations inside a style="" attribute.
export function safeCssColor(value, fallback) {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|hsl)a?\(\s*[0-9.%\s,/-]+\)$/i.test(v)) return v;
  return fallback;
}

// Branded 404 page for a missing profile / CV / landing page.
// heading and message may contain a caller-escaped value (see call sites);
// ctaHref/ctaText default to sending people back to create their own page.
// code: big number shown above the heading. Pass '' to hide it (used by the inactive landing page).
export function notFoundPage({ title, heading, message, ctaHref = '/', ctaText = 'Create your own free page', code = '404' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Netlink.bio</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: linear-gradient(180deg, #0A1929 0%, #0F1D2E 50%, #0A1929 100%);
    color: rgba(255, 255, 255, 0.92);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 80px 20px;
  }
  .wrap { max-width: 460px; }
  .code {
    font-family: 'Poppins', system-ui, sans-serif;
    font-weight: 800;
    font-size: 4.5rem;
    line-height: 1;
    background: linear-gradient(135deg, #16C6C8 0%, #0EA5A7 50%, #0D9488 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 16px;
  }
  h1 {
    font-family: 'Poppins', system-ui, sans-serif;
    font-size: 1.375rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  p { color: rgba(255, 255, 255, 0.60); font-size: 0.9375rem; line-height: 1.6; margin-bottom: 28px; }
  a.cta {
    display: inline-block;
    padding: 13px 28px;
    background: linear-gradient(135deg, #16C6C8 0%, #0EA5A7 50%, #0D9488 100%);
    color: #FFFFFF;
    font-weight: 600;
    font-size: 0.9375rem;
    text-decoration: none;
    border-radius: 100px;
    box-shadow: 0 4px 20px rgba(22, 198, 200, 0.30);
  }
</style>
</head>
<body>
  <div class="wrap">
    ${code ? `<div class="code">${code}</div>` : ''}
    <h1>${heading}</h1>
    <p>${message}</p>
    <a class="cta" href="${ctaHref}">${ctaText} &rarr;</a>
  </div>
</body>
</html>`;
}
