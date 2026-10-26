/* ============================================================
   store.js — the connector between the pages, calc.js and db.js.

     page  ->  store.js  ->  calc.js   (all the working-out and rules)
                         ->  db.js     (saving / loading)

   It holds the current data in memory, asks calc.js to build / check /
   work out anything, saves the result with db.js, and tells every page
   (also in other tabs) that something changed.

   There is NO calculation in this file: every number, rule, filter and
   report row comes from AlishanCalc. Pages never touch db.js or keep a
   copy of the data — they ask the store and draw the answer.
   ============================================================ */

if (typeof AlishanHas === 'function' && !AlishanHas({ AlishanDB: 1, AlishanCalc: 1 })) { throw new Error('store.js: db.js / calc.js not loaded yet'); }

var AlishanStore = (() => {
    'use strict';

    const C = AlishanCalc;

    // ================= state (private — pages cannot touch it) =================
    let items = [];              // newest first
    let payments = [];           // payments of items that exist
    let orphanPayments = [];     // payments of deleted items: kept in storage, never shown
    let qualityData = { bra: {}, panty: {}, set: {}, blouse: {} };
    let colorData = { colors: [] };
    let priceMap = {};
    let referenceError = null;
    let damagedCount = 0;
    let initPromise = null;
    let autoBackupTimer = null;
    const listeners = new Set();

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }
    function emit(reason) {
        listeners.forEach(fn => { try { fn(reason); } catch (e) { console.error('Store listener failed:', e); } });
    }
    const fail = (error) => ({ ok: false, error });

    // ================= reference data: qualities.json + colors.json =================

    function buildPriceMap() {
        priceMap = {};
        Object.values(qualityData || {}).forEach(categories => {
            Object.values(categories).forEach(list => {
                list.forEach(q => {
                    const name = (q && typeof q === 'object') ? q.name : q;
                    const price = (q && typeof q === 'object') ? (parseFloat(q.price) || 0) : 0;
                    if (name) priceMap[name] = price;
                });
            });
        });
    }

    function getPrice(name) {
        if (name === undefined || name === null) return 0;
        return priceMap[name] || priceMap[String(name).toUpperCase()] || 0;
    }
    function getColorStyle(name) {
        if (!name) return null;
        return (colorData.colors || []).find(c => c.name.toUpperCase() === String(name).toUpperCase()) || null;
    }
    // a colour that is not in colors.json yet: neutral grey, so it can still be shown and edited
    function getColorStyleSafe(name) {
        const c = getColorStyle(name);
        if (c) return c;
        const n = String(name || '').toUpperCase();
        return { name: n, displayName: n, backgroundColor: '#e5e7eb', textColor: '#374151', borderColor: '#9ca3af', unknown: true };
    }
    function colorDisplayName(name) {
        const c = getColorStyle(name);
        return c ? c.displayName : name;
    }
    const ctx = () => ({
        items, priceOf: getPrice, colorLabel: colorDisplayName,
        productTypes: getProductTypes(),
        hasQuality: (name) => Object.prototype.hasOwnProperty.call(priceMap, name),
        hasColor: (name) => !!getColorStyle(name)
    });

    async function loadJSON(file) {
        const res = await fetch(file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // qualities.json and colors.json are fetched at the same time (not one after the other)
    async function loadReference() {
        const [q, c] = await Promise.allSettled([loadJSON('qualities.json'), loadJSON('colors.json')]);
        const problems = [];

        if (q.status === 'fulfilled') qualityData = q.value;
        else { console.error('Could not load qualities.json:', q.reason); qualityData = { bra: {}, panty: {}, set: {}, blouse: {} }; problems.push('qualities.json'); }
        buildPriceMap();

        if (c.status === 'fulfilled' && c.value.colors && Array.isArray(c.value.colors)) colorData = c.value;
        else { console.error('Could not load colors.json:', c.reason || 'Invalid color data format'); colorData = { colors: [] }; problems.push('colors.json'); }

        referenceError = problems.length
            ? `Could not load ${problems.join(' and ')} — open the app through a local web server (e.g. VS Code Live Server), not by double-clicking the file.`
            : null;
    }

    // ================= loading + saving (db.js) =================

    async function loadInventory(preloaded) {
        const raw = preloaded || await AlishanDB.getInventory();
        const { items: repaired, invalid, changed } = C.normalizeInventory(raw);
        const valid = [];
        const broken = [...invalid];
        repaired.forEach(it => (C.validateItem(it, true).ok ? valid : broken).push(it));

        let needSave = changed || broken.length > 0;
        if (broken.length) {
            try {
                const prev = await AlishanDB.getSetting('corruptedItemsBackup', []);
                const stamp = new Date().toISOString();
                await AlishanDB.setSetting('corruptedItemsBackup', [...prev, ...broken.map(item => ({ savedAt: stamp, item }))].slice(-200));
            } catch (e) { console.error('Could not back up damaged items:', e); }
        }
        if (C.backfillPrices(valid, getPrice)) needSave = true;

        valid.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
        items = valid;
        damagedCount = broken.length;
        if (needSave) {
            try { await AlishanDB.saveInventory(items); } catch (e) { console.error('Could not save repaired data:', e); }
        }
    }

    async function loadPayments(preloaded) {
        const all = preloaded || (await AlishanDB.getPayments()) || [];
        const ids = new Set(items.map(i => String(i.id)));
        payments = all.filter(p => ids.has(String(p.inventoryId)));
        orphanPayments = all.filter(p => !ids.has(String(p.inventoryId)));
    }

    const savePayments = () => AlishanDB.savePayments([...payments, ...orphanPayments]);

    function init() {
        if (initPromise) return initPromise;
        initPromise = (async () => {
            await AlishanDB.init();
            // everything is read at the same time (before: one after the other)
            const [, rawItems, rawPayments] = await Promise.all([
                loadReference(), AlishanDB.getInventory(), AlishanDB.getPayments()
            ]);
            await loadInventory(rawItems);
            await loadPayments(rawPayments);
            await loadAliases();

            // another tab / page changed something -> reload so nobody overwrites newer data
            AlishanDB.onChange('inventory', async () => { await loadInventory(); await loadPayments(); emit('external'); });
            AlishanDB.onChange('payments', async () => { await loadPayments(); emit('external'); });

            // the automatic backup copies the whole inventory: do it later, when the page is idle,
            // so it never delays the first screen
            const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
            later(() => startAutoBackup(), { timeout: 8000 });
            return { damaged: damagedCount, referenceError };
        })();
        return initPromise;
    }

    // ================= reading (all answers come from calc.js) =================

    const getItems = () => items.slice();
    const getItem = (id) => items.find(i => String(i.id) === String(id)) || null;
    const getPayments = () => payments.slice();
    const hasItems = () => items.length > 0;
    const itemCount = () => items.length;

    const query = (o) => C.filterItems(items, o);
    const summary = (list) => C.summarize(list || items, payments);
    const paginate = (list, page, size) => C.paginate(list, page, size);
    const typeStats = () => C.typeStats(items);
    const suggest = (text, limit) => C.suggest(items, text, limit);
    const lowStockItems = () => items.filter(C.isLowStock);
    const itemPayment = (item) => C.paymentStatus(item, payments);
    const qualityOptions = () => [...new Set(items.map(i => i.quality).filter(Boolean))].sort();

    // report data for a scope (a list of items the page got from query())
    const pendingList = (scope) => C.pendingList(scope, payments);
    const paymentCards = (scope) => C.paymentCards(scope, payments);
    const weekOptions = (scope) => C.weekOptions(scope, payments);
    const weeklyReport = (scope, weekKey) => C.weeklyReport(scope, payments, items, weekKey);
    const paymentHistory = (scope) => C.paymentHistory(scope, payments, items);
    const valuationTrend = (scope) => C.valuationTrend(scope);
    const qualitySummary = (scope) => C.qualitySummary(scope, payments);
    const agingReport = (scope) => C.agingReport(scope);
    const advancedPaymentSearch = (o) => C.advancedPaymentSearch(items, payments, o);
    const exportRows = (kind, scope) => C.exportRows(kind, scope || items, payments, items);

    const getQualityData = () => qualityData;
    const getColors = () => colorData.colors || [];
    const getReferenceError = () => referenceError;
    const getDamagedCount = () => damagedCount;

    // ================= changing entries: calc builds, db saves, pages are told =================

    function logActivity(type, text) {
        AlishanDB.logActivity(type, text).catch(() => { /* activity log is best-effort */ });
    }
    async function getRecentActivity(limit = 5) {
        try { return await AlishanDB.getRecentActivity(limit); } catch (e) { return []; }
    }

    async function addItem(input) {
        const built = C.buildNewItem(input, ctx());
        if (!built.ok) return built;
        const item = built.item;

        items.push(item);
        items.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
        try {
            await AlishanDB.saveInventoryItem(item);          // only this entry is written
        } catch (err) {
            console.error('Failed to save inventory:', err);
            items.splice(items.indexOf(item), 1);
            return fail('Could not save your changes! Please try again.');
        }
        const oldNote = item.isManualEntry ? ` — old entry dated ${C.fmtDate(item.dateTime)}` : '';
        logActivity('add', `Added ${item.quality} ${item.productType} (${item.code})${oldNote}`);
        emit('add');
        return built;
    }

    async function updateItem(id, input) {
        const idx = items.findIndex(i => String(i.id) === String(id));
        if (idx < 0) return fail('Item not found');

        const built = C.buildUpdatedItem(items[idx], input, ctx());
        if (!built.ok) return built;

        const backup = items.slice();
        items[idx] = built.item;
        if (built.dateChanged) items.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
        try {
            await AlishanDB.saveInventoryItem(built.item);    // only this entry is written
        } catch (err) {
            console.error('Failed to save inventory:', err);
            items = backup;
            return fail('Could not save your changes! Please try again.');
        }
        logActivity('edit', `Edited ${built.item.quality} ${built.item.productType} (${built.item.code})`);
        emit('edit');
        return built;
    }

    async function deleteItem(id) {
        const idx = items.findIndex(i => String(i.id) === String(id));
        if (idx < 0) return fail('Item not found');
        const backup = items.slice();
        const removed = items[idx];
        items.splice(idx, 1);
        try {
            await AlishanDB.deleteInventoryItem(removed.id);  // only this entry is removed
        } catch (err) {
            console.error('Failed to save inventory:', err);
            items = backup;
            return fail('Could not save your changes! Please try again.');
        }
        // its payments are kept (not shown) — they were never deleted from storage
        const moved = payments.filter(p => String(p.inventoryId) === String(removed.id));
        payments = payments.filter(p => String(p.inventoryId) !== String(removed.id));
        orphanPayments = orphanPayments.concat(moved);

        logActivity('delete', `Deleted ${removed.quality} ${removed.productType} (${removed.code})`);
        emit('delete');
        return { ok: true, item: removed, message: 'Item deleted successfully' };
    }

    // In Stock <-> Out of Stock (calc.js decides that out of stock leaves Aging)
    async function toggleStock(id) {
        const item = getItem(id);
        if (!item) return fail('Item not found');
        item.inStock = !item.inStock;
        try {
            await AlishanDB.saveInventoryItem(item);          // only this entry is written
        } catch (err) {
            console.error('Failed to save inventory:', err);
            item.inStock = !item.inStock;
            return fail('Could not save your changes! Please try again.');
        }
        logActivity('stock', `${item.quality} ${item.productType} marked ${item.inStock ? 'In Stock' : 'Out of Stock'}`);
        emit('stock');
        return { ok: true, item, message: `Item marked as ${item.inStock ? 'In Stock' : 'Out of Stock'}` };
    }

    // ================= payments =================

    async function addPayment(input) {
        const built = C.buildPayment(getItem(input.inventoryId), payments, input);
        if (!built.ok) return built;

        payments.push(built.entry);
        try {
            await savePayments();
        } catch (err) {
            console.error('Failed to save payments:', err);
            payments.pop();
            return fail('Could not save the payment! Please try again.');
        }
        emit('payment');
        return { ok: true, payment: built.entry, message: built.message };
    }

    async function deletePayment(id) {
        const idx = payments.findIndex(p => String(p.id) === String(id));
        if (idx < 0) return fail('Payment not found');
        const removed = payments.splice(idx, 1)[0];
        try {
            await savePayments();
        } catch (err) {
            console.error('Failed to save payments:', err);
            payments.splice(idx, 0, removed);
            return fail('Could not save the payment! Please try again.');
        }
        emit('payment');
        return { ok: true, message: 'Amount entry deleted successfully!' };
    }


    // ================= bulk import (AI JSON) with review =================
    // The Bulk Import page keeps the drafts the user is reviewing; every check, amount and rule
    // comes from calc.js, and only importEntries() writes anything.

    // Names the user told the importer earlier: "Gajri" is CARROT. Saved in the db, so the next
    // import already knows them. (Further aliases can be written in qualities.json / colors.json:
    // add  "aliases": ["gajri", "gajar"]  to a colour or a quality.)
    let importAliases = { color: {}, quality: {} };
    async function loadAliases() {
        try {
            const saved = await AlishanDB.getSetting('importAliases', null);
            if (saved && typeof saved === 'object') importAliases = { color: saved.color || {}, quality: saved.quality || {} };
        } catch (e) { console.error('Could not read saved names:', e); }
    }
    async function rememberAlias(kind, from, to) {
        const key = C.normKey(from);
        if (!key || !to || key === C.normKey(to)) return;
        importAliases[kind] = { ...(importAliases[kind] || {}), [key]: to };
        try { await AlishanDB.setSetting('importAliases', importAliases); } catch (e) { console.error(e); }
    }

    const getProductTypes = () => {
        const t = Object.keys(qualityData || {}).filter(k => Object.keys(qualityData[k] || {}).length).map(k => k.toUpperCase());
        return t.length ? t : C.PRODUCT_TYPES.slice();
    };

    // the app's own lists (qualities.json / colors.json) so the importer can match names, find the product type, ...
    function importRef() {
        const names = [];
        const typeOf = {};
        const qAlias = {};
        const cAlias = {};
        Object.keys(qualityData || {}).forEach(type => {
            Object.values(qualityData[type] || {}).forEach(list => list.forEach(q => {
                const n = (q && typeof q === 'object') ? q.name : q;
                names.push(n);
                typeOf[n] = type.toUpperCase();
                if (q && Array.isArray(q.aliases)) q.aliases.forEach(a => { qAlias[C.normKey(a)] = n; });
            }));
        });
        getColors().forEach(c => (c.aliases || []).forEach(a => { cAlias[C.normKey(a)] = c.name; }));
        Object.assign(qAlias, importAliases.quality || {});
        Object.assign(cAlias, importAliases.color || {});
        return {
            qualityNames: names,
            colorNames: getColors().map(c => c.name),
            productTypes: getProductTypes(),
            qualityAliases: qAlias,
            colorAliases: cAlias,
            typeOfQuality: (n) => {
                const exact = C.matchExact(n, names, qAlias);
                return typeOf[exact || n] || C.inferTypeFromNames(n, typeOf);
            }
        };
    }
    const parseBulk = (text, defaults) => C.parseBulkJson(text, defaults, importRef());
    // colours of the app that could replace an unknown colour: [{ name, displayName }]
    const closeColors = (name) => { const ref = importRef(); return C.nameSuggestions(name, ref.colorNames, ref.colorAliases).map(n => ({ name: n, displayName: colorDisplayName(n) })); };
    const typeOfQuality = (name) => importRef().typeOfQuality(name);
    // [{ name, price, type }] for "Did you mean ...?" buttons
    const closeQualities = (name) => {
        const ref = importRef();
        return C.nameSuggestions(name, ref.qualityNames, ref.qualityAliases).map(n => ({ name: n, price: getPrice(n), type: ref.typeOfQuality(n) }));
    };
    const checkImportDraft = (draft) => C.checkImportDraft(draft, ctx());
    const batchDuplicateIds = (checks) => C.batchDuplicateIds(checks);
    const importTotals = (checks) => C.importTotals(checks);

    function aiPrompt() {
        const byType = {};
        Object.keys(qualityData || {}).forEach(type => {
            const names = [];
            Object.values(qualityData[type] || {}).forEach(list => list.forEach(q => names.push((q && typeof q === 'object') ? q.name : q)));
            byType[type] = names;
        });
        return C.bulkPrompt(byType, getColors().map(c => c.name));
    }

    // old imports (so the user can undo one): [{ id, count, date }]
    function listImportBatches() {
        const map = new Map();
        items.forEach(i => {
            if (!i.importBatch) return;
            const b = map.get(i.importBatch) || { id: i.importBatch, count: 0, date: i.addedDateTime || i.dateTime };
            b.count += 1;
            map.set(i.importBatch, b);
        });
        return [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    // Saves the approved drafts as real entries (+ their payments). A safety copy is kept first.
    async function importEntries(drafts) {
        // one id per import (to the second); a number is added if that id is already used, so "Undo" never
        // removes the entries of two different imports together
        const baseId = 'IMP-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        let batchId = baseId;
        for (let n = 2; items.some(i => i.importBatch === batchId); n++) batchId = `${baseId}-${n}`;
        const built = C.buildImportEntries(drafts, ctx(), batchId);
        if (!built.ok) return built;

        try {
            if (items.length) await saveBackupToHistory('PRE_IMPORT_BACKUP');
            items = items.concat(built.items);
            items.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
            payments = payments.concat(built.payments);
            // entries + payments in ONE transaction: both are saved or neither (so "Nothing was changed" is true)
            await AlishanDB.addInventoryAndPayments(built.items, built.payments);
        } catch (err) {
            console.error('Bulk import failed:', err);
            await loadInventory();
            await loadPayments();
            emit('import');
            return fail('Could not save the imported entries. Nothing was changed.');
        }
        logActivity('add', `Imported ${built.items.length} old entries (${batchId})`);
        emit('import');
        return { ok: true, batchId, imported: built.items.length, payments: built.payments.length,
                 message: `Imported ${built.items.length} entries${built.payments.length ? ` and ${built.payments.length} payments` : ''}.` };
    }

    // removes everything one import added (entries and their payments)
    async function undoImport(batchId) {
        const removed = new Set(items.filter(i => i.importBatch === batchId).map(i => String(i.id)));
        if (removed.size === 0) return fail('Nothing found for this import.');
        try {
            if (items.length) await saveBackupToHistory('PRE_IMPORT_BACKUP');
            items = items.filter(i => i.importBatch !== batchId);
            const keep = (p) => p.importBatch !== batchId && !removed.has(String(p.inventoryId));
            payments = payments.filter(keep);
            orphanPayments = orphanPayments.filter(keep);
            await AlishanDB.replaceInventoryAndPayments(items, allPayments());   // ONE transaction
        } catch (err) {
            console.error('Undo import failed:', err);
            await loadInventory();
            await loadPayments();
            emit('import');
            return fail('Could not undo the import.');
        }
        logActivity('delete', `Undid import ${batchId} (${removed.size} entries)`);
        emit('import');
        return { ok: true, message: `Removed ${removed.size} entries of this import.` };
    }

    // ================= search history (saved in db.js) =================

    // Always read fresh from db.js: other pages / tabs add searches too, and a cached
    // copy here would overwrite theirs.
    const getSearchHistory = async () => (await AlishanDB.getSearchHistory([])).slice();
    const getSearchAnalytics = async () => ({ ...(await AlishanDB.getSearchAnalytics({})) });

    async function recordSearch(text, type = 'search') {
        const q = String(text || '').trim();
        if (!q) return;
        try {
            const history = await getSearchHistory();
            const analytics = await getSearchAnalytics();
            const key = q.toLowerCase();
            const a = analytics[key] || { query: q, count: 0, type };
            a.count += 1;
            a.lastSearched = new Date().toISOString();
            a.type = type;
            analytics[key] = a;
            await AlishanDB.saveSearchHistory([...history.filter(x => x !== q), q].slice(-10));   // newest last
            await AlishanDB.saveSearchAnalytics(analytics);
        } catch (e) { console.error('Could not save search history:', e); }
    }
    async function clearSearchHistory() {
        try { await AlishanDB.saveSearchHistory([]); } catch (e) { console.error(e); }
    }

    // ================= backups (calc.js builds / checks / merges, db.js keeps) =================

    const MAX_AUTO_BACKUPS = 7;
    const MAX_PRE_IMPORT_BACKUPS = 5;   // safety copies taken before an import / undo / restore: kept apart from the 7
    const isPreImport = (b) => !!(b && b.metadata && b.metadata.type === 'PRE_IMPORT_BACKUP');
    const allPayments = () => [...payments, ...orphanPayments];
    const backupFile = (type) => C.makeBackup(items, allPayments(), type);

    async function saveBackupToHistory(type) {
        const history = await AlishanDB.getSetting('autoBackups', []);
        history.push(backupFile(type));
        // the automatic copies (7) and the pre-import copies (5) are counted separately, so a few days of
        // automatic backups can never push out the copy taken before an import. The order stays the same.
        const keep = new Set([
            ...history.filter(isPreImport).slice(-MAX_PRE_IMPORT_BACKUPS),
            ...history.filter(b => !isPreImport(b)).slice(-MAX_AUTO_BACKUPS)
        ]);
        await AlishanDB.setSetting('autoBackups', history.filter(b => keep.has(b)));
        await AlishanDB.setSetting('lastBackupDate', new Date().toISOString());
    }

    async function createBackup() {
        if (items.length === 0) return fail('No data to backup!');
        try {
            await saveBackupToHistory('AUTO_BACKUP');
            return { ok: true, message: 'Backup created successfully' };
        } catch (e) {
            console.error(e);
            return fail('Could not create the backup');
        }
    }

    const listBackups = () => AlishanDB.getSetting('autoBackups', []);

    async function getBackupSettings() {
        return {
            enabled: (await AlishanDB.getSetting('autoBackupEnabled', 'true')) !== 'false',
            frequency: parseInt(await AlishanDB.getSetting('backupFrequency', '24')) || 24
        };
    }
    async function saveBackupSettings({ enabled, frequency }) {
        await AlishanDB.setSetting('autoBackupEnabled', enabled ? 'true' : 'false');
        await AlishanDB.setSetting('backupFrequency', String(frequency));
        await startAutoBackup();
        return { ok: true, message: 'Backup settings saved' };
    }

    // runs for every page: catches up on load, then on a timer
    async function startAutoBackup() {
        if (autoBackupTimer) { clearInterval(autoBackupTimer); autoBackupTimer = null; }
        const { enabled, frequency } = await getBackupSettings();
        if (!enabled || !(frequency > 0)) return;

        const last = await AlishanDB.getSetting('lastBackupDate', null);
        const due = !last || (Date.now() - new Date(last).getTime()) >= frequency * 3600 * 1000;
        if (due && items.length > 0) { try { await saveBackupToHistory('AUTO_BACKUP'); } catch (e) { console.error(e); } }

        autoBackupTimer = setInterval(() => {
            if (items.length > 0) saveBackupToHistory('AUTO_BACKUP').catch(e => console.error(e));
        }, frequency * 3600 * 1000);
    }

    const inspectBackup = (file) => C.inspectBackup(file, items.length);

    // mode: 'replace' | 'merge'. A safety copy of the current data is stored first.
    async function importBackup(file, mode) {
        const merged = C.mergeBackup(items, allPayments(), file, mode);
        if (!merged.ok) return merged;
        try {
            if (items.length) await saveBackupToHistory('PRE_IMPORT_BACKUP');
            items = merged.items;
            await AlishanDB.replaceInventoryAndPayments(items, merged.payments);   // ONE transaction
            await loadPayments();
        } catch (e) {
            console.error('Import error:', e);
            await loadInventory();
            await loadPayments();
            emit('import');
            return fail('Error importing file. Please check file format.');
        }
        emit('import');
        return { ok: true, imported: merged.imported, skipped: merged.skipped,
                 message: `Successfully imported ${merged.imported} items!` + (merged.skipped ? ` (${merged.skipped} skipped)` : '') };
    }

    async function restoreBackup(index) {
        const b = (await listBackups())[index];
        if (!b) return fail('Backup not found');
        return importBackup(b, 'replace');
    }

    return {
        // lifecycle
        init, subscribe, getDamagedCount, getReferenceError,
        // reference data
        getQualityData, getColors, getColorStyle, getColorStyleSafe, colorDisplayName, getPrice,
        // read
        getItems, getItem, hasItems, itemCount, getPayments, query, summary, paginate, typeStats,
        qualityOptions, lowStockItems, itemPayment, getRecentActivity,
        // change entries
        addItem, updateItem, deleteItem, toggleStock,
        // payments
        addPayment, deletePayment,
        // report data
        pendingList, paymentCards, advancedPaymentSearch, weekOptions, weeklyReport, paymentHistory,
        valuationTrend, qualitySummary, agingReport, exportRows,
        // search data
        suggest, getSearchHistory, getSearchAnalytics, recordSearch, clearSearchHistory,
        // bulk import (AI JSON) with review
        parseBulk, getProductTypes, rememberAlias, typeOfQuality, closeQualities, closeColors, checkImportDraft, batchDuplicateIds, importTotals, aiPrompt, importEntries, undoImport, listImportBatches,
        // backups
        backupFile, createBackup, listBackups, getBackupSettings, saveBackupSettings,
        inspectBackup, importBackup, restoreBackup
    };
})();

if (typeof window !== 'undefined') window.AlishanStore = AlishanStore;
