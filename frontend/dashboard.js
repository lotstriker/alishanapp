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

function updateStats() {
    const stats = AlishanStore.typeStats();
    ['BRA', 'PANTY', 'SET', 'BLOUSE'].forEach(type => {
        const cap = type.charAt(0) + type.slice(1).toLowerCase();
        const countEl = document.getElementById(`total${cap}Items`);
        const mostEl = document.getElementById(`${type.toLowerCase()}MostAdded`);
        if (countEl) countEl.textContent = stats[type].count;
        if (mostEl) mostEl.textContent = stats[type].mostAdded;
    });
}

function updateTotalInventory() {
    const el = document.getElementById('totalInventoryItems');
    if (el) el.textContent = AlishanStore.itemCount();
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
    const paged = AlishanStore.paginate(AlishanStore.query({ search: currentSearch() }), currentPage, itemsPerPage);
    currentPage = paged.page;
    renderItems(paged.items);
    updatePaginationControls(paged);
}

// Redraws everything from the store. Runs at start-up and after ANY change.
function refreshUI() {
    displayPaginatedItems();
    updateStats();
    updateActivityFeed();
    updateTotalInventory();
}

// called by search.js whenever a search is run (or cleared)
function onSearch(term) {
    currentPage = 1;
    displayPaginatedItems();
    if (term) showNotification(`Found ${AlishanStore.query({ search: term }).length} item(s) matching "${term}"`, 'info');
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
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.focus();
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

    if (typeof AlishanSearch !== 'undefined') AlishanSearch.init({ onSearch });   // the shared search box (search.js)

    // the page redraws itself whenever the store changes (add/edit/delete/stock,
    // or a change made in another tab)
    AlishanStore.subscribe(refreshUI);
    refreshUI();
}

document.addEventListener('DOMContentLoaded', function () {
    optimizeForMobile();
    window.addEventListener('resize', optimizeForMobile);
    initApp();
});
