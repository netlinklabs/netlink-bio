// shared/turnstile.js
// Cloudflare Turnstile helper for Supabase Auth CAPTCHA protection.
//
// Supabase (Authentication > Attack Protection) can require a CAPTCHA token on
// signUp, signInWithPassword, signInWithIdToken, resend and resetPasswordForEmail.
// Each token is single use, so every call needs a fresh one.
//
// Usage:
//   signUp({ email, password, options: await nlCaptcha.opts() })
//   signInWithPassword({ email, password, options: await nlCaptcha.opts() })
//   signInWithIdToken({ provider, token, options: await nlCaptcha.opts() })
//   resend({ type: 'signup', email, options: await nlCaptcha.opts() })
//   resetPasswordForEmail(email, { redirectTo, ...(await nlCaptcha.opts()) })
//
// While SITE_KEY is empty, opts() returns {} and nothing changes, so this file
// is safe to deploy before Turnstile is configured.
//
// Rollout order: 1) fill SITE_KEY and deploy, 2) enable CAPTCHA in Supabase.
// Enabling it in Supabase first breaks every login and signup.

(function () {
  'use strict';

  // Public Turnstile site key (safe to expose in client code). Empty = off.
  const SITE_KEY = '';
  // shared/turnstile-test.html sets window.NL_TURNSTILE_SITE_KEY to try this helper
  // before SITE_KEY above is switched on.
  const KEY = SITE_KEY || window.NL_TURNSTILE_SITE_KEY || '';

  const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=nlTurnstileOnload';
  const TIMEOUT_MS = 30000;
  const LOAD_TIMEOUT_MS = 15000;

  const MSG_LOAD = 'Security check could not load. Please refresh the page and try again.';
  const MSG_FAIL = 'Security check failed. Please refresh the page and try again.';
  const MSG_TIMEOUT = 'Security check timed out. Please try again.';

  let container = null;
  let widgetId = null;
  let settleCurrent = null; // settles the request that is waiting for a token
  let queue = Promise.resolve(); // one challenge at a time

  let apiReady = false;
  let scriptInjected = false;
  let readyWaiters = [];

  // Cloudflare calls this once api.js is fully ready (the documented `onload`
  // parameter). Do not use turnstile.ready() with a script injected like this:
  // it never fires, which made every auth call hang on phones.
  window.nlTurnstileOnload = () => {
    apiReady = true;
    readyWaiters.splice(0).forEach((w) => w());
  };

  function loadScript() {
    if (apiReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer = null;
      const waiter = () => { clearTimeout(timer); resolve(); };
      const fail = () => {
        clearTimeout(timer);
        readyWaiters = readyWaiters.filter((w) => w !== waiter);
        reject(new Error(MSG_LOAD));
      };
      readyWaiters.push(waiter);
      timer = setTimeout(fail, LOAD_TIMEOUT_MS);
      if (!scriptInjected) {
        scriptInjected = true;
        const el = document.createElement('script');
        el.src = SCRIPT_SRC;
        el.async = true;
        el.onerror = () => { scriptInjected = false; fail(); };
        document.head.appendChild(el);
      }
    });
  }

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'nl-turnstile';
    // interaction-only: the widget stays invisible unless Cloudflare needs the
    // user to tap something, then it shows up here above everything else.
    container.style.cssText =
      'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;';
    document.body.appendChild(container);
    return container;
  }

  // Optional debug hook, only used by shared/turnstile-test.html.
  function dbg(msg) {
    try { if (typeof window.nlTurnstileDebug === 'function') window.nlTurnstileDebug(msg); } catch (e) { /* ignore */ }
  }

  function requestToken() {
    return loadScript().then(
      () =>
        new Promise((resolve, reject) => {
          let settled = false;
          let timer = null;
          const settle = (err, token) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (settleCurrent === settle) settleCurrent = null;
            if (err) reject(err);
            else resolve(token);
          };
          settleCurrent = settle;
          timer = setTimeout(() => settle(new Error(MSG_TIMEOUT)), TIMEOUT_MS);

          try {
            // No turnstile.execute(): the widget runs by itself when it is
            // rendered, and reset() runs it again for the next token. Calling
            // execute() right after render() lost the first request on a phone.
            if (widgetId === null) {
              dbg('render');
              widgetId = window.turnstile.render(ensureContainer(), {
                sitekey: KEY,
                appearance: 'interaction-only',
                callback: (token) => { dbg('token received'); if (settleCurrent) settleCurrent(null, token); },
                'error-callback': (code) => { dbg('error code ' + code); if (settleCurrent) settleCurrent(new Error(MSG_FAIL)); },
                'timeout-callback': () => { dbg('timeout-callback'); if (settleCurrent) settleCurrent(new Error(MSG_TIMEOUT)); },
                'before-interactive-callback': () => dbg('interaction needed'),
                'after-interactive-callback': () => dbg('interaction done'),
              });
            } else {
              dbg('reset');
              window.turnstile.reset(widgetId);
            }
          } catch (err) {
            dbg('render or reset threw: ' + err.message);
            settle(new Error(MSG_FAIL));
          }
        })
    );
  }

  // Resolves to a fresh token, or undefined while captcha is off on the client.
  function getToken() {
    if (!KEY) return Promise.resolve(undefined);
    const p = queue.then(requestToken);
    queue = p.catch(() => {});
    return p;
  }

  // Ready-made `options` object for Supabase auth calls.
  async function opts() {
    const captchaToken = await getToken();
    return captchaToken ? { captchaToken } : {};
  }

  window.nlCaptcha = { enabled: !!KEY, getToken, opts };
})();
