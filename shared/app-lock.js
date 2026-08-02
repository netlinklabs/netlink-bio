// shared/app-lock.js
// PIN-based app lock. PIN is mandatory; WebAuthn (fingerprint/FaceID) is an
// optional local shortcut on top of it, never a replacement.
//
// Lock points covered by the PASSIVE screen (session-based, low friction):
//   - First page load after login (per browser tab session)
//   - Returning to the app after >= 2 minutes in background
//
// Lock points covered by requireAppLock() (ALWAYS re-verify, no exceptions):
//   - Account deletion request
//   - Cancel account deletion
//
// Usage (after auth resolves):
//   NetlinkAppLock.init({ supabaseClient, userId, userEmail });
//   const ok = await NetlinkAppLock.requireAppLock('delete your account');
//   if (!ok) return;
//
// IMPORTANT: call NetlinkAppLock.clearLockSession() at every logout point,
// BEFORE supabaseClient.auth.signOut(). Without this, logging out and back
// in within the same browser tab skips the lock screen, because the
// "already unlocked this session" marker lives in sessionStorage and is
// otherwise untouched by logout.

(function () {
  const BG_LOCK_MS = 2 * 60 * 1000; // 2 minutes
  const SS_UNLOCKED_AT = 'nl_lock_unlocked_at';
  const SS_HIDDEN_AT = 'nl_lock_last_hidden_at';
  const LS_WEBAUTHN_CRED = 'nl_lock_webauthn_cred_id';
  const LS_WEBAUTHN_USER = 'nl_lock_webauthn_user_id';
  const GOOGLE_CLIENT_ID = '207398676098-o9j3ijhd20latst8rq1orvt6rvlk8v06.apps.googleusercontent.com';

  let state = {
    supabaseClient: null,
    userId: null,
    userEmail: null,
  };

  // ---------------- Styles ----------------

  function injectStyles() {
    if (document.getElementById('nlal-styles')) return;
    const style = document.createElement('style');
    style.id = 'nlal-styles';
    style.textContent = `
      #nlal-overlay { position: fixed; inset: 0; z-index: 200; background: #ffffff;
        display: flex; align-items: center; justify-content: center; padding: 24px; }
      html.dark #nlal-overlay { background: #0f172a; }
      #nlal-modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center; padding: 24px; }
      .nlal-card { width: 100%; max-width: 320px; text-align: center; }
      .nlal-icon-wrap { width: 56px; height: 56px; border-radius: 16px; background: #eff6ff;
        display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
      html.dark .nlal-icon-wrap { background: rgba(59,130,246,0.15); }
      .nlal-title { font-size: 17px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
      html.dark .nlal-title { color: #f8fafc; }
      .nlal-subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
      .nlal-dots { display: flex; justify-content: center; gap: 12px; margin-bottom: 20px; }
      .nlal-dot { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid #cbd5e1;
        background: transparent; transition: all 0.15s; }
      .nlal-dot.filled { background: #3b82f6; border-color: #3b82f6; }
      .nlal-dot.error { background: #ef4444; border-color: #ef4444; }
      .nlal-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 260px; margin: 0 auto; }
      .nlal-key { padding: 16px 0; border-radius: 14px; background: #f1f5f9; border: none;
        font-size: 20px; font-weight: 600; color: #0f172a; cursor: pointer; }
      html.dark .nlal-key { background: #1e293b; color: #f8fafc; }
      .nlal-key:active { background: #e2e8f0; }
      html.dark .nlal-key:active { background: #334155; }
      .nlal-key.ghost { background: transparent; }
      .nlal-key.ghost:active { background: transparent; }
      .nlal-msg { font-size: 12.5px; color: #ef4444; min-height: 18px; margin-bottom: 12px; }
      .nlal-links { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
      .nlal-link-btn { font-size: 13px; color: #3b82f6; font-weight: 500; background: none; border: none; cursor: pointer; }
      .nlal-link-btn.muted { color: #94a3b8; }
      .nlal-biometric-btn { margin: 0 auto 6px; width: 56px; height: 56px; border-radius: 50%;
        background: #eff6ff; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
      html.dark .nlal-biometric-btn { background: rgba(59,130,246,0.15); }
      .nlal-bio-hint { font-size: 11.5px; color: #3b82f6; font-weight: 500; margin-bottom: 16px; }
      .nlal-input { width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 12px;
        font-size: 14px; margin-bottom: 8px; }
      html.dark .nlal-input { background: #1e293b; border-color: rgba(255,255,255,0.08); color: #f8fafc; }
      .nlal-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
      .nlal-divider::before, .nlal-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
      html.dark .nlal-divider::before, html.dark .nlal-divider::after { background: rgba(255,255,255,0.08); }
      .nlal-divider span { font-size: 11px; color: #94a3b8; }
      .nlal-gbtn-wrap { display: flex; justify-content: center; margin-bottom: 4px; min-height: 40px; }
    `;
    document.head.appendChild(style);
  }

  function icon(name, cls) {
    return `<i data-lucide="${name}" class="${cls || 'w-6 h-6 text-blue-500'}"></i>`;
  }

  // ---------------- Google Identity Services loader ----------------
  let gsiLoadPromise = null;
  function loadGoogleIdentity() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      return Promise.resolve();
    }
    if (gsiLoadPromise) return gsiLoadPromise;
    gsiLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
        if (window.google && window.google.accounts && window.google.accounts.id) resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
    return gsiLoadPromise;
  }

  // ---------------- WebAuthn helpers ----------------

  function webauthnSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials);
  }

  function hasRegisteredBiometric() {
    return localStorage.getItem(LS_WEBAUTHN_USER) === state.userId
      && !!localStorage.getItem(LS_WEBAUTHN_CRED);
  }

  function b64urlToBuf(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf;
  }
  function bufToB64url(buf) {
    let str = '';
    new Uint8Array(buf).forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function registerBiometric() {
    if (!webauthnSupported()) throw new Error('Biometric unlock is not supported on this device.');
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBuf = new TextEncoder().encode(state.userId);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Netlink.bio' },
        user: { id: userIdBuf, name: state.userEmail || 'user', displayName: state.userEmail || 'Netlink user' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    });
    if (!cred) throw new Error('Biometric registration was cancelled.');
    localStorage.setItem(LS_WEBAUTHN_CRED, bufToB64url(cred.rawId));
    localStorage.setItem(LS_WEBAUTHN_USER, state.userId);
  }

  async function verifyBiometric() {
    const credId = localStorage.getItem(LS_WEBAUTHN_CRED);
    if (!credId) throw new Error('No biometric registered.');
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64urlToBuf(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (!assertion) throw new Error('Biometric verification failed.');
    return true;
  }

  function removeBiometric() {
    localStorage.removeItem(LS_WEBAUTHN_CRED);
    localStorage.removeItem(LS_WEBAUTHN_USER);
  }

  // ---------------- Session-state helpers ----------------

  function markUnlocked() {
    sessionStorage.setItem(SS_UNLOCKED_AT, String(Date.now()));
    sessionStorage.removeItem(SS_HIDDEN_AT);
  }

  function clearLockSession() {
    sessionStorage.removeItem(SS_UNLOCKED_AT);
    sessionStorage.removeItem(SS_HIDDEN_AT);
  }

  function needsPassiveLock() {
    const unlockedAt = sessionStorage.getItem(SS_UNLOCKED_AT);
    if (!unlockedAt) return true;
    const hiddenAt = sessionStorage.getItem(SS_HIDDEN_AT);
    if (hiddenAt && (Date.now() - Number(hiddenAt)) >= BG_LOCK_MS) return true;
    return false;
  }

  function wireBackgroundTimer() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        sessionStorage.setItem(SS_HIDDEN_AT, String(Date.now()));
      } else if (needsPassiveLock()) {
        showPassiveLock();
      }
    });
    window.addEventListener('pagehide', () => {
      sessionStorage.setItem(SS_HIDDEN_AT, String(Date.now()));
    });
  }

  // ---------------- Core: PIN pad renderer ----------------

  function mountPinPad(container, onComplete) {
    let digits = '';
    let errorFlash = false;

    function render() {
      const dotsHtml = Array.from({ length: 6 }).map((_, i) => {
        const filled = i < digits.length;
        const cls = errorFlash ? 'nlal-dot error' : (filled ? 'nlal-dot filled' : 'nlal-dot');
        return `<span class="${cls}"></span>`;
      }).join('');
      const dotsEl = container.querySelector('.nlal-dots');
      if (dotsEl) dotsEl.innerHTML = dotsHtml;
    }

    container.querySelectorAll('.nlal-key[data-digit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (digits.length >= 6) return;
        digits += btn.dataset.digit;
        render();
        if (digits.length === 6) {
          const finished = digits;
          digits = '';
          onComplete(finished);
        }
      });
    });
    const delBtn = container.querySelector('.nlal-key[data-action="del"]');
    if (delBtn) delBtn.addEventListener('click', () => { digits = digits.slice(0, -1); render(); });

    render();

    return {
      reset() { digits = ''; errorFlash = false; render(); },
      flashError() {
        errorFlash = true; render();
        setTimeout(() => { errorFlash = false; digits = ''; render(); }, 400);
      },
    };
  }

  function keypadHtml(showBiometric) {
    const cornerSlot = showBiometric
      ? `<button type="button" id="nlal-bio-btn" class="nlal-key ghost">${icon('fingerprint', 'w-6 h-6 text-blue-500 mx-auto')}</button>`
      : '<span></span>';
    return `
      <div class="nlal-keypad">
        ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="nlal-key" data-digit="${n}">${n}</button>`).join('')}
        ${cornerSlot}
        <button type="button" class="nlal-key" data-digit="0">0</button>
        <button type="button" class="nlal-key ghost" data-action="del">${icon('delete', 'w-5 h-5 text-slate-400 mx-auto')}</button>
      </div>
    `;
  }

  // ---------------- Setup flow (first-time PIN) ----------------

  function renderSetupScreen(onDone) {
    const overlay = document.getElementById('nlal-overlay');
    let stage = 'first';
    let firstPin = '';

    function paint() {
      overlay.innerHTML = `
        <div class="nlal-card">
          <div class="nlal-icon-wrap">${icon('shield-check')}</div>
          <p class="nlal-title">${stage === 'first' ? 'Set an app PIN' : 'Confirm your PIN'}</p>
          <p class="nlal-subtitle">${stage === 'first' ? 'Choose a 6-digit PIN to protect your account.' : 'Enter it once more to confirm.'}</p>
          <div class="nlal-dots"></div>
          <p class="nlal-msg" id="nlal-msg"></p>
          ${keypadHtml()}
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      const pad = mountPinPad(overlay, async (pin) => {
        if (stage === 'first') {
          firstPin = pin;
          stage = 'confirm';
          paint();
          return;
        }
        if (pin !== firstPin) {
          document.getElementById('nlal-msg').textContent = "PINs don't match — try again.";
          pad.flashError();
          stage = 'first';
          setTimeout(paint, 450);
          return;
        }
        try {
          const { error } = await state.supabaseClient.rpc('set_app_pin', { p_pin: pin });
          if (error) throw error;
          markUnlocked();
          onDone();
        } catch (err) {
          console.error('set_app_pin failed:', err);
          document.getElementById('nlal-msg').textContent = 'Could not save your PIN. Please try again.';
          stage = 'first';
          setTimeout(paint, 900);
        }
      });
    }
    paint();
  }

  // ---------------- Verify flow (unlock) ----------------

  function renderVerifyScreen(overlay, onSuccess, { allowForgot = true } = {}) {
    function paint(lockedMsg) {
      const showBiometric = hasRegisteredBiometric();
      overlay.innerHTML = `
        <div class="nlal-card">
          <div class="nlal-icon-wrap">${icon('lock')}</div>
          <p class="nlal-title">Enter your PIN</p>
          <p class="nlal-subtitle">Verify it's you to continue.</p>
          <div class="nlal-dots"></div>
          <p class="nlal-msg" id="nlal-msg">${lockedMsg || ''}</p>
          ${keypadHtml(showBiometric)}
          <div class="nlal-links">
            ${allowForgot ? `<button type="button" id="nlal-forgot-btn" class="nlal-link-btn">Forgot PIN?</button>` : ''}
            <button type="button" id="nlal-logout-btn" class="nlal-link-btn muted">Log out</button>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      const pad = mountPinPad(overlay, async (pin) => {
        try {
          const { data, error } = await state.supabaseClient.rpc('verify_app_pin', { p_pin: pin });
          if (error) throw error;
          if (data === true) { onSuccess(); return; }
          document.getElementById('nlal-msg').textContent = 'Incorrect PIN.';
          pad.flashError();
        } catch (err) {
          console.error('verify_app_pin error:', err);
          const msg = /Locked\. Try again/i.test(err.message || '')
            ? 'Too many attempts. Please wait before trying again.'
            : 'Could not verify PIN. Please try again.';
          document.getElementById('nlal-msg').textContent = msg;
          pad.flashError();
        }
      });

      const bioBtn = document.getElementById('nlal-bio-btn');
      if (bioBtn) {
        bioBtn.addEventListener('click', async () => {
          try {
            await verifyBiometric();
            onSuccess();
          } catch (err) {
            console.error('Biometric unlock failed:', err);
            document.getElementById('nlal-msg').textContent = 'Biometric unlock failed. Use your PIN instead.';
          }
        });
      }

      const forgotBtn = document.getElementById('nlal-forgot-btn');
      if (forgotBtn) forgotBtn.addEventListener('click', renderForgotPinFlow);

      document.getElementById('nlal-logout-btn').addEventListener('click', async () => {
        clearLockSession();
        if (state.supabaseClient) await state.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
      });
    }

    async function renderForgotPinFlow() {
      overlay.innerHTML = `
        <div class="nlal-card">
          <div class="nlal-icon-wrap">${icon('key-round')}</div>
          <p class="nlal-title">Reset your PIN</p>
          <p class="nlal-subtitle">Verify your identity to continue.</p>
          <div id="nlal-gbtn" class="nlal-gbtn-wrap"></div>
          <div class="nlal-divider"><span>OR USE PASSWORD</span></div>
          <input id="nlal-forgot-email" type="email" placeholder="Email" value="${state.userEmail || ''}" class="nlal-input" />
          <input id="nlal-forgot-pw" type="password" placeholder="Password" class="nlal-input" />
          <p class="nlal-msg" id="nlal-msg"></p>
          <button type="button" id="nlal-forgot-submit" class="w-full py-2.5 bg-blue-600 text-white font-medium rounded-xl text-sm mb-2">Continue with Password</button>
          <button type="button" id="nlal-forgot-back" class="nlal-link-btn muted">Back</button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();

      document.getElementById('nlal-forgot-back').addEventListener('click', () => paint());
      document.getElementById('nlal-forgot-submit').addEventListener('click', async () => {
        const email = document.getElementById('nlal-forgot-email').value.trim();
        const password = document.getElementById('nlal-forgot-pw').value;
        const msgEl = document.getElementById('nlal-msg');
        try {
          const { error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          renderResetPinFlow();
        } catch (err) {
          msgEl.textContent = 'Could not verify your password. Please try again.';
        }
      });

      try {
        await loadGoogleIdentity();
        const gbtnContainer = document.getElementById('nlal-gbtn');
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            const msgEl2 = document.getElementById('nlal-msg');
            try {
              const { error } = await state.supabaseClient.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
              });
              if (error) throw error;
              renderResetPinFlow();
            } catch (err) {
              console.error('Google reauth failed:', err);
              if (msgEl2) msgEl2.textContent = 'Could not verify your Google account. Please try again.';
            }
          },
        });
        google.accounts.id.renderButton(gbtnContainer, {
          theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width: 240,
        });
      } catch (err) {
        console.error('Google Identity failed to load:', err);
        const gbtnContainer = document.getElementById('nlal-gbtn');
        if (gbtnContainer) gbtnContainer.innerHTML = '<p class="text-xs text-slate-400">Google sign-in unavailable</p>';
      }
    }

    function renderResetPinFlow() {
      overlay.innerHTML = `<div class="nlal-card"><p class="nlal-title">Set a new PIN</p><p class="nlal-subtitle">Choose a new 6-digit PIN.</p><div class="nlal-dots"></div><p class="nlal-msg" id="nlal-msg"></p>${keypadHtml()}</div>`;
      const pad = mountPinPad(overlay, async (pin) => {
        try {
          const { error } = await state.supabaseClient.rpc('set_app_pin', { p_pin: pin });
          if (error) throw error;
          markUnlocked();
          onSuccess();
        } catch (err) {
          document.getElementById('nlal-msg').textContent = 'Could not save your new PIN.';
          pad.flashError();
        }
      });
    }

    paint();
  }

  // ---------------- Public entry points ----------------

  function ensureOverlay() {
    let el = document.getElementById('nlal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nlal-overlay';
      document.body.appendChild(el);
    }
    return el;
  }

  function showPassiveLock() {
    const overlay = ensureOverlay();
    overlay.style.display = 'flex';
    renderVerifyScreen(overlay, () => {
      markUnlocked();
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    });
  }

  async function checkAndShowLock() {
    const overlay = ensureOverlay();
    overlay.style.display = 'none';

    const { data: hasPin, error } = await state.supabaseClient.rpc('has_app_pin');
    if (error) { console.error('has_app_pin check failed:', error); return; }

    if (!hasPin) {
      overlay.style.display = 'flex';
      renderSetupScreen(() => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      });
      return;
    }

    if (needsPassiveLock()) {
      overlay.style.display = 'flex';
      renderVerifyScreen(overlay, () => {
        markUnlocked();
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      });
    }
  }

  function requireAppLock(reasonLabel) {
    return new Promise((resolve) => {
      let modalOverlay = document.getElementById('nlal-modal-overlay');
      if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'nlal-modal-overlay';
        document.body.appendChild(modalOverlay);
      }
      modalOverlay.style.display = 'flex';
      renderVerifyScreen(modalOverlay, () => {
        modalOverlay.style.display = 'none';
        modalOverlay.innerHTML = '';
        resolve(true);
      }, { allowForgot: true });
    });
  }

  function init(options) {
    state = { ...state, ...options };
    injectStyles();
    ensureOverlay();
    wireBackgroundTimer();
    checkAndShowLock();
  }

  window.NetlinkAppLock = {
    init,
    requireAppLock,
    registerBiometric,
    hasRegisteredBiometric,
    webauthnSupported,
    clearLockSession,
    removeBiometric,
  };
})();
