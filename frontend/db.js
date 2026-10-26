/* ============================================================
   db.js — SINGLE source of truth for all Alishan app data.
   Every page (index/inventory/report/setting) loads this file
   BEFORE its own script, and reads/writes go through AlishanDB
   instead of talking to localStorage directly.

   Storage: IndexedDB, per the locked architecture decision —
   9 object stores: inventory, payments, qualities, colors,
   settings, searchAnalytics, users, editHistory, auditLog.

   Why IndexedDB now, API later: every method here is async and
   named the way a REST call would be (getInventory/saveInventory,
   getSetting/setSetting, etc). When a real backend exists, only
   the *insides* of these methods change to fetch() calls — no
   page's own script needs to change, because they only ever
   talk to AlishanDB, never to storage directly. That's the
   "single source of truth" the data itself flows through.

   One-time migration: on first load in a browser that already
   has data in the old localStorage keys, that data is copied
   into IndexedDB automatically so nothing is lost.
   ============================================================ */

var AlishanDB = (() => {
    const DB_NAME = 'AlishanDB';
    const DB_VERSION = 1;
    const STORES = [
        'inventory', 'payments', 'qualities', 'colors', 'settings',
        'searchAnalytics', 'users', 'editHistory', 'auditLog'
    ];

    let dbPromise = null;

    // Tells other open tabs/pages when inventory/payments changed, so a
    // stale tab can reload instead of overwriting newer data on its next save.
    const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('alishan-db') : null;
    const listeners = {};
    function notify(store) {
        if (channel) { try { channel.postMessage({ store }); } catch (e) { /* ignore */ } }
    }
    if (channel) {
        channel.onmessage = (ev) => {
            const store = ev.data && ev.data.store;
            (listeners[store] || []).forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
        };
    }

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                STORES.forEach(name => {
                    if (!db.objectStoreNames.contains(name)) {
                        const keyPath = (name === 'settings') ? 'key' : 'id';
                        db.createObjectStore(name, { keyPath });
                    }
                });
            };

            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => { dbPromise = null; reject(e.target.error); };
            req.onblocked = () => console.warn('AlishanDB: upgrade blocked by another open tab');
        });
        return dbPromise;
    }

    function getAll(store) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        }));
    }

    function get(store, key) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }));
    }

    function put(store, value) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value);
            tx.oncomplete = () => { notify(store); resolve(true); };
            tx.onerror = () => reject(tx.error);
        }));
    }

    // Overwrites the WHOLE store with `items` — matches the pattern
    // the app already used with localStorage (save the entire array
    // back every time), just now backed by IndexedDB.
    function putAll(store, items) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const os = tx.objectStore(store);
            os.clear();
            (items || []).forEach(item => os.put(item));
            tx.oncomplete = () => { notify(store); resolve(true); };
            tx.onerror = () => reject(tx.error);
        }));
    }

    function remove(store, key) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key);
            tx.oncomplete = () => { notify(store); resolve(true); };
            tx.onerror = () => reject(tx.error);
        }));
    }

    // inventory + payments in ONE transaction: either both are written or neither.
    // replace = true  -> both stores are cleared first and then filled (undo / restore)
    // replace = false -> the records are only added / overwritten by id (bulk import)
    function writeInventoryAndPayments(invItems, payItems, replace) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(['inventory', 'payments'], 'readwrite');
            const inv = tx.objectStore('inventory');
            const pay = tx.objectStore('payments');
            if (replace) { inv.clear(); pay.clear(); }
            (invItems || []).forEach(item => inv.put(item));
            (payItems || []).forEach(item => pay.put(item));
            tx.oncomplete = () => { notify('inventory'); notify('payments'); resolve(true); };
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Transaction aborted: nothing was saved'));
        }));
    }

    // ---- one-time migration from the old scattered localStorage keys ----
    async function migrateFromLocalStorage() {
        if (localStorage.getItem('alishan_db_migrated')) return;

        try {
            const inv = localStorage.getItem('inventoryItems');
            if (inv) {
                const items = JSON.parse(inv);
                if (Array.isArray(items) && items.length && (await getAll('inventory')).length === 0) {
                    await putAll('inventory', items);
                }
            }
        } catch (e) {
            console.error('AlishanDB: inventory migration failed', e);
        }

        try {
            const pay = localStorage.getItem('amountReceived');
            if (pay) {
                const items = JSON.parse(pay);
                if (Array.isArray(items) && items.length && (await getAll('payments')).length === 0) {
                    await putAll('payments', items);
                }
            }
        } catch (e) {
            console.error('AlishanDB: payments migration failed', e);
        }

        // Everything settings-shaped collapses into the single
        // `settings` store as { key, value } rows — one place,
        // one shape, instead of a dozen separate localStorage keys.
        const settingKeys = [
            'appSettings', 'completeSettings', 'appearanceSettings',
            'notificationSettings', 'securitySettings', 'businessLogo',
            'selectedTheme', 'autoBackupEnabled', 'backupFrequency',
            'lastBackupDate', 'backups', 'searchAnalytics', 'searchHistory'
        ];
        for (const k of settingKeys) {
            try {
                const raw = localStorage.getItem(k);
                if (raw === null) continue;
                let value = raw;
                try { value = JSON.parse(raw); } catch (e) { /* plain string value */ }
                await put('settings', { key: k, value });
            } catch (e) {
                console.error(`AlishanDB: migration of "${k}" failed`, e);
            }
        }

        localStorage.setItem('alishan_db_migrated', 'true');
    }

    return {
        // Call once per page, before reading any data (e.g. in
        // DOMContentLoaded / initPage / initApp). Safe to call
        // multiple times — later calls just resolve immediately.
        async init() {
            await openDB();
            await migrateFromLocalStorage();
        },

        // ---- Inventory (the core business data) ----
        async getInventory() {
            return getAll('inventory');
        },
        async saveInventory(items) {
            return putAll('inventory', items);          // replaces everything (import / repair)
        },
        // ONE record: far faster than rewriting all of them on every small change
        async saveInventoryItem(item) {
            return put('inventory', item);
        },
        async deleteInventoryItem(id) {
            return remove('inventory', id);
        },

        // ---- Payments (amount-received records) ----
        async getPayments() {
            return getAll('payments');
        },
        async savePayments(items) {
            return putAll('payments', items);
        },
        // bulk import: adds the new entries AND their payments in ONE transaction (all or nothing)
        async addInventoryAndPayments(items, payments) {
            return writeInventoryAndPayments(items, payments, false);
        },
        // undo import / restore a backup: replaces both stores in ONE transaction (all or nothing)
        async replaceInventoryAndPayments(items, payments) {
            return writeInventoryAndPayments(items, payments, true);
        },

        // ---- Generic settings key/value (single settings store) ----
        async getSetting(key, fallback = null) {
            const row = await get('settings', key);
            return row ? row.value : fallback;
        },
        async setSetting(key, value) {
            return put('settings', { key, value });
        },
        async removeSetting(key) {
            return remove('settings', key);
        },

        // ---- Convenience wrappers used by the app today ----
        async getSearchAnalytics(fallback = {}) {
            return this.getSetting('searchAnalytics', fallback);
        },
        async saveSearchAnalytics(data) {
            return this.setSetting('searchAnalytics', data);
        },
        async getSearchHistory(fallback = []) {
            return this.getSetting('searchHistory', fallback);
        },
        async saveSearchHistory(data) {
            return this.setSetting('searchHistory', data);
        },
        async getTheme(fallback = 'light-default') {
            return this.getSetting('selectedTheme', fallback);
        },
        async setTheme(value) {
            return this.setSetting('selectedTheme', value);
        },

        // ---- Activity log (feeds the dashboard's Recent Activity) ----
        async logActivity(type, text) {
            const now = Date.now();
            await put('editHistory', { id: now * 1000 + Math.floor(Math.random() * 1000), type, text, at: new Date(now).toISOString() });
            // keep it small: only the newest 200 entries
            const all = await getAll('editHistory');
            if (all.length > 200) {
                all.sort((a, b) => a.id - b.id);
                for (const old of all.slice(0, all.length - 200)) await remove('editHistory', old.id);
            }
        },
        async getRecentActivity(limit = 5) {
            const all = await getAll('editHistory');
            return all.sort((a, b) => b.id - a.id).slice(0, limit);
        },

        // ---- Cross-tab change notifications: AlishanDB.onChange('inventory', cb) ----
        onChange(store, cb) {
            (listeners[store] = listeners[store] || []).push(cb);
        },

        // ---- Direct store access, for qualities/colors/users/etc.
        // if/when those move off static JSON files too ----
        getAll,
        get,
        put,
        putAll,
        remove
    };
})();

