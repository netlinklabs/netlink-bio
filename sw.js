self.addEventListener('install', (e) => {
    console.log('[Netlink Service Worker] Installed');
});

// Wajib ada fungsi fetch agar diakui sebagai PWA oleh Google Chrome
self.addEventListener('fetch', (e) => {
    // Saat ini dibiarkan kosong, cukup untuk syarat PWA
});
