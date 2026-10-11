// Static build config for the public legal pages that used to load cdn.tailwindcss.com
// (terms, terms-of-use, privacy-policy, username-policy, contact, investor, changelog).
// Separate from tailwind.config.js on purpose: the app pages keep their own shared/tailwind.css.
//
// Rebuild after changing Tailwind classes in any file listed below:
//   npm run build:css:public
// Then bump `?v=` on the <link href="/shared/tailwind-public.css?v=N"> include in those pages.
module.exports = {
  content: [
    './terms.html',
    './terms-of-use.html',
    './privacy-policy.html',
    './username-policy.html',
    './contact.html',
    './investor.html',
    './changelog.html',
  ],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
