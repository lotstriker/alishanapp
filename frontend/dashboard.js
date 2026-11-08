/* ============================================================
   dashboard.js — the Dashboard page (index.html). UI ONLY.

   This page does not keep its own copy of the inventory, does no
   maths and never saves anything itself:
     • data / numbers  <- AlishanStore (store.js) / AlishanCalc (calc.js)
     • add an entry    -> AlishanStore.addItem(what the user typed)
     • edit/delete/stock are done by the shared item card + modal,
       which also ask the store.
   The page just draws what the store says, and draws again every
   time the store tells it something changed (even from another tab).
   ============================================================ */

// ---------- UI state only (nothing about the data itself) ----------
let currentPage = 1;
let itemsPerPage = 50;

// the words in the search box (search.js is optional: without it nothing is searched)
const currentSearch = () => (typeof AlishanSearch !== 'undefined' ? AlishanSearch.getTerm() : '');

// ================= DIFFERENT SIZES: one card per colour =================

function colorSizeCardHTML(colorName) {
    const color = ItemForm.getColorStyleSafe(colorName);
    const cells = ItemForm.SIZES.map(size => ItemForm.sizeCellHTML(size, {
        dozenClass: `color-size-${size}`,
        piecesClass: `color-size-${size}_pieces`,
        color: colorName
    })).join('');
    return `
        <div class="color-size-item" data-color="${escapeHtml(colorName)}">
            <div class="color-size-header" style="background-color: ${color.backgroundColor}; color: ${color.textColor}; border-color: ${color.borderColor}">
                <h4><i class="fas fa-palette"></i> ${escapeHtml(color.displayName)}</h4>
                <button type="button" class="remove-color-btn" onclick="removeColorSizeItemByElement(this)">Remove</button>
            </div>
            <div class="size-grid">${cells}</div>
        </div>`;
}

function isDifferentSizesMode() {
    const diff = document.querySelector('input[name="sizeOption"][value="different"]');
    return !!(diff && diff.checked);
}

// ONE colour picker does everything: in "different sizes" mode a size card appears for
// every colour picked in the "Colors" box above (and goes when the colour is un-picked).
function syncColorSizeCards() {
    if (!isDifferentSizesMode()) return;
    const chosen = ItemForm.getSelectedColors('');
    ItemForm.syncColorCards(document.getElementById('colorSizeItems'), chosen, colorSizeCardHTML);
    const hint = document.getElementById('colorSizeHint');
    if (hint) hint.style.display = chosen.length ? 'none' : '';
}

// the card's Remove button un-picks the colour in the one colour picker
function removeColorSizeItemByElement(button) {
    const card = button.closest('.color-size-item');
    if (card) ItemForm.removeColor(card.getAttribute('data-color'), '');
}

function resetQualitySelector() {
    const searchInput = document.getElementById('qualitySearch');
    const selectedDisplay = document.getElementById('selectedQualityDisplay');
    const qualityHidden = document.getElementById('quality');

    if (searchInput) searchInput.value = '';
    if (selectedDisplay) selectedDisplay.style.display = 'none';
    if (qualityHidden) qualityHidden.value = '';

    document.querySelectorAll('.quality-option.selected').forEach(opt => opt.classList.remove('selected'));
    ItemForm.filterQuality('');
}

function toggleSizeOption() {
    const same = document.querySelector('input[name="sizeOption"][value="same"]');
    const sameBox = document.getElementById('sameSizesContainer');
    const diffBox = document.getElementById('differentSizesContainer');
    if (same && sameBox && diffBox) {
        sameBox.style.display = same.checked ? 'block' : 'none';
        diffBox.style.display = same.checked ? 'none' : 'block';
    }
    syncColorSizeCards();      // different sizes: one card per colour picked above
}

// ================= ENTRY DATE (new entry / old entry) — form only =================
// The numbers (days old, aging level) come from AlishanCalc.entryInfo; the store
// validates the date when the entry is added.

function isOldEntryMode() {
    const useManual = document.getElementById('useManualDateTime');
    return !!(useManual && useManual.checked);
}

function updateEntryPreview() {
    const box = document.getElementById('entryPreview');
    if (!box) return;
    box.innerHTML = ItemForm.entryPreviewHTML(
        document.getElementById('entryDate').value,
        document.getElementById('entryTime').value
    );
    const chosen = document.getElementById('entryDate').value;
    document.querySelectorAll('#entryQuick button').forEach(btn => {
        const d = new Date();
        d.setDate(d.getDate() - Number(btn.dataset.days));
        btn.classList.toggle('active', !!chosen && AlishanCalc.localDate(d) === chosen);
    });
}

function setEntryDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    document.getElementById('entryDate').value = AlishanCalc.localDate(d);
    updateEntryPreview();
}

function toggleManualDateTime() {
    const manualFields = document.getElementById('manualDateTimeFields');
    const hint = document.getElementById('entryDateHint');
    if (!manualFields) return;

    if (isOldEntryMode()) {
        const now = new Date();
        const dateInput = document.getElementById('entryDate');
        const timeInput = document.getElementById('entryTime');
        dateInput.max = AlishanCalc.localDate(now);              // no future dates
        if (!dateInput.value) dateInput.value = AlishanCalc.localDate(now);
        if (!timeInput.value) timeInput.value = AlishanCalc.localTime(now);
        manualFields.style.display = 'block';
        if (hint) hint.style.display = 'none';
        updateEntryPreview();
    } else {
        manualFields.style.display = 'none';
        if (hint) hint.style.display = '';
    }
}