window.AlishanDB = AlishanDB;

/* ------------------------------------------------------------
   Startup safety net (used by the other files).

   AlishanHas(needed)            sync  -> true when every global is already defined.
   AlishanRequire(needed, opt)   async -> makes sure the files are there:
        1. a file that did not load is requested again (up to 3 times, with a short wait)
           — this fixes a flaky server / network that drops a file now and then;
        2. if it still is not there, a clear message is shown on the page saying WHICH file;
        3. files in `needed` are essential (returns false -> the page stops);
           files in `opt` are optional (e.g. search): the message is shown but the
           rest of the app keeps working.
   Usage:  await AlishanRequire({ AlishanCalc: 'calc.js', ... }, { AlishanSearch: 'search.js' })
   ------------------------------------------------------------ */

// NOTE: the app's global objects are declared with `var` (not `const`): a file that is loaded a second time
// (when a first attempt failed) must be allowed to declare them again.
// the app files, in the order they must load (each one may use the ones above it)
var ALISHAN_FILES = [
    // [global name, file, globals it needs before it can load]
    ['AlishanDB', 'db.js', []],
    ['AlishanLoader', 'loader.js', []],
    ['AlishanCalc', 'calc.js', []],
    ['AlishanStore', 'store.js', ['AlishanDB', 'AlishanCalc']],
    ['AlishanSearch', 'search.js', ['AlishanStore', 'AlishanCalc']],
    ['ItemForm', 'item-form.js', ['AlishanCalc', 'AlishanStore']],
    ['ItemCard', 'item-card.js', []],
    ['ItemModal', 'item-modal.js', []],
    ['BulkImport', 'bulk-import.js', ['AlishanStore', 'AlishanCalc', 'ItemForm']]
];

