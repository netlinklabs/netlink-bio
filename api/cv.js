// api/cv.js
// Server-rendered public CV page. Same architecture as api/bio.js: data is
// fetched here on the server so AI crawlers and search bots see full content
// immediately, plus JSON-LD (schema.org/Person with resume-specific fields
// like jobTitle, alumniOf, worksFor, knowsAbout) for machine-readability.

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { COUNTRY_NAME_BY_CODE, countryFlag } from './_lib/countries.js';
import { escapeHtml, notFoundPage, jsonForScript } from './_lib/html.js';
import { isDemoProfile } from './_lib/demo-profiles.js';
import { recordEvent } from './_lib/analytics.js';
import { supabaseAuthHeaders } from './_lib/public-db.js';
import { withStats } from './_lib/stats.js';

const SUPABASE_URL = 'https://fuewalufgiclrcgszlit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FcmN6iwrOJp-5KBtBU8Cww_ZtvzahQb';

// ---- Verification badges (Green/Gold/Silver/Black) ----
// Identical logic to api/bio.js -- color is computed live from stored
// facts + current tier, never stored directly, so both pages always
// agree and never need an extra write when a tier changes.
function formatBadgeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Gold and Platinum users can hide the "netlink.bio -- build your page
// free" watermark via the "Hide Footer Link" toggle on privacy.html --
// tier alone is no longer enough, the toggle must also be on.
// profiles_cv_public exposes hide_footer_link_cv unconditionally (it's
// not a privacy-sensitive field), so it's always present in `profile`.
function showWatermark(profile) {
  const tier = profile?.tier || 'basic';
  if (tier !== 'gold' && tier !== 'platinum') return true;
  return !profile?.hide_footer_link_cv;
}

function computeBadges(profile) {
  const badges = [];
  const tier = profile.tier || 'basic';
  const tierEligible = tier === 'gold' || tier === 'platinum';

  if (profile.is_black_badge) {
    badges.push({
      color: 'black', label: 'Netlink Special',
      message: 'Awarded directly by the Netlink team as special recognition.',
      date: null,
    });
  }
  // Gold Verified Business stays a Gold/Platinum perk. Identity (KYC) is green for every tier.
  if (profile.business_verified_at) {
    if (tierEligible) {
      badges.push({ color: 'gold', label: 'Verified Business', message: "This business's registration has been manually verified by the Netlink team.", date: profile.business_verified_at });
    } else if (!profile.identity_verified_at) {
      badges.push({ color: 'silver', label: 'Previously Verified', message: "This profile's identity was previously verified by the Netlink team.", date: profile.business_verified_at });
    }
  }
  if (profile.identity_verified_at) {
    badges.push({ color: 'green', label: 'Verified Profile', message: "This profile's identity has been verified by the Netlink team.", date: profile.identity_verified_at });
  }
  return badges;
}

function badgeDotsHtml(profile) {
  const badges = computeBadges(profile);
  if (!badges.length) return '';
  return `<span class="badge-row">${badges.map((b, i) => `
      <button type="button" class="badge-dot badge-${b.color}" onclick="openBadgeModal(${i})" title="${escapeHtml(b.label)}">&#10003;</button>`).join('')}</span>`;
}

function badgeModalsHtml(profile) {
  const badges = computeBadges(profile);
  if (!badges.length) return '';
  const displayName = profile.display_name || profile.username || '';
  const avatar = profile.avatar_url || '';
  const avatarHtml = avatar
    ? `<img class="badge-modal-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`
    : `<div class="badge-modal-avatar badge-modal-avatar-fallback">${escapeHtml(displayName.charAt(0).toUpperCase() || '?')}</div>`;

  return badges.map((b, i) => `
    <div id="badgeModal${i}" class="badge-modal-overlay" onclick="if(event.target===this) closeBadgeModal(${i})">
      <div class="badge-modal-box">
        <span class="badge-modal-handle"></span>
        <button class="badge-modal-close" onclick="closeBadgeModal(${i})">&times;</button>
        <div class="badge-modal-avatar-wrap">
          ${avatarHtml}
          <span class="badge-modal-avatar-check badge-${b.color}">&#10003;</span>
        </div>
        <h3 class="badge-modal-title">&#9989; ${escapeHtml(b.label)}</h3>
        <p class="badge-modal-message">${escapeHtml(b.message)}</p>
        ${b.date ? `<p class="badge-modal-date">Verified since ${formatBadgeDate(b.date)}</p>` : ''}
      </div>
    </div>`).join('\n');
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: supabaseAuthHeaders(path, SUPABASE_KEY),
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}