function toggleMoreDetails(btn) {
    const content = document.getElementById('moreDetailsContent');
    const icon = btn.querySelector('i');
    const isOpen = content.classList.toggle('open');
    icon.classList.toggle('fa-chevron-right', !isOpen);
    icon.classList.toggle('fa-chevron-down', isOpen);
}

function initManualDateTime() {
    const manualFields = document.getElementById('manualDateTimeFields');
    if (manualFields) manualFields.style.display = 'none';
    const hint = document.getElementById('entryDateHint');
    if (hint) hint.style.display = '';

    const useManual = document.getElementById('useManualDateTime');
    if (useManual) useManual.checked = false;

    const dateInput = document.getElementById('entryDate');
    const timeInput = document.getElementById('entryTime');
    if (dateInput) dateInput.value = '';
    if (timeInput) timeInput.value = '';

    if (dateInput && !dateInput.dataset.previewBound) {
        dateInput.dataset.previewBound = '1';
        dateInput.addEventListener('input', updateEntryPreview);
        timeInput.addEventListener('input', updateEntryPreview);
    }
    const preview = document.getElementById('entryPreview');
    if (preview) preview.innerHTML = '';
}

// ================= ADD ENTRY: read the form, hand it to the store =================

// what the user typed in one block of size boxes -> { 28: {dozens, pieces}, ... }
function readSizeBoxes(getDozen, getPieces) {
    const map = {};
    ItemForm.SIZES.forEach(size => {
        map[size] = {
            dozens: getDozen(size) ? getDozen(size).value : '',
            pieces: getPieces(size) ? getPieces(size).value : ''
        };
    });
    return map;
}

async function addInventoryItem(e) {
    e.preventDefault();

    const sizeOption = document.querySelector('input[name="sizeOption"]:checked');
    if (!sizeOption) {
        showNotification('Please select a size option', 'error');
        return;
    }

    const input = {
        productType: document.getElementById('productType').value,
        cupSize: document.getElementById('cupSize').value,
        quality: document.getElementById('quality').value,
        material: document.getElementById('material').value,
        weight: document.getElementById('weight').value,
        notes: document.getElementById('notes').value,
        sizeOption: sizeOption.value,
        entry: isOldEntryMode()
            ? { mode: 'old', date: document.getElementById('entryDate').value, time: document.getElementById('entryTime').value }
            : { mode: 'now' }
    };

    if (sizeOption.value === 'same') {
        input.colors = ItemForm.getSelectedColors('');
        input.sizes = readSizeBoxes(
            size => document.getElementById(`size${size}`),
            size => document.getElementById(`size${size}_pieces`)
        );
    } else {
        const colorSizeItems = document.getElementById('colorSizeItems');
        input.colorSizes = Array.from(colorSizeItems ? colorSizeItems.getElementsByClassName('color-size-item') : []).map(card => ({
            name: card.getAttribute('data-color'),
            sizes: readSizeBoxes(
                size => card.querySelector(`.color-size-${size}`),
                size => card.querySelector(`.color-size-${size}_pieces`)
            )
        }));
    }

    const result = await AlishanStore.addItem(input);
    if (!result.ok) {
        showNotification(result.error, 'error');
        return;
    }

    // reset the form (the list redraws itself: the page listens to the store)
    document.getElementById('productForm').reset();
    const sameSizesOption = document.querySelector('input[name="sizeOption"][value="same"]');
    if (sameSizesOption) sameSizesOption.checked = true;
    toggleSizeOption();
    initManualDateTime();
    ItemForm.resetColorSelector('');
    resetQualitySelector();
    const colorSizeItems = document.getElementById('colorSizeItems');
    if (colorSizeItems) colorSizeItems.innerHTML = '';

    showNotification(result.message, 'success');
}

// ================= DRAWING THE PAGE (from the store) =================

