/* ============================================================
   bulk-import.js — "Bulk Import (AI JSON)" window on the Inventory page.
   UI ONLY: it shows the entries one by one, lets you correct ANYTHING
   (date, quality, colours, sizes, price, payment ...) and approve them.

   It does no maths and saves nothing by itself:
     • reading the JSON, checking an entry, dozens / amount / pending
         -> AlishanStore.parseBulk / checkImportDraft (calc.js does the work)
     • saving the approved entries (and their payments), undoing an import
         -> AlishanStore.importEntries / undoImport
   Nothing is saved until you press "Import".
   ============================================================ */

var BulkImport = (() => {
    'use strict';

    const esc = (v) => escapeHtml(v);
    const types = () => AlishanStore.getProductTypes();      // the groups of qualities.json
    const CUPS = ['A', 'B', 'C', 'D', 'E', 'F'];

    let overlay = null;
    let state = null;               // { drafts, checks, dups, current, filter }
    let editTimer = null;

    const $ = (sel) => overlay.querySelector(sel);
    const $$ = (sel) => [...overlay.querySelectorAll(sel)];
    const toast = (msg, type = 'info') => {
        if (typeof showNotification === 'function') showNotification(msg, type); else alert(msg);
    };

    // ================= the window =================

    function build() {
        overlay = document.createElement('div');
        overlay.className = 'bi-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
        <div class="bi-box" role="dialog" aria-modal="true" aria-label="Bulk import">
            <div class="bi-head">
                <h2><i class="fas fa-magic"></i> Bulk Import — old records from AI JSON</h2>
                <button type="button" class="bi-x" aria-label="Close">&times;</button>
            </div>

            <!-- STEP 1: get the JSON -->
            <div class="bi-step" id="biLoad">
                <ol class="bi-how">
                    <li><b>Copy the AI prompt</b> below.</li>
                    <li>Give that prompt + photos of your paper copy to an AI (ChatGPT, Gemini …). Do a few pages at a time.</li>
                    <li><b>Paste the JSON</b> it returns here and press <b>Check JSON</b>. You review every entry before anything is saved.</li>
                </ol>
                <div class="bi-row">
                    <button type="button" class="bi-btn" id="biCopyPrompt"><i class="fas fa-copy"></i> Copy AI prompt</button>
                    <label class="bi-field">Old entries are
                        <select id="biDefStock">
                            <option value="out" selected>Out of stock (history — not in Aging)</option>
                            <option value="in">In stock</option>
                        </select>
                    </label>
                    <label class="bi-field">If the JSON does not say, payment is
                        <select id="biDefPay">
                            <option value="full" selected>Fully received (not in Pending)</option>
                            <option value="none">Not received (counts as Pending)</option>
                        </select>
                    </label>
                </div>
                <textarea id="biText" rows="11" spellcheck="false" placeholder='Paste the JSON here …   {"entries": [ { "date": "2024-03-14", "quality": "...", "colors": [...], "sizes": {...} } ]}'></textarea>
                <div class="bi-row">
                    <label class="bi-btn bi-btn-light"><i class="fas fa-file-upload"></i> Open a .json file
                        <input type="file" id="biFile" accept=".json,.txt,application/json,text/plain" hidden>
                    </label>
                    <button type="button" class="bi-btn bi-primary" id="biCheck"><i class="fas fa-search"></i> Check JSON &amp; start review</button>
                </div>
                <div class="bi-error" id="biError" hidden></div>
                <div id="biBatches"></div>
            </div>

            <!-- STEP 2: review one by one -->
            <div class="bi-step" id="biReview" hidden>
                <div class="bi-topbar">
                    <button type="button" class="bi-btn bi-btn-light" id="biBack"><i class="fas fa-arrow-left"></i> Back to JSON</button>
                    <div class="bi-progress" id="biProgress"></div>
                    <select id="biFilter" aria-label="Show">
                        <option value="all">Show all</option>
                        <option value="attention">Needs attention</option>
                        <option value="new">Not reviewed yet</option>
                        <option value="approved">Approved</option>
                        <option value="skipped">Skipped</option>
                    </select>
                </div>
                <div class="bi-colorfix" id="biColorFix" hidden></div>
                <div class="bi-grid">
                    <div class="bi-list" id="biList"></div>
                    <div class="bi-editor" id="biEditor"></div>
                </div>
                <div class="bi-bottom">
                    <button type="button" class="bi-btn bi-btn-light" id="biApproveClean"><i class="fas fa-check-double"></i> Approve all without problems</button>
                    <span class="bi-spacer"></span>
                    <span id="biImportInfo"></span>
                    <button type="button" class="bi-btn bi-primary" id="biImport" disabled><i class="fas fa-download"></i> Import</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        $('.bi-x').addEventListener('click', close);
        $('#biCopyPrompt').addEventListener('click', copyPrompt);
        $('#biCheck').addEventListener('click', loadJson);
        $('#biFile').addEventListener('change', readFile);
        $('#biBack').addEventListener('click', () => showStep('load'));
        $('#biFilter').addEventListener('change', (e) => { state.filter = e.target.value; renderList(); });
        $('#biApproveClean').addEventListener('click', approveClean);
        $('#biImport').addEventListener('click', importNow);
    }

    function showStep(step) {
        $('#biLoad').hidden = step !== 'load';
        $('#biReview').hidden = step !== 'review';
        if (step === 'load') renderBatches();
    }

    function open() {
        if (!overlay) build();
        overlay.hidden = false;
        document.body.classList.add('modal-open');
        if (state && state.drafts.length) showStep('review'); else showStep('load');
    }

    function close() {
        if (state && state.drafts.some(d => d.status !== 'new') &&
            !confirm('Close the import window? Your review so far will be lost (nothing has been saved).')) return;
        state = null;
        overlay.hidden = true;
        document.body.classList.remove('modal-open');
    }

    // ================= step 1 =================

    async function copyPrompt() {
        const text = AlishanStore.aiPrompt();
        try {
            await navigator.clipboard.writeText(text);
            toast('AI prompt copied. Paste it into the AI together with the photos.', 'success');
        } catch (e) {
            const t = $('#biText');                       // clipboard blocked: show it so it can be copied by hand
            t.value = text;
            t.select();
            toast('Could not copy automatically — the prompt is in the box, press Ctrl+C.', 'warning');
        }
    }

    function readFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { $('#biText').value = String(reader.result || ''); };
        reader.readAsText(file);
    }

    function showError(msg) {
        const box = $('#biError');
        box.hidden = !msg;
        box.textContent = msg || '';
    }

    function loadJson() {
        showError('');
        const res = AlishanStore.parseBulk($('#biText').value, { inStock: $('#biDefStock').value === 'in', payment: $('#biDefPay').value });
        if (!res.ok) { showError(res.error); return; }

        state = { drafts: res.drafts, checks: {}, dups: new Set(), current: 0, filter: 'all' };
        state.drafts.forEach(d => {
            d.chips = d.sizeOption === 'different' ? d.colorSizes.map(c => c.name) : d.colors.slice();
            state.checks[d.id] = AlishanStore.checkImportDraft(d);
        });
        refreshDuplicates();
        $('#biFilter').value = 'all';
        showStep('review');
        renderAll();
        toast(`${state.drafts.length} entries loaded. Review them one by one.`, 'success');
    }

    function renderBatches() {
        const box = $('#biBatches');
        const batches = AlishanStore.listImportBatches();
        if (!batches.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<h4>Earlier imports</h4>' + batches.map(b => `
            <div class="bi-batch">
                <span>${esc(b.id)} · ${b.count} entries · ${AlishanCalc.fmtDateLong(b.date)}</span>
                <button type="button" class="bi-btn bi-danger" data-undo="${esc(b.id)}"><i class="fas fa-undo"></i> Undo this import</button>
            </div>`).join('');
        box.querySelectorAll('[data-undo]').forEach(btn => btn.addEventListener('click', async () => {
            if (!confirm(`Remove all entries (and their payments) added by ${btn.dataset.undo}? A safety backup is kept.`)) return;
            const r = await AlishanStore.undoImport(btn.dataset.undo);
            toast(r.ok ? r.message : r.error, r.ok ? 'success' : 'error');
            renderBatches();
        }));
    }

    // ================= review: list =================

    function statusOf(d) {
        const c = state.checks[d.id];
        if (d.status === 'approved') return 'approved';
        if (d.status === 'skipped') return 'skipped';
        if (c.blocking) return 'error';
        if (c.issues.length || state.dups.has(d.id)) return 'warn';
        return 'new';
    }
    const ICONS = { approved: 'fa-check-circle', skipped: 'fa-forward', error: 'fa-times-circle', warn: 'fa-exclamation-triangle', new: 'fa-circle' };

    function refreshDuplicates() {
        state.dups = AlishanStore.batchDuplicateIds(state.drafts.map(d => ({ draft: d, check: state.checks[d.id] })));
    }

    function matchesFilter(d) {
        const s = statusOf(d);
        switch (state.filter) {
            case 'attention': return s === 'error' || s === 'warn';
            case 'new': return s === 'new' || s === 'warn' || s === 'error';
            case 'approved': return s === 'approved';
            case 'skipped': return s === 'skipped';
            default: return true;
        }
    }

    function rowHTML(d) {
        const c = state.checks[d.id];
        const s = statusOf(d);
        const amount = c.totals ? AlishanCalc.fmtMoney(c.totals.amount) : '—';
        return `<button type="button" class="bi-row-item bi-${s} ${d.index === state.current ? 'bi-current' : ''}" data-i="${d.index}">
            <i class="fas ${ICONS[s]}"></i>
            <span class="bi-row-main"><b>#${d.index + 1}</b> ${esc(d.quality || '?')}</span>
            <span class="bi-row-sub">${d.date ? AlishanCalc.fmtDateLong(d.date) : 'no date'} · ${amount}</span>
        </button>`;
    }

    function renderList() {
        const list = $('#biList');
        list.innerHTML = state.drafts.filter(matchesFilter).map(rowHTML).join('') || '<p class="bi-empty">Nothing to show here.</p>';
        list.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => select(Number(b.dataset.i))));
        const cur = list.querySelector('.bi-current');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
    }

    function updateRow(d) {
        const old = $(`#biList [data-i="${d.index}"]`);
        if (!old) return;
        const holder = document.createElement('div');
        holder.innerHTML = rowHTML(d);
        const row = holder.firstElementChild;
        row.addEventListener('click', () => select(d.index));
        old.replaceWith(row);
    }

    function renderProgress() {
        const counts = { approved: 0, skipped: 0, error: 0, rest: 0 };
        state.drafts.forEach(d => {
            const s = statusOf(d);
            if (s === 'approved') counts.approved++; else if (s === 'skipped') counts.skipped++;
            else if (s === 'error') counts.error++; else counts.rest++;
        });
        $('#biProgress').innerHTML = `Entry <b>${state.current + 1}</b> of ${state.drafts.length} ·
            <span class="bi-ok">${counts.approved} approved</span> ·
            <span>${counts.skipped} skipped</span> ·
            <span class="bi-bad">${counts.error} need fixing</span> ·
            <span>${counts.rest} not reviewed</span>`;

        const approved = state.drafts.filter(d => d.status === 'approved');
        const totals = AlishanStore.importTotals(approved.map(d => state.checks[d.id]));
        $('#biImportInfo').innerHTML = approved.length
            ? `${totals.count} entries · amount ${AlishanCalc.fmtMoney(totals.amount)} · received ${AlishanCalc.fmtMoney(totals.received)} · pending ${AlishanCalc.fmtMoney(totals.pending)}`
            : 'Approve entries to import them';
        $('#biImport').disabled = approved.length === 0;
        $('#biImport').innerHTML = `<i class="fas fa-download"></i> Import ${approved.length} approved`;
    }

    // every colour of the import that the app does not have, with the number of entries it is in
    function unknownColors() {
        const map = new Map();
        state.drafts.forEach(x => new Set(x.chips).forEach(n => {
            if (!ItemForm.getColorStyle(n)) map.set(n, (map.get(n) || 0) + 1);
        }));
        return map;
    }

    // colours that already exist in an entry that also has `oldName`: choosing one of them would
    // mix two colours into one (the quantity would change), so they are not offered
    function blockedFor(oldName) {
        const blocked = new Set();
        state.drafts.forEach(x => { if (x.chips.includes(oldName)) x.chips.forEach(n => blocked.add(n)); });
        return blocked;
    }

    // ONE place to fix all unknown colours of the whole import (sizes stay with the colour)
    function renderColorFix() {
        const box = $('#biColorFix');
        const unknown = unknownColors();
        box.hidden = unknown.size === 0;
        if (unknown.size === 0) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="bi-colorfix-title"><i class="fas fa-palette"></i> Colors that are not in the app (${unknown.size}) — choose the app's colour for each:</div>
            <div class="bi-colorfix-list">${[...unknown.entries()].map(([name, count]) => {
                const blocked = blockedFor(name);
                const sug = AlishanStore.closeColors(name).filter(c => !blocked.has(c.name));
                const all = AlishanStore.getColors().filter(c => !blocked.has(c.name));
                return `<label class="bi-colorfix-item"><span><b>${esc(name)}</b> <small>(${count} ${count === 1 ? 'entry' : 'entries'})</small></span>
                    <select data-fixold="${esc(name)}"><option value="">Choose …</option>
                        ${sug.length ? `<optgroup label="Suggestions">${sug.map(c => `<option value="${esc(c.name)}">${esc(c.displayName)}</option>`).join('')}</optgroup>` : ''}
                        <optgroup label="All colours">${all.map(c => `<option value="${esc(c.name)}">${esc(c.displayName)}</option>`).join('')}</optgroup>
                    </select></label>`;
            }).join('')}</div>`;
        box.querySelectorAll('[data-fixold]').forEach(sel => sel.addEventListener('change', () => {
            if (sel.value) replaceColor(sel.dataset.fixold, sel.value, true);
        }));
    }

    function renderAll() { renderColorFix(); renderList(); renderEditor(); renderProgress(); }

    function select(i) {
        readEditor();
        state.current = Math.max(0, Math.min(state.drafts.length - 1, i));
        renderAll();
    }

    // ================= review: the editor =================

    const val = (id) => { const el = $('#' + id); return el ? el.value : ''; };

    function sizeBlockHTML(sizes, prefixClass) {
        return '<div class="size-grid">' + ItemForm.SIZES.map(size => {
            const cell = (sizes && sizes[size]) || {};
            return ItemForm.sizeCellHTML(size, {
                dozenClass: `${prefixClass}${size}`, piecesClass: `${prefixClass}${size}_pieces`,
                dozenValue: cell.dozens, piecesValue: cell.pieces
            });
        }).join('') + '</div>';
    }

    function chipHTML(name) {
        const st = ItemForm.getColorStyle(name);
        const style = st ? `background:${st.backgroundColor};color:${st.textColor};border-color:${st.borderColor}` : '';
        return `<span class="bi-chip ${st ? '' : 'bi-chip-unknown'}" style="${style}">${esc(st ? st.displayName : name)}
            <button type="button" data-swap="${esc(name)}" title="Replace this colour with another one (keeps its sizes)" aria-label="Replace ${esc(name)}"><i class="fas fa-exchange-alt"></i></button>
            <button type="button" data-rmcolor="${esc(name)}" aria-label="Remove ${esc(name)}">&times;</button></span>`;
    }

    // "Gajri is not in the app's colours -> replace with [ ... ]". The sizes of the colour are kept.
    function swapRowHTML(d, name) {
        const known = !!ItemForm.getColorStyle(name);
        const taken = new Set(d.chips);
        const suggestions = AlishanStore.closeColors(name).filter(c => !taken.has(c.name));
        const all = AlishanStore.getColors().filter(c => !taken.has(c.name));
        return `<div class="bi-swaprow" data-for="${esc(name)}">
            <span>${known ? `Replace <b>${esc(name)}</b>` : `<b>${esc(name)}</b> is not in the app's colour list.`} Replace with:</span>
            <select class="bi-swapselect" data-old="${esc(name)}">
                <option value="">Choose a colour …</option>
                ${suggestions.length ? `<optgroup label="Suggestions">${suggestions.map(c => `<option value="${esc(c.name)}">${esc(c.displayName)}</option>`).join('')}</optgroup>` : ''}
                <optgroup label="All colours">${all.map(c => `<option value="${esc(c.name)}">${esc(c.displayName)}</option>`).join('')}</optgroup>
            </select>
            <label class="bi-inline"><input type="checkbox" class="bi-swapall" checked> in all entries</label>
        </div>`;
    }

    function diffCardHTML(name, sizes) {
        const st = ItemForm.getColorStyle(name);
        const style = st ? `background:${st.backgroundColor};color:${st.textColor};border-color:${st.borderColor}` : '';
        return `<div class="color-size-item" data-color="${esc(name)}">
            <div class="color-size-header" style="${style}"><h4>${esc(st ? st.displayName : name)}</h4></div>
            ${sizeBlockHTML(sizes, 'bi-size-')}</div>`;
    }

    function renderEditor() {
        const d = state.drafts[state.current];
        const ed = $('#biEditor');
        // the qualities of the chosen type (qualities.json, through the store); all of them while no type is chosen
        const qData = AlishanStore.getQualityData() || {};
        const typeKey = Object.keys(qData).find(k => k.toUpperCase() === String(d.productType || '').toUpperCase());
        const qGroups = (typeKey ? [qData[typeKey]] : Object.values(qData));
        const qName = q => (q && typeof q === 'object') ? q.name : q;
        const qualities = [];
        qGroups.forEach(cats => Object.values(cats).forEach(list => list.forEach(q => qualities.push(qName(q)))));
        const qPick = typeKey
            ? `<label class="bi-wide">Choose from the ${esc(d.productType)} list<select id="bi-qpick"><option value="">Pick a quality…</option>${Object.entries(qData[typeKey]).map(([cat, list]) => `<optgroup label="${esc(cat)}">${list.map(q => `<option ${qName(q) === d.quality ? 'selected' : ''}>${esc(qName(q))}</option>`).join('')}</optgroup>`).join('')}</select></label>`
            : `<label class="bi-wide">Choose from the list<select id="bi-qpick" disabled><option>Select a type first</option></select></label>`;
        const colorOptions = AlishanStore.getColors().map(c => `<option value="${esc(c.name)}">${esc(c.displayName)}</option>`).join('');
        const priceHint = d.quality ? AlishanStore.getPrice(d.quality) : 0;
        const diff = d.sizeOption === 'different';

        ed.innerHTML = `
        <div class="bi-paper">
            <span>From the paper copy: <b>${esc(d.source || '—')}</b></span>
            ${d.dateText ? `<span>Date written as: <b>${esc(d.dateText)}</b></span>` : ''}
        </div>

        <details class="bi-raw"><summary>What the AI wrote for this entry</summary><pre>${esc(d.raw)}</pre></details>

        <div class="bi-form">
            <label>Date<input type="date" id="bi-date" value="${esc(d.date)}"></label>
            <label>Type<select id="bi-type"><option value="">Select</option>${types().map(t => `<option ${t === d.productType ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            <label>Cup<select id="bi-cup"><option value="">—</option>${CUPS.map(c => `<option ${c === d.cupSize ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label>Lot number<input type="text" id="bi-lot" value="${esc(d.lotNumber)}"></label>

            <label class="bi-wide">Quality
                <input type="text" id="bi-quality" list="bi-qlist" value="${esc(d.quality)}" autocomplete="off">
                <datalist id="bi-qlist">${qualities.map(q => `<option value="${esc(q)}">`).join('')}</datalist>
            </label>
            ${qPick}
            <div class="bi-qhelp" id="bi-qhelp"></div>
            <label>Price per dozen (₹)<input type="number" id="bi-price" min="0" step="0.01" value="${esc(d.price)}" placeholder="${priceHint ? 'app price ' + priceHint : 'type the price'}"></label>
            <label>Stock<select id="bi-stock"><option value="out" ${d.inStock ? '' : 'selected'}>Out of stock (history)</option><option value="in" ${d.inStock ? 'selected' : ''}>In stock</option></select></label>
            <label>Material<input type="number" id="bi-material" min="0" step="any" value="${esc(d.material)}"></label>
            <label>Weight<input type="number" id="bi-weight" min="0" step="any" value="${esc(d.weight)}"></label>
        </div>

        <div class="bi-block">
            <div class="bi-block-title">Colors</div>
            <div class="bi-chips" id="bi-chips">${d.chips.map(chipHTML).join('') || '<span class="bi-muted">No colors yet</span>'}</div>
            ${[...new Set([...d.chips.filter(n => !ItemForm.getColorStyle(n)), ...(d.swapOpen ? [d.swapOpen] : [])])].map(n => swapRowHTML(d, n)).join('')}
            <div class="bi-addcolor">
                <input type="text" id="bi-newcolor" list="bi-clist" placeholder="Type / pick a colour" autocomplete="off">
                <datalist id="bi-clist">${colorOptions}</datalist>
                <button type="button" class="bi-btn bi-btn-light" id="bi-addcolor"><i class="fas fa-plus"></i> Add</button>
            </div>
        </div>

        <div class="bi-block">
            <div class="bi-block-title">Sizes
                <label class="bi-inline"><input type="radio" name="bi-mode" value="same" ${diff ? '' : 'checked'}> Same sizes for all colors</label>
                <label class="bi-inline"><input type="radio" name="bi-mode" value="different" ${diff ? 'checked' : ''}> Different sizes for each color</label>
            </div>
            <div id="bi-same" ${diff ? 'hidden' : ''}>${sizeBlockHTML(d.sizes, 'bi-size-')}</div>
            <div id="bi-diff" ${diff ? '' : 'hidden'}>${d.chips.map(n => diffCardHTML(n, (d.colorSizes.find(c => c.name === n) || {}).sizes)).join('') || '<p class="bi-muted">Add colors above — a size card appears for each.</p>'}</div>
        </div>

        <div class="bi-block">
            <div class="bi-block-title">Payment</div>
            <div class="bi-pay">
                <label class="bi-inline"><input type="radio" name="bi-pay" value="full" ${d.payment.mode === 'full' ? 'checked' : ''}> Fully received</label>
                <label class="bi-inline"><input type="radio" name="bi-pay" value="amount" ${d.payment.mode === 'amount' ? 'checked' : ''}> Received ₹ <input type="number" id="bi-payamount" min="0" step="0.01" value="${esc(d.payment.amount)}"></label>
                <label class="bi-inline"><input type="radio" name="bi-pay" value="none" ${d.payment.mode === 'none' ? 'checked' : ''}> Not received (Pending)</label>
                <label class="bi-inline">Received on <input type="date" id="bi-paydate" value="${esc(d.payment.date)}"> <span class="bi-muted">(blank = entry date)</span></label>
            </div>
        </div>

        <label class="bi-block">Notes<textarea id="bi-notes" rows="2">${esc(d.notes)}</textarea></label>

        <div class="bi-result" id="biResult"></div>

        <div class="bi-actions">
            <button type="button" class="bi-btn bi-btn-light" id="biPrev" ${state.current === 0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Previous</button>
            <button type="button" class="bi-btn bi-btn-light" id="biSkip"><i class="fas fa-forward"></i> Skip this entry</button>
            <span class="bi-spacer"></span>
            <button type="button" class="bi-btn bi-primary" id="biApprove"><i class="fas fa-check"></i> Approve &amp; next</button>
        </div>`;

        // any typing / choosing re-reads the form and re-checks (the check is done by calc.js)
        ed.querySelectorAll('input, select, textarea').forEach(el => {
            el.addEventListener('input', onEdit);
            el.addEventListener('change', onEdit);
        });
        // choosing a type loads that type's qualities; picking one fills the quality field
        ed.querySelector('#bi-type').addEventListener('change', () => { clearTimeout(editTimer); readEditor(); recheck(); renderEditor(); });
        const qp = ed.querySelector('#bi-qpick');
        if (qp) qp.addEventListener('change', () => { if (!qp.value) return; $('#bi-quality').value = qp.value; clearTimeout(editTimer); readEditor(); recheck(); renderEditor(); });
        ed.querySelectorAll('input[name="bi-mode"]').forEach(r => r.addEventListener('change', onModeChange));
        ed.querySelector('#bi-addcolor').addEventListener('click', addColor);
        ed.querySelector('#bi-newcolor').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } });
        ed.querySelectorAll('[data-rmcolor]').forEach(b => b.addEventListener('click', () => removeColor(b.dataset.rmcolor)));
        ed.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => {
            readEditor();
            d.swapOpen = d.swapOpen === b.dataset.swap ? '' : b.dataset.swap;
            renderEditor();
        }));
        ed.querySelectorAll('.bi-swapselect').forEach(sel => sel.addEventListener('change', () => {
            if (sel.value) replaceColor(sel.dataset.old, sel.value, sel.closest('.bi-swaprow').querySelector('.bi-swapall').checked);
        }));
        ed.querySelector('#biPrev').addEventListener('click', () => select(state.current - 1));
        ed.querySelector('#biSkip').addEventListener('click', skip);
        ed.querySelector('#biApprove').addEventListener('click', approve);
        renderResult();
    }

    // what the user typed -> the draft (reading only; no maths)
    function readSizes(root, prefix) {
        const map = {};
        ItemForm.SIZES.forEach(size => {
            const d = root.querySelector(`.${prefix}${size}`);
            const p = root.querySelector(`.${prefix}${size}_pieces`);
            map[size] = { dozens: d ? d.value : '', pieces: p ? p.value : '' };
        });
        return map;
    }

    function readEditor() {
        if (!state || !$('#bi-date')) return;
        const d = state.drafts[state.current];
        d.date = val('bi-date');
        // a quality tells its product type (qualities.json, or words like MOLD / PAD / PANTY)
        if (!val('bi-type')) {
            const t = AlishanStore.typeOfQuality(val('bi-quality').trim().toUpperCase());
            if (t && $('#bi-type')) $('#bi-type').value = t;
        }
        d.productType = val('bi-type');
        d.cupSize = val('bi-cup');
        d.lotNumber = val('bi-lot');
        d.quality = val('bi-quality').trim().toUpperCase();
        d.price = val('bi-price');
        d.inStock = val('bi-stock') === 'in';
        d.material = val('bi-material');
        d.weight = val('bi-weight');
        d.notes = val('bi-notes');
        d.payment = {
            mode: ($('input[name="bi-pay"]:checked') || {}).value || 'none',
            amount: val('bi-payamount'),
            date: val('bi-paydate')
        };
        d.sizeOption = ($('input[name="bi-mode"]:checked') || {}).value || 'same';
        if (d.sizeOption === 'same') {
            d.colors = d.chips.slice();
            d.sizes = readSizes($('#bi-same'), 'bi-size-');
        } else {
            d.colors = [];
            d.colorSizes = $$('#bi-diff .color-size-item').map(card => ({
                name: card.getAttribute('data-color'), sizes: readSizes(card, 'bi-size-')
            }));
        }
    }

    function recheck() {
        const d = state.drafts[state.current];
        state.checks[d.id] = AlishanStore.checkImportDraft(d);
        if (d.status === 'approved' && state.checks[d.id].blocking) d.status = 'new';
        updateRow(d);
        renderResult();
        renderProgress();
    }

    function onEdit() {
        clearTimeout(editTimer);
        editTimer = setTimeout(() => { readEditor(); recheck(); }, 120);
    }

    // switching "same / different": keep what was typed
    function onModeChange() {
        readEditor();
        const d = state.drafts[state.current];
        if (d.sizeOption === 'different') {
            d.chips.forEach(n => {
                if (!d.colorSizes.some(c => c.name === n)) d.colorSizes.push({ name: n, sizes: JSON.parse(JSON.stringify(d.sizes || {})) });
            });
        }
        recheck();
        renderEditor();
    }

    function addColor() {
        readEditor();
        const d = state.drafts[state.current];
        const name = val('bi-newcolor').trim().toUpperCase();
        if (!name) return;
        if (!d.chips.includes(name)) d.chips.push(name);
        if (d.sizeOption === 'different' && !d.colorSizes.some(c => c.name === name)) d.colorSizes.push({ name, sizes: {} });
        if (d.sizeOption === 'same') d.colors = d.chips.slice();     // the check counts d.colors: keep it in step with the chips
        recheck();
        renderEditor();
        $('#bi-newcolor').focus();
    }

    function recheckAll() {
        state.drafts.forEach(x => {
            state.checks[x.id] = AlishanStore.checkImportDraft(x);
            if (x.status === 'approved' && state.checks[x.id].blocking) x.status = 'new';
        });
        refreshDuplicates();
    }

    // Replaces a colour by another one. The colour's sizes move with it (nothing is lost).
    // In "all entries" mode it is done in every entry that has the colour.
    function replaceColor(oldName, newName, everywhere) {
        readEditor();
        const targets = everywhere ? state.drafts : [state.drafts[state.current]];
        let changed = 0, clash = 0;
        targets.forEach(x => {
            const has = x.chips.includes(oldName);
            if (!has) return;
            if (x.chips.includes(newName)) { clash++; return; }      // that entry already has the new colour: do not merge silently
            x.chips = x.chips.map(n => (n === oldName ? newName : n));
            x.colors = x.colors.map(n => (n === oldName ? newName : n));
            x.colorSizes.forEach(c => { if (c.name === oldName) c.name = newName; });
            if (x.swapOpen === oldName) x.swapOpen = '';
            changed++;
        });
        if (everywhere) AlishanStore.rememberAlias('color', oldName, newName);      // next imports know it
        recheckAll();
        renderAll();
        toast(`${oldName} → ${newName} in ${changed} ${changed === 1 ? 'entry' : 'entries'}.` +
              (clash ? ` ${clash} entr${clash === 1 ? 'y was' : 'ies were'} left alone because the new colour is already there — fix by hand.` : ''),
              clash ? 'warning' : 'success');
    }

    function removeColor(name) {
        readEditor();
        const d = state.drafts[state.current];
        d.chips = d.chips.filter(n => n !== name);
        d.colorSizes = d.colorSizes.filter(c => c.name !== name);
        if (d.sizeOption === 'same') d.colors = d.chips.slice();     // the check counts d.colors: keep it in step with the chips
        recheck();
        renderEditor();
    }

    // the result box: amounts come from the check (calc.js), the page only prints them
    // "Did you mean ROSE-MOLD?" — only when the quality is not in qualities.json
    function renderQualityHelp() {
        const d = state.drafts[state.current];
        const c = state.checks[d.id];
        const box = $('#bi-qhelp');
        if (!box) return;
        const unknown = c.issues.some(i => i.field === 'quality');
        const options = unknown ? AlishanStore.closeQualities(d.quality) : [];
        box.innerHTML = options.length
            ? 'Did you mean: ' + options.map(o => `<button type="button" class="bi-sug" data-q="${esc(o.name)}">${esc(o.name)} · ₹${o.price}</button>`).join(' ')
            : '';
        box.querySelectorAll('[data-q]').forEach(btn => btn.addEventListener('click', () => {
            readEditor();
            const oldQ = d.quality;
            const newQ = btn.dataset.q;
            const t = AlishanStore.typeOfQuality(newQ);
            let n = 0;
            state.drafts.forEach(x => {
                if (x.quality !== oldQ) return;
                x.quality = newQ;
                if (!x.productType && t) x.productType = t;
                n++;
            });
            AlishanStore.rememberAlias('quality', oldQ, newQ);                          // next imports know it
            recheckAll();
            renderAll();
            toast(`${oldQ} → ${newQ} in ${n} ${n === 1 ? 'entry' : 'entries'}.`, 'success');
        }));
        const price = $('#bi-price');
        if (price) {
            const p = d.quality ? AlishanStore.getPrice(d.quality) : 0;
            price.placeholder = p ? 'app price ' + p : 'type the price';
        }
    }

    // colours of the OTHER entries of the same quality that this entry does not have yet
    function missingColorIdeas(d) {
        const count = new Map();
        state.drafts.forEach(x => {
            if (x === d || x.quality !== d.quality) return;
            x.chips.forEach(n => { if (!d.chips.includes(n)) count.set(n, (count.get(n) || 0) + 1); });
        });
        return [...count.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 8);
    }

    function addColorByName(name) {
        readEditor();
        const d = state.drafts[state.current];
        if (!d.chips.includes(name)) d.chips.push(name);
        if (d.sizeOption === 'different' && !d.colorSizes.some(c => c.name === name)) d.colorSizes.push({ name, sizes: {} });
        if (d.sizeOption === 'same') d.colors = d.chips.slice();     // the check counts d.colors: keep it in step with the chips
        recheckAll();
        renderAll();
    }

    function renderResult() {
        const d = state.drafts[state.current];
        const c = state.checks[d.id];
        const box = $('#biResult');
        if (!box) return;
        renderQualityHelp();
        const issues = c.issues.slice();
        if (state.dups.has(d.id)) issues.push({ level: 'warn', message: 'The same entry appears more than once in this import.' });
        const t = c.totals;
        const totalIssue = c.issues.find(i => i.field === 'total');
        const ideas = totalIssue && d.sizeOption === 'same' ? missingColorIdeas(d) : [];
        box.innerHTML = `
            ${totalIssue ? `<div class="bi-mismatch"><i class="fas fa-balance-scale"></i> <b>The total does not match the paper.</b> ${esc(totalIssue.message)}
                ${ideas.length ? `<div>Other entries of this quality also have: ${ideas.map(n => `<button type="button" class="bi-sug" data-addcolor="${esc(n)}">+ ${esc(n)}</button>`).join(' ')}</div>` : ''}
                <div class="bi-muted">Add the missing colours in the Colors box above (or fix the sizes) until the total matches.</div></div>` : ''}
            <div class="bi-totals">${t ? `
                <div><span>Total</span><b>${AlishanCalc.fmtDozens(t.dozens)} dozens</b></div>
                <div><span>Price / dozen</span><b>${AlishanCalc.fmtMoney(t.price)}</b></div>
                <div><span>Amount</span><b class="bi-amount">${AlishanCalc.fmtMoney(t.amount)}</b></div>
                <div><span>Received</span><b>${AlishanCalc.fmtMoney(t.received)}</b></div>
                <div><span>Pending</span><b class="${t.pending > 0 ? 'bi-bad' : 'bi-ok'}">${AlishanCalc.fmtMoney(t.pending)}</b></div>`
                : '<div class="bi-muted">The amount appears here once the entry is complete.</div>'}</div>
            ${(d.unreadable.length || d.problems.length) ? '<button type="button" class="bi-btn bi-btn-light" id="biAck"><i class="fas fa-eye"></i> I have checked these values on the paper — mark as checked</button>' : ''}
            ${issues.length ? `<ul class="bi-issues">${issues.map(i => `<li class="bi-${i.level === 'error' ? 'bad' : 'warnc'}"><i class="fas ${i.level === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle'}"></i> ${esc(i.message)}</li>`).join('')}</ul>`
                : '<div class="bi-ok"><i class="fas fa-check-circle"></i> Looks fine.</div>'}`;
        box.querySelectorAll('[data-addcolor]').forEach(b => b.addEventListener('click', () => addColorByName(b.dataset.addcolor)));
        const ack = box.querySelector('#biAck');
        if (ack) ack.addEventListener('click', () => {
            // values the AI could not read must be looked at by a person: this is that confirmation
            readEditor();
            d.unreadable = [];
            d.problems = [];
            recheck();
        });
    }

    // ================= approve / skip / import =================

    function goNext() {
        const rest = state.drafts.filter(d => d.index > state.current && statusOf(d) !== 'approved' && d.status !== 'skipped');
        const target = rest.length ? rest[0].index : Math.min(state.current + 1, state.drafts.length - 1);
        state.current = target;
        renderAll();
    }

    function approve() {
        clearTimeout(editTimer);
        readEditor();
        const d = state.drafts[state.current];
        state.checks[d.id] = AlishanStore.checkImportDraft(d);
        if (state.checks[d.id].blocking) {
            updateRow(d); renderResult(); renderProgress();
            toast('Fix the red problems first, then approve.', 'error');
            return;
        }
        const mismatch = state.checks[d.id].issues.find(i => i.field === 'total');
        if (mismatch && !confirm(`${mismatch.message}\n\nApprove this entry with the total as the app counts it?`)) return;
        d.status = 'approved';
        goNext();
    }

    function skip() {
        clearTimeout(editTimer);
        readEditor();
        state.checks[state.drafts[state.current].id] = AlishanStore.checkImportDraft(state.drafts[state.current]);
        state.drafts[state.current].status = 'skipped';
        goNext();
    }

    function approveClean() {
        readEditor();
        let n = 0;
        state.drafts.forEach(d => {
            const c = state.checks[d.id];
            if (d.status === 'new' && !c.blocking && c.issues.length === 0 && !state.dups.has(d.id)) { d.status = 'approved'; n++; }
        });
        renderAll();
        toast(n ? `${n} entries without any problem were approved.` : 'No entry is free of warnings — review them one by one.', n ? 'success' : 'info');
    }

    // after every import the whole data (entries + payments) is also saved as a file on the computer,
    // because the copies kept inside the browser disappear together with the browser data
    function downloadBackupAfterImport(batchId) {
        try {
            const text = JSON.stringify(AlishanStore.backupFile('COMPLETE_BACKUP'), null, 2);
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ALISHAN_Backup_after_${batchId}_${Date.now()}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            return true;
        } catch (e) {
            console.error('Backup file after import failed:', e);
            return false;
        }
    }

    async function importNow() {
        clearTimeout(editTimer);
        readEditor();
        if (state.drafts[state.current]) state.checks[state.drafts[state.current].id] = AlishanStore.checkImportDraft(state.drafts[state.current]);
        const approved = state.drafts.filter(d => d.status === 'approved');
        const checks = approved.map(d => AlishanStore.checkImportDraft(d));
        if (checks.some(c => c.blocking)) { toast('Some approved entries still have problems. Review them again.', 'error'); renderAll(); return; }
        const totals = AlishanStore.importTotals(checks);
        const ok = confirm(`Import ${totals.count} entries?\n\nAmount: ${AlishanCalc.fmtMoney(totals.amount)}\nReceived: ${AlishanCalc.fmtMoney(totals.received)}\nPending: ${AlishanCalc.fmtMoney(totals.pending)}\n\nA safety backup is kept, a backup file is downloaded after the import, and you can undo this import later.`);
        if (!ok) return;

        $('#biImport').disabled = true;
        const result = await AlishanStore.importEntries(approved);
        if (!result.ok) { toast(result.error, 'error'); renderProgress(); return; }
        const saved = downloadBackupAfterImport(result.batchId);
        toast(`${result.message} (${result.batchId})` + (saved ? ' Backup file downloaded.' : ' The backup file could not be downloaded: use "Complete Backup" now.'), saved ? 'success' : 'error');
        state = null;
        overlay.hidden = true;
        document.body.classList.remove('modal-open');
    }

    return { open, close };
})();

window.BulkImport = BulkImport;
