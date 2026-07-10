// api/bio.js
const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

// Helper untuk escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Handler utama
export default async function handler(req, res) {
  const { username } = req.query;

  if (!username) {
    return res.status(400).send('Username diperlukan.');
  }

  try {
    // 1. Fetch profile menggunakan ilike agar tidak sensitif huruf kapital
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?username=ilike.${encodeURIComponent(username)}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const profiles = await profileRes.json();

    if (!profiles || profiles.length === 0) {
      return res.status(404).send(`Profil dengan username "${username}" tidak ditemukan.`);
    }

    const profile = profiles[0];
    
    // 2. Fetch links berdasarkan user_id (kolom di tabel links)
    const linksRes = await fetch(`${SUPABASE_URL}/rest/v1/links?user_id=eq.${profile.id}&order=position.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const links = await linksRes.json();

    // 3. Menentukan shape icon dari kolom link_icon_shape
    const iconShape = (profile.link_icon_shape === 'rounded') ? 'rounded' : 'circle';

    // 4. Render HTML
    const linksHtml = links.map((l) => `
      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="link-card">
        <span class="link-icon ${iconShape}">
           <img src="https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${escapeHtml(l.icon || 'link')}.svg" alt="icon">
        </span>
        <div class="link-text">
            <span class="link-title">${escapeHtml(l.title)}</span>
            ${l.description ? `<span class="link-desc">${escapeHtml(l.description)}</span>` : ''}
        </div>
      </a>`).join('\n');

    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(profile.display_name || profile.username)} | Netlink.bio</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 20px; background: #f8fafc; }
          .avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; }
          .link-card { display: flex; align-items: center; padding: 12px; margin: 10px auto; border: 1px solid #e2e8f0; width: 100%; max-width: 400px; border-radius: 12px; background: white; text-decoration: none; color: #333; }
          .link-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; margin-right: 15px; background: #f1f5f9; }
          .link-icon.circle { border-radius: 50%; }
          .link-icon.rounded { border-radius: 8px; }
          .link-icon img { width: 20px; height: 20px; }
          .link-text { display: flex; flex-direction: column; text-align: left; }
          .link-title { font-weight: 600; font-size: 14px; }
          .link-desc { font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        ${profile.avatar_url ? `<img class="avatar" src="${escapeHtml(profile.avatar_url)}">` : ''}
        <h1>${escapeHtml(profile.display_name || profile.username)}</h1>
        <p>${escapeHtml(profile.bio || '')}</p>
        <div class="links-container">${linksHtml}</div>
      </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).send('Terjadi kesalahan server.');
  }
}