function renderItems(list) {
    const inventoryCards = document.getElementById('inventoryCards');
    if (!inventoryCards) return;

    if (list.length === 0) {
        inventoryCards.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-clipboard-list"></i></div>
                <h3>No inventory items found</h3>
                <p>Try changing your search criteria</p>
            </div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach(item => fragment.appendChild(ItemCard.create(item)));
    inventoryCards.innerHTML = '';
    inventoryCards.appendChild(fragment);
}

const breakdownState = { period: 'all' };

function breakdownTypeLabel(type) {
    const value = String(type || 'OTHER').trim();
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function breakdownPeriodStart(period, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (period === 'month') start.setDate(1);
    return period === 'all' ? null : start;
}

function getBreakdownData() {
    const items = AlishanStore.getItems();
    const start = breakdownPeriodStart(breakdownState.period);
    const map = new Map();
    items.forEach(item => {
        const date = AlishanCalc.parseDate(item.dateTime || item.createdAt || item.addedDateTime || '');
        if (start && (!date || Number.isNaN(date.getTime()) || date < start)) return;
        const key = String(item.productType || 'OTHER').trim().toUpperCase();
        if (!map.has(key)) map.set(key, { type: key, items: [], count: 0, dozens: 0, amount: 0, complete: 0, incomplete: 0 });
        const bucket = map.get(key);
        const totals = AlishanCalc.itemTotals(item);
        bucket.items.push(item);
        bucket.count += 1;
        bucket.dozens += Number(totals.dozens) || 0;
        bucket.amount += Number(totals.amount) || 0;
        if (item.inStock === false) bucket.complete += 1; else bucket.incomplete += 1;   // Complete = out of stock
    });
    // Keep all four supported product types visible, even when one currently has zero records.
    ['BRA', 'PANTY', 'SET', 'BLOUSE'].forEach(type => {
        if (!map.has(type)) map.set(type, { type, items: [], count: 0, dozens: 0, amount: 0, complete: 0, incomplete: 0 });
    });
    return Array.from(map.values()).map(x => ({ ...x, dozens: Math.round(x.dozens * 100) / 100, amount: Math.round(x.amount * 100) / 100 }))
        .sort((a, b) => {
            const order = ['BRA', 'PANTY', 'SET', 'BLOUSE'];
            const ai = order.indexOf(a.type), bi = order.indexOf(b.type);
            if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            return b.dozens - a.dozens || b.count - a.count || a.type.localeCompare(b.type);
        });
}

function breakdownCardHTML(bucket, totalDozens, compact = false) {
    const percent = totalDozens > 0 ? Math.round(bucket.dozens / totalDozens * 100) : 0;
    return `<button type="button" class="type-breakdown-card" data-breakdown-type="${escapeHtml(bucket.type)}">
        <span class="type-breakdown-card-top"><strong class="type-breakdown-name">${escapeHtml(breakdownTypeLabel(bucket.type))}</strong><span class="type-breakdown-open" aria-hidden="true"><i class="fas fa-chevron-right"></i></span></span>
        <span class="type-breakdown-meta">${bucket.count} ${bucket.count === 1 ? 'Quality' : 'Qualities'} <span>·</span> ${AlishanCalc.fmtDozens(bucket.dozens)} Dozen</span>
        <span class="type-breakdown-amount">${AlishanCalc.fmtMoney(bucket.amount)}</span>
        <span class="type-breakdown-progress" role="img" aria-label="${percent}% of total dozen"><span style="width:${percent}%"></span></span>
        <span class="type-breakdown-foot"><span>${percent}% of total dozen</span><span>${bucket.complete} complete · ${bucket.incomplete} incomplete</span></span>
    </button>`;
}

function renderProductTypeBreakdown() {
    initHomeSummaryCards();
    const root = document.getElementById('productTypeBreakdown');
    if (!root) return;
    const data = getBreakdownData();
    if (!data.length) {
        root.innerHTML = `<div class="breakdown-empty"><i class="fas fa-layer-group"></i><strong>No product data for this period</strong><span>Add an entry or choose another time period.</span></div>`;
        return;
    }
    const ranking = getQualityRanking();
    const top = ranking.slice(0, 4);
    const rowsHTML = top.map((q, index) => qualityRankRowHTML(q, index + 1)).join('');
    const moreButton = ranking.length > 4
        ? `<button type="button" class="top-quality-more" data-see-more-qualities>See more <small>(${ranking.length - 4} more)</small> <i class="fas fa-chevron-right"></i></button>`
        : '';
    root.innerHTML = top.length ? rowsHTML + moreButton : `<div class="breakdown-empty"><strong>No qualities added yet</strong></div>`;
}

// Every quality name of the chosen period with the number of entries it has, most entries first.
// A quality name is counted per product type (BRA "Gajri" and PANTY "Gajri" are two rows).
function getQualityRanking() {
    const counts = new Map();
    getBreakdownData().forEach(bucket => bucket.items.forEach(item => {
        const name = String(item.quality || 'Unnamed Quality').trim();
        const type = String(item.productType || 'OTHER').trim().toUpperCase();
        const key = `${type}::${name.toLowerCase()}`;
        if (!counts.has(key)) counts.set(key, { name, type, count: 0 });
        counts.get(key).count += 1;
    }));
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function qualityRankRowHTML(q, rank) {
    return `<button type="button" class="top-quality-row" data-quality-name="${escapeHtml(q.name)}" data-quality-type="${escapeHtml(q.type)}"><span class="top-quality-rank">${rank}</span><span class="top-quality-info"><strong>${escapeHtml(q.name)}</strong><small>${escapeHtml(breakdownTypeLabel(q.type))}</small></span><span class="top-quality-count">${q.count} ${q.count === 1 ? 'time' : 'times'} <i class="fas fa-chevron-right"></i></span></button>`;
}

// "See more": the whole quality list (same order as the top 4). Clicking a quality shows its entries.
function showAllQualityNames() {
    const ranking = getQualityRanking();
    const content = ranking.length
        ? `<div class="top-quality-full-list">${ranking.map((q, index) => qualityRankRowHTML(q, index + 1)).join('')}</div>`
        : `<div class="breakdown-empty"><strong>No qualities added yet</strong></div>`;
    openBreakdownDialog('All Qualities', `${ranking.length} ${ranking.length === 1 ? 'quality' : 'qualities'} · ${breakdownPeriodLabel()}`, content);
    document.getElementById('breakdownDialogContent').dataset.summaryKind = 'all-qualities';
}

// Only the entries of ONE quality name (inside its product type), newest first.
// `fromList` = opened from "See more", so a Back button returns to that list.
function showQualityEntries(name, type, fromList) {
    const bucket = getBreakdownData().find(x => x.type === type);
    const wanted = String(name || '').trim().toLowerCase();
    const rows = bucket
        ? bucket.items
            .filter(item => String(item.quality || 'Unnamed Quality').trim().toLowerCase() === wanted)
            .sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0))
        : [];
    const totals = rows.reduce((sum, item) => {
        const t = AlishanCalc.itemTotals(item);
        return { dozens: sum.dozens + (Number(t.dozens) || 0), amount: sum.amount + (Number(t.amount) || 0) };
    }, { dozens: 0, amount: 0 });
    const overview = `<div class="breakdown-type-overview"><div><strong>${rows.length}</strong><span>Total Entries</span></div><div><strong>${AlishanCalc.fmtDozens(totals.dozens)}</strong><span>Total Dozen</span></div><div><strong>${AlishanCalc.fmtMoney(totals.amount)}</strong><span>Total Amount</span></div></div>`;
    const list = rows.length
        ? `<div class="breakdown-quality-list">${rows.map(breakdownEntryRowHTML).join('')}</div>`
        : `<div class="breakdown-empty"><strong>No entries found</strong></div>`;
    openBreakdownDialog(name, `${breakdownTypeLabel(type)} · all entries of this quality · ${breakdownPeriodLabel()}`, overview + list);
    const contentRoot = document.getElementById('breakdownDialogContent');
    // remembered so that "Back" from an entry's details comes back to this list
    contentRoot.dataset.summaryKind = 'quality-entries';
    contentRoot.dataset.qualityName = name;
    contentRoot.dataset.qualityType = type;
    contentRoot.dataset.qualityFromList = fromList ? '1' : '';
    if (fromList) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'breakdown-detail-back';
        back.innerHTML = '<i class="fas fa-arrow-left"></i> Back to all qualities';
        back.addEventListener('click', showAllQualityNames);
        contentRoot.insertBefore(back, contentRoot.firstChild);
    }
}

