/* ============================================================
   sw.js - the service worker: lets the app open and work WITHOUT internet.

   * The app's own files (pages, styles, scripts, qualities.json ...) are fetched from the server when you are
     online (so an updated file always arrives) and a copy is kept; offline, the kept copy is used.
   * The libraries from the internet (Excel export, charts, photo crop) are kept the first time they are
     downloaded and used from then on. Put them in the vendor/ folder to have them from the very first start.
   * Your data (entries, payments, backups) is not touched: it lives in the browser database, not here.
   ============================================================ */
const VERSION = 'v20';                       // bump when cached app-shell assets change
const APP_CACHE = 'alishan-app-' + VERSION;
const LIB_CACHE = 'alishan-libs-v1';        // the library URLs contain their version, so this never goes stale

const APP_FILES = [
    "aging.css",
    "advanced-search.js",
    "bulk-import.css",
    "bulk-import.js",
    "calc.js",
    "common-pagination.js",
    "common-pagination.css",
    "colors.json",
    "dashboard.css",
    "dashboard.js",
    "export-center.js",
    "export-center.css",
    "db.js",
    "icons.js",
    "index.html",
    "audit-pages.js",
    "quality-history.html",
    "missing-lot.html",
    "missing-completion.html",
    "pending-amount.html",
    "inventory.css",
    "add-entry.css",
    "inventory.html",
    "add-entry.html",
    "inventory.js",
    "item-card.css",
    "item-card.js",
    "item-form.css",
    "item-form.js",
    "item-modal.css",
    "item-modal.js",
    "loader.js",
    "manifest.webmanifest",
    "mobile.css",
    "nav.css",
    "nav.js",
    "pwa.js",
    "qualities.json",
    "reports.html",
    "reports.css",
    "responsive-layout.css",
    "report-engine.js",
    "report-views.js",
    "script.js",
    "settings-data-backup.js",
    "search.css",
    "search.js",
    "setting.css",
    "setting.html",
    "store.js",
    "theme-boot.js",
    "theme-manager.js",
    "themes.css",
    "ui.js",
    "user-guide.js",
    "guide-images/screen-01.jpg",
    "guide-images/screen-02.jpg",
    "guide-images/screen-03.jpg",
    "guide-images/screen-04.jpg",
    "guide-images/screen-05.jpg",
    "guide-images/screen-06.jpg",
    "guide-images/screen-07.jpg",
    "guide-images/screen-08.jpg",
    "guide-images/screen-09.jpg",
    "guide-images/screen-10.jpg",
    "guide-images/screen-11.jpg",
    "guide-images/screen-12.jpg",
    "guide-images/screen-13.jpg",
    "guide-images/screen-14.jpg",
    "guide-images/screen-15.jpg",
    "guide-images/screen-16.jpg",
    "guide-images/screen-17.jpg",
    "guide-images/screen-18.jpg",
    "guide-images/screen-19.jpg",
    "guide-images/screen-20.jpg",
    "guide-images/screen-21.jpg",
    "guide-images/screen-22.jpg",
    "guide-images/screen-23.jpg",
    "guide-images/screen-24.jpg",
    "guide-images/screen-25.jpg",
    "guide-images/screen-26.jpg",
    "guide-images/screen-27.jpg",
    "guide-images/screen-28.jpg",
    "guide-images/screen-29.jpg",
    "guide-images/screen-30.jpg",
    "guide-images/screen-31.jpg",
    "guide-images/screen-32.jpg",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png"
];
const OPTIONAL_FILES = ["vendor/xlsx.full.min.js", "vendor/chart.umd.js"];   // only used if the files exist
const LIB_URLS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const NETWORK_WAIT_MS = 4000;               // on a very slow connection the kept copy is used after this

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const app = await caches.open(APP_CACHE);
        await Promise.all(APP_FILES.concat(OPTIONAL_FILES).map(u => app.add(new Request(u, { cache: 'reload' })).catch(() => {})));
        const libs = await caches.open(LIB_CACHE);
        await Promise.all(LIB_URLS.map(async u => {
            try { if (!(await libs.match(u))) await libs.put(u, await fetch(u, { mode: 'no-cors' })); } catch (e) { /* offline now: fetched later */ }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith('alishan-app-') && name !== APP_CACHE) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
    else if (LIB_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
    // anything else (pictures from other sites) is left alone
});

async function networkFirst(req) {
    const cache = await caches.open(APP_CACHE);
    try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NETWORK_WAIT_MS))]);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') { const home = await cache.match('index.html'); if (home) return home; }
        throw err;
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(LIB_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
}
