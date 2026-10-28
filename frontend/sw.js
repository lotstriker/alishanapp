/* ============================================================
   sw.js - the service worker: lets the app open and work WITHOUT internet.

   * The app's own files (pages, styles, scripts, qualities.json ...) are fetched from the server when you are
     online (so an updated file always arrives) and a copy is kept; offline, the kept copy is used.
   * The libraries from the internet (Excel export, charts, photo crop) are kept the first time they are
     downloaded and used from then on. Put them in the vendor/ folder to have them from the very first start.
   * Your data (entries, payments, backups) is not touched: it lives in the browser database, not here.
   ============================================================ */
const VERSION = 'v1';                       // change this only if files are renamed or removed
const APP_CACHE = 'alishan-app-' + VERSION;
const LIB_CACHE = 'alishan-libs-v1';        // the library URLs contain their version, so this never goes stale

const APP_FILES = [
    "aging.css",
    "bulk-import.css",
    "bulk-import.js",
    "calc.js",
    "colors.json",
    "dashboard.css",
    "dashboard.js",
    "db.js",
    "icons.js",
    "index.html",
    "inventory.css",
    "inventory.html",
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
    "script.js",
    "search.css",
    "search.js",
    "setting.css",
    "setting.html",
    "store.js",
    "theme-boot.js",
    "theme-manager.js",
    "themes.css",
    "ui.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png"
];
const OPTIONAL_FILES = ["vendor/xlsx.full.min.js", "vendor/chart.umd.js", "vendor/cropper.min.js", "vendor/cropper.min.css"];   // only used if the files exist
const LIB_URLS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css'
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