function openBreakdownDialog(title, subtitle, content) {
    const backdrop = document.getElementById('breakdownDialogBackdrop');
    if (!backdrop) return;
    document.getElementById('breakdownDialogTitle').textContent = title;
    document.getElementById('breakdownDialogSubtitle').textContent = subtitle || '';
    document.getElementById('breakdownDialogContent').innerHTML = content;
    backdrop.hidden = false;
    document.body.classList.add('breakdown-dialog-open');
    const close = document.getElementById('closeBreakdownDialog');
    if (close) close.focus();
}

function showAllProductTypes() {
    const data = getBreakdownData();
    const totalDozens = data.reduce((sum, bucket) => sum + bucket.dozens, 0);
    const content = data.length
        ? `<div class="breakdown-all-list">${data.map(bucket => breakdownCardHTML(bucket, totalDozens, true)).join('')}</div>`
        : `<div class="breakdown-empty"><strong>No product types found</strong></div>`;
    openBreakdownDialog('All Product Types', `${data.length} product type${data.length === 1 ? '' : 's'} · ${breakdownPeriodLabel()}`, content);
}

function breakdownPeriodLabel() {
    return ({ all: 'All Time', week: 'This Week', month: 'This Month' })[breakdownState.period] || 'All Time';
}

function breakdownEntryRowHTML(item) {
        const totals = AlishanCalc.itemTotals(item);
        const status = item.inStock === false ? 'Complete' : 'Incomplete';
        return `<button type="button" class="breakdown-quality-row" data-breakdown-quality-id="${escapeHtml(String(item.id))}">
            <span class="breakdown-quality-main"><strong>${escapeHtml(item.quality || 'Unnamed Quality')}</strong><small>${escapeHtml(item.material || 'No design/material')} · ${escapeHtml(AlishanCalc.fmtDate(item.dateTime || item.createdAt || item.addedDateTime))}</small></span>
            <span class="breakdown-quality-values"><strong>${AlishanCalc.fmtDozens(totals.dozens)} doz</strong><small>${AlishanCalc.fmtMoney(totals.amount)}</small></span>
            <span class="breakdown-status ${item.inStock === false ? 'is-complete' : 'is-pending'}">${status}</span>
        </button>`;
}

function showProductTypeDetails(type) {
    document.getElementById('breakdownDialogContent').dataset.summaryKind = '';
    const bucket = getBreakdownData().find(x => x.type === type);
    if (!bucket) return;
    const rows = bucket.items.slice().sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0));
    const content = `<div class="breakdown-type-overview"><div><strong>${bucket.count}</strong><span>Total Entries</span></div><div><strong>${AlishanCalc.fmtDozens(bucket.dozens)}</strong><span>Total Dozen</span></div><div><strong>${AlishanCalc.fmtMoney(bucket.amount)}</strong><span>Total Amount</span></div></div>` + (rows.length ? `<div class="breakdown-quality-list">${rows.map(breakdownEntryRowHTML).join('')}</div>` : `<div class="breakdown-empty"><strong>No qualities found</strong></div>`);
    openBreakdownDialog(breakdownTypeLabel(type), `All qualities in this product type · ${breakdownPeriodLabel()}`, content);
}

