// Demo/mockup profiles: real, working pages (used for design mockups and
// demos) that must not be treated as real people by search engines or AI.
// For these usernames only:
//   - api/sitemap.js leaves their /{username} and /cv/{username} URLs out
//   - api/bio.js and api/cv.js add <meta name="robots" content="noindex, nofollow">
//     and skip the schema.org Person JSON-LD
// Deliberately NOT blocked in robots.txt: crawlers must still be able to
// fetch the page to see the noindex tag (a Disallow would keep an already
// indexed URL stuck in the index).
//
// Every other profile is unaffected. Add a username here (lowercase) to
// mark another mockup profile.
export const DEMO_USERNAMES = new Set(['yourname', 'michelletan', 'alandmusic']);

export function isDemoProfile(username) {
  return DEMO_USERNAMES.has(String(username || '').toLowerCase());
}
