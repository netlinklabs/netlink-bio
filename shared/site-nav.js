/* ============================================
   SITE-NAV.JS — Shared header/footer injector for public pages
   Usage: add <div id="site-header"></div> right after <body>
          and <div id="site-footer"></div> before closing </body>,
          then include shared/site-nav.css + shared/site-nav.js.
   ============================================ */
(function () {
  'use strict';

  const path = window.location.pathname;
  const isIndex = path === '/' || path.endsWith('/') || /\/?index\.html$/.test(path);
  const HOME = isIndex ? '' : 'index.html';

  // Anchors (#features, #docs, etc.) only exist on index.html.
  // Real pages (privacy-policy.html, etc.) are left untouched.
  function link(href) {
    if (href.indexOf('http') === 0 || href.indexOf('.html') !== -1) return href;
    return HOME + href;
  }

  const LOGO_LIGHT = 'https://raw.githubusercontent.com/netlinklabs/netlink-bio/refs/heads/main/assets/netlinkbio-darkBG.png';
  const LOGIN_URL = 'https://netlink-bio.vercel.app/login.html';

  const headerHTML = `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header class="header" id="site-header-el" role="banner">
      <div class="header-inner">
        <a href="${isIndex ? '#' : 'index.html'}" class="header-logo" aria-label="Netlink Home">
          <img src="${LOGO_LIGHT}" alt="Netlink Logo" width="200" height="48">
        </a>
        <nav class="header-nav" role="navigation" aria-label="Main navigation">
          <a href="${link('#hero')}">Home</a>
          <a href="${link('#features')}">Features</a>
          <a href="${link('#how-it-works')}">How It Works</a>
          <a href="${link('#docs')}">Documentation</a>
          <a href="${LOGIN_URL}">Login</a>
        </nav>
        <div class="header-cta">
          <a href="${LOGIN_URL}" class="btn btn-primary">Get Started Free</a>
        </div>
        <button class="menu-toggle" id="siteMenuToggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="siteMobileNav">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
    <nav class="mobile-nav" id="siteMobileNav" role="navigation" aria-label="Mobile navigation">
      <a href="${link('#hero')}">Home</a>
      <a href="${link('#features')}">Features</a>
      <a href="${link('#how-it-works')}">How It Works</a>
      <a href="${link('#docs')}">Documentation</a>
      <a href="${LOGIN_URL}">Login</a>
    </nav>
  `;

  const footerHTML = `
    <footer class="footer" role="contentinfo">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand-block">
            <div class="footer-brand">
              <img src="${LOGO_LIGHT}" alt="Netlink" width="200" height="48">
            </div>
            <h4 class="footer-brand-title">About</h4>
            <p class="footer-brand-desc">Netlink is a modern digital identity platform that helps individuals and businesses create a trusted online presence, showcase their work, connect with opportunities, receive payments, and build an AI-ready profile — all from a single trusted identity.</p>
          </div>
          <div class="footer-group footer-group-left">
            <div>
              <h4 class="footer-col-title">Product</h4>
              <div class="footer-links">
                <a href="${link('#link-in-bio')}">Link in Bio</a>
                <a href="${link('#digital-cv')}">Digital CV</a>
                <a href="${link('#business-profile')}">Business Profile</a>
                <a href="${link('#netlink-pay')}">Netlink Pay</a>
                <a href="${link('#netlink-token')}">Netlink Token (NET)</a>
                <a href="${link('#verification')}">Verification</a>
              </div>
            </div>
            <div>
              <h4 class="footer-col-title">Resources</h4>
              <div class="footer-links">
                <a href="${link('#docs')}">Documentation</a>
                <a href="${link('#help')}">Help Center</a>
                <a href="${link('#api')}">API</a>
                <a href="${link('#blog')}">Blog</a>
                <a href="${link('#changelog')}">Changelog</a>
              </div>
            </div>
          </div>
          <div class="footer-group footer-group-right">
            <div>
              <h4 class="footer-col-title">Company</h4>
              <div class="footer-links">
                <a href="${link('#about')}">About</a>
                <a href="${link('#careers')}">Careers</a>
                <a href="${link('#contact')}">Contact</a>
                <a href="${link('#partners')}">Partners</a>
                <a href="${link('#press')}">Press Kit</a>
              </div>
            </div>
            <div>
              <h4 class="footer-col-title">Legal</h4>
              <div class="footer-links">
                <a href="privacy-policy.html">Privacy Policy</a>
                <a href="terms.html">Terms of Service</a>
                <a href="terms-of-use.html">Terms of Use (Netlink Pay)</a>
                <a href="cookies.html">Cookie Policy</a>
                <a href="acceptable-use.html">Acceptable Use Policy</a>
                <a href="security.html">Security</a>
              </div>
            </div>
          </div>
          <div>
            <h4 class="footer-col-title">Social</h4>
            <div class="footer-links">
              <a href="https://twitter.com/netlinkbio" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
              <a href="https://linkedin.com/company/netlinklabs" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a href="https://github.com/netlinklabs" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://youtube.com/@netlink" target="_blank" rel="noopener noreferrer">YouTube</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p class="footer-bottom-copyright">&copy; 2026 PT Netlink Labs Global. All rights reserved.</p>
        </div>
      </div>
    </footer>
  `;

  function mount() {
    const headerMount = document.getElementById('site-header');
    const footerMount = document.getElementById('site-footer');
    if (headerMount) headerMount.innerHTML = headerHTML;
    if (footerMount) footerMount.innerHTML = footerHTML;

    if (!isIndex) {
      document.body.classList.add('has-site-header-offset');
    }

    initHeaderBehavior();
  }

  function initHeaderBehavior() {
    const header = document.getElementById('site-header-el');
    if (!header) return;

    function updateHeader() {
      if (!isIndex) {
        // No dark hero underneath on non-index pages: keep header always solid.
        header.classList.add('scrolled');
        return;
      }
      const scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 20) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    }

    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () { updateHeader(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });
    updateHeader();

    const menuToggle = document.getElementById('siteMenuToggle');
    const mobileNav = document.getElementById('siteMobileNav');
    if (!menuToggle || !mobileNav) return;

    let menuOpen = false;
    menuToggle.addEventListener('click', function () {
      menuOpen = !menuOpen;
      menuToggle.classList.toggle('active', menuOpen);
      mobileNav.classList.toggle('active', menuOpen);
      menuToggle.setAttribute('aria-expanded', String(menuOpen));
      document.body.style.overflow = menuOpen ? 'hidden' : '';
    });
    mobileNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menuOpen = false;
        menuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) {
        menuOpen = false;
        menuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