function showBreakdownQualityDetail(item, backAction) {
    const contentRoot = document.getElementById('breakdownDialogContent');
    if (!contentRoot || !item) return;
    const type = breakdownTypeLabel(item.productType || 'OTHER');
    document.getElementById('breakdownDialogTitle').textContent = item.quality || 'Quality Details';
    document.getElementById('breakdownDialogSubtitle').textContent = `${type} · ${item.code || 'Quality entry'} · Product details`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'breakdown-detail-back';
    back.innerHTML = '<i class="fas fa-arrow-left"></i> Back to qualities';
    back.addEventListener('click', () => { if (typeof backAction === 'function') backAction(); else showProductTypeDetails(String(item.productType || 'OTHER').trim().toUpperCase()); });
    contentRoot.innerHTML = '';
    contentRoot.appendChild(back);
    if (window.ItemCard && typeof ItemCard.create === 'function') {
        const card = ItemCard.create(item);
        card.classList.add('breakdown-readonly-item-card');
        contentRoot.appendChild(card);
        // Open the existing read-only product card so the size, colour, calculation,
        // product and additional details are shown instead of opening the edit form.
        const toggle = card.querySelector('[data-ic-toggle]');
        if (toggle) toggle.click();
        const detailButton = card.querySelector('[data-ic-details]');
        if (detailButton) detailButton.click();
    } else {
        const totals = AlishanCalc.itemTotals(item);
        contentRoot.insertAdjacentHTML('beforeend', `<div class="breakdown-fallback-detail">
            <div><span>Product Type</span><strong>${escapeHtml(type)}</strong></div>
            <div><span>Quality</span><strong>${escapeHtml(item.quality || 'N/A')}</strong></div>
            <div><span>Design / Material</span><strong>${escapeHtml(item.material || 'N/A')}</strong></div>
            <div><span>Lot Number</span><strong>${escapeHtml(item.lotNumber || 'N/A')}</strong></div>
            <div><span>Cup Size</span><strong>${escapeHtml(item.cupSize || 'N/A')}</strong></div>
            <div><span>Entry Date</span><strong>${escapeHtml(AlishanCalc.fmtDate(item.dateTime || item.createdAt || item.addedDateTime))}</strong></div>
            <div><span>Total Dozen</span><strong>${AlishanCalc.fmtDozens(totals.dozens)}</strong></div>
            <div><span>Total Amount</span><strong>${AlishanCalc.fmtMoney(totals.amount)}</strong></div>
            <div><span>Status</span><strong>${item.inStock === false ? 'Complete / Out of stock' : 'Incomplete / In stock'}</strong></div>
            <div><span>Notes</span><strong>${escapeHtml(item.notes || 'N/A')}</strong></div>
        </div>`);
    }
    contentRoot.scrollTop = 0;
}

function showAgingStockBreakdown() {
    const all = AlishanStore.getItems();
    const now = new Date();
    const levels = [
        { key: 'fresh', title: 'Fresh', range: '0–7 days' },
        { key: 'aging', title: 'Aging', range: '8–15 days' },
        { key: 'warning', title: 'Warning', range: '16–30 days' },
        { key: 'critical', title: 'Critical', range: '31+ days' }
    ];
    const inStock = all.filter(item => item.inStock !== false);
    const groups = levels.map(level => ({ ...level, items: inStock.filter(item => AlishanCalc.agingLevel({ ...item, dateTime: item.dateTime || item.createdAt || item.addedDateTime }, now) === level.key) }));
    const content = groups.map(group => {
        const rows = group.items.slice().sort((a,b) => AlishanCalc.daysInStock({ ...b, dateTime: b.dateTime || b.createdAt || b.addedDateTime }, now) - AlishanCalc.daysInStock({ ...a, dateTime: a.dateTime || a.createdAt || a.addedDateTime }, now));
        return `<section class="aging-breakdown-group aging-${group.key}">
            <div class="aging-breakdown-heading"><div><strong>${group.title}</strong><small>${group.range}</small></div><span>${rows.length} ${rows.length === 1 ? 'quality' : 'qualities'}</span></div>
            ${rows.length ? `<div class="breakdown-quality-list">${rows.map(item => {
                const totals = AlishanCalc.itemTotals(item);
                const days = AlishanCalc.daysInStock({ ...item, dateTime: item.dateTime || item.createdAt || item.addedDateTime }, now);
                return `<button type="button" class="breakdown-quality-row aging-quality-row" data-breakdown-quality-id="${escapeHtml(String(item.id))}">
                    <span class="breakdown-quality-main"><strong>${escapeHtml(item.quality || 'Unnamed Quality')}</strong><small>${escapeHtml(breakdownTypeLabel(item.productType || 'OTHER'))} · ${escapeHtml(item.code || 'Quality entry')}</small></span>
                    <span class="aging-days-count"><strong>${days}</strong><small>${days === 1 ? 'day' : 'days'}</small></span>
                    <span class="breakdown-quality-values"><strong>${AlishanCalc.fmtDozens(totals.dozens)} doz</strong><small>${AlishanCalc.fmtMoney(totals.amount)}</small></span>
                </button>`;
            }).join('')}</div>` : `<div class="aging-breakdown-empty">No qualities in this range</div>`}
        </section>`;
    }).join('');
    openBreakdownDialog('Aging Stock Breakdown', `${inStock.length} in-stock qualities · grouped by days in stock`, content);
    document.getElementById('breakdownDialogContent').dataset.summaryKind = 'aging-breakdown';
}

