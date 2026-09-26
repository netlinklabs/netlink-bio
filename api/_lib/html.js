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

// Branded 404 page for a missing profile / CV / landing page.
// heading and message may contain a caller-escaped value (see call sites);
// ctaHref/ctaText default to sending people back to create their own page.
export function notFoundPage({ title, heading, message, ctaHref = '/', ctaText = 'Create your own free page' }) {
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
    <div class="code">404</div>
    <h1>${heading}</h1>
    <p>${message}</p>
    <a class="cta" href="${ctaHref}">${ctaText} &rarr;</a>
  </div>
</body>
</html>`;
}
