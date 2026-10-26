/* ============================================================
   search.js — THE search box. One file, the same on every page.

   A page only adds   <div id="alishan-search"></div>   and calls

       AlishanSearch.init({ onSearch: (term) => { ...draw again... } });

   and then asks  AlishanSearch.getTerm()  when it needs the words
   that are being searched (usually: AlishanStore.query({ search: ... })).

   What it does (identically everywhere):
     • live suggestions while you type — from EVERY field of the
       inventory (quality, lot, code, colour, product type, cup size,
       notes ...), plus a "Search for ..." row
     • search history when the box is empty (and a Clear button)
     • searches ANYTHING: every word you type must match somewhere in
       an entry (quality, lot, code, colour, type, cup, notes, date,
       price, quantity, status, aging level, size ...) — the matching
       rule itself is in calc.js (AlishanCalc.matchesSearch)
     • keyboard: Up / Down / Enter / Esc;  x clears the search
     • "top searches" button

   The history is kept by the store (db.js); this file only draws.
   ============================================================ */

if (typeof AlishanHas === 'function' && !AlishanHas({ AlishanStore: 1, AlishanCalc: 1 })) { throw new Error('search.js: store.js / calc.js not loaded yet'); }

var AlishanSearch = (() => {
    'use strict';

    const DEFAULT_PLACEHOLDER = 'Search anything — quality, lot, code, colour, type, cup size, notes, date, price …';
    const ICONS = {
        quality: 'fa-tag', lot: 'fa-hashtag', code: 'fa-barcode', color: 'fa-palette',
        type: 'fa-shapes', cup: 'fa-circle-notch', note: 'fa-sticky-note', history: 'fa-clock', run: 'fa-search'
    };

    let opts = { mount: '#alishan-search', placeholder: DEFAULT_PLACEHOLDER, onSearch: () => {} };
    let root, input, dropdown, clearBtn;
    let rows = [];            // what the dropdown currently shows (for keyboard use)
    let active = -1;
    let term = '';            // the words that are currently being searched
    let historyCache = [];
    let typingTimer = null;

    const esc = (v) => String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function highlight(text, query) {
        const safe = esc(text);
        if (!query) return safe;
        const q = esc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return safe.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
    }

    // ================= building the box =================

    function init(options = {}) {
        opts = { ...opts, ...options };
        root = document.querySelector(opts.mount);
        if (!root) { console.warn('AlishanSearch: nothing to mount on', opts.mount); return; }

        root.classList.add('as-root');
        root.innerHTML = `
            <div class="as-bar">
                <i class="fas fa-search as-icon"></i>
                <input id="searchInput" class="as-input" type="text" autocomplete="off" spellcheck="false"
                       placeholder="${esc(opts.placeholder)}" aria-label="Search">
                <button type="button" class="as-clear" title="Clear search" aria-label="Clear search" hidden>&times;</button>
                <button type="button" class="as-go"><i class="fas fa-search"></i> Search</button>
                <button type="button" class="as-top" title="Top searches" aria-label="Top searches"><i class="fas fa-chart-bar"></i></button>
            </div>
            <ul class="as-dropdown" hidden></ul>`;

        input = root.querySelector('.as-input');
        dropdown = root.querySelector('.as-dropdown');
        clearBtn = root.querySelector('.as-clear');

        input.addEventListener('focus', () => refreshDropdown());
        input.addEventListener('input', () => {
            clearBtn.hidden = !input.value;
            clearTimeout(typingTimer);
            typingTimer = setTimeout(refreshDropdown, 90);           // live suggestions
        });
        input.addEventListener('keydown', onKey);
        clearBtn.addEventListener('click', clear);
        root.querySelector('.as-go').addEventListener('click', submit);
        root.querySelector('.as-top').addEventListener('click', showTopSearches);
        document.addEventListener('mousedown', (e) => { if (root && !root.contains(e.target)) close(); });

        AlishanStore.getSearchHistory().then(h => { historyCache = h; });
    }

    // ================= dropdown =================

    function close() {
        if (!dropdown) return;
        dropdown.hidden = true;
        active = -1;
    }

    function refreshDropdown() {
        const text = input.value.trim();
        rows = [];

        if (!text) {
            // empty box -> the search history
            const recent = historyCache.slice(-8).reverse();
            if (recent.length) {
                rows.push({ kind: 'head', text: 'Recent searches', clearable: true });
                recent.forEach(h => rows.push({ kind: 'history', text: h, value: h }));
            } else {
                rows.push({ kind: 'hint', text: 'Type to search anything: quality, lot number, code, colour, type, cup size, notes, date, price …' });
            }
        } else {
            // typing -> "search for ..." + live suggestions from every field
            rows.push({ kind: 'run', text: `Search for “${text}”`, value: text });
            let category = '';
            AlishanStore.suggest(text).forEach(s => {
                if (s.category !== category) { category = s.category; rows.push({ kind: 'head', text: category }); }
                rows.push({ kind: 'suggestion', type: s.type, text: s.text, value: s.original || s.text, fuzzy: s.fuzzy });
            });
        }
        draw(text);
    }

    function draw(query) {
        dropdown.innerHTML = '';
        rows.forEach((r, i) => {
            const li = document.createElement('li');
            if (r.kind === 'head') {
                li.className = 'as-head';
                li.innerHTML = `<span>${esc(r.text)}</span>` + (r.clearable ? '<button type="button" class="as-clear-history">Clear</button>' : '');
                if (r.clearable) {
                    li.querySelector('button').addEventListener('mousedown', async (e) => {
                        e.preventDefault();
                        await AlishanStore.clearSearchHistory();
                        historyCache = [];
                        refreshDropdown();
                    });
                }
            } else if (r.kind === 'hint') {
                li.className = 'as-hint';
                li.textContent = r.text;
            } else {
                li.className = `as-row as-${r.kind}${r.fuzzy ? ' as-fuzzy' : ''}`;
                li.dataset.index = i;
                const icon = r.kind === 'history' ? ICONS.history : r.kind === 'run' ? ICONS.run : (ICONS[r.type] || ICONS.quality);
                li.innerHTML = `<i class="fas ${icon}"></i><span>${r.kind === 'suggestion' ? highlight(r.text, query) : esc(r.text)}</span>`;
                li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
                li.addEventListener('mousemove', () => setActive(i));
            }
            dropdown.appendChild(li);
        });
        active = -1;
        dropdown.hidden = false;
    }

    function selectable() {
        return [...dropdown.querySelectorAll('.as-row')];
    }

    function setActive(i) {
        const list = selectable();
        list.forEach(li => li.classList.remove('as-active'));
        if (i >= 0 && i < list.length) {
            active = i;
            list[i].classList.add('as-active');
            list[i].scrollIntoView({ block: 'nearest' });
        } else {
            active = -1;
        }
    }

    function choose(rowIndex) {
        const r = rows[rowIndex];
        if (!r || !r.value) return;
        run(r.value, r.kind === 'suggestion' ? r.type : r.kind === 'history' ? 'history' : 'search');
    }

    function onKey(e) {
        const open = dropdown && !dropdown.hidden;
        const list = open ? selectable() : [];
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) refreshDropdown(); else setActive(Math.min(active + 1, list.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, -1)); }
        else if (e.key === 'Escape') { close(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && active >= 0 && list[active]) choose(Number(list[active].dataset.index));
            else submit();
        }
    }

    // ================= searching =================

    // run a search for these words (and tell the page)
    async function run(value, type = 'search') {
        term = String(value || '').trim();
        input.value = term;
        clearBtn.hidden = !term;
        close();
        opts.onSearch(term, { type });

        if (term) {
            await AlishanStore.recordSearch(term, type);            // history + top searches (db.js)
            historyCache = await AlishanStore.getSearchHistory();
        }
    }

    function submit() { return run(input ? input.value : ''); }

    function clear() {
        if (!input) return;
        input.value = '';
        if (term) run('');              // search was active -> show everything again
        else { clearBtn.hidden = true; refreshDropdown(); }
        input.focus();
    }

    const getTerm = () => term;
    function setTerm(value) { if (input) run(value); }

    // ================= top searches =================

    async function showTopSearches() {
        let modal = document.getElementById('asTopModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'asTopModal';
            modal.className = 'as-modal';
            modal.innerHTML = `
                <div class="as-modal-box" role="dialog" aria-modal="true">
                    <div class="as-modal-head"><h3><i class="fas fa-chart-line"></i> Top searches</h3>
                        <button type="button" class="as-modal-x" aria-label="Close">&times;</button></div>
                    <div class="as-modal-body"></div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('mousedown', (e) => { if (e.target === modal || e.target.closest('.as-modal-x')) modal.hidden = true; });
        }
        const analytics = await AlishanStore.getSearchAnalytics();
        const sorted = Object.values(analytics).sort((a, b) => b.count - a.count).slice(0, 10);
        modal.querySelector('.as-modal-body').innerHTML = sorted.length
            ? sorted.map((a, i) => `
                <div class="as-top-row">
                    <span class="as-top-rank">${i + 1}</span>
                    <span class="as-top-q">${esc(a.query)}</span>
                    <span class="as-top-n">${a.count} search${a.count === 1 ? '' : 'es'}</span>
                </div>`).join('')
            : '<p class="as-hint">No searches yet.</p>';
        modal.hidden = false;
    }

    return { init, getTerm, setTerm, submit, clear, showTopSearches };
})();

window.AlishanSearch = AlishanSearch;