function showHomeSummaryItems(kind) {
    const all = AlishanStore.getItems();
    const now = new Date();
    let items = all;
    let title = 'All Inventory Items';
    let subtitle = `${all.length} entries`;
    if (kind === 'in-stock') {
        items = all.filter(item => item.inStock !== false);
        title = 'In Stock Items';
        subtitle = `${items.length} entries currently in stock`;
    } else if (kind === 'aging') {
        showAgingStockBreakdown();
        return;
    } else if (kind === 'added-week') {
        items = all.filter(item => AlishanCalc.isAddedWithinDays ? AlishanCalc.isAddedWithinDays(item, AlishanCalc.CONFIG.NEW_ITEM_DAYS, now) : (() => { const d = AlishanCalc.parseDate(item.dateTime || item.createdAt || item.addedDateTime || ''); return d && (now - d) <= AlishanCalc.CONFIG.NEW_ITEM_DAYS * 86400000 && d <= now; })());
        title = 'Added This Week';
        subtitle = `${items.length} entries added in the last ${AlishanCalc.CONFIG.NEW_ITEM_DAYS} days`;
    } else if (kind === 'pending') {
        items = all.filter(item => (AlishanStore.itemPayment(item).pending || 0) > 0);
        title = 'Pending Amount';
        subtitle = `${items.length} entries with an outstanding amount`;
    }
    const content = items.length ? `<div class="breakdown-quality-list">${items.slice().sort((a,b)=>new Date(b.dateTime||b.createdAt||0)-new Date(a.dateTime||a.createdAt||0)).map(item => {
        const totals = AlishanCalc.itemTotals(item);
        const status = item.inStock === false ? 'Out of stock' : 'In stock';
        const row = `<button type="button" class="breakdown-quality-row" data-breakdown-quality-id="${escapeHtml(String(item.id))}">
            <span class="breakdown-quality-main"><strong>${escapeHtml(item.quality || 'Unnamed Quality')}</strong><small>${escapeHtml(breakdownTypeLabel(item.productType || 'OTHER'))} · ${escapeHtml(item.code || 'Quality entry')} · ${escapeHtml(AlishanCalc.fmtDate(item.dateTime || item.createdAt || item.addedDateTime))}</small></span>
            <span class="breakdown-quality-values"><strong>${AlishanCalc.fmtDozens(totals.dozens)} doz</strong><small>${AlishanCalc.fmtMoney(totals.amount)}</small></span>
            <span class="breakdown-status ${item.inStock === false ? 'is-complete' : 'is-pending'}">${status}</span>
        </button>`;
        if (kind !== 'in-stock') return row;
        return `<div class="breakdown-quality-item">${row}<button type="button" class="breakdown-complete-btn" data-complete-quality="${escapeHtml(String(item.id))}" title="Mark complete: this quality goes out of stock and leaves In Stock Items"><i class="fas fa-check"></i><span>Complete</span></button></div>`;
    }).join('')}</div>` : `<div class="breakdown-empty"><strong>No matching entries found</strong></div>`;
    openBreakdownDialog(title, subtitle, content);
    document.getElementById('breakdownDialogContent').dataset.summaryKind = kind;
}

// "Complete" on the Home > In Stock Items list: same action as the Complete button on the Inventory card
// (AlishanStore.toggleStock => out of stock, leaves In Stock Items, leaves Aging, saved in Quality History).
async function completeFromInStockList(btn) {
    if (btn.disabled) return;
    const id = btn.dataset.completeQuality;
    const item = AlishanStore.getItem(id);
    if (!item) { showHomeSummaryItems('in-stock'); return; }
    if (item.inStock === false) { showHomeSummaryItems('in-stock'); return; }   // already out of stock: just refresh the list
    btn.disabled = true;
    const result = await AlishanStore.toggleStock(id);
    if (!result.ok) { btn.disabled = false; showNotification(result.error || 'Could not complete this quality', 'error'); return; }
    // take just this row out of the open list (no full redraw, so the scroll position stays)
    const wrap = btn.closest('.breakdown-quality-item');
    if (wrap) wrap.remove();
    const left = AlishanStore.getItems().filter(i => i.inStock !== false).length;
    if (!left) { showHomeSummaryItems('in-stock'); return; }
    const sub = document.getElementById('breakdownDialogSubtitle');
    if (sub) sub.textContent = `${left} entries currently in stock`;
    showNotification(`${item.quality || 'Quality'} marked complete`, 'success');
}

