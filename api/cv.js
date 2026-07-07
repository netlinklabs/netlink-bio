// api/cv.js
// Server-rendered public CV page. Same architecture as api/bio.js: data is
// fetched here on the server so AI crawlers and search bots see full content
// immediately, plus JSON-LD (schema.org/Person with resume-specific fields
// like jobTitle, alumniOf, worksFor, knowsAbout) for machine-readability.

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

function notFoundPage(username) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>CV not found — Netlink.bio</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;text-align:center;padding:80px 20px;color:#334155}</style>
</head><body>
<h1>No CV found for @${escapeHtml(username)}</h1>
<p><a href="/">Create your own free page &rarr;</a></p>
</body></html>`;
}

export default async function handler(req, res) {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!username) { res.status(400).send('Missing username'); return; }

  let profile;
  try {
    const profiles = await supabaseGet(`profiles?username=eq.${encodeURIComponent(username)}&select=*`);
    if (!profiles.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage(username));
      return;
    }
    profile = profiles[0];
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this CV.');
    return;
  }

  const cv = profile.cv_data || {};
  const displayName = profile.display_name || profile.username;
  const title = cv.title || '';
  const location = cv.location || '';
  const summary = cv.summary || '';
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const education = Array.isArray(cv.education) ? cv.education : [];
  const languages = Array.isArray(cv.languages) ? cv.languages : [];
  const experience = Array.isArray(cv.experience) ? cv.experience : [];
  const projects = Array.isArray(cv.projects) ? cv.projects : [];
  const certifications = Array.isArray(cv.certifications) ? cv.certifications : [];
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink-bio.vercel.app/cv/${profile.username}`;
  const bioUrl = `https://netlink-bio.vercel.app/${profile.username}`;

  // ---- JSON-LD (schema.org/Person, resume-flavored) ----
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: displayName,
    url: pageUrl,
    ...(title ? { jobTitle: title } : {}),
    ...(summary ? { description: summary } : {}),
    ...(avatar ? { image: avatar } : {}),
    ...(location ? { address: { '@type': 'PostalAddress', addressLocality: location } } : {}),
    ...(skills.length ? { knowsAbout: skills } : {}),
    ...(languages.length ? { knowsLanguage: languages.map((l) => l.name).filter(Boolean) } : {}),
    ...(education.length ? { alumniOf: education.map((e) => ({ '@type': 'EducationalOrganization', name: e.school })).filter((e) => e.name) } : {}),
    ...(experience.length && experience[0].company ? { worksFor: { '@type': 'Organization', name: experience[0].company } } : {}),
    sameAs: [bioUrl],
  };

  // ---- Section builders ----
  const contactHtml = `
    <div class="contact-list">
      ${profile.contact_email ? `<a href="mailto:${escapeHtml(profile.contact_email)}" class="contact-item">${iconMail()} ${escapeHtml(profile.contact_email)}</a>` : ''}
      ${profile.contact_whatsapp ? `<a href="https://wa.me/${escapeHtml(profile.contact_whatsapp.replace(/[^0-9]/g, ''))}" target="_blank" class="contact-item">${iconPhone()} WhatsApp</a>` : ''}
      <a href="${bioUrl}" class="contact-item">${iconGlobe()} netlink.bio/${escapeHtml(profile.username)}</a>
    </div>`;

  function iconMail() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`; }
  function iconPhone() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`; }
  function iconGlobe() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`; }
  function iconCheck() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a365d" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }

  const skillsHtml = skills.length
    ? `<div class="cv-section"><h2 class="section-title">Skills</h2><div class="skill-tags">${skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}</div></div>`
    : '';

  const educationHtml = education.length
    ? `<div class="cv-section"><h2 class="section-title">Education</h2>${education.map((e) => `
        <div class="education-item">
          <h3 class="edu-degree">${escapeHtml(e.degree)}</h3>
          <p class="edu-school">${escapeHtml(e.school)}</p>
          ${e.year ? `<p class="edu-year">${escapeHtml(e.year)}</p>` : ''}
          ${e.detail ? `<p class="edu-detail">${escapeHtml(e.detail)}</p>` : ''}
        </div>`).join('')}</div>`
    : '';

  const languagesHtml = languages.length
    ? `<div class="cv-section"><h2 class="section-title">Languages</h2><div class="language-list">${languages.map((l) => `
        <div class="language-item"><span class="lang-name">${escapeHtml(l.name)}</span><span class="lang-level">${escapeHtml(l.level)}</span></div>`).join('')}</div></div>`
    : '';

  const experienceHtml = experience.length
    ? `<div class="cv-section"><h2 class="section-title">Work Experience</h2>${experience.map((e) => `
        <div class="experience-item">
          <div class="exp-header">
            <div><h3 class="exp-title">${escapeHtml(e.title)}</h3><p class="exp-company">${escapeHtml(e.company)}</p></div>
            ${e.date ? `<span class="exp-date">${escapeHtml(e.date)}</span>` : ''}
          </div>
          ${(e.bullets && e.bullets.length) ? `<ul class="exp-list">${e.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        </div>`).join('')}</div>`
    : '';

  const projectsHtml = projects.length
    ? `<div class="cv-section"><h2 class="section-title">Featured Projects</h2><div class="project-grid">${projects.map((p) => `
        <div class="project-card">
          <h4>${escapeHtml(p.name)}</h4>
          ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
          ${(p.tags && p.tags.length) ? `<div class="project-tags">${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('')}</div></div>`
    : '';

  const certificationsHtml = certifications.length
    ? `<div class="cv-section"><h2 class="section-title">Certifications</h2><div class="cert-list">${certifications.map((c) => `
        <div class="cert-item">${iconCheck()}<span>${escapeHtml(c)}</span></div>`).join('')}</div></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(displayName)}${title ? ` — ${escapeHtml(title)}` : ''} | CV — Netlink.bio</title>
<meta name="description" content="${escapeHtml(summary || `${displayName}'s CV on Netlink.bio`)}">
<meta property="og:title" content="${escapeHtml(displayName)} — CV">
<meta property="og:description" content="${escapeHtml(summary)}">
${avatar ? `<meta property="og:image" content="${escapeHtml(avatar)}">` : ''}
<meta property="og:url" content="${pageUrl}">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f0f2f5; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:2rem 1rem;
  --primary:#1a365d; --primary-light:#2c5282; --accent:#c5a47e; --text-dark:#1a202c; --text-medium:#4a5568; --text-light:#718096; --bg-warm:#faf9f7; --bg-white:#ffffff; --border:#e2e8f0;
  --shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06); --shadow-lg:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04); }
.cv-container { width:100%; max-width:1100px; background:var(--bg-white); border-radius:12px; box-shadow:var(--shadow-lg); overflow:hidden; display:grid; grid-template-columns:1fr; }
.cv-column { padding:2rem; }
.left-column { background:var(--bg-warm); border-bottom:1px solid var(--border); }
.right-column { background:var(--bg-white); }
.profile-header { text-align:center; margin-bottom:2rem; }
.profile-avatar { width:100px; height:100px; margin:0 auto 1rem; border-radius:50%; overflow:hidden; border:3px solid var(--accent); background:linear-gradient(135deg,#1a365d,#2c5282); display:flex; align-items:center; justify-content:center; }
.profile-avatar img { width:100%; height:100%; object-fit:cover; }
.profile-avatar-initial { color:white; font-size:2.5rem; font-weight:700; }
.profile-name { font-size:1.75rem; font-weight:700; color:var(--primary); letter-spacing:-0.025em; margin-bottom:0.25rem; }
.profile-title { font-size:1rem; color:var(--accent); font-weight:500; margin-bottom:0.5rem; }
.profile-location { display:inline-flex; align-items:center; gap:0.375rem; color:var(--text-light); font-size:0.875rem; }
.cv-section { margin-bottom:2rem; }
.cv-section:last-child { margin-bottom:0; }
.section-title { font-size:0.875rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--primary); margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:2px solid var(--accent); display:inline-block; }
.contact-list { display:flex; flex-direction:column; gap:0.75rem; }
.contact-item { display:flex; align-items:center; gap:0.75rem; color:var(--text-medium); text-decoration:none; font-size:0.875rem; word-break:break-all; }
.contact-item:hover { color:var(--primary); }
.contact-item svg { flex-shrink:0; color:var(--accent); }
.skill-tags { display:flex; flex-wrap:wrap; gap:0.5rem; }
.skill-tag { background:var(--bg-white); border:1px solid var(--border); padding:0.375rem 0.75rem; border-radius:20px; font-size:0.8rem; color:var(--text-medium); font-weight:500; }
.education-item { margin-bottom:1.25rem; }
.education-item:last-child { margin-bottom:0; }
.edu-degree { font-size:1rem; font-weight:600; color:var(--text-dark); margin-bottom:0.25rem; }
.edu-school { font-size:0.875rem; color:var(--primary); font-weight:500; margin-bottom:0.25rem; }
.edu-year { font-size:0.8rem; color:var(--text-light); margin-bottom:0.25rem; }
.edu-detail { font-size:0.8rem; color:var(--text-medium); font-style:italic; }
.language-list { display:flex; flex-direction:column; gap:0.75rem; }
.language-item { display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--border); }
.language-item:last-child { border-bottom:none; }
.lang-name { font-weight:500; color:var(--text-dark); font-size:0.875rem; }
.lang-level { font-size:0.8rem; color:var(--text-light); background:var(--bg-white); padding:0.25rem 0.625rem; border-radius:12px; border:1px solid var(--border); }
.summary-text { color:var(--text-medium); line-height:1.7; font-size:0.9375rem; white-space:pre-wrap; }
.experience-item { margin-bottom:1.75rem; }
.experience-item:last-child { margin-bottom:0; }
.exp-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem; }
.exp-title { font-size:1.1rem; font-weight:600; color:var(--text-dark); }
.exp-company { font-size:0.9rem; color:var(--primary); font-weight:500; margin-top:0.125rem; }
.exp-date { font-size:0.8rem; color:var(--text-light); background:var(--bg-warm); padding:0.25rem 0.625rem; border-radius:6px; font-weight:500; white-space:nowrap; }
.exp-list { list-style:none; padding-left:0; }
.exp-list li { position:relative; padding-left:1.25rem; margin-bottom:0.5rem; color:var(--text-medium); font-size:0.875rem; line-height:1.6; }
.exp-list li::before { content:''; position:absolute; left:0; top:0.6rem; width:6px; height:6px; background:var(--accent); border-radius:50%; }
.project-grid { display:grid; grid-template-columns:1fr; gap:1rem; }
.project-card { background:var(--bg-warm); border:1px solid var(--border); border-radius:8px; padding:1rem; }
.project-card h4 { font-size:1rem; font-weight:600; color:var(--text-dark); margin-bottom:0.375rem; }
.project-card p { font-size:0.8rem; color:var(--text-medium); margin-bottom:0.75rem; line-height:1.5; }
.project-tags { display:flex; gap:0.5rem; flex-wrap:wrap; }
.project-tags span { font-size:0.75rem; color:var(--primary); background:rgba(26,54,93,0.08); padding:0.25rem 0.5rem; border-radius:4px; font-weight:500; }
.cert-list { display:flex; flex-direction:column; gap:0.75rem; }
.cert-item { display:flex; align-items:center; gap:0.625rem; font-size:0.875rem; color:var(--text-medium); }
.cert-item svg { flex-shrink:0; }
.footer-link { margin-top:2rem; text-align:center; }
.footer-link a { color:#94a3b8; font-size:12px; text-decoration:none; }
@media (min-width:768px) {
  .cv-container { grid-template-columns:320px 1fr; }
  .left-column { border-bottom:none; border-right:1px solid var(--border); }
  .project-grid { grid-template-columns:1fr 1fr; }
}
@media print {
  @page { size:A4; margin:0; }
  body { background:white; padding:0; }
  .cv-container { display:grid !important; grid-template-columns:280px 1fr !important; max-width:100%; box-shadow:none; border-radius:0; min-height:100vh; }
  .footer-link { display:none !important; }
}
</style>
</head>
<body>
  <div class="cv-container">
    <div class="cv-column left-column">
      <div class="profile-header">
        <div class="profile-avatar">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">` : `<span class="profile-avatar-initial">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`}
        </div>
        <h1 class="profile-name">${escapeHtml(displayName)}</h1>
        ${title ? `<p class="profile-title">${escapeHtml(title)}</p>` : ''}
        ${location ? `<div class="profile-location">${iconGlobe()} ${escapeHtml(location)}</div>` : ''}
      </div>
      <div class="cv-section"><h2 class="section-title">Contact</h2>${contactHtml}</div>
      ${skillsHtml}
      ${educationHtml}
      ${languagesHtml}
    </div>
    <div class="cv-column right-column">
      ${summary ? `<div class="cv-section"><h2 class="section-title">Professional Summary</h2><p class="summary-text">${escapeHtml(summary)}</p></div>` : ''}
      ${experienceHtml}
      ${projectsHtml}
      ${certificationsHtml}
    </div>
  </div>
  <div class="footer-link"><a href="/">netlink.bio &mdash; build your page free</a></div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