// ---- Certificates + project links ----
// Certificate PDFs live in the PRIVATE bucket `cv-certificates` (Silver and up).
// File paths are never put in the HTML. The "View Certificate" button points at
// /cv/<username>?cert=<index>, and this function streams the PDF itself after
// checking the tier, so Basic profiles never expose a file even if one exists
// (for example after a downgrade).
const CERT_BUCKET = 'cv-certificates';
const CERT_TIERS = ['silver', 'gold', 'platinum'];
const CERT_MAX_BYTES = 2 * 1024 * 1024;

// Legacy certifications are plain strings, new ones are { name, file_path }.
// `i` is the position in the stored array, so the ?cert=<i> link stays valid.
function normalizeCertifications(list) {
  return (Array.isArray(list) ? list : []).map((c, i) => (
    typeof c === 'string'
      ? { i, name: c.trim(), filePath: '' }
      : { i, name: String(c?.name || '').trim(), filePath: String(c?.file_path || '') }
  )).filter((c) => c.name);
}

function isSafeCertPath(profileId, path) {
  return typeof path === 'string'
    && path.startsWith(`${profileId}/`)
    && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.pdf$/i.test(path)
    && !path.includes('..');
}

// Featured Project links: https only. Anything else is dropped, not rendered.
function safeHttpsUrl(value) {
  const s = String(value || '').trim();
  if (!/^https:\/\/\S+$/i.test(s) || s.length > 500) return '';
  try { return new URL(s).href; } catch { return ''; }
}

// Stamps every page with a light diagonal watermark that ties the copy to this
// CV page and the day it was shown. It does not stop a determined forger, but a
// copied file visibly says where it came from, and the stamp is in the file
// itself, so it also shows up in downloads and screenshots.
const CERT_MAX_PAGES = 30;
async function stampCertificate(buf, username) {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  if (pages.length === 0 || pages.length > CERT_MAX_PAGES) throw new Error('page count');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const label = `netlink.bio/cv/${username} | shown ${new Date().toISOString().slice(0, 10)} | unverified copy`;
  const size = 11;
  const textWidth = font.widthOfTextAtSize(label, size);
  const stepX = textWidth + 70;
  const stepY = 96;
  const cos = Math.cos(Math.PI / 6);
  const sin = Math.sin(Math.PI / 6);
  for (const page of pages) {
    const { width, height } = page.getSize();
    const reach = Math.hypot(width, height);
    let row = 0;
    for (let y = -reach; y <= reach; y += stepY, row++) {
      for (let x = -reach + (row % 2 ? stepX / 2 : 0); x <= reach; x += stepX) {
        const px = x * cos - y * sin;
        const py = x * sin + y * cos;
        // Only draw tiles that touch the page (keeps the file small).
        if (px < -textWidth || px > width || py < -textWidth || py > height) continue;
        page.drawText(label, { x: px, y: py, size, font, color: rgb(0.45, 0.45, 0.5), opacity: 0.2, rotate: degrees(30) });
      }
    }
  }
  return Buffer.from(await doc.save());
}