function initHomeSummaryCards() {
    const cards = document.querySelectorAll('.home-summary-card[data-summary-kind]');
    cards.forEach(card => {
        if (card.dataset.summaryBound) return;
        card.dataset.summaryBound = '1';
        const kind = card.dataset.summaryKind;
        card.classList.add('is-clickable-summary');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const open = () => showHomeSummaryItems(kind);
        card.addEventListener('click', open);
        card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
}

function initProductTypeBreakdown() {
    const menuButton = document.getElementById('breakdownMenuButton');
    const menu = document.getElementById('breakdownMenu');
    const allButton = document.getElementById('showAllProductTypes');
    const backdrop = document.getElementById('breakdownDialogBackdrop');
    const closeButton = document.getElementById('closeBreakdownDialog');
    if (menuButton && menu && !menuButton.dataset.bound) {
        menuButton.dataset.bound = '1';
        menuButton.addEventListener('click', event => {
            event.stopPropagation();
            menu.hidden = !menu.hidden;
            menuButton.setAttribute('aria-expanded', String(!menu.hidden));
        });
        menu.querySelectorAll('[data-breakdown-period]').forEach(button => {
            button.classList.toggle('is-selected', button.dataset.breakdownPeriod === breakdownState.period);
            button.addEventListener('click', () => {
                breakdownState.period = button.dataset.breakdownPeriod;
                menu.querySelectorAll('[data-breakdown-period]').forEach(option => option.classList.toggle('is-selected', option === button));
                menu.hidden = true;
                menuButton.setAttribute('aria-expanded', 'false');
                renderProductTypeBreakdown();
            });
        });
        document.addEventListener('click', event => {
            if (!event.target.closest('.breakdown-menu-wrap')) {
                menu.hidden = true;
                menuButton.setAttribute('aria-expanded', 'false');
            }
        });
    }
    if (allButton && !allButton.dataset.bound) { allButton.dataset.bound = '1'; allButton.addEventListener('click', showAllProductTypes); }
    const root = document.getElementById('productTypeBreakdown');
    if (root && !root.dataset.bound) {
        root.dataset.bound = '1';
        root.addEventListener('click', event => {
            if (event.target.closest('[data-see-more-qualities]')) { showAllQualityNames(); return; }
            const quality = event.target.closest('[data-quality-name]');
            if (quality) { showQualityEntries(quality.dataset.qualityName, quality.dataset.qualityType, false); return; }
            const card = event.target.closest('[data-breakdown-type]');
            if (card) showProductTypeDetails(card.dataset.breakdownType);
        });
    }
    if (backdrop && !backdrop.dataset.bound) {
        backdrop.dataset.bound = '1';
        const close = () => { backdrop.hidden = true; document.body.classList.remove('breakdown-dialog-open'); };
        if (closeButton) closeButton.addEventListener('click', close);
        backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) close(); });
        document.getElementById('breakdownDialogContent').addEventListener('click', event => {
            const typeCard = event.target.closest('[data-breakdown-type]');
            if (typeCard) { showProductTypeDetails(typeCard.dataset.breakdownType); return; }
            const qualityName = event.target.closest('[data-quality-name]');
            if (qualityName) {
                const fromList = document.getElementById('breakdownDialogContent').dataset.summaryKind === 'all-qualities';
                showQualityEntries(qualityName.dataset.qualityName, qualityName.dataset.qualityType, fromList);
                return;
            }
            const completeBtn = event.target.closest('[data-complete-quality]');
            if (completeBtn) { completeFromInStockList(completeBtn); return; }
            const quality = event.target.closest('[data-breakdown-quality-id]');
            if (!quality) return;
            const item = AlishanStore.getItem(quality.dataset.breakdownQualityId);
            if (!item) return;
            const summaryKind = document.getElementById('breakdownDialogContent').dataset.summaryKind;
            const contentData = document.getElementById('breakdownDialogContent').dataset;
            let backAction = summaryKind === 'aging-breakdown' ? showAgingStockBreakdown : (summaryKind ? () => showHomeSummaryItems(summaryKind) : null);
            if (summaryKind === 'quality-entries') {
                const { qualityName: name, qualityType: type, qualityFromList: fromList } = contentData;
                backAction = () => showQualityEntries(name, type, !!fromList);
            }
            showBreakdownQualityDetail(item, backAction);
        });
    }
}

function updateStats() {
    const stats = AlishanStore.typeStats();
    ['BRA', 'PANTY', 'SET', 'BLOUSE'].forEach(type => {
        const cap = type.charAt(0) + type.slice(1).toLowerCase();
        const countEl = document.getElementById(`total${cap}Items`);
        const mostEl = document.getElementById(`${type.toLowerCase()}MostAdded`);
        if (countEl) countEl.textContent = stats[type].count;
        if (mostEl) mostEl.textContent = stats[type].mostAdded;
    });
    renderProductTypeBreakdown();
}

function updateTotalInventory() {
    const summary = AlishanStore.summary();
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('totalInventoryItems', summary.totalItems);
    set('homeTotalItems', summary.totalItems);
    set('homeTotalValue', AlishanCalc.fmtMoney(summary.totalValue));
    set('homeInStockItems', summary.inStockItems);
    set('homeAgingItems', summary.agingItems);
    set('homeAddedThisWeek', summary.addedThisWeek);
    set('homePendingAmount', AlishanCalc.fmtMoney(summary.pending));
    set('homeAgingLabel', `Aging Stock (> ${AlishanCalc.CONFIG.AGING_AFTER_DAYS} Days)`);
}

