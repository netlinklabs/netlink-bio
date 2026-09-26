// Known AI bot User-Agent patterns, used to tag analytics_events rows so
// AI reads never inflate the human "Views" count and instead show up as
// their own metric (see api/_lib/analytics.js and analytics.html).
//
// Two categories, matching the taxonomy AI infra providers (Vercel's
// verified-bots directory, Cloudflare's AI Crawl Control) already use:
//
//   'crawler'  -- background bots that fetch pages to build AI training
//                 datasets or long-lived indexes. No single visit means a
//                 person saw anything; volume can swing a lot month to
//                 month and doesn't track real interest.
//   'assistant' -- fetches triggered by an actual person asking an AI
//                 assistant a question right now (ChatGPT-User,
//                 Claude-User, PerplexityBot's search feature, etc.) or an
//                 AI-powered search index built from live queries. Closer
//                 in spirit to a real visit than 'crawler' is.
//
// Matching is a case-insensitive substring test against the User-Agent
// header -- the same self-identification method these bots rely on to be
// allowed by robots.txt, and what free-tier bot-management tools use too.
// It can't catch a bot that lies about its identity; that's fine here,
// this is an informational "AI is reading your profile" signal, not a
// security control.
const AI_BOTS = [
  // --- AI Crawler (training / index-building) ---
  { match: 'gptbot', name: 'GPTBot (OpenAI)', category: 'crawler' },
  { match: 'claudebot', name: 'ClaudeBot (Anthropic)', category: 'crawler' },
  { match: 'google-extended', name: 'Google-Extended (Gemini)', category: 'crawler' },
  { match: 'google-cloudvertexbot', name: 'Google-CloudVertexBot (Vertex AI)', category: 'crawler' },
  { match: 'meta-externalagent', name: 'Meta-ExternalAgent (Meta AI)', category: 'crawler' },
  { match: 'applebot-extended', name: 'Applebot-Extended (Apple AI)', category: 'crawler' },
  { match: 'amazonbot', name: 'Amazonbot (Amazon)', category: 'crawler' },
  { match: 'bytespider', name: 'Bytespider (ByteDance)', category: 'crawler' },
  { match: 'ccbot', name: 'CCBot (Common Crawl)', category: 'crawler' },
  { match: 'meta-webindexer', name: 'Meta-WebIndexer (Meta AI)', category: 'crawler' },

  // --- AI Assistant (a person's live question, or AI-powered search) ---
  { match: 'chatgpt-user', name: 'ChatGPT', category: 'assistant' },
  { match: 'oai-searchbot', name: 'ChatGPT Search (OpenAI)', category: 'assistant' },
  { match: 'claude-user', name: 'Claude (Anthropic)', category: 'assistant' },
  { match: 'claude-searchbot', name: 'Claude Search (Anthropic)', category: 'assistant' },
  { match: 'perplexity-user', name: 'Perplexity', category: 'assistant' },
  { match: 'perplexitybot', name: 'Perplexity Search', category: 'assistant' },
  { match: 'duckassistbot', name: 'DuckDuckGo AI', category: 'assistant' },
  { match: 'meta-externalfetcher', name: 'Meta AI', category: 'assistant' },
  { match: 'gemini-deep-research', name: 'Gemini Deep Research (Google)', category: 'assistant' },
];

// AI apps whose in-app browser (WebView) adds its own token to the
// User-Agent. Unlike AI_BOTS above, these are real people: someone tapped
// a link inside the AI app, and the page opened in that app's WebView. The
// token lets analytics credit the visit to the app as its source instead
// of "Direct or apps" (these WebViews send no referrer). Only add apps
// whose token has been seen in a real request -- e.g. Kimi's WebView sent
// "... Mobile Safari/537.36 Kimi/3.1.3" (verified 2026-09-26). Several
// apps (the ChatGPT Android app, for one) open links in plain Chrome with
// no token at all, so they can't be listed here.
//
// `source` is stored in analytics_events.referrer, so it uses the app's
// web domain -- the same key a click from that AI's website would get --
// and analytics.html maps it to a friendly name.
const AI_APPS = [
  { pattern: /\bkimi\/\d/i, source: 'kimi.com' },
];

// Returns the source domain for a known AI app's in-app browser, or null.
export function detectAiApp(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return null;
  for (const app of AI_APPS) {
    if (app.pattern.test(ua)) return app.source;
  }
  return null;
}

// Returns { category, name } for a known AI bot User-Agent, or null for
// anything else (regular browsers, non-AI crawlers like Googlebot/
// Ahrefsbot, etc. -- those aren't tracked here).
export function detectAiBot(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return null;
  for (const bot of AI_BOTS) {
    if (ua.includes(bot.match)) return { category: bot.category, name: bot.name };
  }
  return null;
}