async function serveCertificate(req, res, profile) {
  const idx = Number.parseInt(String(req.query.cert), 10);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cert = normalizeCertifications(profile.cv_data?.certifications).find((c) => c.i === idx);
  const allowed = CERT_TIERS.includes(profile.tier || 'basic')
    && cert && cert.filePath && isSafeCertPath(profile.id, cert.filePath) && serviceKey;
  if (!allowed) {
    res.status(404).setHeader('Cache-Control', 'no-store').send('Certificate not found');
    return;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${CERT_BUCKET}/${cert.filePath}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) {
      res.status(404).setHeader('Cache-Control', 'no-store').send('Certificate not found');
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    // The bucket limits size and mime type, but re-check the real bytes before serving.
    if (buf.length > CERT_MAX_BYTES + 1024 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      res.status(404).setHeader('Cache-Control', 'no-store').send('Certificate not found');
      return;
    }
    let out;
    try {
      out = await stampCertificate(buf, profile.username);
    } catch (stampErr) {
      // Never serve the unstamped original: a file we cannot stamp is not shown.
      console.error('certificate stamp failed', stampErr?.message);
      res.status(422).setHeader('Cache-Control', 'no-store').send('This certificate file could not be displayed.');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="certificate.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(out);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this certificate.');
  }
}

async function handler(req, res) {
  const username = (req.query.username || '').toLowerCase().trim();
  if (!username) { res.status(400).send('Missing username'); return; }

  let profile;
  try {
    const profiles = await supabaseGet(`profiles_cv_public?username=eq.${encodeURIComponent(username)}&select=*`);
    if (!profiles.length) {
      res.status(404).setHeader('Content-Type', 'text/html').send(notFoundPage({
        title: 'CV not found',
        heading: `No CV found for @${escapeHtml(username)}`,
        message: 'This CV doesn’t exist or may have been removed.',
      }));
      return;
    }
    profile = profiles[0];
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this CV.');
    return;
  }

  // /cv/<username>?cert=<index> returns the certificate PDF (popup viewer / new tab).
  if (req.query.cert !== undefined) {
    await serveCertificate(req, res, profile);
    return;
  }

  const cv = profile.cv_data || {};
  const displayName = profile.display_name || profile.username;
  const title = cv.title || '';
  const city = cv.location || '';
  const countryName = profile.country_code
    ? `${countryFlag(profile.country_code)} ${COUNTRY_NAME_BY_CODE[profile.country_code] || profile.country_code}`
    : '';
  const location = [city, countryName].filter(Boolean).join(', ');
  const summary = cv.summary || '';
  const skills = Array.isArray(cv.skills) ? cv.skills : [];
  const education = Array.isArray(cv.education) ? cv.education : [];
  const languages = Array.isArray(cv.languages) ? cv.languages : [];
  const experience = Array.isArray(cv.experience) ? cv.experience : [];
  const projects = Array.isArray(cv.projects) ? cv.projects : [];
  const certifications = normalizeCertifications(cv.certifications);
  const canViewCertFiles = CERT_TIERS.includes(profile.tier || 'basic');
  const avatar = profile.avatar_url || '';
  const pageUrl = `https://netlink.bio/cv/${profile.username}`;
  const bioUrl = `https://netlink.bio/${profile.username}`;

  // ---- JSON-LD (schema.org/Person, resume-flavored) ----
  // @id must be byte-identical to the one api/bio.js emits for the same
  // username (bio's pageUrl, not this page's), so both pages resolve to
  // the same Person entity in a graph.
  const personId = `${bioUrl}#person`;
  const personNode = {
    '@type': 'Person',
    '@id': personId,
    name: displayName,
    url: pageUrl,
    ...(title ? { jobTitle: title } : {}),
    ...(summary ? { description: summary } : {}),
    ...(avatar ? { image: avatar } : {}),
    ...((city || profile.country_code) ? {
      address: {
        '@type': 'PostalAddress',
        ...(city ? { addressLocality: city } : {}),
        ...(profile.country_code ? { addressCountry: profile.country_code } : {}),
      }
    } : {}),
    ...(skills.length ? { knowsAbout: skills } : {}),
    // Certificate names only. The PDF itself is private and noindex, so it is never linked here.
    ...(certifications.some((c) => c.name) ? { hasCredential: certifications.filter((c) => c.name).map((c) => ({ '@type': 'EducationalOccupationalCredential', name: c.name })) } : {}),
    ...(languages.length ? { knowsLanguage: languages.map((l) => l.name).filter(Boolean) } : {}),
    ...(education.length ? { alumniOf: education.map((e) => ({ '@type': 'EducationalOrganization', name: e.school })).filter((e) => e.name) } : {}),
    ...(experience.length && experience[0].company ? { worksFor: { '@type': 'Organization', name: experience[0].company } } : {}),
    sameAs: [bioUrl],
  };
  // ProfilePage wraps the Person as its mainEntity, per Google's Profile
  // Page structured data guidance -- mainEntity points at the SAME Person
  // @id as api/bio.js (this page is about the same Person, just via their
  // CV), while the ProfilePage node itself gets its own #profilepage @id
  // scoped to this URL. No dateCreated/dateModified: profiles_cv_public
  // has no updated_at column (see CHANGELOG.md).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${pageUrl}#profilepage`,
        url: pageUrl,
        mainEntity: { '@id': personId },
      },
      personNode,
    ],
  };

  // ---- Section builders ----
  const contactHtml = `
    <div class="contact-list">
      ${(profile.contact_email && profile.show_email_cv !== false) ? `<a href="mailto:${escapeHtml(profile.contact_email)}" class="contact-item">${iconMail()} ${escapeHtml(profile.contact_email)}</a>` : ''}
      ${(profile.contact_whatsapp && profile.show_phone_cv !== false) ? `<a href="https://wa.me/${escapeHtml(profile.contact_whatsapp.replace(/[^0-9]/g, ''))}" target="_blank" class="contact-item">${iconPhone()} ${escapeHtml(profile.contact_whatsapp)}</a>` : ''}
      <a href="${bioUrl}" class="contact-item">${iconGlobe()} netlink.bio/${escapeHtml(profile.username)}</a>
    </div>`;

  function iconMail() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`; }
  function iconPhone() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`; }
  function iconGlobe() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`; }
  function iconCheck() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a365d" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }
  function iconPrint() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`; }
  function iconShare() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`; }

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
    ? `<div class="cv-section"><h2 class="section-title">Featured Projects</h2><div class="project-grid">${projects.map((p) => {
        const projectUrl = safeHttpsUrl(p.url);
        return `
        <div class="project-card">
          <h4>${projectUrl ? `<a class="project-link" href="${escapeHtml(projectUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.name)} <span aria-hidden="true">&#8599;</span></a>` : escapeHtml(p.name)}</h4>
          ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
          ${(p.tags && p.tags.length) ? `<div class="project-tags">${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('')}</div></div>`
    : '';

  // "View Certificate" only exists for Silver and up, and only for rows with a file.
  const hasViewableCert = canViewCertFiles && certifications.some((c) => isSafeCertPath(profile.id, c.filePath));
  const certificationsHtml = certifications.length
    ? `<div class="cv-section"><h2 class="section-title">Certifications</h2><div class="cert-list">${certifications.map((c) => `
        <div class="cert-item">
          <div class="cert-title">${iconCheck()}<span>${escapeHtml(c.name)}</span></div>
          ${(canViewCertFiles && isSafeCertPath(profile.id, c.filePath)) ? `<button type="button" class="cert-view-btn" data-cert-index="${c.i}" data-title="${escapeHtml(c.name)}" onclick="openCertificate(this)">View Certificate</button>` : ''}
        </div>`).join('')}</div></div>`
    : '';

  const certModalHtml = hasViewableCert ? `
    <div id="certModal" class="cert-modal-overlay" onclick="if(event.target===this) closeCertificate()">
      <div class="cert-modal-box" role="dialog" aria-modal="true" aria-labelledby="certModalTitle">
        <div class="cert-modal-bar">
          <span id="certModalTitle" class="cert-modal-title"></span>
          <a id="certModalOpen" class="cert-modal-open" href="#" target="_blank" rel="noopener">Open in new tab</a>
          <button type="button" class="cert-modal-close" onclick="closeCertificate()" aria-label="Close">&times;</button>
        </div>
        <iframe id="certFrame" class="cert-modal-frame" title="Certificate" src="about:blank"></iframe>
        <div id="certPages" class="cert-modal-pages" style="display:none"></div>
        <p class="cert-modal-note">Unverified document, uploaded by the profile owner. Not checked by Netlink.</p>
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(displayName)}${title ? `, ${escapeHtml(title)}` : ''} | CV | Netlink</title>
<meta name="description" content="${escapeHtml(summary || `${displayName}'s CV on Netlink`)}">
<meta property="og:title" content="${escapeHtml(displayName)} | CV">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:image" content="https://netlink.bio/api/og?username=${encodeURIComponent(profile.username)}&type=cv">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<link rel="icon" type="image/png" href="/assets/netlinkbio-icon.png">
${isDemoProfile(profile.username)
  // Demo/mockup profile (api/_lib/demo-profiles.js): keep it out of search
  // indexes and don't describe it to crawlers/AI as a real Person.
  ? '<meta name="robots" content="noindex, nofollow">'
  : `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`}

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f0f2f5; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:2rem 1rem;
  --primary:#1a365d; --primary-light:#2c5282; --accent:#c5a47e; --text-dark:#1a202c; --text-medium:#4a5568; --text-light:#718096; --bg-warm:#faf9f7; --bg-white:#ffffff; --border:#e2e8f0;
  --shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06); --shadow-lg:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04); }
.cv-container { position:relative; width:100%; max-width:1100px; background:var(--bg-white); border-radius:12px; box-shadow:var(--shadow-lg); overflow:hidden; display:grid; grid-template-columns:1fr; }
.cv-column { padding:2rem; }
.left-column { background:var(--bg-warm); border-bottom:1px solid var(--border); }
.right-column { background:var(--bg-white); }
.profile-header { text-align:center; margin-bottom:2rem; }
.profile-avatar { width:100px; height:100px; margin:0 auto 1rem; border-radius:50%; overflow:hidden; border:3px solid var(--accent); background:linear-gradient(135deg,#1a365d,#2c5282); display:flex; align-items:center; justify-content:center; }
.profile-avatar img { width:100%; height:100%; object-fit:cover; }
.profile-avatar-initial { color:white; font-size:2.5rem; font-weight:700; }
.profile-name { font-size:1.4rem; font-weight:700; color:var(--primary); letter-spacing:-0.025em; margin-bottom:0.25rem; display:flex; align-items:center; justify-content:center; gap:0.4rem; flex-wrap:wrap; }
.badge-row { display:inline-flex; align-items:center; gap:4px; }
.badge-dot { width:18px; height:18px; border-radius:50%; border:none; padding:0; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; line-height:1; cursor:pointer; flex-shrink:0; }
.badge-green { background:#10b981; }
.badge-gold { background:#f59e0b; }
.badge-silver { background:#94a3b8; }
.badge-black { background:#18181b; }

/* Verification badge modal -- bottom sheet, same as api/bio.js */
.badge-modal-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:100; align-items:flex-end; justify-content:center; }
.badge-modal-overlay.active { display:flex; animation: badge-fade-in 0.2s ease-out; }
@keyframes badge-fade-in { from { opacity:0; } to { opacity:1; } }
.badge-modal-box { position:relative; background:white; width:100%; max-width:480px; border-radius:24px 24px 0 0; padding:14px 24px 36px; box-shadow:0 -10px 30px rgba(0,0,0,0.2); animation: badge-slide-up 0.25s cubic-bezier(0.16,1,0.3,1); text-align:left; }
@keyframes badge-slide-up { from { transform:translateY(100%); } to { transform:translateY(0); } }
.badge-modal-handle { display:block; width:36px; height:4px; border-radius:99px; background:#e2e8f0; margin:0 auto 20px; }
.badge-modal-close { position:absolute; top:16px; right:18px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; color:#64748b; font-size:16px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.badge-modal-avatar-wrap { position:relative; width:64px; height:64px; margin-bottom:16px; }
.badge-modal-avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; display:block; background:#e2e8f0; }
.badge-modal-avatar-fallback { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,var(--primary),var(--primary-light)); display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700; }
.badge-modal-avatar-check { position:absolute; bottom:-2px; right:-2px; width:24px; height:24px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-content:center; color:white; font-size:11px; box-sizing:content-box; }
.badge-modal-title { font-size:19px; font-weight:700; color:var(--text-dark); margin:0 0 10px; display:flex; align-items:center; gap:8px; }
.badge-modal-message { font-size:14px; color:var(--text-medium); line-height:1.6; margin:0 0 12px; }
.badge-modal-date { font-size:12px; color:var(--text-light); margin:0; }
.profile-title { font-size:0.85rem; color:var(--accent); font-weight:500; margin-bottom:0.5rem; }
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
.project-link { color:inherit; text-decoration:none; }
.project-link:hover { color:var(--primary); text-decoration:underline; }
.cert-list { display:flex; flex-direction:column; }
.cert-item { display:flex; flex-direction:column; align-items:flex-start; gap:0.5rem; padding:0.75rem 0; border-top:1px solid var(--border); font-size:0.875rem; color:var(--text-medium); }
.cert-item:first-child { border-top:none; padding-top:0; }
.cert-item:last-child { padding-bottom:0; }
.cert-title { display:flex; align-items:flex-start; gap:0.625rem; }
.cert-title svg { flex-shrink:0; margin-top:2px; }
.cert-view-btn { margin-left:calc(16px + 0.625rem); font-family:inherit; font-size:0.75rem; font-weight:600; color:var(--primary); background:rgba(26,54,93,0.08); border:none; border-radius:6px; padding:0.4rem 0.8rem; cursor:pointer; }
.cert-view-btn:hover { background:rgba(26,54,93,0.14); }
.cert-modal-overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:110; align-items:center; justify-content:center; padding:1rem; }
.cert-modal-overlay.active { display:flex; }
.cert-modal-box { display:flex; flex-direction:column; width:100%; max-width:900px; height:88vh; background:#fff; border-radius:12px; overflow:hidden; box-shadow:var(--shadow-lg); }
.cert-modal-bar { display:flex; align-items:center; gap:0.75rem; padding:0.625rem 1rem; border-bottom:1px solid var(--border); }
.cert-modal-title { flex:1; min-width:0; font-size:0.875rem; font-weight:600; color:var(--text-dark); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cert-modal-open { font-size:0.75rem; font-weight:600; color:var(--primary); text-decoration:none; white-space:nowrap; }
.cert-modal-open:hover { text-decoration:underline; }
.cert-modal-close { width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; color:#64748b; font-size:18px; line-height:1; cursor:pointer; flex-shrink:0; }
.cert-modal-frame { flex:1; width:100%; border:0; background:#f8fafc; }
.cert-modal-pages { flex:1; overflow:auto; background:#e2e8f0; padding:0.75rem; -webkit-overflow-scrolling:touch; }
.cert-modal-pages canvas { display:block; width:100%; height:auto; margin:0 auto 0.75rem; background:#fff; box-shadow:0 1px 4px rgba(15,23,42,0.18); }
.cert-modal-note { padding:0.4rem 1rem; border-top:1px solid var(--border); background:#fff; font-size:0.7rem; line-height:1.3; color:var(--text-light); text-align:center; }
.cert-modal-msg { padding:2rem 1rem; text-align:center; font-size:0.85rem; color:var(--text-medium); }
.footer-link { margin-top:2rem; text-align:center; }
.footer-link a { color:#94a3b8; font-size:12px; text-decoration:none; }
.legal-footer { margin-top:8px; text-align:center; }
.legal-footer a { color:#94a3b8; font-size:11px; text-decoration:none; }
.legal-footer span { color:#94a3b8; font-size:11px; padding:0 4px; }
.cv-corner-logo { position:absolute; top:16px; left:16px; z-index:5; display:inline-flex; }
.cv-corner-logo img { width:30px; height:30px; border-radius:7px; display:block; }
.cv-toolbar { max-width:1100px; margin:1.5rem auto 0; padding:0 1rem; display:flex; justify-content:center; gap:0.5rem; }
.cv-toolbar-btn { display:inline-flex; align-items:center; gap:0.4rem; padding:0.5rem 0.9rem; background:var(--bg-white); border:1px solid var(--border); border-radius:8px; font-size:0.8rem; font-weight:600; color:var(--text-medium); cursor:pointer; }
.cv-toolbar-btn:hover { background:var(--bg-warm); color:var(--primary); }
@media (min-width:768px) {
  .cv-container { grid-template-columns:320px 1fr; }
  .left-column { border-bottom:none; border-right:1px solid var(--border); }
  .project-grid { grid-template-columns:1fr 1fr; }
}
@media print {
  @page { size:A4; margin:14mm 0; }
  @page :first { margin:0 0 14mm 0; }
  body { background:white; padding:0; }
  .cv-container { display:grid !important; grid-template-columns:280px 1fr !important; max-width:100%; box-shadow:none; border-radius:0; min-height:100vh; }
  .footer-link { display:none !important; }
  .legal-footer { display:none !important; }
  .cv-toolbar { display:none !important; }
  .cv-corner-logo { display:none !important; }
  .cert-view-btn, .cert-modal-overlay { display:none !important; }
}
</style>
</head>
<body>
  <div class="cv-container">
    <a href="https://netlink.bio" class="cv-corner-logo" title="Netlink"><img src="/assets/netlinkbio-icon.png" alt="Netlink"></a>
    <div class="cv-column left-column">
      <div class="profile-header">
        <div class="profile-avatar">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">` : `<span class="profile-avatar-initial">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`}
        </div>
        <h1 class="profile-name">${escapeHtml(displayName)}${badgeDotsHtml(profile)}</h1>
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
  <div class="cv-toolbar">
    <button type="button" class="cv-toolbar-btn" onclick="window.print()" title="Print / Save as PDF">${iconPrint()} Print</button>
    <button type="button" class="cv-toolbar-btn" onclick="shareCv(event)" title="Share this CV">${iconShare()} Share</button>
  </div>
  ${showWatermark(profile) ? `<div class="footer-link"><a href="/">Netlink | Build Your Page Free</a></div>` : ''}
  <div class="legal-footer"><a href="/privacy-policy" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="mailto:contact@netlink.bio" target="_blank" rel="noopener">Report</a></div>
  ${badgeModalsHtml(profile)}
  ${certModalHtml}
  <script>
    function shareCv(event) {
      const shareData = { title: ${jsonForScript(displayName + ' | CV')}, url: ${jsonForScript(pageUrl)} };
      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareData.url).then(() => {
          const btn = event.currentTarget;
          const original = btn.innerHTML;
          btn.textContent = 'Link copied!';
          setTimeout(() => btn.innerHTML = original, 1500);
        });
      }
    }

    function closeAllBadgePopups() {
      document.querySelectorAll('.badge-modal-overlay').forEach(m => m.classList.remove('active'));
    }
    function openBadgeModal(idx) {
      closeAllBadgePopups();
      document.getElementById('badgeModal' + idx).classList.add('active');
    }
    function closeBadgeModal(idx) {
      document.getElementById('badgeModal' + idx).classList.remove('active');
    }

    // Certificate popup. Browsers with a built-in PDF viewer show the file in an
    // iframe. Others (most phones) render the pages with PDF.js on canvas, still
    // inside the popup. PDF.js is self-hosted and loaded only on first use.
    // A new tab is only the last fallback if rendering fails.
    const CERT_BASE = ${jsonForScript(`/cv/${profile.username}`)};
    let certToken = 0;
    let pdfjsLoading = null;
    function loadPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      if (pdfjsLoading) return pdfjsLoading;
      pdfjsLoading = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = '/assets/pdfjs/pdf.min.js';
        sc.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        sc.onerror = () => { pdfjsLoading = null; reject(new Error('load')); };
        document.head.appendChild(sc);
      });
      return pdfjsLoading;
    }
    async function renderCertificate(url, token) {
      const box = document.getElementById('certPages');
      box.innerHTML = '<div class="cert-modal-msg">Loading certificate...</div>';
      try {
        const lib = await loadPdfJs();
        const doc = await lib.getDocument({ url, withCredentials: false }).promise;
        if (token !== certToken) { doc.destroy(); return; }
        box.innerHTML = '';
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(box.clientWidth - 24, 280);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (token !== certToken) { doc.destroy(); return; }
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          box.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
      } catch (err) {
        if (token !== certToken) return;
        closeCertificate();
        window.open(url, '_blank', 'noopener');
      }
    }
    function openCertificate(btn) {
      const url = CERT_BASE + '?cert=' + encodeURIComponent(btn.dataset.certIndex);
      const frame = document.getElementById('certFrame');
      const pages = document.getElementById('certPages');
      const token = ++certToken;
      document.getElementById('certModalTitle').textContent = btn.dataset.title || 'Certificate';
      document.getElementById('certModalOpen').href = url;
      document.getElementById('certModal').classList.add('active');
      if (navigator.pdfViewerEnabled) {
        pages.style.display = 'none';
        frame.style.display = '';
        frame.src = url;
      } else {
        frame.style.display = 'none';
        pages.style.display = '';
        renderCertificate(url, token);
      }
    }
    function closeCertificate() {
      const modal = document.getElementById('certModal');
      if (!modal) return;
      certToken++;
      modal.classList.remove('active');
      document.getElementById('certFrame').src = 'about:blank';
      document.getElementById('certPages').innerHTML = '';
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCertificate(); });
  </script>
</body>
</html>`;

  recordEvent({ userId: profile.id, eventType: 'view_cv', referrer: req.headers.referer || '', req });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=120');
  res.status(200).send(html);
}

export default withStats('cv', handler);
