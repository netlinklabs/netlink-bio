// shared/nav.js
// Single source of truth for: header (avatar + name), bottom nav (5 tabs),
// and the Account sheet. Include this + shared/account-menu.js on every
// page except page-builder.html (full-screen editor, has its own chrome).
//
// Usage (after auth resolves and profile is loaded):
//   NetlinkNav.init({
//     activePage: 'pay',            // 'dashboard' | 'pay' | 'activity' | 'account' | null
//     profile: currentProfile,      // { display_name, username, avatar_url, tier, net_id, local_currency }
//     supabaseClient: supabaseClient,
//     userId: currentUser.id,
//     unreadCount: 0,               // optional, shows a dot on the Activity tab
//     onLogout: async () => {...},  // optional override; default = signOut + redirect login.html
//   });

(function () {
  const BOTTOM_NAV_ITEMS = [
    { key: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard', href: 'dashboard.html' },
    { key: 'pagebuilder', icon: 'layout-template', label: 'Page', href: 'dashboard.html#landingPageCard' },
    { key: 'pay', icon: 'wallet', label: 'Pay', href: 'pay.html' },
    { key: 'activity', icon: 'history', label: 'Activity', href: 'tx.html' },
    { key: 'account', icon: 'user-round', label: 'Account', href: null }, // opens sheet, not a page
  ];

  let state = {
    activePage: null,
    profile: null,
    supabaseClient: null,
    userId: null,
    unreadCount: 0,
    onLogout: null,
    localCurrencyDirty: false,
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatNetId(rawId) {
    if (!rawId) return 'NET-00000-00000';
    const digits = String(rawId).replace(/^NET/i, '').replace(/-/g, '');
    if (digits.length !== 10) return String(rawId);
    return 'NET-' + digits.slice(0, 5) + '-' + digits.slice(5);
  }

  function toast(message) {
    if (typeof window.showToast === 'function') { window.showToast(message); return; }
    // Minimal fallback if a page hasn't defined showToast() itself.
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;z-index:80;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function injectStyles() {
    if (document.getElementById('nlnav-styles')) return;
    const style = document.createElement('style');
    style.id = 'nlnav-styles';
    style.textContent = `
      #nlnav-header { position: fixed; top: 0; left: 0; right: 0; height: 72px; z-index: 30;
        background: #ffffff; border-bottom: 1px solid rgba(0,0,0,0.06);
        display: flex; align-items: center; padding: 0 16px; gap: 10px; }
      html.dark #nlnav-header { background: #0f172a; border-color: rgba(255,255,255,0.06); }
      #nlnav-bottom { position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
        background: #ffffff; border-top: 1px solid rgba(0,0,0,0.06);
        display: flex; padding-bottom: max(10px, env(safe-area-inset-bottom, 0px)); }
      html.dark #nlnav-bottom { background: #0f172a; border-color: rgba(255,255,255,0.06); }
      #nlnav-bottom button { flex: 1; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 4px; padding: 12px 4px 6px; background: none; border: none;
        cursor: pointer; color: #94a3b8; font-size: 11.5px; font-weight: 500; position: relative; }
      #nlnav-bottom button.active { color: #3b82f6; }
      #nlnav-bottom .nlnav-dot { position: absolute; top: 7px; right: 26%; width: 8px; height: 8px;
        border-radius: 50%; background: #ef4444; border: 2px solid #ffffff; }
      html.dark #nlnav-bottom .nlnav-dot { border-color: #0f172a; }
      body { padding-top: 72px; padding-bottom: 82px; }

      #nlnav-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 70;
        opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }
      #nlnav-overlay.active { opacity: 1; pointer-events: auto; }
      #nlnav-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 71; max-height: 85vh;
        background: #ffffff; border-radius: 20px 20px 0 0; transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); overflow-y: auto; }
      html.dark #nlnav-sheet { background: #1e293b; }
      #nlnav-sheet.active { transform: translateY(0); }
      #nlnav-sheet-handle { width: 36px; height: 4px; border-radius: 99px; background: #e2e8f0;
        margin: 10px auto 4px; }
      html.dark #nlnav-sheet-handle { background: #334155; }
    `;
    document.head.appendChild(style);
  }

  function initialsFor(profile) {
    const label = profile?.display_name || profile?.username || '?';
    return label.charAt(0).toUpperCase();
  }

  const TIER_ACCENT = {
    basic: 'text-slate-500 dark:text-slate-400',
    silver: 'text-slate-500 dark:text-slate-300',
    gold: 'text-amber-600 dark:text-amber-400',
    platinum: 'text-purple-600 dark:text-purple-400',
  };

  function tierAccentClass(tier) {
    return TIER_ACCENT[(tier || 'basic').toLowerCase()] || TIER_ACCENT.basic;
  }

  // Verification fields (business_verified_at / identity_verified_at) are
  // optional on the profile object passed to init() -- only pages that
  // select them will show this part of the subtitle. Pages that don't
  // fetch these columns simply fall back to showing the tier alone.
  function verificationLabel(profile) {
    if (!profile) return null;
    if (profile.business_verified_at) return 'Verified Business';
    if (profile.identity_verified_at) return 'Verified Profile';
    return null;
  }

  function avatarHtml(profile, sizeClass) {
    if (profile?.avatar_url) {
      return `<img src="${escapeHtml(profile.avatar_url)}" class="${sizeClass} rounded-full object-cover" alt="">`;
    }
    return `<div class="${sizeClass} rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-semibold">${escapeHtml(initialsFor(profile))}</div>`;
  }

  function renderHeader() {
    let el = document.getElementById('nlnav-header');
    if (!el) {
      el = document.createElement('header');
      el.id = 'nlnav-header';
      document.body.prepend(el);
    }
    const p = state.profile || {};
    const label = p.display_name || p.username || 'Account';
    const tierKey = (p.tier || 'basic').toLowerCase();
    const tierLabel = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
    const verification = verificationLabel(p);
    const subtitle = `${tierLabel} Member` + (verification ? ` · ${verification} \u2705` : '');

    el.innerHTML = `
      <button type="button" id="nlnav-avatar-btn" class="flex items-center gap-3 flex-1 min-w-0 text-left">
        ${avatarHtml(p, 'w-12 h-12')}
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold text-slate-900 dark:text-slate-50 truncate">${escapeHtml(label)}</span>
          <span class="block text-xs font-medium truncate ${tierAccentClass(tierKey)}">${escapeHtml(subtitle)}</span>
        </span>
      </button>
      <img src="https://raw.githubusercontent.com/netlinklabs/netlink-pay/refs/heads/main/asset/netlinkpay-icon.png" alt="Netlink Pay" class="w-9 h-9 rounded-[7px] object-cover flex-shrink-0">
    `;
    document.getElementById('nlnav-avatar-btn').addEventListener('click', openAccountSheet);
  }

  function renderBottomNav() {
    let el = document.getElementById('nlnav-bottom');
    if (!el) {
      el = document.createElement('nav');
      el.id = 'nlnav-bottom';
      document.body.appendChild(el);
    }
    el.innerHTML = BOTTOM_NAV_ITEMS.map((item) => {
      const isActive = state.activePage === item.key;
      const showDot = item.key === 'activity' && state.unreadCount > 0;
      return `
        <button type="button" data-key="${item.key}" class="${isActive ? 'active' : ''}">
          <span class="relative">
            <i data-lucide="${item.icon}" class="w-5 h-5"></i>
            ${showDot ? '<span class="nlnav-dot"></span>' : ''}
          </span>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    }).join('');

    el.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === 'account') { openAccountSheet(); return; }
        const item = BOTTOM_NAV_ITEMS.find((i) => i.key === key);
        if (item?.href) window.location.href = item.href;
      });
    });
  }

  function renderMenuItemRow(item) {
    if (item.type === 'currency-select') {
      const current = state.profile?.local_currency || 'USD';
      const options = (window.NetlinkAccountMenu?.CURRENCY_OPTIONS || [])
        .map((c) => `<option value="${c.code}" ${c.code === current ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
        .join('');
      return `
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <i data-lucide="${item.icon}" class="w-4 h-4 text-slate-400"></i> ${escapeHtml(item.label)}
          </span>
          <select id="nlnav-currency-select" class="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[140px]">
            ${options}
          </select>
        </div>
      `;
    }

    const locked = !!item.locked;
    return `
      <button type="button" data-href="${locked ? '' : escapeHtml(item.href || '')}" data-locked="${locked}"
        class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${locked ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-white/5'} transition">
        <span class="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <i data-lucide="${item.icon}" class="w-4 h-4 text-slate-400"></i> ${escapeHtml(item.label)}
        </span>
        ${locked ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Soon</span>' : '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300"></i>'}
      </button>
    `;
  }

  function renderAccountSheet() {
    let overlay = document.getElementById('nlnav-overlay');
    let sheet = document.getElementById('nlnav-sheet');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'nlnav-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', closeAccountSheet);
    }
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'nlnav-sheet';
      document.body.appendChild(sheet);
    }

    const p = state.profile || {};
    const tierLabel = ((p.tier || 'basic').charAt(0).toUpperCase() + (p.tier || 'basic').slice(1));
    const groups = window.NetlinkAccountMenu?.ACCOUNT_MENU?.groups || [];

    const groupsHtml = groups.map((group) => `
      <div class="border-t border-slate-100 dark:border-white/5 pt-2 pb-1">
        <p class="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">${escapeHtml(group.title)}</p>
        ${group.items.map(renderMenuItemRow).join('')}
      </div>
    `).join('');

    sheet.innerHTML = `
      <div id="nlnav-sheet-handle"></div>
      <button type="button" id="nlnav-sheet-close" aria-label="Close" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition">
        <i data-lucide="x" class="w-[18px] h-[18px]"></i>
      </button>
      <div class="px-5 pt-2 pb-4 flex items-center gap-3">
        ${avatarHtml(p, 'w-14 h-14')}
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 dark:text-slate-50 truncate">${escapeHtml(p.display_name || p.username || 'Your Account')}</p>
          <p class="text-xs text-slate-500">@${escapeHtml(p.username || '—')} · ${escapeHtml(tierLabel)} Plan</p>
          <p class="text-xs text-slate-400 font-mono mt-0.5">${escapeHtml(formatNetId(p.net_id))}</p>
        </div>
      </div>
      ${groupsHtml}
      <div class="border-t border-slate-100 dark:border-white/5 flex items-center justify-between px-4 py-3">
        <button type="button" id="nlnav-theme-btn" class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <i data-lucide="moon" class="w-4 h-4"></i> <span id="nlnav-theme-label">Dark Mode</span>
        </button>
        <button type="button" id="nlnav-logout-btn" class="flex items-center gap-2 text-sm text-red-500 font-medium">
          <i data-lucide="log-out" class="w-4 h-4"></i> Logout
        </button>
      </div>
      <p class="text-center text-[11px] text-slate-400 py-4">Developed by Netlink Labs</p>
    `;

    // Wire item clicks
    sheet.querySelectorAll('button[data-href]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.locked === 'true') { toast('Coming soon'); return; }
        const href = btn.dataset.href;
        if (href) window.location.href = href;
      });
    });

    // Currency select
    const currencySelect = document.getElementById('nlnav-currency-select');
    if (currencySelect) {
      currencySelect.addEventListener('change', async () => {
        const value = currencySelect.value;
        if (state.profile) state.profile.local_currency = value;
        if (state.supabaseClient && state.userId) {
          const { error } = await state.supabaseClient
            .from('profiles').update({ local_currency: value }).eq('id', state.userId);
          if (error) { console.error(error); toast('Failed to save currency'); return; }
        }
        toast(`Local currency set to ${value}`);
        window.dispatchEvent(new CustomEvent('netlink:local-currency-changed', { detail: { currency: value } }));
      });
    }

    // Close button
    document.getElementById('nlnav-sheet-close').addEventListener('click', closeAccountSheet);

    // Theme toggle
    document.getElementById('nlnav-theme-btn').addEventListener('click', toggleTheme);
    updateThemeLabel();

    // Logout
    document.getElementById('nlnav-logout-btn').addEventListener('click', async () => {
      if (typeof state.onLogout === 'function') { await state.onLogout(); return; }
      if (state.supabaseClient) await state.supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    if (window.lucide) lucide.createIcons();
  }

  function updateThemeLabel() {
    const labelEl = document.getElementById('nlnav-theme-label');
    if (!labelEl) return;
    const isDark = document.documentElement.classList.contains('dark');
    labelEl.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    applyTheme(isDark ? 'light' : 'dark', true);
    updateThemeLabel();
  }

  function applyTheme(theme, save) {
    const html = document.documentElement;
    if (theme === 'dark') { html.classList.add('dark'); html.classList.remove('light'); }
    else { html.classList.remove('dark'); html.classList.add('light'); }
    if (save) localStorage.setItem('theme', theme);
  }

  function initTheme() {
    applyTheme(localStorage.getItem('theme') || 'light', false);
  }

  function openAccountSheet() {
    renderAccountSheet();
    document.getElementById('nlnav-overlay').classList.add('active');
    document.getElementById('nlnav-sheet').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeAccountSheet() {
    const overlay = document.getElementById('nlnav-overlay');
    const sheet = document.getElementById('nlnav-sheet');
    if (overlay) overlay.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    document.body.style.overflow = '';
  }

  function init(options) {
    state = { ...state, ...options };
    injectStyles();
    initTheme();
    renderHeader();
    renderBottomNav();
    if (window.lucide) lucide.createIcons();
  }

  window.NetlinkNav = { init, openAccountSheet, closeAccountSheet };
})();
