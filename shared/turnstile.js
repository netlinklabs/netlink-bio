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
  const SITE_KEY = '0x4AAAAAAGAyQXsZM4W1z7mF';

  const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const TIMEOUT_MS = 30000;

  const MSG_LOAD = 'Security check could not load. Please refresh the page and try again.';
  const MSG_FAIL = 'Security check failed. Please refresh the page and try again.';
  const MSG_TIMEOUT = 'Security check timed out. Please try again.';

  let scriptPromise = null;
  let container = null;
  let widgetId = null;
  let settleCurrent = null; // settles the request that is waiting for a token
  let queue = Promise.resolve(); // one challenge at a time

  function loadScript() {
    if (window.turnstile) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => {
        if (window.turnstile && typeof window.turnstile.ready === 'function') window.turnstile.ready(resolve);
        else resolve();
      };
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error(MSG_LOAD));
      };
      document.head.appendChild(s);
    });
    return scriptPromise;
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
            if (widgetId === null) {
              widgetId = window.turnstile.render(ensureContainer(), {
                sitekey: SITE_KEY,
                execution: 'execute',
                appearance: 'interaction-only',
                callback: (token) => { if (settleCurrent) settleCurrent(null, token); },
                'error-callback': () => { if (settleCurrent) settleCurrent(new Error(MSG_FAIL)); },
                'timeout-callback': () => { if (settleCurrent) settleCurrent(new Error(MSG_TIMEOUT)); },
              });
            } else {
              window.turnstile.reset(widgetId);
            }
            window.turnstile.execute(widgetId);
          } catch (err) {
            settle(new Error(MSG_FAIL));
          }
        })
    );
  }

  // Resolves to a fresh token, or undefined while captcha is off on the client.
  function getToken() {
    if (!SITE_KEY) return Promise.resolve(undefined);
    const p = queue.then(requestToken);
    queue = p.catch(() => {});
    return p;
  }

  // Ready-made `options` object for Supabase auth calls.
  async function opts() {
    const captchaToken = await getToken();
    return captchaToken ? { captchaToken } : {};
  }

  window.nlCaptcha = { enabled: !!SITE_KEY, getToken, opts };
})();
