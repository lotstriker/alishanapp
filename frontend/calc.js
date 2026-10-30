/* ============================================================
   calc.js — EVERY calculation and every rule of the app. NOTHING ELSE.

   • no database   (that is db.js)
   • no saved data (that is store.js, which asks this file and then saves)
   • no page code  (that is the pages)

   Lists and typed values go IN, answers come OUT: quantity, amount,
   aging, payments, week numbers, what a new / edited entry looks like,
   filters, search matching, suggestions, report data, Excel rows,
   backup checking, number/date formatting.
   ============================================================ */

var AlishanCalc = (() => {
    'use strict';

    const SIZES = [28, 30, 32, 34, 36, 38, 40, 42, 44, 46];
    const DAY_MS = 24 * 60 * 60 * 1000;

    // ---- business rules: edit here and every page follows ----
    const CONFIG = Object.freeze({
        AGING_AFTER_DAYS: 7,      // more than 7 days in stock   -> AGING   (normal)
        WARNING_AFTER_DAYS: 15,   // more than 15 days in stock  -> WARNING (medium)
        CRITICAL_AFTER_DAYS: 30,  // more than 30 days in stock  -> CRITICAL (red, biggest)
        LOW_STOCK_DOZENS: 10,     // in-stock entry with fewer dozens than this = low stock
        NEW_ITEM_DAYS: 7          // "added this week"
    });

    // The four aging levels + their colours — the ONE definition used by item cards,
    // Inventory, Reports and exports (colours are also published as CSS variables).
    const AGING_LEVELS = Object.freeze({
        fresh:    { key: 'fresh',    label: 'Fresh',    badge: 'NEW',      color: '#2e9e5b', soft: '#e3f5ea', text: '#ffffff', icon: 'leaf' },
        aging:    { key: 'aging',    label: 'Aging',    badge: 'AGING',    color: '#e6b800', soft: '#fff7d6', text: '#3d3000', icon: 'clock' },
        warning:  { key: 'warning',  label: 'Warning',  badge: 'WARNING',  color: '#f77f00', soft: '#ffe8cc', text: '#ffffff', icon: 'exclamation-triangle' },
        critical: { key: 'critical', label: 'Critical', badge: 'CRITICAL', color: '#e63946', soft: '#fde1e3', text: '#ffffff', icon: 'exclamation-circle' }
    });
    const AGING_ORDER = ['fresh', 'aging', 'warning', 'critical'];

    function agingRange(key) {
        const c = CONFIG;
        switch (key) {
            case 'fresh':    return `0-${c.AGING_AFTER_DAYS} days`;
            case 'aging':    return `${c.AGING_AFTER_DAYS + 1}-${c.WARNING_AFTER_DAYS} days`;
            case 'warning':  return `${c.WARNING_AFTER_DAYS + 1}-${c.CRITICAL_AFTER_DAYS} days`;
            default:         return `${c.CRITICAL_AFTER_DAYS + 1}+ days`;
        }
    }
    function agingTitle(key) {
        return `${AGING_LEVELS[key].label} (${agingRange(key)})`;
    }

    // ================= basic helpers =================

    function round2(n) {
        const x = Number(n);
        if (!Number.isFinite(x)) return 0;
        return Math.round((x + Number.EPSILON) * 100) / 100;
    }

    // "2026-10-05" (date-only) must be read as a LOCAL date, not UTC midnight.
    function parseDate(value) {
        if (value instanceof Date) return value;
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(value);
    }

    // ================= quantity =================

    // Display size quantity in the app's compact dozen.pieces notation.
    // This is presentation-only: calculations and stored quantities stay unchanged.
    // Examples: 7 pieces -> "0.7", 12 pieces -> "1", 30 pieces -> "2.6",
    // 47 pieces -> "3.11", 48 pieces -> "4".
    // The digits after the dot are remaining pieces (0-11), not decimal fractions.
    function formatSizeQuantity(dozens, pieces) {
        const dz = Math.max(0, Number(dozens) || 0);
        const pcs = Math.max(0, parseInt(pieces, 10) || 0);
        const totalPieces = Math.round(dz * 12) + pcs;
        const d = Math.floor(totalPieces / 12);
        const p = totalPieces % 12;
        if (p === 0) return String(d);
        return `${d}.${p}`;
    }

    // pieces inside ONE set of size boxes ({size28, size28_pieces, ...})
    function sizesPieces(obj) {
        if (!obj) return 0;
        let total = 0;
        SIZES.forEach(size => {
            total += (Number(obj[`size${size}`]) || 0) * 12 + (Number(obj[`size${size}_pieces`]) || 0);
        });
        return total;
    }

    // total pieces of an item, counted from its size boxes (never trusts stored totals
    // unless an old item has no size boxes at all)
    function itemPieces(item) {
        if (!item) return 0;
        let computed = 0;
        const colors = Array.isArray(item.colors) ? item.colors : [];
        const perColor = item.sizeOption === 'different' || (colors.length > 0 && typeof colors[0] === 'object');

        if (perColor) {
            computed = colors.reduce((sum, c) => sum + (c && c.sizes ? sizesPieces(c.sizes) : 0), 0);
        } else {
            computed = sizesPieces(item) * colors.length;
        }

        if (computed === 0) {
            // legacy fallback: very old items that only stored totals
            if (Number(item.totalPieces) > 0) return Math.round(Number(item.totalPieces));
            if (Number(item.totalDozens) > 0) return Math.round(Number(item.totalDozens) * 12);
        }
        return Math.round(computed);
    }

    function itemDozens(item) {
        return itemPieces(item) / 12;
    }

    // ================= money =================

    function itemPrice(item) {
        const p = Number(item && item.price);
        return Number.isFinite(p) && p > 0 ? p : 0;
    }

    // THE amount of an item. Every page uses this — nothing else.
    function itemAmount(item) {
        return round2((itemPieces(item) / 12) * itemPrice(item));
    }

    function itemTotals(item) {
        const pieces = itemPieces(item);
        return { pieces, dozens: pieces / 12, price: itemPrice(item), amount: itemAmount(item) };
    }

    // Writes the stored totals (totalPieces / totalDozens / totalAmount) from the size
    // boxes, so even code that reads the stored fields can never disagree.
    function applyTotals(item) {
        if (!item) return item;
        const colors = Array.isArray(item.colors) ? item.colors : [];
        colors.forEach(c => {
            if (c && typeof c === 'object' && c.sizes) c.totalDozens = sizesPieces(c.sizes) / 12;
        });
        const t = itemTotals(item);
        item.totalPieces = t.pieces;
        item.totalDozens = t.dozens;
        item.totalAmount = t.amount;
        return item;
    }

    // ================= dates / aging =================

    // Whole CALENDAR days between the item's date and today (not elapsed hours).
    // Pick "20 September" on 10 October and it is 20 days old — whatever time of day it is.
    function daysInStock(item, now = new Date()) {
        const d = parseDate(item && item.dateTime);
        if (isNaN(d)) return 0;
        const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.max(0, Math.round((to - from) / DAY_MS));
    }

    // 'fresh' | 'aging' | 'warning' | 'critical'  — or null when the item is
    // Out of Stock (an item that left stock is no longer "aging").
    function agingLevel(item, now = new Date()) {
        if (!item || item.inStock === false) return null;
        const days = daysInStock(item, now);
        if (days > CONFIG.CRITICAL_AFTER_DAYS) return 'critical';
        if (days > CONFIG.WARNING_AFTER_DAYS) return 'warning';
        if (days > CONFIG.AGING_AFTER_DAYS) return 'aging';
        return 'fresh';
    }

    // "added in the last N days" (today counts as day 0)
    function isAddedWithinDays(item, days, now = new Date()) {
        const d = parseDate(item && item.dateTime);
        if (isNaN(d) || d > now) return !isNaN(d) && d <= now;
        return daysInStock(item, now) <= days;
    }

    function isLowStock(item) {
        return !!item && item.inStock !== false && itemDozens(item) < CONFIG.LOW_STOCK_DOZENS;
    }

    // ISO-8601 week (Mon-Sun) with the matching ISO year — one definition for the
    // whole app (the old one broke around 1 January and differed between screens).
    function weekInfo(value) {
        const d = parseDate(value);
        const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - dayNum);
        const year = t.getUTCFullYear();
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const week = Math.ceil(((t - yearStart) / DAY_MS + 1) / 7);
        return { week, year, key: `${week}-${year}`, label: `Week ${week}, ${year}` };
    }

    // ================= payments =================

    function sameId(a, b) {
        return String(a) === String(b);
    }

    function paymentsFor(item, payments) {
        return (payments || []).filter(p => sameId(p.inventoryId, item.id));
    }

    // money received per item, worked out in ONE pass over the payments:  Map(itemId -> total).
    // Everything that looks at many items builds this once instead of searching all the
    // payments again for every item (that was N x payments and made big inventories slow).
    function paymentIndex(payments) {
        const index = new Map();
        (payments || []).forEach(p => {
            const key = String(p.inventoryId);
            index.set(key, (index.get(key) || 0) + (Number(p.amount) || 0));
        });
        return index;
    }

    // expected / received / pending for ONE item.  `payments` = the payments array OR a paymentIndex().
    function paymentStatus(item, payments) {
        const expected = itemAmount(item);
        const raw = payments instanceof Map
            ? (payments.get(String(item.id)) || 0)
            : paymentsFor(item, payments).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const received = round2(raw);
        const pending = Math.max(0, round2(expected - received));
        const overpaid = received > expected + 0.005;
        let status = 'pending';
        if (expected > 0 && pending === 0) status = 'paid';
        else if (received > 0) status = 'partial';
        return { expected, received, pending, overpaid, status };
    }

    // ================= summary of any list of items =================

    function emptyBucket() { return { count: 0, pieces: 0, dozens: 0, value: 0 }; }

    function addToBucket(bucket, totals) {
        bucket.count += 1;
        bucket.pieces += totals.pieces;
        bucket.dozens += totals.dozens;
        bucket.value = round2(bucket.value + totals.amount);
    }

    // One call gives every headline number. Pass the items you want to report on
    // (all of them, or a filtered list) and the payments.
    function summarize(items, payments, now = new Date()) {
        const list = Array.isArray(items) ? items : [];
        const paid = paymentIndex(payments);
        const s = {
            totalItems: list.length,
            inStockItems: 0,
            outOfStockItems: 0,
            totalPieces: 0,
            totalDozens: 0,
            totalValue: 0,
            inStockValue: 0,
            addedThisWeek: 0,
            lowStockItems: 0,
            aging: { fresh: emptyBucket(), aging: emptyBucket(), warning: emptyBucket(), critical: emptyBucket() },
            agingItems: 0,           // in-stock items older than AGING_AFTER_DAYS (aging + warning + critical)
            expected: 0,
            received: 0,
            pending: 0,
            paidItems: 0,
            partialItems: 0,
            unpaidItems: 0,
            byType: {},
            byQuality: {}
        };

        list.forEach(item => {
            const totals = itemTotals(item);
            s.totalPieces += totals.pieces;
            s.totalDozens += totals.dozens;
            s.totalValue = round2(s.totalValue + totals.amount);

            if (item.inStock !== false) {
                s.inStockItems += 1;
                s.inStockValue = round2(s.inStockValue + totals.amount);
            } else {
                s.outOfStockItems += 1;
            }
            if (isAddedWithinDays(item, CONFIG.NEW_ITEM_DAYS, now)) s.addedThisWeek += 1;
            if (isLowStock(item)) s.lowStockItems += 1;

            const level = agingLevel(item, now);          // null = out of stock = not in aging
            if (level) {
                addToBucket(s.aging[level], totals);
                if (level !== 'fresh') s.agingItems += 1;
            }

            const type = String(item.productType || 'OTHER').toUpperCase();
            if (!s.byType[type]) s.byType[type] = emptyBucket();
            addToBucket(s.byType[type], totals);

            const quality = item.quality || 'UNKNOWN';
            if (!s.byQuality[quality]) s.byQuality[quality] = emptyBucket();
            addToBucket(s.byQuality[quality], totals);

            const pay = paymentStatus(item, paid);
            s.expected = round2(s.expected + pay.expected);
            s.received = round2(s.received + pay.received);
            s.pending = round2(s.pending + pay.pending);
            if (pay.status === 'paid') s.paidItems += 1;
            else if (pay.status === 'partial') s.partialItems += 1;
            else s.unpaidItems += 1;
        });

        return s;
    }

    // ================= formatting (same look on every page) =================

    function fmtNumber(n, maxDecimals = 2) {
        return round2(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
    }
    function fmtMoney(n) { return '₹' + fmtNumber(n); }
    function fmtDozens(n) { return fmtNumber(n); }
    function fmtDate(value) {
        const d = parseDate(value);
        return isNaN(d) ? 'N/A' : d.toLocaleDateString('en-IN');
    }
    function fmtDateLong(value) {
        const d = parseDate(value);
        return isNaN(d) ? 'N/A' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function fmtDateTime(value) {
        const d = parseDate(value);
        return isNaN(d) ? 'N/A' : `${fmtDateLong(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    function percent(part, total, decimals = 1) {
        if (!(total > 0)) return (0).toFixed(decimals);
        return ((part / total) * 100).toFixed(decimals);
    }

    // small coloured summary line: "● 3 Aging  ● 2 Warning  ● 1 Critical"
    function agingBreakdownHTML(summary) {
        return ['aging', 'warning', 'critical'].map(k => {
            const L = AGING_LEVELS[k];
            return `<span class="aging-chip" title="${agingTitle(k)}"><i style="background:${L.color}"></i>${summary.aging[k].count} ${L.label}</span>`;
        }).join('');
    }

    // Publish the colours as CSS variables (--aging-<level>, --aging-<level>-soft,
    // --aging-<level>-text) so stylesheets never hard-code them.
    function publishAgingColors() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        AGING_ORDER.forEach(k => {
            root.style.setProperty(`--aging-${k}`, AGING_LEVELS[k].color);
            root.style.setProperty(`--aging-${k}-soft`, AGING_LEVELS[k].soft);
            root.style.setProperty(`--aging-${k}-text`, AGING_LEVELS[k].text);
        });
    }
    publishAgingColors();


    // 12 pieces = 1 dozen. Any "dozens + pieces" typed anywhere goes through this.
    // Half dozens are kept: 2.5 dozens = 2 dozens + 6 pieces (before, the .5 was silently cut off).
    function splitPieces(dozens, pieces) {
        const dz = Math.max(0, parseFloat(dozens) || 0);
        let whole = Math.floor(dz + 1e-9);
        const p = Math.max(0, parseInt(pieces) || 0) + Math.round((dz - whole) * 12);
        whole += Math.floor(p / 12);
        return { dozens: whole, pieces: p % 12 };
    }

    // ================= search / entry-date / card helpers =================

    function colorName(c) {
        return (c && typeof c === 'object') ? (c.name || '') : String(c || '');
    }

    // Everything about an entry that a person might type into the search box.
    function itemSearchText(item) {
        const colors = Array.isArray(item.colors) ? item.colors.map(colorName).join(' ') : '';
        const level = agingLevel(item);
        const when = parseDate(item.dateTime);
        const dateWords = isNaN(when) ? '' : [
            fmtDate(when),                                                    // 21/9/2026
            when.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),   // 21 September 2026
            when.toLocaleDateString('en-IN', { month: 'short' })              // Sep
        ].join(' ');
        const sizeWords = [];
        const sizeSets = item.sizeOption === 'different' ? (item.colors || []).map(c => c && c.sizes || {}) : [item];
        SIZES.forEach(size => {
            if (sizeSets.some(o => (Number(o[`size${size}`]) || 0) > 0 || (Number(o[`size${size}_pieces`]) || 0) > 0)) sizeWords.push(`size ${size}`);
        });
        const t = itemTotals(item);
        return [
            item.quality, item.lotNumber, item.notes, item.source, item.productType,
            item.cupSize && item.cupSize !== 'N/A' ? `${item.cupSize} cup ${item.cupSize}` : '',
            item.code, colors,
            item.inStock !== false ? 'in stock' : 'out of stock',
            level ? AGING_LEVELS[level].label : '',
            item.isManualEntry ? 'old entry manual' : 'new entry',
            item.sizeOption === 'same' ? 'same sizes' : 'different sizes',
            dateWords, sizeWords.join(' '),
            t.price, item.material, item.weight, round2(t.dozens), t.pieces, t.amount
        ].filter(v => v !== undefined && v !== null && v !== '' && v !== 0).join(' ').toLowerCase();
    }
    // every word typed must match somewhere in the item
    function matchesSearch(item, query) {
        const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!tokens.length) return true;
        const text = itemSearchText(item);
        return tokens.every(t => text.includes(t));
    }

    function localDate(d) {
        const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return z.toISOString().slice(0, 10);
    }
    function localTime(d) {
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    // "2026-10-05" + "14:30" -> Date (local). Time is optional (defaults to noon).
    function buildEntryDate(dateStr, timeStr) {
        if (!dateStr) return null;
        const d = new Date(`${dateStr}T${timeStr || '12:00'}`);
        return isNaN(d) ? null : d;
    }

    // what to show under an entry-date field: how old it is + which aging level it starts in
    function entryInfo(dateStr, timeStr, inStock = true) {
        const d = buildEntryDate(dateStr, timeStr);
        if (!d) return { valid: false };
        if (d > new Date()) return { valid: true, future: true, date: d };
        const pseudo = { dateTime: d.toISOString(), inStock };
        return { valid: true, future: false, date: d, days: daysInStock(pseudo), level: agingLevel(pseudo) };
    }

    // new entry = now; old entry = the chosen date (never in the future)
    function resolveEntry(entry) {
        const now = new Date();
        if (!entry || entry.mode !== 'old') {
            return { ok: true, dateTime: now.toISOString(), addedDateTime: now.toISOString(), isManual: false };
        }
        if (!entry.date) return { ok: false, error: 'Please select the date of the old entry' };
        const d = buildEntryDate(entry.date, entry.time);
        if (!d) return { ok: false, error: 'The entry date/time is not valid' };
        if (d > now) return { ok: false, error: 'Entry date/time cannot be in the future!' };
        return { ok: true, dateTime: d.toISOString(), addedDateTime: now.toISOString(), isManual: true };
    }

    // 'all' | 'today' | 'week' | 'month' | <days>
    function matchesPeriod(item, period, now = new Date()) {
        if (!period || period === 'all') return true;
        const d = parseDate(item && item.dateTime);
        if (isNaN(d)) return false;
        if (period === 'today') return daysInStock(item, now) === 0;
        if (period === 'week') return daysInStock(item, now) <= 7;
        if (period === 'month') return d >= new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const n = Number(period);
        return Number.isFinite(n) ? daysInStock(item, now) <= n : true;
    }

    // Everything an item card needs to show (so the card itself does no maths)
    function describeItem(item) {
        const colors = Array.isArray(item.colors) ? item.colors : [];
        const totals = itemTotals(item);
        const simple = colors.length > 0 && typeof colors[0] === 'string';
        const info = {
            mode: colors.length === 0 ? 'none' : (simple ? 'same' : 'different'),
            colorNames: colors.map(colorName).filter(Boolean),
            totalDozens: round2(totals.dozens),
            amount: totals.amount,
            summary: 'No calculation available',
            sizes: [],
            tables: []
        };
        if (info.mode === 'same') {
            const perColor = sizesPieces(item) / 12;
            info.summary = `${round2(perColor)} dozens per color × ${colors.length} colors = ${info.totalDozens} dozens`;
            SIZES.forEach(size => {
                const d = Number(item[`size${size}`]) || 0, p = Number(item[`size${size}_pieces`]) || 0;
                if (d || p) info.sizes.push({
                    size,
                    value: round2(d + p / 12),
                    displayValue: formatSizeQuantity(d, p)
                });
            });
        } else if (info.mode === 'different') {
            info.summary = `${info.totalDozens} dozens`;
            info.tables = colors.filter(c => c && c.sizes).map(c => ({
                name: c.name || 'Unknown',
                totalDozens: round2(sizesPieces(c.sizes) / 12),
                // only the sizes that were filled in (same as the same-colour card)
                sizes: SIZES
                    .filter(size => (Number(c.sizes[`size${size}`]) || 0) > 0 || (Number(c.sizes[`size${size}_pieces`]) || 0) > 0)
                    .map(size => ({
                        size,
                        value: round2((Number(c.sizes[`size${size}`]) || 0) + (Number(c.sizes[`size${size}_pieces`]) || 0) / 12),
                        displayValue: formatSizeQuantity(
                            Number(c.sizes[`size${size}`]) || 0,
                            Number(c.sizes[`size${size}_pieces`]) || 0
                        )
                    }))
            }));
        }
        return info;
    }

    // ============================================================
    //  LOGIC ON DATA — still pure: lists go IN, answers come OUT.
    //  No database, no page, no saved state in this file.
    // ============================================================

    const ok = (extra = {}) => ({ ok: true, ...extra });
    const fail = (error) => ({ ok: false, error });
    const byDateDesc = (a, b) => new Date(b.dateTime) - new Date(a.dateTime);

    // ---------- repair + validation of saved items ----------

    function carryPieces(obj) {
        let changed = false;
        SIZES.forEach(size => {
            const pk = `size${size}_pieces`, dk = `size${size}`;
            const p = Number(obj[pk]);
            if (obj[pk] !== undefined && (!Number.isInteger(p) || p < 0 || p > 11)) {
                const safe = Number.isFinite(p) && p > 0 ? Math.floor(p) : 0;
                obj[dk] = (Number(obj[dk]) || 0) + Math.floor(safe / 12);
                obj[pk] = safe % 12;
                changed = true;
            }
        });
        return changed;
    }

    function generateCode(taken) {
        let code, tries = 0;
        do {
            code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
            tries++;
        } while (taken.has(code) && tries < 500);
        taken.add(code);
        return code;
    }

    // Repairs old / slightly-wrong records instead of throwing them away.
    function normalizeInventory(rawItems) {
        const out = [];
        const invalid = [];
        let changed = false;
        const list = Array.isArray(rawItems) ? rawItems : [];

        const taken = new Set();
        const seen = new Set();
        list.forEach(it => {
            if (it && typeof it === 'object' && /^\d{6}$/.test(String(it.code || '')) && !seen.has(it.code)) {
                seen.add(it.code);
                taken.add(it.code);
            }
        });
        const usedNow = new Set();

        list.forEach(it => {
            if (!it || typeof it !== 'object') { invalid.push(it); changed = true; return; }

            if (it.id === undefined || it.id === null) {
                it.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
                changed = true;
            }
            if (typeof it.productType === 'string') {
                const u = it.productType.trim().toUpperCase();
                if (u !== it.productType) { it.productType = u; changed = true; }
            }
            if (typeof it.quality === 'string') {
                const u = it.quality.trim().toUpperCase();
                if (u !== it.quality) { it.quality = u; changed = true; }
            }
            if (!Array.isArray(it.colors)) { it.colors = []; changed = true; }
            if (it.sizeOption !== 'same' && it.sizeOption !== 'different') {
                it.sizeOption = (it.colors.length && typeof it.colors[0] === 'object') ? 'different' : 'same';
                changed = true;
            }
            if (it.sizeOption === 'same') {
                if (carryPieces(it)) changed = true;
            } else {
                it.colors.forEach(c => {
                    if (c && typeof c === 'object' && c.sizes && carryPieces(c.sizes)) changed = true;
                });
            }
            ['price', 'material', 'weight', 'totalDozens'].forEach(k => {
                if (it[k] !== undefined && typeof it[k] !== 'number') {
                    const n = parseFloat(it[k]);
                    it[k] = Number.isFinite(n) && n >= 0 ? n : 0;
                    changed = true;
                }
            });
            {
                const before = `${it.totalPieces}|${it.totalDozens}|${it.totalAmount}`;
                applyTotals(it);
                if (before !== `${it.totalPieces}|${it.totalDozens}|${it.totalAmount}`) changed = true;
            }
            if (it.inStock === undefined) { it.inStock = true; changed = true; }
            if (!it.dateTime || isNaN(new Date(it.dateTime))) {
                it.dateTime = it.addedDateTime && !isNaN(new Date(it.addedDateTime))
                    ? it.addedDateTime : new Date().toISOString();
                changed = true;
            }
            const codeOk = /^\d{6}$/.test(String(it.code || '')) && !usedNow.has(it.code);
            if (!codeOk) { it.code = generateCode(taken); changed = true; }
            usedNow.add(it.code);

            out.push(it);
        });

        return { items: out, invalid, changed };
    }

    function validateItem(item, loose = false) {
        if (!item || typeof item !== 'object') return fail('Invalid item');
        if (typeof item.productType !== 'string' || !item.productType.trim()) return fail('Product type is required');
        if (typeof item.quality !== 'string' || !item.quality.trim()) return fail('Quality is required');
        if (typeof item.code !== 'string' || !/^\d{6}$/.test(item.code)) return fail('Item code is invalid');
        if (!loose && item.lotNumber && !/^[\d\-]*$/.test(item.lotNumber)) return fail('Lot number can contain only digits and hyphens');
        if (!['same', 'different'].includes(item.sizeOption)) return fail('Size option is invalid');
        if (!Array.isArray(item.colors) || item.colors.length === 0) return fail('At least one color is required');

        const pcsOk = (obj) => SIZES.every(size => {
            const p = obj[`size${size}_pieces`];
            return p === undefined || (Number.isInteger(p) && p >= 0 && p <= 11);
        });
        if (item.sizeOption === 'same') {
            if (!pcsOk(item)) return fail('Pieces must be between 0 and 11 (12 pieces = 1 dozen)');
        } else {
            for (const c of item.colors) {
                if (!c || typeof c !== 'object' || !c.name || !c.sizes || typeof c.sizes !== 'object') {
                    return fail('Each color needs its own sizes');
                }
                if (!pcsOk(c.sizes)) return fail(`Pieces for ${c.name} must be between 0 and 11`);
            }
        }
        for (const k of ['material', 'weight', 'price', 'totalDozens']) {
            if (item[k] !== undefined && (typeof item[k] !== 'number' || item[k] < 0 || !Number.isFinite(item[k]))) {
                return fail(`${k} must be a positive number`);
            }
        }
        return ok();
    }

    // items saved while a quality's price was 0 get the real price (priceOf = name -> price)
    function backfillPrices(list, priceOf) {
        let changed = false;
        list.forEach(it => {
            if (!(Number(it.price) > 0)) {
                const p = priceOf(it.quality);
                if (p > 0) {
                    it.price = p;
                    it.totalAmount = itemAmount(it);
                    changed = true;
                }
            }
        });
        return changed;
    }

    // ---------- building / changing an entry from what the user typed ----------
    // ctx = { items (all current items), priceOf(name), colorLabel(name) }

    function buildQuantity(input, colorLabel = (n) => n) {
        const readSizes = (map) => {
            const fields = {};
            let pieces = 0;
            SIZES.forEach(size => {
                const cell = map && map[size];
                const r = splitPieces(cell && cell.dozens, cell && cell.pieces);
                fields[`size${size}`] = r.dozens;
                fields[`size${size}_pieces`] = r.pieces;
                pieces += r.dozens * 12 + r.pieces;
            });
            return { fields, pieces };
        };

        if (input.sizeOption === 'different') {
            const list = input.colorSizes || [];
            if (list.length === 0) return fail('Please select at least one color');
            const colors = [];
            const empty = [];
            list.forEach(cs => {
                const name = String(cs.name || '').toUpperCase();
                if (!name) return;
                const { fields, pieces } = readSizes(cs.sizes);
                if (pieces > 0) colors.push({ name, sizes: fields, totalDozens: pieces / 12 });
                else empty.push(colorLabel(name));
            });
            if (empty.length) return fail(`Please enter sizes for: ${empty.join(', ')}`);
            if (colors.length === 0) return fail('Please enter sizes for at least one color');
            return ok({ sizeOption: 'different', colors, sizeFields: {} });
        }

        const colors = (input.colors || []).map(c => String(c).toUpperCase());
        if (colors.length === 0) return fail('Please select at least one color');
        const { fields, pieces } = readSizes(input.sizes);
        if (pieces === 0) return fail('Please enter at least one size quantity');
        return ok({ sizeOption: 'same', colors, sizeFields: fields });
    }

    function nextId(items) {
        let id = Date.now();
        while (items.some(i => i.id === id)) id++;
        return id;
    }

    // a NEW entry -> { ok, item, message }  (nothing is saved here)
    function buildNewItem(input, ctx) {
        const productType = String(input.productType || '').trim().toUpperCase();
        const quality = String(input.quality || '').trim().toUpperCase();
        if (!productType) return fail('Product Type is required');
        if (!quality) return fail('Quality Name is required');

        const qty = buildQuantity(input, ctx.colorLabel);
        if (!qty.ok) return qty;

        const entry = resolveEntry(input.entry);
        if (!entry.ok) return entry;

        const item = {
            id: nextId(ctx.items),
            code: generateCode(new Set(ctx.items.map(i => i.code))),
            dateTime: entry.dateTime,
            addedDateTime: entry.addedDateTime,
            productType,
            cupSize: input.cupSize || 'N/A',
            lotNumber: String(input.lotNumber || '').trim(),
            quality,
            material: parseFloat(input.material) || 0,
            weight: parseFloat(input.weight) || 0,
            price: (has(input.price) && isFinite(Number(input.price)) && Number(input.price) > 0) ? Number(input.price) : ctx.priceOf(quality),
            colors: qty.colors,
            notes: input.notes || '',
            inStock: input.inStock !== false,
            sizeOption: qty.sizeOption,
            isManualEntry: entry.isManual,
            ...qty.sizeFields
        };
        applyTotals(item);

        const check = validateItem(item);
        if (!check.ok) return check;

        let kind = 'New entry';
        if (item.isManualEntry) {
            const level = agingLevel(item);
            kind = `Old entry (${daysInStock(item)} days old${level && level !== 'fresh' ? ', ' + AGING_LEVELS[level].label : ''})`;
        }
        return ok({ item, message: `${kind} added successfully! Total: ${fmtDozens(item.totalDozens)} dozens` });
    }

    // an EDITED entry -> { ok, item, dateChanged, message }  (nothing is saved here)
    function buildUpdatedItem(current, input, ctx) {
        const productType = String(input.productType || '').trim().toUpperCase();
        const quality = String(input.quality || '').trim().toUpperCase();
        if (!productType || !quality) return fail('Please fill in all required fields');

        const qty = buildQuantity(input, ctx.colorLabel);
        if (!qty.ok) return qty;

        const e = input.entry || {};
        const newWhen = buildEntryDate(e.date, e.time);
        if (!newWhen) return fail('Please enter a valid entry date');
        if (newWhen > new Date()) return fail('Entry date/time cannot be in the future!');
        const oldWhen = parseDate(current.dateTime);
        const dateChanged = isNaN(oldWhen) ||
            localDate(oldWhen) !== localDate(newWhen) ||
            localTime(oldWhen) !== localTime(newWhen);

        // price comes from the quality; an unchanged quality keeps the item's own saved price
        const price = (quality === current.quality && Number(current.price) > 0)
            ? Number(current.price)
            : ctx.priceOf(quality);

        const updated = { ...current };
        SIZES.forEach(size => { delete updated[`size${size}`]; delete updated[`size${size}_pieces`]; });
        Object.assign(updated, {
            productType,
            cupSize: input.cupSize || 'N/A',
            lotNumber: String(input.lotNumber || '').trim(),
            quality,
            material: parseFloat(input.material) || 0,
            weight: parseFloat(input.weight) || 0,
            price,
            notes: input.notes || '',
            sizeOption: qty.sizeOption,
            colors: qty.colors,
            lastModified: new Date().toISOString()
        }, qty.sizeFields);

        if (dateChanged) {
            if (!updated.addedDateTime) updated.addedDateTime = current.dateTime;
            updated.dateTime = newWhen.toISOString();
            updated.isManualEntry = localDate(newWhen) !== localDate(parseDate(updated.addedDateTime));
        }
        applyTotals(updated);

        const check = validateItem(updated);
        if (!check.ok) return check;
        return ok({ item: updated, dateChanged, message: 'Product entry updated successfully!' });
    }

    // ---------- finding items (filters + search) ----------
    //   search / productType / quality / stock / period / dateFrom / dateTo / lotNumber / code
    function filterItems(items, o = {}) {
        const now = new Date();
        let list = items.slice();

        if (o.search) list = list.filter(it => matchesSearch(it, o.search));
        if (o.productType && o.productType !== 'all') {
            const t = String(o.productType).toLowerCase();
            list = list.filter(it => String(it.productType).toLowerCase() === t);
        }
        if (o.quality && o.quality !== 'all') list = list.filter(it => it.quality === o.quality);
        if (o.stock === 'inStock') list = list.filter(it => it.inStock !== false);
        if (o.stock === 'outOfStock') list = list.filter(it => it.inStock === false);
        if (o.lotNumber) {
            const l = String(o.lotNumber).toLowerCase();
            list = list.filter(it => String(it.lotNumber || '').toLowerCase().includes(l));
        }
        if (o.code) {
            const c = String(o.code).toLowerCase();
            list = list.filter(it => String(it.code || '').toLowerCase().includes(c));
        }
        if (o.period && o.period !== 'all') list = list.filter(it => matchesPeriod(it, o.period, now));
        if (o.dateFrom || o.dateTo) {
            const from = o.dateFrom ? parseDate(o.dateFrom) : null;
            const to = o.dateTo ? new Date(parseDate(o.dateTo).getTime() + 86400000 - 1) : null;
            list = list.filter(it => {
                const d = parseDate(it.dateTime);
                return (!from || d >= from) && (!to || d <= to);
            });
        }
        return list;
    }

    function paginate(list, page, pageSize) {
        const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
        const current = Math.min(Math.max(1, page), totalPages);
        const start = (current - 1) * pageSize;
        return { page: current, totalPages, total: list.length, items: list.slice(start, start + pageSize), from: list.length ? start + 1 : 0, to: Math.min(start + pageSize, list.length) };
    }

    function typeStats(items) {
        const out = {};
        ['BRA', 'PANTY', 'SET', 'BLOUSE'].forEach(type => {
            const list = items.filter(i => i.productType === type);
            const counts = {};
            list.forEach(i => { counts[i.quality] = (counts[i.quality] || 0) + 1; });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            out[type] = { count: list.length, mostAdded: top ? top[0] : '-' };
        });
        return out;
    }

    // ---------- live suggestions for the search box (any field) ----------
    function fuzzyMatch(text, query) {
        text = String(text).toLowerCase();
        query = String(query).toLowerCase();
        if (text.includes(query)) return true;
        let i = 0;
        for (const ch of text) { if (ch === query[i]) i++; if (i === query.length) return true; }
        return false;
    }

    // [{ text, type, category, original?, fuzzy? }] — `original` = what goes into the search box
    function suggest(items, queryText, limit = 12) {
        const query = String(queryText || '').trim();
        const q = query.toLowerCase();
        if (!q) return [];

        const pools = {
            quality: { cat: 'Qualities', set: new Set() },
            lot: { cat: 'Lot Numbers', set: new Set() },
            code: { cat: 'Codes', set: new Set() },
            color: { cat: 'Colors', set: new Set() },
            type: { cat: 'Product Types', set: new Set() },
            cup: { cat: 'Cup Sizes', set: new Set() },
            note: { cat: 'Notes', set: new Set() }
        };
        items.forEach(it => {
            if (it.quality) pools.quality.set.add(it.quality);
            if (it.lotNumber) pools.lot.set.add(String(it.lotNumber));
            if (it.code) pools.code.set.add(String(it.code));
            (it.colors || []).forEach(c => { const n = colorName(c); if (n) pools.color.set.add(n); });
            if (it.productType) pools.type.set.add(it.productType);
            if (it.cupSize && it.cupSize !== 'N/A') pools.cup.set.add(it.cupSize);
            String(it.notes || '').split(/[\s,.;:/\\-]+/).filter(w => w.length >= 3).forEach(w => pools.note.set.add(w.toLowerCase()));
        });

        const label = { quality: '', lot: 'Lot: ', code: 'Code: ', color: 'Color: ', type: 'Type: ', cup: 'Cup: ', note: 'Note: ' };
        const out = [];
        Object.entries(pools).forEach(([type, pool]) => {
            pool.set.forEach(value => {
                if (String(value).toLowerCase().includes(q)) {
                    out.push({ text: label[type] + value, type, category: pool.cat, original: value });
                }
            });
        });
        if (out.length < 5) {
            pools.quality.set.forEach(value => {
                if (fuzzyMatch(value, q) && !out.some(s => s.original === value && s.type === 'quality')) {
                    out.push({ text: value, type: 'quality', category: pools.quality.cat, original: value, fuzzy: true });
                }
            });
        }
        const startsWith = (s) => (String(s.original).toLowerCase().startsWith(q) ? 0 : 1);
        const order = ['quality', 'lot', 'code', 'color', 'type', 'cup', 'note'];
        return out
            .sort((a, b) => startsWith(a) - startsWith(b) || order.indexOf(a.type) - order.indexOf(b.type) || String(a.original).localeCompare(String(b.original)))
            .slice(0, limit);
    }

    // ---------- payments ----------

    // checks ONE new payment against the item's pending amount -> { ok, error | entry }
    function buildPayment(item, payments, { amount, date, notes }) {
        if (!item) return fail('Inventory item not found!');
        const amt = round2(parseFloat(amount));
        if (!date || isNaN(amt)) return fail('Please fill in all required fields');
        if (amt <= 0) return fail('Amount must be greater than zero');

        const pay = paymentStatus(item, payments);
        if (Math.round(amt * 100) > Math.round(pay.pending * 100)) {
            return fail(`Amount exceeds the pending value! Expected: ${fmtMoney(pay.expected)}, already received: ${fmtMoney(pay.received)}, pending: ${fmtMoney(pay.pending)}`);
        }
        return ok({
            entry: { id: Date.now(), inventoryId: item.id, quality: item.quality, amount: amt, date, notes: notes || '', week: weekInfo(date).week },
            message: 'Amount received saved successfully!'
        });
    }

    // ---------- report data (every tab reads the SAME scope) ----------

    function scopePayments(scope, payments) {
        const ids = new Set(scope.map(i => String(i.id)));
        return payments.filter(p => ids.has(String(p.inventoryId)));
    }

    // Average money received per week, from the week of the FIRST payment up to the current week.
    // Weeks follow the weekly report (Monday to Sunday). A week with no payment counts as 0, so the average is
    // total received / number of weeks in that period. Only the payments of the items in `scope` are used.
    function weeklyAverage(scope, payments, today) {
        const list = scopePayments(scope, payments || []).filter(p => Number(p.amount) > 0 && p.date);
        if (!list.length) return { total: 0, weeks: 0, average: 0, since: null };
        const mondayOf = (value) => {
            const d = parseDate(value);
            const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            t.setDate(t.getDate() - ((t.getDay() || 7) - 1));
            return t;
        };
        let total = 0;
        let first = null;
        list.forEach(p => {
            total += Number(p.amount);
            const d = parseDate(p.date);
            if (!first || d < first) first = d;
        });
        const weeks = Math.max(1, Math.round((mondayOf(today || new Date()) - mondayOf(first)) / (7 * DAY_MS)) + 1);
        return { total: round2(total), weeks, average: round2(total / weeks), since: first };
    }

    function cardData(item, payments) {
        const pay = paymentStatus(item, payments);
        return {
            id: item.id, item,
            quality: item.quality, lotNumber: item.lotNumber, code: item.code, productType: item.productType,
            totalDozens: itemDozens(item),
            expectedAmount: pay.expected, amountReceived: pay.received, pendingAmount: pay.pending,
            status: pay.status, dateAdded: item.dateTime, isManualEntry: item.isManualEntry,
            completionPercent: pay.expected > 0 ? Math.min(100, Math.round((pay.received / pay.expected) * 100)) : 0
        };
    }

    function pendingList(scope, payments) {
        const paid = paymentIndex(payments);
        return scope.filter(i => paymentStatus(i, paid).status !== 'paid').map(i => cardData(i, paid));
    }
    function paymentCards(scope, payments) {
        const paid = paymentIndex(payments);
        return scope.map(i => cardData(i, paid));
    }

    function weekOptions(scope, payments) {
        const map = {};
        scopePayments(scope, payments).forEach(p => { const w = weekInfo(p.date); map[w.key] = w; });
        return Object.values(map).sort((a, b) => (b.year - a.year) || (b.week - a.week));
    }

    function itemsById(items) {
        return new Map(items.map(i => [String(i.id), i]));
    }

    function weeklyReport(scope, payments, items, weekKey) {
        const byId = itemsById(items);
        const list = scopePayments(scope, payments).filter(p => weekInfo(p.date).key === weekKey);
        const byDate = {};
        list.forEach(p => { (byDate[String(p.date).slice(0, 10)] = byDate[String(p.date).slice(0, 10)] || []).push(p); });
        const days = Object.keys(byDate).sort().map(date => ({
            date,
            total: round2(byDate[date].reduce((s, p) => s + p.amount, 0)),
            entries: byDate[date].map(p => ({ payment: p, item: byId.get(String(p.inventoryId)) || null }))
        }));
        return { key: weekKey, total: round2(list.reduce((s, p) => s + p.amount, 0)), days };
    }

    function paymentHistory(scope, payments, items) {
        const byId = itemsById(items);
        return scopePayments(scope, payments)
            .sort((a, b) => parseDate(b.date) - parseDate(a.date))
            .map(p => {
                const item = byId.get(String(p.inventoryId)) || null;
                return { payment: p, item, weekLabel: weekInfo(p.date).label, expected: item ? itemAmount(item) : null };
            });
    }

    function valuationTrend(scope) {
        const byWeek = {};
        scope.forEach(item => {
            const w = weekInfo(item.dateTime);
            byWeek[w.key] = byWeek[w.key] || { info: w, value: 0 };
            byWeek[w.key].value = round2(byWeek[w.key].value + itemAmount(item));
        });
        const weeks = Object.values(byWeek).sort((a, b) => (a.info.year - b.info.year) || (a.info.week - b.info.week));
        return { labels: weeks.map(w => w.info.label), values: weeks.map(w => w.value) };
    }

    function qualitySummary(scope, payments) {
        const s = summarize(scope, payments);
        const rows = Object.keys(s.byQuality).map(quality => ({
            quality,
            dozens: s.byQuality[quality].dozens,
            value: s.byQuality[quality].value,
            percent: percent(s.byQuality[quality].value, s.totalValue)
        }));
        return { rows, totalValue: s.totalValue, totalDozens: s.totalDozens };
    }

    // in-stock items only, grouped by aging level, oldest first
    function agingReport(scope) {
        const now = new Date();
        const out = {};
        AGING_ORDER.forEach(k => { out[k] = { items: [], totalValue: 0 }; });
        scope.forEach(item => {
            const level = agingLevel(item, now);
            if (!level) return;
            const amount = itemAmount(item);
            out[level].items.push({ item, days: daysInStock(item, now), dozens: itemDozens(item), amount });
            out[level].totalValue = round2(out[level].totalValue + amount);
        });
        AGING_ORDER.forEach(k => out[k].items.sort((a, b) => b.days - a.days));
        return out;
    }

    // Reports > advanced search (looks at ALL items; the date range limits which PAYMENTS count)
    //   o = { quality, lotNumber, code, amountStatus, dateRange, startDate, endDate }
    function advancedPaymentSearch(items, payments, o = {}) {
        let list = filterItems(items, { lotNumber: o.lotNumber, code: o.code });
        const q = String(o.quality || '').trim().toLowerCase();
        if (q) list = list.filter(item => String(item.quality).toLowerCase().includes(q));

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let from = null, to = null;
        if (o.dateRange === 'today') from = today;
        else if (o.dateRange === 'week') from = new Date(today.getTime() - 7 * 86400000);
        else if (o.dateRange === 'month') { from = new Date(today); from.setMonth(from.getMonth() - 1); }
        else if (o.dateRange === 'custom' && o.startDate && o.endDate) {
            from = parseDate(o.startDate);
            to = new Date(parseDate(o.endDate).getTime() + 86400000 - 1);   // end date included
        }
        const inRange = (p) => {
            if (!from) return true;
            const d = parseDate(p.date);
            return d >= from && (!to || d <= to);
        };

        const paid = paymentIndex(payments);
        const byItem = new Map();
        payments.forEach(p => {
            const key = String(p.inventoryId);
            if (!byItem.has(key)) byItem.set(key, []);
            byItem.get(key).push(p);
        });
        return list.map(i => cardData(i, paid)).filter(card => {
            const receivedInRange = (byItem.get(String(card.id)) || [])
                .filter(inRange)
                .reduce((sum, p) => sum + p.amount, 0);
            if (o.amountStatus === 'received') return (from ? receivedInRange : card.amountReceived) > 0;
            if (o.amountStatus === 'pending') return card.pendingAmount > 0;
            return true;
        });
    }

    // ---------- Excel / CSV rows (ONE definition per report) ----------

    function sizesText(obj) {
        const parts = [];
        SIZES.forEach(size => {
            const d = obj[`size${size}`] || 0;
            const p = obj[`size${size}_pieces`] || 0;
            if (d || p) parts.push(`${size}: ${d ? d + ' dz' : ''}${d && p ? ' + ' : ''}${p ? p + ' pcs' : ''}`);
        });
        return parts.join(', ');
    }

    function inventoryRows(list) {
        return list.map(item => {
            const t = itemTotals(item);
            const colors = (item.colors || []).map(c => colorName(c)).join(', ') || 'N/A';
            const sizes = item.sizeOption === 'same'
                ? sizesText(item)
                : (item.colors || []).map(c => `${c.name} [${sizesText(c.sizes || {})}]`).join(' | ');
            const level = agingLevel(item);
            return {
                'Code': item.code || 'N/A',
                'Date': fmtDate(item.dateTime),
                'Time': new Date(item.dateTime).toLocaleTimeString('en-IN'),
                'Product Type': item.productType || 'N/A',
                'Quality': item.quality || 'N/A',
                'Cup Size': item.cupSize || 'N/A',
                'Lot Number': item.lotNumber || 'N/A',
                'Colors': colors,
                'Sizes': sizes || 'N/A',
                'Quantity (Dozens)': round2(t.dozens),
                'Total Pieces': t.pieces,
                'Price/Dozen (₹)': t.price,
                'Total Amount (₹)': t.amount,
                'Material (m)': item.material || 0,
                'Weight (kg)': item.weight || 0,
                'Status': item.inStock !== false ? 'In Stock' : 'Out of Stock',
                'Aging': level ? agingTitle(level) : 'Out of stock',
                'Size Format': item.sizeOption === 'same' ? 'Same Sizes' : 'Different Sizes',
                'Source (paper)': item.source || '',
                'Notes': item.notes || 'N/A'
            };
        });
    }

    function pendingRows(scope, payments) {
        const now = new Date();
        return pendingList(scope, payments).map(c => ({
            'Date Added': fmtDate(c.dateAdded),
            'Quality': c.quality,
            'Unique Code': c.code || 'N/A',
            'Lot Number': c.lotNumber || 'N/A',
            'Product Type': c.productType,
            'Quantity (Dozens)': round2(c.totalDozens),
            'Expected Amount (₹)': c.expectedAmount,
            'Received Amount (₹)': c.amountReceived,
            'Pending Amount (₹)': c.pendingAmount,
            'Days in Stock': daysInStock(c.item, now),
            'Status': c.status === 'partial' ? 'Partially Received' : 'Pending',
            'Manual Entry': c.isManualEntry ? 'Yes' : 'No'
        }));
    }

    function weeklyRows(scope, payments, items) {
        const rows = [];
        weekOptions(scope, payments).forEach(w => {
            weeklyReport(scope, payments, items, w.key).days.forEach(day => {
                rows.push({ 'Week': w.label, 'Date': fmtDate(day.date), 'Total Amount (₹)': day.total, 'Records Count': day.entries.length });
                day.entries.forEach(({ payment, item }) => rows.push({
                    'Week': '', 'Date': '',
                    'Quality': payment.quality,
                    'Unique Code': item ? item.code || 'N/A' : 'N/A',
                    'Lot Number': item ? item.lotNumber || 'N/A' : 'N/A',
                    'Amount (₹)': payment.amount,
                    'Product Type': item ? item.productType : 'N/A'
                }));
            });
        });
        return rows;
    }

    function historyRows(scope, payments, items) {
        return paymentHistory(scope, payments, items).map(({ payment, item, weekLabel, expected }) => ({
            'Date Received': fmtDate(payment.date),
            'Week': weekLabel,
            'Quality': payment.quality,
            'Unique Code': item ? item.code || 'N/A' : 'N/A',
            'Lot Number': item ? item.lotNumber || 'N/A' : 'N/A',
            'Amount Received (₹)': payment.amount,
            'Product Type': item ? item.productType : 'N/A',
            'Quantity (Dozens)': item ? round2(itemDozens(item)) : 'N/A',
            'Expected Amount (₹)': expected === null ? 'N/A' : expected,
            'Notes': payment.notes || 'N/A'
        }));
    }

    function valuationRows(scope, payments) {
        const q = qualitySummary(scope, payments);
        const rows = q.rows.map(r => ({
            'Quality': r.quality,
            'Total Quantity (Dozens)': round2(r.dozens),
            'Total Value (₹)': r.value,
            'Percentage of Inventory': `${r.percent}%`
        }));
        rows.push({
            'Quality': 'TOTAL',
            'Total Quantity (Dozens)': round2(q.totalDozens),
            'Total Value (₹)': q.totalValue,
            'Percentage of Inventory': q.totalValue > 0 ? '100%' : '0%'
        });
        return rows;
    }

    function agingRows(scope) {
        const report = agingReport(scope);
        const rows = [];
        [...AGING_ORDER].reverse().forEach(level => {
            report[level].items.forEach(({ item, days, dozens, amount }) => rows.push({
                'Level': agingTitle(level),
                'Quality': item.quality,
                'Unique Code': item.code || 'N/A',
                'Lot Number': item.lotNumber || 'N/A',
                'Days in Stock': days,
                'Quantity (Dozens)': round2(dozens),
                'Value (₹)': amount,
                'Manual Entry': item.isManualEntry ? 'Yes' : 'No'
            }));
        });
        return rows;
    }

    // kind: inventory | pending | weekly | history | valuation | aging
    function exportRows(kind, scope, payments, items) {
        switch (kind) {
            case 'inventory': return inventoryRows(scope);
            case 'pending': return pendingRows(scope, payments);
            case 'weekly': return weeklyRows(scope, payments, items);
            case 'history': return historyRows(scope, payments, items);
            case 'valuation': return valuationRows(scope, payments);
            case 'aging': return agingRows(scope);
            default: return [];
        }
    }

    // ---------- backups (pure: they build / check / merge, the store saves) ----------

    function makeBackup(items, payments, type = 'COMPLETE_BACKUP') {
        return {
            metadata: {
                type,
                created: new Date().toISOString(),
                exportedAt: new Date().toISOString(),
                totalItems: items.length,
                totalPayments: payments.length,
                system: 'ALISHAN_INVENTORY',
                version: '2.0'
            },
            inventory: items.slice(),
            payments: payments.slice()
        };
    }

    // looks inside a backup file WITHOUT changing anything
    function inspectBackup(file, currentCount = 0) {
        if (!file || !Array.isArray(file.inventory)) return fail('Invalid backup file format');
        const { items: cleaned } = normalizeInventory(JSON.parse(JSON.stringify(file.inventory)));
        const good = cleaned.filter(it => validateItem(it, true).ok);
        if (good.length === 0) return fail('No valid items in this file');
        return ok({ valid: good.length, skipped: file.inventory.length - good.length, current: currentCount, items: good });
    }

    // mode: 'replace' | 'merge'  ->  { items, payments }
    function mergeBackup(currentItems, currentPayments, file, mode) {
        const info = inspectBackup(file, currentItems.length);
        if (!info.ok) return info;
        let items;
        if (mode === 'replace') {
            items = info.items;
        } else {
            const ids = new Set(currentItems.map(i => i.id));
            const codes = new Set(currentItems.map(i => i.code));
            const fresh = info.items.filter(i => !ids.has(i.id));
            fresh.forEach(i => {
                if (codes.has(i.code)) i.code = generateCode(codes);
                codes.add(i.code);
            });
            items = [...currentItems, ...fresh];
        }
        items.sort(byDateDesc);

        let payments = currentPayments;
        if (Array.isArray(file.payments) && file.payments.length) {
            payments = mode === 'replace'
                ? file.payments
                : [...currentPayments, ...file.payments.filter(p => !currentPayments.some(a => String(a.id) === String(p.id)))];
        }
        return ok({ items, payments, imported: info.valid, skipped: info.skipped });
    }

    // ============================================================
    //  BULK IMPORT (AI-made JSON of old paper records)
    //  The page only shows + edits drafts; everything below decides what is
    //  valid, what the amounts are and what gets saved.
    // ============================================================

    // only a fallback: the real types are the groups of qualities.json (ctx.productTypes / ref.productTypes)
    const PRODUCT_TYPES = ['BRA', 'PANTY', 'SET', 'BLOUSE'];
    const has = (v) => v !== undefined && v !== null && v !== '';
    const pickFirst = (o, keys) => { for (const k of keys) { if (o && has(o[k])) return o[k]; } return undefined; };

    function stripCodeFence(text) {
        return String(text || '').replace(/^\s*```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    }

    // JSON from an AI is often almost-valid: code fences, curly quotes, trailing commas.
    function parseLooseJson(text) {
        let t = stripCodeFence(text).replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
        if (!t) return { ok: false, error: 'Nothing to check: paste the JSON first.' };
        try { return { ok: true, value: JSON.parse(t) }; } catch (e1) { /* try the small fixes below */ }
        const t2 = t.replace(/,\s*([}\]])/g, '$1');                 // trailing commas
        try { return { ok: true, value: JSON.parse(t2) }; } catch (e2) {
            let where = '';
            const lc = /line (\d+) column (\d+)/.exec(e2.message);
            const pos = /position (\d+)/.exec(e2.message);
            if (lc) where = ` (line ${lc[1]}, column ${lc[2]})`;
            else if (pos) {
                const p = Number(pos[1]);
                const before = t2.slice(0, p);
                where = ` (line ${before.split('\n').length}, near “${t2.slice(Math.max(0, p - 25), p + 15).replace(/\s+/g, ' ')}”)`;
            }
            return { ok: false, error: 'This is not valid JSON' + where + '. Ask the AI to return only valid JSON, or fix that spot.' };
        }
    }

    function isRealDate(y, m, d) {
        const t = new Date(y, m - 1, d);
        return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
    }
    const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // -> { iso, note?, unreadable?, bad? }.  Day-first numbers (14/03/2024) are the Indian way.
    function normalizeDateText(value) {
        const t = String(has(value) ? value : '').trim();
        if (!t) return { iso: '' };
        if (t.includes('?')) return { iso: '', unreadable: true };
        let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ].*)?$/.exec(t);
        if (m) return isRealDate(+m[1], +m[2], +m[3]) ? { iso: isoOf(+m[1], +m[2], +m[3]) } : { iso: '', bad: true };
        m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(t);
        if (m) {
            const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
            return isRealDate(y, +m[2], +m[1])
                ? { iso: isoOf(y, +m[2], +m[1]), note: `Date “${t}” was read as day/month/year — please check it` }
                : { iso: '', bad: true };
        }
        const d = new Date(t);
        if (!isNaN(d)) return { iso: localDate(d), note: `Date “${t}” was converted — please check it` };
        return { iso: '', bad: true };
    }

    // { "28": 2, "30": {"dozens":1,"pieces":3} }  ->  { 28:{dozens,pieces}, 30:{...} }
    function parseSizeMap(obj, label, flags, problems) {
        const out = {};
        if (!obj || typeof obj !== 'object') return out;
        Object.keys(obj).forEach(key => {
            const size = parseInt(String(key).replace(/\D/g, ''));
            const v = obj[key];
            const unread = (x) => typeof x === 'string' && x.includes('?');
            if (!SIZES.includes(size)) {
                if (v !== 0 && v !== '' && v !== null) problems.push(`${label}size ${key} is not an app size (28, 30 ... 46) — change it or remove it.`);
                return;
            }
            let dozens = '', pieces = '';
            if (v && typeof v === 'object') {
                dozens = pickFirst(v, ['dozens', 'dozen', 'dz', 'd']);
                pieces = pickFirst(v, ['pieces', 'piece', 'pcs', 'pc', 'p']);
            } else {
                dozens = v;
            }
            if (unread(dozens) || unread(pieces)) { flags.push(`${label}size ${size}`); dozens = ''; pieces = ''; }
            // 2.5 dozens -> 2 dozens + 6 pieces (shown that way, so nothing is hidden)
            const dzNum = parseFloat(dozens);
            if (isFinite(dzNum) && dzNum % 1 !== 0) {
                const exactPieces = (dzNum - Math.floor(dzNum)) * 12;
                if (Math.abs(exactPieces - Math.round(exactPieces)) > 0.05) {
                    problems.push(`${label}size ${size}: ${dzNum} dozens is not a whole number of pieces — it was rounded, please check it.`);
                }
                const parts = splitPieces(dzNum, pieces);
                dozens = parts.dozens;
                pieces = parts.pieces;
            }
            out[size] = { dozens: has(dozens) ? dozens : '', pieces: has(pieces) ? pieces : '' };
        });
        return out;
    }

    const normKey = (s) => String(s === undefined || s === null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        if (!m) return n; if (!n) return m;
        let prev = Array.from({ length: n + 1 }, (_, j) => j);
        for (let i = 1; i <= m; i++) {
            const cur = [i];
            for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[n];
    }

    // same name once case, spaces, hyphens and underscores are ignored: "L-wood" = "L_WOOD", "RedBean" = "REDBEAN"
    // aliasMap = { normalizedWrittenName: appName } — from the "aliases" lists in qualities.json / colors.json
    // and from replacements the user made in earlier imports.
    function matchExact(name, candidates, aliasMap) {
        const k = normKey(name);
        if (!k) return null;
        const hit = (candidates || []).find(c => normKey(c) === k);
        if (hit) return hit;
        const alias = aliasMap && aliasMap[k];
        return (alias && (candidates || []).includes(alias)) ? alias : null;
    }

    // a quality that is not in the list: the listed qualities that share a word with it vote for the type
    // (if "X-MOLD" is listed under BRA, another "Y-MOLD" is a BRA too). Nothing is typed in here:
    // the words and the types come from qualities.json (typeByName = { "SOME-QUALITY": "BRA", ... }).
    function inferTypeFromNames(name, typeByName) {
        const words = (s) => String(s || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
        const mine = words(name).filter(w => w.length >= 3);
        const votes = {};
        Object.keys(typeByName || {}).forEach(n => {
            const theirs = words(n);
            mine.forEach(w => { if (theirs.includes(w)) votes[typeByName[n]] = (votes[typeByName[n]] || 0) + 1; });
        });
        const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
        return best ? best[0] : '';
    }

    // names that are close to `name` (a spelling slip, a missing word) — for "Did you mean ...?"
    function closeMatches(name, candidates, limit = 3) {
        const k = normKey(name);
        if (k.length < 3) return [];
        return (candidates || [])
            .map(c => ({ c, d: levenshtein(k, normKey(c)), part: normKey(c).includes(k) || k.includes(normKey(c)) }))
            .filter(x => x.d <= Math.max(2, Math.floor(k.length / 4)) || x.part)
            .sort((a, b) => a.d - b.d)
            .slice(0, limit)
            .map(x => x.c);
    }

    // names of the list that could replace an unknown name (first: the user's saved / written aliases, then close spellings)
    function nameSuggestions(name, candidates, aliasMap) {
        const out = [];
        const alias = aliasMap && aliasMap[normKey(name)];
        if (alias && (candidates || []).includes(alias)) out.push(alias);
        closeMatches(name, candidates).forEach(n => { if (!out.includes(n)) out.push(n); });
        return out.slice(0, 4);
    }

    // reads fields by NAME TOLERANTLY: "item_name", "itemName" and "Item Name" are the same key
    function makeReader(raw) {
        const byNorm = {};
        Object.keys(raw).forEach(k => { byNorm[normKey(k)] = k; });
        const used = new Set();
        const read = (aliases) => {
            for (const a of aliases) {
                const k = byNorm[normKey(a)];
                if (k !== undefined && has(raw[k])) { used.add(k); return raw[k]; }
            }
            return undefined;
        };
        const skip = (aliases) => aliases.forEach(a => { const k = byNorm[normKey(a)]; if (k !== undefined) used.add(k); });
        return { read, skip, used };
    }

    // { "Red": {"30": 2, ...}, "Blue": {...} }  ->  [{ name, sizes }]
    function colorMapToList(obj) {
        return Object.keys(obj).filter(k => obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]))
            .map(k => ({ name: k, sizes: obj[k] }));
    }
    const isSizeKey = (k) => SIZES.includes(parseInt(String(k).replace(/\D/g, '')));

    const numberOf = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        const m = /-?\d+(\.\d+)?/.exec(String(has(v) ? v : ''));
        return m ? Number(m[0]) : null;
    };

    // one raw JSON entry -> an editable draft (nothing is checked here)
    //   ref = { qualityNames, typeOfQuality(name), colorNames }  (from the app's own lists)
    function draftFromRaw(raw, index, defaults, ref) {
        raw = raw && typeof raw === 'object' ? raw : {};
        ref = ref || { qualityNames: [], typeOfQuality: () => '', colorNames: [], productTypes: PRODUCT_TYPES };
        const { read, skip, used } = makeReader(raw);
        const unreadable = [];
        const problems = [];
        const notes = [];

        const dateRaw = read(['date', 'entryDate', 'dateTime', 'billDate']);
        const dateInfo = normalizeDateText(dateRaw);
        if (dateInfo.unreadable) unreadable.push('date');
        if (dateInfo.note) notes.push(dateInfo.note);

        // quality: "Rosie-Mold C" = quality "ROSIE-MOLD" + cup "C"
        const qRaw = read(['quality', 'qualityName', 'item_name', 'itemName', 'item', 'productName', 'design', 'article', 'name']);
        let qText = String(has(qRaw) ? qRaw : '').trim();
        let cupText = String(has(read(['cup', 'cupSize', 'cup_size'])) ? read(['cup', 'cupSize', 'cup_size']) : '').trim();
        if (qText.includes('?')) unreadable.push('quality');
        if (!cupText) {
            const m = /^(.*\S)[\s_-]+([A-Fa-f])$/.exec(qText);
            if (m && m[1].length >= 3) { qText = m[1].trim(); cupText = m[2]; }
        }
        const exactQuality = matchExact(qText, ref.qualityNames, ref.qualityAliases);
        const quality = (exactQuality || qText).toUpperCase();
        const qualitySuggestions = exactQuality ? [] : nameSuggestions(qText, ref.qualityNames, ref.qualityAliases);

        // type: given, else the type of the quality (qualities.json; a new quality gets the type of similar listed ones)
        const tRaw = read(['type', 'productType', 'product_type', 'category', 'product']);
        let type = String(has(tRaw) ? tRaw : '').trim().toUpperCase();
        if (type.includes('?')) { unreadable.push('product type'); type = ''; }
        if (!(ref.productTypes || PRODUCT_TYPES).includes(type)) type = '';
        if (!type) type = String(ref.typeOfQuality(quality) || '').toUpperCase();

        // lot number(s). The app's lot format is ONE number ("312449") or a from-to range ("309963-310010").
        // Every size of a block has its own (consecutive) lot number, so a list like ["309963", ..., "309968"]
        // becomes the range first-last. Letters in a lot number are kept as written (the check then asks to fix them).
        const lotRaw = read(['lot', 'lotNumber', 'lot_numbers', 'lotNumbers', 'lots', 'lotNo', 'lot_no']);
        let lotNumber = '';
        const lotNotes = [];
        let lotParts = null;
        const lotTxt = Array.isArray(lotRaw) ? '' : (has(lotRaw) ? String(lotRaw).trim() : '');
        if (Array.isArray(lotRaw)) lotParts = lotRaw.map(x => String(x).trim()).filter(Boolean);
        else if (/^\d+\s*[-–—]\s*\d+$/.test(lotTxt)) lotNumber = lotTxt.replace(/\s*[-–—]\s*/, '-');          // already a range
        else if (/^[\d\s,;–—-]+$/.test(lotTxt) && /\d\D+\d/.test(lotTxt)) lotParts = lotTxt.match(/\d+/g);   // "1, 2, 3" or "1 2 3"
        else lotNumber = lotTxt;
        if (lotParts) {
            if (lotParts.length && lotParts.every(x => /^\d+$/.test(x))) {
                const sorted = lotParts.slice().sort((a, b) => Number(a) - Number(b));
                const lo = sorted[0];
                const hi = sorted[sorted.length - 1];
                lotNumber = lo === hi ? lo : `${lo}-${hi}`;
                const distinct = new Set(sorted.map(Number)).size;
                if (lotParts.length > 2 && Number(hi) - Number(lo) + 1 !== distinct) {
                    lotNotes.push(`${lotParts.length} lot numbers were read (${lo} to ${hi}) but they are not all consecutive. They are saved as the range ${lo}-${hi}; check the lot numbers on the paper.`);
                }
            } else lotNumber = lotParts.join(', ');
        }

        skip(['circled']);
        let price = read(['price', 'rate', 'pricePerDozen', 'price_per_dozen']);
        if (typeof price === 'string') {
            if (price.includes('?')) { unreadable.push('price'); price = ''; }
            else price = price.replace(/[^\d.]/g, '');
        }

        // quantities: the same for all colours (colors + sizes) or per colour (colorSizes)
        let colorSizes = [];
        let colors = [];
        let sizes = {};
        const colorLabel = (n) => (matchExact(n, ref.colorNames, ref.colorAliases) || String(n).trim()).toUpperCase();
        const rawColors = read(['colors', 'color', 'colours', 'colour']);
        const csRaw = read(['colorSizes', 'color_sizes', 'colourSizes', 'colorwise', 'color_wise']);
        const sizesRaw = read(['sizes', 'quantities', 'sizewise', 'size_wise']);
        const plainObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
        let perColor = Array.isArray(csRaw) ? csRaw
            : plainObj(csRaw) ? colorMapToList(csRaw)
            : (Array.isArray(rawColors) && rawColors.some(c => c && typeof c === 'object')) ? rawColors
            : plainObj(rawColors) ? colorMapToList(rawColors) : null;
        // "sizes": { "L-Pista": { "30": 2, ... }, "Gajri": { ... } }  (sizes written per colour)
        if (!perColor && plainObj(sizesRaw) && Object.keys(sizesRaw).length && !Object.keys(sizesRaw).some(isSizeKey)) {
            const asList = colorMapToList(sizesRaw);
            if (asList.length) perColor = asList;
        }
        if (perColor) {
            colorSizes = perColor.filter(c => c && typeof c === 'object').map(c => {
                const nm = pickFirst(c, ['name', 'color', 'colour']);
                return {
                    name: colorLabel(has(nm) ? nm : ''),
                    sizes: parseSizeMap(c.sizes || c.quantities || {}, `${has(nm) ? nm : 'colour'}: `, unreadable, problems)
                };
            });
        } else {
            colors = (Array.isArray(rawColors) ? rawColors : has(rawColors) ? [rawColors] : [])
                .map(c => String(c).trim()).filter(Boolean).map(colorLabel);
            sizes = parseSizeMap(sizesRaw || {}, '', unreadable, problems);
        }
        if (colors.some(c => c.includes('?')) || colorSizes.some(c => c.name.includes('?'))) unreadable.push('color');

        // like a new entry: always in stock, no payment (payments are not part of the import)
        // stock status
        let inStock = defaults.inStock;
        const inStockRaw = read(['inStock']);
        const statusRaw = read(['status']);
        if (typeof inStockRaw === 'boolean') inStock = inStockRaw;
        else if (typeof statusRaw === 'string') {
            if (/out|sold|complete|done|closed|finish|history/i.test(statusRaw)) inStock = false;
            else if (/in\s*stock|active|open/i.test(statusRaw)) inStock = true;
        }

        const aiCheck = read(['check', 'checks']);
        if (has(aiCheck)) notes.push('AI note: ' + String(aiCheck));
        // payment: "paid": true | "received": 65 | "received": {"amount": 65, "date": "..."}
        const payment = { mode: defaults.payment === 'none' ? 'none' : 'full', amount: '', date: '' };
        const rv = read(['received', 'payment', 'paid']);
        if (rv === false || (typeof rv === 'string' && /^(no|none|pending|unpaid)$/i.test(rv.trim()))) payment.mode = 'none';
        else if (rv === true || (typeof rv === 'string' && /^(yes|full|paid|done)$/i.test(rv.trim()))) payment.mode = 'full';
        else if (typeof rv === 'number') { payment.mode = 'amount'; payment.amount = rv; }
        else if (rv && typeof rv === 'object') {
            const a = pickFirst(rv, ['amount', 'value', 'total']);
            const dd = normalizeDateText(pickFirst(rv, ['date', 'on']));
            payment.date = dd.iso || '';
            if (has(a)) { payment.mode = 'amount'; payment.amount = a; }
            else if (rv.full === true || rv.paid === true) payment.mode = 'full';
            if (dd.note) notes.push(`Payment ${dd.note.charAt(0).toLowerCase()}${dd.note.slice(1)}`);
        }
        const material = numberOf(read(['material', 'meter', 'meters']));
        // weight in kg: "18.6", "18.600 kg", "850 gm" are numbers; anything with text/several values goes to the notes
        const weightRaw = read(['weight']);
        let weight = null;
        if (has(weightRaw)) {
            const wm = /^([\d.]+)\s*(kgs?|gms?|g|grams?)?$/i.exec(String(weightRaw).trim());
            if (wm && isFinite(Number(wm[1]))) weight = /^(g|gm|gms|gram|grams)$/i.test(wm[2] || '') ? Math.round(Number(wm[1])) / 1000 : Number(wm[1]);
        }

        // the paper's own totals: used only to double-check the app's calculation
        const paperTotal = numberOf(read(['paperTotal', 'total_dozen', 'totalDozen', 'total_dozens', 'totalDozens', 'totalQuantity', 'total_quantity', 'total', 'totalQty', 'qty']));
        const multiplier = numberOf(read(['multiplier', 'sets', 'numberOfColors', 'colorsCount']));
        skip(['totalPerSet', 'total_per_set']);
        const source = read(['source', 'ref', 'page', 'sourceRef']);

        // everything else the AI wrote is kept in the notes, so nothing is lost
        const noteParts = [];
        const ownNotes = read(['notes', 'remark', 'remarks', 'note']);
        if (has(ownNotes)) noteParts.push(String(ownNotes));
        if (has(weightRaw) && weight === null) noteParts.push('Weight: ' + String(weightRaw));

        return {
            id: 'd' + index,
            index,
            source: String(has(source) ? source : ''),
            date: dateInfo.iso,
            dateText: String(has(dateRaw) ? dateRaw : ''),
            productType: type,
            cupSize: cupText.toUpperCase().replace(/\s*CUP$/, ''),
            quality,
            qualitySuggestions,
            lotNumber,
            notes: noteParts.join('; '),
            price: has(price) ? price : '',
            material: material === null ? '' : material,
            weight: weight === null ? '' : weight,
            sizeOption: perColor ? 'different' : 'same',
            colors, sizes, colorSizes,
            inStock,
            payment,
            paperTotal: paperTotal === null ? '' : paperTotal,
            multiplier: multiplier === null ? '' : multiplier,
            raw: JSON.stringify(raw, null, 1),
            unreadable,
            problems,
            parseNotes: notes,
            lotNotes,
            status: 'new'
        };
    }

    // text -> { ok, drafts } | { ok:false, error }
    function parseBulkJson(text, defaults = {}, ref) {
        const opts = { inStock: defaults.inStock === true, payment: defaults.payment === 'none' ? 'none' : 'full' };
        const parsed = parseLooseJson(text);
        if (!parsed.ok) return parsed;
        let list = parsed.value;
        if (list && !Array.isArray(list)) {
            const inner = Array.isArray(list.entries) ? list.entries
                : Array.isArray(list.items) ? list.items
                : Array.isArray(list.records) ? list.records
                : Array.isArray(list.data) ? list.data : null;
            if (inner) list = inner;
        }
        if (!Array.isArray(list)) return { ok: false, error: 'Expected a list of entries: [ ... ] or {"entries": [ ... ]}.' };
        if (list.length === 0) return { ok: false, error: 'The list is empty — there are no entries to review.' };
        return { ok: true, drafts: list.map((raw, i) => draftFromRaw(raw, i, opts, ref)) };
    }

    // Checks ONE draft. -> { issues:[{level,field,message}], blocking, item, payment, totals }
    // ctx = { items, priceOf(name), colorLabel(name), hasQuality(name), hasColor(name) }
    function checkImportDraft(draft, ctx) {
        const issues = [];
        const err = (field, message) => issues.push({ level: 'error', field, message });
        const warn = (field, message) => issues.push({ level: 'warn', field, message });

        (draft.unreadable || []).forEach(u => err('unreadable', `The AI could not read: ${u} — please fill it in.`));
        (draft.problems || []).forEach(p => err('sizes', p));
        (draft.parseNotes || []).forEach(n => warn('date', n));
        (draft.lotNotes || []).forEach(n => warn('lotNumber', n));

        const types = ctx.productTypes || PRODUCT_TYPES;
        if (!types.includes(draft.productType)) err('productType', `Product type must be one of: ${types.join(', ')}.`);
        if (!String(draft.quality || '').trim()) err('quality', 'Quality is missing.');

        // date
        const when = buildEntryDate(draft.date, '12:00');
        if (!draft.date || !when) err('date', 'Date is missing or not valid.');
        else if (when > new Date()) err('date', 'Date is in the future.');
        else if (when.getFullYear() < 2000) err('date', 'Date is before the year 2000 — check the year.');

        // quantities
        const qty = buildQuantity(draft, ctx.colorLabel);
        if (!qty.ok) err('sizes', qty.error);

        // names the app does not know (still importable)
        if (draft.quality && !ctx.hasQuality(draft.quality)) {
            const sug = (draft.qualitySuggestions || []).slice(0, 3);
            warn('quality', 'This quality is not in qualities.json, so type the price from the paper.' + (sug.length ? ` Did you mean: ${sug.join(', ')}?` : ' Check the spelling.'));
        }
        const colorNames = draft.sizeOption === 'different' ? (draft.colorSizes || []).map(c => c.name) : (draft.colors || []);
        colorNames.filter(n => n && !ctx.hasColor(n)).forEach(n => warn('colors', `Color “${n}” is not in colors.json — it will be imported as written (add it to colors.json later), or use “Replace” to pick an app colour.`));

        // the entry is built by buildNewItem: exactly what the "Add new entry" form does (old date, price from the quality)
        let item = null;
        let payment = null;
        const typedPrice = has(draft.price) ? Number(draft.price) : null;
        if (has(draft.price) && !(isFinite(typedPrice) && typedPrice > 0)) err('price', 'The price must be a number above 0.');
        if (qty.ok && when && !issues.some(i => i.level === 'error' && ['productType', 'quality', 'date'].includes(i.field))) {
            const built = buildNewItem({
                productType: draft.productType, quality: draft.quality, cupSize: draft.cupSize,
                price: typedPrice, inStock: draft.inStock,
                lotNumber: draft.lotNumber, material: draft.material, weight: draft.weight, notes: draft.notes,
                sizeOption: draft.sizeOption, colors: draft.colors, sizes: draft.sizes, colorSizes: draft.colorSizes,
                entry: { mode: 'old', date: draft.date, time: '12:00' }
            }, ctx);
            if (!built.ok) err('item', built.error); else item = built.item;
        }
        if (item) {
            const appPrice = Number(ctx.priceOf(item.quality)) || 0;
            if (typedPrice > 0 && appPrice > 0 && Math.abs(appPrice - typedPrice) > 0.005) {
                warn('price', `The paper price is ₹${typedPrice} but the app's price for ${item.quality} is ₹${appPrice}. The paper price is used for this entry.`);
            } else if (!(item.price > 0)) {
                // no price on the paper and none in the app: the entry would be saved with amount 0 and its
                // payment could never be created, so it cannot be imported until a price is typed
                err('price', 'No price is known for this quality (it is not in the app, or its price is 0). Type the price from the paper.');
            }
        }

        if (item) {
            const expected = item.totalAmount;
            const mode = draft.payment && draft.payment.mode;
            const payDate = (draft.payment && draft.payment.date) || draft.date;
            if (mode === 'full') {
                if (expected > 0) payment = { amount: expected, date: payDate };
            } else if (mode === 'amount') {
                const a = round2(Number(draft.payment.amount));
                if (!(a > 0)) err('payment', 'Received amount must be more than 0.');
                else if (a > expected + 0.005) err('payment', `Received amount ${fmtMoney(a)} is more than the entry amount ${fmtMoney(expected)}.`);
                else payment = { amount: a, date: payDate };
            }
            if (payment && !buildEntryDate(payment.date, '12:00')) err('payment', 'Payment date is not valid.');

            // the paper's own total (and multiplier) is a double-check of the calculation
            const nColors = draft.sizeOption === 'different' ? (draft.colorSizes || []).length : (draft.colors || []).length;
            const mult = Number(draft.multiplier);
            if (has(draft.paperTotal) && isFinite(Number(draft.paperTotal)) && Math.abs(Number(draft.paperTotal) - item.totalDozens) > 0.01) {
                const perColor = draft.sizeOption === 'same' ? ` (${fmtDozens(sizesPieces(item) / 12)} per color × ${nColors} colors)` : '';
                warn('total', `The paper's total is ${fmtDozens(Number(draft.paperTotal))} but the app counts ${fmtDozens(item.totalDozens)} dozens${perColor}.` +
                    (draft.sizeOption === 'same' && mult > 0 && mult !== nColors ? ` The paper multiplier is ${mult} but ${nColors} colors are listed — add the missing colors?` : ' Check the sizes and colors.'));
            } else if (!has(draft.paperTotal) && draft.sizeOption === 'same' && mult > 0 && mult !== nColors) {
                warn('total', `The paper multiplier is ${mult} but ${nColors} colors are listed — check the colors.`);
            }
            // already in the app?
            const dup = ctx.items.find(x => localDate(parseDate(x.dateTime)) === draft.date && x.quality === item.quality &&
                x.productType === item.productType && itemPieces(x) === item.totalPieces);
            if (dup) warn('duplicate', 'An entry with the same date, quality and quantity is already in the app.');
        }

        const blocking = issues.some(i => i.level === 'error');
        const expected = item ? item.totalAmount : 0;
        const received = payment ? payment.amount : 0;
        return {
            issues, blocking, item, payment,
            totals: item ? {
                dozens: item.totalDozens, pieces: item.totalPieces, price: item.price, amount: expected,
                received, pending: Math.max(0, round2(expected - received))
            } : null
        };
    }

    // within the import itself: the 2nd, 3rd ... copy of the same entry. checks = [{ draft, check }]
    function batchDuplicateIds(checks) {
        const seen = new Map();
        const dup = new Set();
        checks.forEach(({ draft, check }) => {
            if (!check.item) return;
            const key = [draft.date, check.item.productType, check.item.quality, check.item.totalPieces].join('|');
            if (seen.has(key)) dup.add(draft.id); else seen.set(key, draft.id);
        });
        return dup;
    }

    // the totals shown in "Import N entries?"
    function importTotals(checks) {
        const t = { count: 0, dozens: 0, amount: 0, received: 0, pending: 0 };
        checks.forEach(c => {
            if (!c || !c.totals) return;
            t.count += 1;
            t.dozens += c.totals.dozens;
            t.amount = round2(t.amount + c.totals.amount);
            t.received = round2(t.received + c.totals.received);
            t.pending = round2(t.pending + c.totals.pending);
        });
        return t;
    }

    // approved drafts -> the real items + payments to save. Nothing is saved here.
    function buildImportEntries(drafts, ctx, batchId) {
        const items = [];
        const payments = [];
        const taken = new Set(ctx.items.map(i => i.code));
        const firstId = nextId(ctx.items);
        const stamp = Date.now();

        for (let n = 0; n < drafts.length; n++) {
            const d = drafts[n];
            const chk = checkImportDraft(d, ctx);
            if (chk.blocking || !chk.item) {
                const first = chk.issues.find(i => i.level === 'error');
                return fail(`Entry ${d.index + 1}: ${first ? first.message : 'cannot be imported'}`);
            }
            const item = chk.item;
            item.id = firstId + n;
            item.code = generateCode(taken);
            item.importBatch = batchId;
            item.source = d.source || '';
            items.push(item);
            if (chk.payment) {
                payments.push({
                    id: stamp * 1000 + n,
                    inventoryId: item.id,
                    quality: item.quality,
                    amount: chk.payment.amount,
                    date: chk.payment.date,
                    notes: 'Imported (old record)',
                    week: weekInfo(chk.payment.date).week,
                    importBatch: batchId
                });
            }
        }
        return ok({ items, payments });
    }

    // The text the user gives to an AI together with the photos of the paper copy.
    // Every quality / colour / type named in it comes from qualities.json and colors.json
    // (nothing is typed in here): the examples use the first names of those files.
    function bulkPrompt(qualityNamesByType, colorNames) {
        const groups = Object.keys(qualityNamesByType || {}).filter(t => (qualityNamesByType[t] || []).length);
        const typeList = Object.keys(qualityNamesByType || {}).map(t => t.toUpperCase()).join(' | ');      // qualities.json groups
        const qualityList = groups.map(t => `     ${t.toUpperCase()}: ${qualityNamesByType[t].join(', ')}`).join('\n');
        const colours = (colorNames || []).join(', ');                                                      // colors.json
        return `You are helping me digitalize an old paper ledger (notebook) of a garment business into an app.
Read the attached photo(s) carefully and return ONLY valid JSON: no explanation, no chit-chat, no markdown, no code fence.

THE LEDGER
The ledger is written in BLOCKS. ONE BLOCK = ONE ENTRY. Every block on the page becomes exactly one entry, from top to bottom.
A block usually has: the quality name (sometimes with a cup letter), a date, a circled number (the price), sizes written on top with the quantity under each size, the colours, a boxed lot number, and a total like "10 x 6 = 60".
A diagonal line drawn across a whole block is only a bookkeeping mark, NOT a cancellation: still copy that block.

OUTPUT SHAPE
{
  "entries": [
    {
      "source": "photo 1, entry 1",
      "date": "YYYY-MM-DD",
      "type": "${typeList}",
      "quality": "QUALITY-NAME",
      "cup": "A | B | C | D | E | F",
      "lot": "FROM_LOT-TO_LOT",
      "weight": "",
      "meter": "",
      "price": 24,
      "colors": ["COLOR1", "COLOR2"],
      "sizes": { "30": 2, "32": 10, "34": 10 },
      "multiplier": 2,
      "total_dozen": 44,
      "notes": ""
    }
  ]
}

RULES

1. PRICE: the circled number (for example (22), (24), (25), (32), (50)) is the PRICE, the rate per dozen. Put it in "price" as a number. Never put it in "notes".

2. ALL QUANTITIES ARE DOZENS. Numbers under the sizes, the line calculations and the totals are DOZENS, not pieces.
   "sizes" must be a direct object: { "30": 2, "32": 10, "34": 10 }
   - Allowed sizes are only 28, 30, 32, 34, 36, 38, 40, 42, 44, 46.
   - Half dozens are allowed: 2.5.
   - If pieces are written too, use { "dozens": 2, "pieces": 3 } for that size (pieces 0 to 11).

3. COLOURS AND SIZES: never make separate entries for different colours of the SAME block.
   CASE A: the same sizes for every colour: use "colors": [all the colours] together with one "sizes" object.
           "multiplier" = the number after "x" (for example 6 in "10 x 6 = 60").
   CASE B: each colour has its own sizes: do NOT use "colors" and "sizes". Use "colorSizes":
     "colorSizes": [
       { "name": "ONION",   "sizes": { "32": 2, "34": 10, "36": 10 }, "total": 22 },
       { "name": "REDBEAN", "sizes": { "32": 1, "34": 4,  "36": 4  }, "total": 9 }
     ]
     "total_dozen" is then the sum of all colours.

4. LOT, WEIGHT, METER
   - "lot": the boxed lot number(s). Every size has its own lot number, so a block can show 6 or 12 lot numbers one after another (consecutive). Write ONLY the first and the last as a range: "309963-309968". If only one lot number is written, write just that number: "312449". Never list all of them.
   - "weight": any weight as written with its unit (for example "18.600 kg", "Cream: 0.818 gm, Redbean: 850 gm"). "" if not written.
   - "meter": fabric length in metres, a number (for example "1.44", "1.38", "61"). Letters like "L" or "M" in circles or margins mean meter. "" if not written.

5. QUALITY, CUP AND TYPE
   - If quality and cup are written together (for example "Maya - C", "Aliza D", "Siska-Pad B"), split them:
     "quality": the base name in UPPERCASE with hyphens (ALIZA, MAYA, SISKA-PAD, ROSE-MOLD)
     "cup": the cup letter A to F. If no cup is written use "".
   - The qualities of the app, by type:
${qualityList}
     Use the app's spelling only when the written name is clearly the same name. Otherwise write the name as written.
   - "type": the type the quality belongs to (see the list above), or as the page or heading says. If it is not clear, use "".

6. COLOUR NAMES: use these standard names:
   ${colours}
   - Expand abbreviations: MR = MAROON, BK = BLACK.
   - If a written colour is NOT in this list (for example GAJRI), write it exactly as written. Never replace it with a "similar" colour and never skip it.

7. DATE: write YYYY-MM-DD. The ledger uses day/month/year (Indian style): 4/7/26 = 2026-07-04.

8. TOTAL: "total_dozen" = the total in dozens that the paper writes for the block.

9. PAYMENT AND STATUS: only if they are clearly written on the paper:
   - "received": { "amount": 5000, "date": "YYYY-MM-DD" }
   - "paid": true, if the block is marked fully paid
   - "status": "complete", if the block is marked complete
   If they are not written, leave these keys OUT completely. Never invent them.

10. NOTES: put the raw calculation (for example "10 x 6 = 60 doz") and any other written remark in "notes" as plain text.

CHECK YOUR OWN READING (very important)
- Add up your sizes. Case A: the sum of sizes x number of colours. Case B: the sum of all colours. It must equal the paper's total.
- COUNT THE COLOURS: if the paper says "x 6" there must be 6 colours in your list. If the paper names fewer colours, write only the names you can read and add "check": "x 6 but only 4 colours written".
- If your sum still does not match the paper after looking at the digits again, keep what you read and add "check": "short reason".
- Overwritten digits: use the newest (top) digit.
- If you cannot read something, write "?" for it. NEVER guess a number, a date or a name.

Return exactly: { "entries": [ ...one object per block... ] }`;
    }

    return {
        // basics
        SIZES, CONFIG, AGING_LEVELS, AGING_ORDER, round2, parseDate, splitPieces, colorName,
        // one entry
        sizesPieces, itemPieces, itemDozens, itemPrice, itemAmount, itemTotals, applyTotals, describeItem,
        daysInStock, agingLevel, agingBucket: agingLevel, agingRange, agingTitle, agingBreakdownHTML,
        isAddedWithinDays, isLowStock, weekInfo,
        // dates of an entry
        localDate, localTime, buildEntryDate, entryInfo, resolveEntry, matchesPeriod,
        // payments
        paymentsFor, paymentIndex, paymentStatus, buildPayment,
        // checking + building entries
        carryPieces, generateCode, normalizeInventory, validateItem, backfillPrices,
        buildQuantity, buildNewItem, buildUpdatedItem,
        // finding things
        itemSearchText, matchesSearch, filterItems, paginate, typeStats, suggest,
        // numbers for the pages
        summarize, scopePayments, weeklyAverage, cardData, pendingList, paymentCards, weekOptions, weeklyReport,
        paymentHistory, valuationTrend, qualitySummary, agingReport, advancedPaymentSearch,
        // Excel rows + backups
        exportRows, makeBackup, inspectBackup, mergeBackup,
        // bulk import (AI JSON) with review
        PRODUCT_TYPES, parseLooseJson, normalizeDateText, parseBulkJson, checkImportDraft,
        batchDuplicateIds, importTotals, buildImportEntries, bulkPrompt, normKey, matchExact, closeMatches, nameSuggestions, inferTypeFromNames,
        // formatting
        fmtNumber, fmtMoney, fmtDozens, fmtDate, fmtDateLong, fmtDateTime, percent
    };
})();

if (typeof window !== 'undefined') window.AlishanCalc = AlishanCalc;
if (typeof module !== 'undefined' && module.exports) module.exports = AlishanCalc;