async function updateActivityFeed() {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    const entries = await AlishanStore.getRecentActivity(5);
    feed.innerHTML = '';
    if (entries.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No recent activity';
        feed.appendChild(li);
        return;
    }
    entries.forEach(entry => {
        const li = document.createElement('li');
        const when = new Date(entry.at);
        li.textContent = `${entry.text} — ${when.toLocaleDateString('en-IN')} ${when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
        feed.appendChild(li);
    });
}

// ----- pagination (only which page to show; the store cuts the list) -----
function updatePaginationControls(paged) {
    const paginationControls = document.getElementById('paginationControls');
    const pageInfo = document.getElementById('pageInfo');
    if (!paginationControls || !pageInfo) return;

    if (paged.total <= itemsPerPage) {
        paginationControls.style.display = 'none';
    } else {
        paginationControls.style.display = 'flex';
        pageInfo.textContent = `Page ${paged.page} of ${paged.totalPages}`;
    }
}
function nextPage() { currentPage++; displayPaginatedItems(); }
function prevPage() { currentPage = Math.max(1, currentPage - 1); displayPaginatedItems(); }
function changeItemsPerPage(value) {
    itemsPerPage = parseInt(value);
    currentPage = 1;
    displayPaginatedItems();
}

function displayPaginatedItems() {
    // the words in the search box (search.js) narrow the list; the store finds the items
    let matching = AlishanStore.query({ search: currentSearch() });
    // Home page uses plain text search only; advanced filters/sorting belong to Inventory.

    const paged = AlishanStore.paginate(matching, currentPage, itemsPerPage);
    currentPage = paged.page;
    renderItems(paged.items);
    updatePaginationControls(paged);
}

function renderHomeLatestQualities() {
    const root = document.getElementById('homeLatestQualities');
    if (!root || !window.AlishanStore || !window.ItemCard) return;
    const term = currentSearch();
    let items = AlishanStore.query({ search: term });
    items = items.slice().sort((a, b) => new Date(b.dateTime || b.createdAt || 0) - new Date(a.dateTime || a.createdAt || 0)).slice(0, 5);
    root.innerHTML = '';
    if (!items.length) {
        root.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><h3>${term ? 'No matching qualities found' : 'No qualities added yet'}</h3><p>${term ? 'Try another search term.' : 'Your latest added qualities will appear here.'}</p></div>`;
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(ItemCard.create(item)));
    root.appendChild(fragment);
}

// Redraws everything from the store. Runs at start-up and after ANY change.
function refreshUI() {
    displayPaginatedItems();
    updateStats();
    updateActivityFeed();
    updateTotalInventory();
    renderHomeLatestQualities();
}

// called by search.js whenever a search is run (or cleared)
function onSearch(term) {
    currentPage = 1;
    displayPaginatedItems();
    renderHomeLatestQualities();
    if (term) showNotification(`Search applied: ${term}`, 'info');
}

// ================= EXCEL REPORT (rows come from the store) =================

async function generateReport() {
    const rows = AlishanStore.exportRows('inventory');
    if (rows.length === 0) {
        showNotification('No inventory data to generate report!', 'warning');
        return;
    }

    try {
        await AlishanLoader.xlsx();       // the Excel library is fetched only now, when needed
        const ws = AlishanLoader.fitColumns(XLSX.utils.json_to_sheet(rows));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory Report');

        const now = new Date();
        AlishanLoader.saveWorkbook(wb, `ALISHAN_Inventory_Report_${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}_${now.getHours()}-${now.getMinutes()}.xlsx`);
        showNotification('Excel report generated successfully! Check your downloads.', 'success');
    } catch (error) {
        console.error('Report generation error: ' + (error && error.message ? error.message : String(error)), error);
        showNotification(error.message && error.message.includes('library') ? error.message : 'Error generating report: ' + (error && error.message ? error.message : 'unknown reason'), 'error');
    }
}

// ================= SMALL UI HELPERS =================

function animateCharts() {
    document.querySelectorAll('.chart-bar').forEach(bar => {
        const height = bar.style.height;
        bar.style.height = '0%';
        setTimeout(() => { bar.style.height = height; }, 300);
    });
}

function scrollToForm() {
    const formSection = document.querySelector('.form-section');
    if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });
}

function checkStock() {
    window.location.href = 'inventory.html';
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
        <div class="notification-content"></div>
        <button class="notification-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    notification.querySelector('.notification-content').textContent = message;   // textContent: messages can contain typed text
    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function optimizeForMobile() {
    if (window.innerWidth <= 768) {
        document.documentElement.style.setProperty('--transition', 'all 0.2s ease');
        let scrollTimeout;
        window.addEventListener('scroll', function () {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(function () {
                document.querySelectorAll('.card-content').forEach(el => { el.style.opacity = '0.95'; });
            }, 100);
        });
        window.addEventListener('scrollend', function () {
            document.querySelectorAll('.card-content').forEach(el => { el.style.opacity = '1'; });
        });
    }
}

// ================= START UP =================

async function initApp() {
    // makes sure every file is there (re-requests a file that did not load); search + loader are optional
    if (typeof AlishanRequire === 'function' && !(await AlishanRequire({
        AlishanDB: 'db.js', AlishanCalc: 'calc.js', AlishanStore: 'store.js',
        ItemForm: 'item-form.js', ItemCard: 'item-card.js', ItemModal: 'item-modal.js'
    }, { AlishanSearch: 'search.js', AlishanLoader: 'loader.js' }))) return;
    const info = await AlishanStore.init();            // loads qualities, colours, inventory, payments
    if (info.referenceError) showNotification(info.referenceError, 'error');
    if (info.damaged) showNotification(`${info.damaged} damaged item(s) were set aside and backed up.`, 'warning');

    ItemModal.inject();                                 // the shared Edit modal
    await ItemForm.loadColors();                        // draws the colour dropdowns
    ItemForm.initColorSelectors(['', 'edit']);
    ItemForm.onColorsChange('', syncColorSizeCards);      // size cards follow the one colour picker

    const productType = document.getElementById('productType');
    if (productType) {
        productType.addEventListener('change', function () {
            ItemForm.renderQualitySelector('', null, this.value);
            resetQualitySelector();
        });
        if (productType.value) ItemForm.renderQualitySelector('', null, productType.value);
    }

    const productForm = document.getElementById('productForm');
    if (productForm) productForm.addEventListener('submit', addInventoryItem);

    initManualDateTime();
    ItemForm.renderSizeGrid('sameSizesContainer', '');
    const sizeOptions = document.querySelectorAll('input[name="sizeOption"]');
    sizeOptions.forEach(option => option.addEventListener('change', toggleSizeOption));
    const sameSizesOption = document.querySelector('input[name="sizeOption"][value="same"]');
    if (sameSizesOption) sameSizesOption.checked = true;
    toggleSizeOption();

    if (typeof AlishanSearch !== 'undefined' && document.getElementById('alishan-search')) AlishanSearch.init({ onSearch, enableAdvanced: false });   // Home: search bar only; filters/sort stay on Inventory

    // the page redraws itself whenever the store changes (add/edit/delete/stock,
    // or a change made in another tab)
    initProductTypeBreakdown();
    AlishanStore.subscribe(refreshUI);
    refreshUI();
}

document.addEventListener('DOMContentLoaded', function () {
    optimizeForMobile();
    window.addEventListener('resize', optimizeForMobile);
    initApp();
});
