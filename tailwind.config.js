// Static build config for the Netlink app pages (dashboard, pay, tx, etc.).
// Public/marketing pages (index.html, privacy-policy.html, ...) use their
// own hand-written shared/site-nav.css and are NOT built from this config.
//
// Rebuild after changing markup/classes in any file listed below:
//   npx tailwindcss -c tailwind.config.js -i shared/tailwind.src.css -o shared/tailwind.css --minify
// Then bump the `?v=` query string on every <link href="/shared/tailwind.css?v=N">
// include so browsers/CDN edge caches pick up the new file (see CHANGELOG.md).
module.exports = {
  content: [
    './analytics.html',
    './card.html',
    './contacts.html',
    './dashboard.html',
    './identity.html',
    './login.html',
    './pay.html',
    './pay2.html',
    './privacy.html',
    './recovery.html',
    './reset-password.html',
    './reward.html',
    './tx.html',
    './shared/nav.js',
    './shared/app-lock.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: { bg: '#0f172a', card: '#1e293b', border: 'rgba(255,255,255,0.05)' },
      },
    },
  },
  plugins: [],
};
