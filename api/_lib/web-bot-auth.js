// Web Bot Auth verification for analytics (IETF draft, built on RFC 9421
// HTTP Message Signatures). Some AI agents cryptographically sign every
// request they make, so a site can prove who sent it instead of trusting
// the User-Agent string. That matters most for agentic browsers (ChatGPT's
// cloud browser, Google-Agent), whose User-Agent looks exactly like
// ordinary Chrome -- this is the only honest way to recognize them.
//
// Used by api/_lib/analytics.js: a page view with a valid signature from a
// known agent is tagged as an AI read (category 'assistant', since these
// agents act on a person's live request), taking priority over the
// User-Agent match in ai-bots.js.
//
// A signed request carries three headers:
//   Signature-Agent: "https://chatgpt.com"            (or g="https://agent.bot.goog")
//   Signature-Input: sig1=("@authority" "signature-agent");created=...;keyid="...";tag="web-bot-auth"
//   Signature:       sig1=:<base64>:
// The agent publishes its public keys at
//   <agent origin>/.well-known/http-message-signatures-directory
//
// SECURITY: the Signature-Agent header is visitor-controlled, so keys are
// ONLY ever fetched from the allowlisted origins below -- never from
// whatever URL a request names (that would let anyone make this server
// fetch arbitrary URLs, i.e. SSRF). An unknown agent is logged
// ([wba-probe]) so it can be reviewed and added here by hand.
//
// Replay: nonces aren't tracked, so someone who captured a genuine signed
// request could replay it to this domain until it expires (minutes) and
// add a few AI reads. Acceptable for an informational stat; this is not
// used for access control anywhere.

import { verify, HTTP_MESSAGE_SIGNATURES_DIRECTORY } from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';

// Verified 2026-09-27 against each vendor's docs:
//   ChatGPT: help.openai.com/en/articles/11845367 (cloud browser signs, legacy header form)
//   Google:  developers.google.com/crawling/docs/crawlers-fetchers/web-bot-auth
//            (a subset of Google-Agent requests, label "g")
const KNOWN_AGENTS = {
  'https://chatgpt.com': { name: 'ChatGPT Agent (verified)' },
  'https://agent.bot.goog': { name: 'Google-Agent (verified)' },
};

const KEY_TTL_MS = 60 * 60 * 1000; // re-fetch a key directory at most hourly per instance
const FAILED_TTL_MS = 5 * 60 * 1000; // back off after a failed fetch
const FETCH_TIMEOUT_MS = 3000;
const MAX_DIRECTORY_BYTES = 64 * 1024;

// origin -> { expiresAt, verifiers: Map<keyid, verifier> } (per warm instance)
const keyCache = new Map();

async function loadVerifiers(origin) {
  const cached = keyCache.get(origin);
  if (cached && cached.expiresAt > Date.now()) return cached.verifiers;

  const verifiers = new Map();
  try {
    const res = await fetch(new URL(HTTP_MESSAGE_SIGNATURES_DIRECTORY, origin), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`directory ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_DIRECTORY_BYTES) throw new Error('directory too large');
    const keys = JSON.parse(text)?.keys;
    if (!Array.isArray(keys)) throw new Error('directory has no keys');
    for (const jwk of keys) {
      try {
        const verifier = await verifierFromJWK(jwk);
        verifiers.set(verifier.keyid, verifier);
      } catch {
        // Unsupported or malformed key -- skip it, keep the rest.
      }
    }
    keyCache.set(origin, { expiresAt: Date.now() + KEY_TTL_MS, verifiers });
  } catch (err) {
    console.error(`[wba] key directory fetch failed for ${origin}:`, err.message);
    keyCache.set(origin, { expiresAt: Date.now() + FAILED_TTL_MS, verifiers });
  }
  return verifiers;
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(', ') : value;
}

// Node's req -> the plain request descriptor the library verifies against.
// @authority is taken from the Host the client actually requested.
function toDescriptor(req) {
  const host = String(header(req, 'x-forwarded-host') || header(req, 'host') || '').split(',')[0].trim();
  const fields = [];
  for (const [name, value] of Object.entries(req.headers)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      // The library rejects non-ASCII field values outright; such headers
      // can't be part of a valid signature anyway, so leave them out.
      if (/^[\x20-\x7e\t]*$/.test(String(v))) fields.push({ name, value: String(v) });
    }
  }
  return { kind: 'request', method: req.method || 'GET', targetUri: `https://${host}${req.url || '/'}`, fields };
}

// Labels present in Signature-Input (e.g. "sig1", "g"). Every member is an
// inner list, so a top-level member always looks like `label=(`.
function signatureLabels(signatureInput) {
  return [...String(signatureInput).matchAll(/(?:^|,)\s*([a-z*][a-z0-9_.*-]*)=\(/g)].map((m) => m[1]);
}

async function tryVerify(descriptor, label, state) {
  state.origin = null;
  return verify(descriptor, {
    label,
    clockSkew: 60,
    async resolver(candidate) {
      const origins = candidate.signatureAgent
        ? [new URL(candidate.signatureAgent.uri).origin]
        : Object.keys(KNOWN_AGENTS); // no Signature-Agent header: look the keyid up across known agents
      for (const origin of origins) {
        if (!KNOWN_AGENTS[origin]) {
          state.unknownAgent = origin;
          continue;
        }
        const verifier = (await loadVerifiers(origin)).get(candidate.keyid);
        if (verifier) {
          state.origin = origin;
          return verifier;
        }
      }
      throw new Error('no trusted key for this signature');
    },
  });
}

// Returns { category: 'assistant', name } for a request carrying a valid
// Web Bot Auth signature from a known agent, otherwise null. Never throws.
export async function verifyWebBotAuth(req) {
  const signature = header(req, 'signature');
  const signatureInput = header(req, 'signature-input');
  if (!signature || !signatureInput || !/web-bot-auth/.test(signatureInput)) return null;

  const state = {};
  let lastError = null;
  try {
    const descriptor = toDescriptor(req);
    const labels = signatureLabels(signatureInput);
    // A single signature needs no label; with several (e.g. one added by a
    // proxy), try each one in turn.
    for (const label of labels.length > 1 ? labels : [undefined]) {
      try {
        await tryVerify(descriptor, label, state);
        if (state.origin) return { category: 'assistant', name: KNOWN_AGENTS[state.origin].name };
      } catch (err) {
        lastError = err;
      }
    }
  } catch (err) {
    lastError = err;
  }

  // Signed, but not by a known agent or not valid: log it (no IP) so new
  // agents can be reviewed and added to KNOWN_AGENTS.
  console.log(`[wba-probe] signature-agent="${String(header(req, 'signature-agent') || '').slice(0, 200)}" unknown="${state.unknownAgent || ''}" error="${String(lastError?.message || '').slice(0, 200)}"`);
  return null;
}