function AlishanHas(needed) {
    return Object.keys(needed).every(name => {
        try { return typeof eval(name) !== 'undefined'; } catch (e) { return false; }
    });
}

function alishanLoadScript(file, attempt) {
    return new Promise(resolve => {
        const s = document.createElement('script');
        s.src = attempt > 0 ? `${file}?retry=${attempt}&t=${Date.now()}` : file;   // later tries skip the browser cache
        s.onload = () => resolve(true);
        s.onerror = () => { s.remove(); resolve(false); };
        document.head.appendChild(s);
    });
}

async function AlishanRequire(needed, optional = {}) {
    const wanted = { ...needed, ...optional };

    // load whatever is missing, in the right order, trying each file up to 3 times
    for (const [name, file, needs] of ALISHAN_FILES) {
        if (!(name in wanted) || AlishanHas({ [name]: 1 })) continue;
        // a file that needs another file which is still missing cannot work: do not waste tries on it
        if (needs.some(n => !AlishanHas({ [n]: 1 }))) continue;
        for (let attempt = 0; attempt < 3 && !AlishanHas({ [name]: 1 }); attempt++) {
            await alishanLoadScript(file, attempt);
            if (!AlishanHas({ [name]: 1 }) && attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        }
    }

    const missing = Object.keys(wanted).filter(name => !AlishanHas({ [name]: 1 }));
    if (missing.length === 0) return true;

    const essential = missing.filter(name => name in needed);
    const files = [...new Set(missing.map(n => wanted[n]))];
    const show = () => {
        if (document.getElementById('alishan-missing-files')) return;
        const bar = document.createElement('div');
        bar.id = 'alishan-missing-files';
        const red = essential.length > 0;
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px 18px;color:#fff;font:600 14px/1.5 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);background:' + (red ? '#b00020' : '#b36b00');
        bar.innerHTML = (red ? 'The app cannot start: ' : 'Part of the app is not available: ') +
            '<b>' + files.join(', ') + '</b> did not load (tried 3 times).' +
            (red ? '' : ' Everything else keeps working.') +
            '<br><span style="font-weight:400">Make sure the file is in the same folder as this page and the server is running, then press Ctrl+Shift+R. ' +
            '<button style="margin-left:8px;padding:2px 10px;border:0;border-radius:6px;cursor:pointer" onclick="this.parentNode.parentNode.remove()">Close</button></span>';
        document.body.appendChild(bar);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    console.error('App files did not load: ' + files.join(', '));
    return essential.length === 0;
}
