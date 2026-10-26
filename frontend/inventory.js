/* ============================================================
   inventory.js — the Inventory page (inventory.html). UI ONLY.

   No copy of the inventory lives here and nothing is calculated or
   saved here:
     • list / filters / search / numbers  <- AlishanStore (store.js) / AlishanCalc (calc.js)
     • edit / delete / stock              <- shared item card + modal -> store
     • import / backup / restore          -> store
   The page reads the filter boxes, asks the store for the matching
   items, and draws them — again, every time the store changes.
   ============================================================ */

// ---------- UI state only ----------
let currentPage = 1;
let itemsPerPage = 50;

// the words in the search box (search.js is optional: without it nothing is searched)
const currentSearch = () => (typeof AlishanSearch !== 'undefined' ? AlishanSearch.getTerm() : '');

// ================= READING THE FILTER BOXES =================

function readFilters() {
    return {
        productType: document.getElementById('productTypeFilter')?.value || 'all',
        quality: document.getElementById('qualityFilter')?.value || 'all',
        stock: document.getElementById('stockFilter')?.value || 'all',
        period: document.getElementById('dateFilter')?.value || 'all',
        search: currentSearch()                  // the words in the search box (search.js)
    };
}

// the items that match the filter boxes + search box (the store does the filtering)
function currentList() {
    return AlishanStore.query(readFilters());
}

// ================= DRAWING THE PAGE =================

function updateDashboard() {
    const summary = AlishanStore.summary();
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    set('totalItems', summary.totalItems);
    set('totalValue', AlishanCalc.fmtMoney(summary.totalValue));
    set('inStockItems', summary.inStockItems);
    set('agingItems', summary.agingItems);
    // aging = IN-STOCK items older than 7 days; the coloured line shows the levels
    set('agingLabel', `Aging Stock (>${AlishanCalc.CONFIG.AGING_AFTER_DAYS} Days, In Stock)`);
    const breakdown = document.getElementById('agingBreakdown');
    if (breakdown) breakdown.innerHTML = AlishanCalc.agingBreakdownHTML(summary);
}

function populateQualityFilter() {
    const qualityFilter = document.getElementById('qualityFilter');
    if (!qualityFilter) return;
    const keep = qualityFilter.value;

    while (qualityFilter.options.length > 1) qualityFilter.remove(1);
    AlishanStore.qualityOptions().forEach(quality => {
        const option = document.createElement('option');
        option.value = quality;
        option.textContent = quality;
        qualityFilter.appendChild(option);
    });
    if ([...qualityFilter.options].some(o => o.value === keep)) qualityFilter.value = keep;
}

function renderInventoryCards() {
    const inventoryCards = document.getElementById('inventoryCards');
    if (!inventoryCards) return;

    const paged = AlishanStore.paginate(currentList(), currentPage, itemsPerPage);
    currentPage = paged.page;
    inventoryCards.innerHTML = '';

    if (paged.total === 0) {
        inventoryCards.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-clipboard-list"></i></div>
                <h3>No inventory items found</h3>
                <p>Try changing your filters or search criteria</p>
            </div>`;
    } else {
        const fragment = document.createDocumentFragment();
        paged.items.forEach(item => fragment.appendChild(ItemCard.create(item)));
        inventoryCards.appendChild(fragment);
    }
    updatePaginationControls(paged);
}

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
function nextPage() { currentPage++; renderInventoryCards(); }
function prevPage() { currentPage = Math.max(1, currentPage - 1); renderInventoryCards(); }
function changeItemsPerPage(value) {
    itemsPerPage = parseInt(value) || 50;
    currentPage = 1;
    renderInventoryCards();
}

// Redraws everything from the store (keeps the filters and the page you are on)
function refreshUI() {
    updateDashboard();
    populateQualityFilter();
    renderInventoryCards();
}

// ================= FILTERS + SEARCH (the store does the work) =================

function applyFilters(options = {}) {
    if (!options.keepPage) currentPage = 1;
    renderInventoryCards();
    if (!options.silent) showNotification('Filters applied successfully.', 'success');
}

function clearFilters() {
    ['productTypeFilter', 'qualityFilter', 'stockFilter', 'dateFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
    });
    currentPage = 1;
    if (typeof AlishanSearch !== 'undefined') AlishanSearch.setTerm('');   // clears the search box too (-> onSearch -> redraw)
    else renderInventoryCards();
    showNotification('Filters cleared successfully.', 'success');
}

// called by search.js whenever a search is run (or cleared)
function onSearch(term) {
    currentPage = 1;
    renderInventoryCards();
    if (term) showNotification(`Found ${currentList().length} items matching your search.`, 'info');
}

// ================= EXPORT (rows come from the store) =================

function showExportModal() {
    const m = document.getElementById('exportModal');
    if (m) m.style.display = 'flex';
}
function closeExportModal() {
    const m = document.getElementById('exportModal');
    if (m) m.style.display = 'none';
}

async function exportInventory(format) {
    const exportAll = document.getElementById('exportAll')?.checked || false;
    const list = exportAll ? AlishanStore.getItems() : currentList();

    if (list.length === 0) {
        showNotification('No data to export!', 'warning');
        return;
    }

    const rows = AlishanStore.exportRows('inventory', list);
    try {
        await AlishanLoader.xlsx();       // the Excel library is fetched only now, when needed
    } catch (error) {
        showNotification(error.message, 'error');
        return;
    }
    const ws = AlishanLoader.fitColumns(XLSX.utils.json_to_sheet(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

    const date = new Date();
    const fileName = `ALISHAN_Inventory_${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}_${date.getHours()}-${date.getMinutes()}.${format === 'csv' ? 'csv' : 'xlsx'}`;   // the Excel button sends 'excel': the file must end in .xlsx

    try {
        if (format === 'csv') {
            downloadFile(XLSX.utils.sheet_to_csv(ws), fileName, 'text/csv');
        } else {
            AlishanLoader.saveWorkbook(wb, fileName);
        }
        showNotification('Inventory data exported successfully!', 'success');
        closeExportModal();
    } catch (error) {
        console.error('Export error: ' + (error && error.message ? error.message : String(error)), error);
        if (format !== 'csv') {
            // the Excel file could not be made: the same rows are saved as CSV instead (opens in Excel too)
            try {
                downloadFile(XLSX.utils.sheet_to_csv(ws), fileName.replace(/\.xlsx$/, '.csv'), 'text/csv');
                showNotification('Excel file could not be made (' + (error && error.message ? error.message : 'unknown reason') + '). Saved as CSV instead.', 'warning');
                closeExportModal();
                return;
            } catch (csvError) {
                console.error('CSV fallback failed:', csvError);
            }
        }
        showNotification('Error exporting data: ' + (error && error.message ? error.message : 'unknown reason'), 'error');
    }
}

function downloadFile(data, fileName, type) {
    try {
        const blob = new Blob([data], { type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    } catch (error) {
        console.error('Download error:', error);
        showNotification('Error downloading file. Please try again.', 'error');
    }
}

function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas ${type === 'success' ? 'fa-check-circle' :
                          type === 'error' ? 'fa-exclamation-circle' :
                          type === 'warning' ? 'fa-exclamation-triangle' :
                          'fa-info-circle'}"></i>
        </div>
        <div class="notification-content"></div>
        <button class="notification-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    notification.querySelector('.notification-content').textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

// ================= BULK IMPORT (AI JSON, reviewed entry by entry) =================
function openBulkImport() {
    if (typeof BulkImport === 'undefined') {
        showNotification('Bulk import (bulk-import.js) did not load. Copy the whole folder and press Ctrl+Shift+R.', 'error');
        return;
    }
    BulkImport.open();
}

// ================= BACKUP / IMPORT (the store does the work) =================

function exportCompleteBackup() {
    if (!AlishanStore.hasItems()) {
        showNotification('No data to backup!', 'warning');
        return;
    }
    const backup = AlishanStore.backupFile('COMPLETE_BACKUP');
    downloadFile(JSON.stringify(backup, null, 2), `ALISHAN_Complete_Backup_${Date.now()}.json`, 'application/json');
    showNotification('Complete backup exported successfully!', 'success');
    closeExportModal();
}

function showImportModal() {
    const m = document.getElementById('importModal');
    if (m) m.style.display = 'flex';
}
function closeImportModal() {
    const m = document.getElementById('importModal');
    if (m) m.style.display = 'none';
}

function handleImport() {
    const file = document.getElementById('importFile')?.files[0];
    if (!file) {
        showNotification('Please select a file to import', 'error');
        return;
    }
    const importOption = document.querySelector('input[name="importOption"]:checked')?.value || 'replace';

    const reader = new FileReader();
    reader.onload = async function (e) {
        let backup;
        try {
            backup = JSON.parse(e.target.result);
        } catch (err) {
            showNotification('Error importing file. Please check file format.', 'error');
            return;
        }

        const info = AlishanStore.inspectBackup(backup);
        if (!info.ok) {
            showNotification(info.error, 'error');
            return;
        }
        const question = importOption === 'replace'
            ? `This will REPLACE all ${info.current} current items with ${info.valid} items from the file.` +
              (info.skipped ? `\n(${info.skipped} damaged item(s) in the file will be skipped.)` : '') +
              `\n\nA safety backup of your current data is saved first. Continue?`
            : `Add the new items from this file (${info.valid} in file) to your ${info.current} current items?`;
        if (!confirm(question)) return;

        const result = await AlishanStore.importBackup(backup, importOption);
        showNotification(result.ok ? result.message : result.error, result.ok ? 'success' : 'error');
        if (result.ok) closeImportModal();
    };
    reader.readAsText(file);
}

async function showBackupSettingsModal() {
    const modal = document.getElementById('backupSettingsModal');
    if (!modal) return;
    const settings = await AlishanStore.getBackupSettings();
    document.getElementById('autoBackupEnabled').checked = settings.enabled;
    document.getElementById('backupFrequency').value = String(settings.frequency);
    modal.style.display = 'flex';
}
function closeBackupSettingsModal() {
    const m = document.getElementById('backupSettingsModal');
    if (m) m.style.display = 'none';
}
async function saveBackupSettings() {
    const result = await AlishanStore.saveBackupSettings({
        enabled: document.getElementById('autoBackupEnabled').checked,
        frequency: document.getElementById('backupFrequency').value
    });
    showNotification(result.message, 'success');
    closeBackupSettingsModal();
}
async function createBackupNow() {
    const result = await AlishanStore.createBackup();
    if (!result.ok) {
        showNotification(result.error, 'warning');
        return;
    }
    showNotification(result.message, 'success');
    exportCompleteBackup();
    closeBackupSettingsModal();
}

async function showBackupHistory() {
    const modal = document.getElementById('backupHistoryModal');
    const list = document.getElementById('backupHistoryList');
    if (!modal || !list) return;

    const history = await AlishanStore.listBackups();
    list.innerHTML = '';
    if (history.length === 0) list.innerHTML = '<p>No backups yet.</p>';

    history.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--light-gray);flex-wrap:wrap;';
        const label = document.createElement('div');
        label.style.cssText = 'flex:1;min-width:180px;';
        const when = new Date(b.metadata.created || Date.now());
        label.textContent = `${when.toLocaleDateString('en-IN')} ${when.toLocaleTimeString('en-IN')} — ${b.metadata.totalItems} items` +
            (b.metadata.type === 'PRE_IMPORT_BACKUP' ? ' (before import)' : '');
        const dl = document.createElement('button');
        dl.className = 'btn btn-sm btn-info';
        dl.textContent = 'Download';
        dl.onclick = () => downloadFile(JSON.stringify(b, null, 2), `ALISHAN_Backup_${when.getTime()}.json`, 'application/json');
        const rs = document.createElement('button');
        rs.className = 'btn btn-sm btn-warning';
        rs.textContent = 'Restore';
        rs.onclick = () => restoreBackupFromHistory(i);
        row.append(label, dl, rs);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}
function closeBackupHistoryModal() {
    const m = document.getElementById('backupHistoryModal');
    if (m) m.style.display = 'none';
}
async function restoreBackupFromHistory(index) {
    const history = await AlishanStore.listBackups();
    const b = history[index];
    if (!b) return;
    if (!confirm(`Restore ${b.metadata.totalItems} items from this backup? Your current data is backed up first.`)) return;
    const result = await AlishanStore.restoreBackup(index);
    showNotification(result.ok ? 'Backup restored' : result.error, result.ok ? 'success' : 'error');
    if (result.ok) closeBackupHistoryModal();
}

// ================= ADVANCED EXPORT (JSON) =================
// The page only reads the boxes and builds a query; the store finds the items.

function showAdvancedExportModal() {
    const m = document.getElementById('advancedExportModal');
    if (m) {
        m.style.display = 'flex';
        populateExportQualities();
        updateExportSummary();
        closeExportModal();
    }
}
function closeAdvancedExportModal() {
    const m = document.getElementById('advancedExportModal');
    if (m) m.style.display = 'none';
}

function toggleExportOptions() {
    const exportType = document.getElementById('exportType')?.value || 'complete';
    document.querySelectorAll('.export-sub-options').forEach(option => { option.style.display = 'none'; });
    const selected = document.getElementById(exportType + 'Options');
    if (selected) selected.style.display = 'block';
    updateExportSummary();
}

function fillQualityOptions(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">All Qualities</option>';
    AlishanStore.qualityOptions().forEach(quality => {
        const option = document.createElement('option');
        option.value = quality;
        option.textContent = quality;
        select.appendChild(option);
    });
}
function populateExportQualities() {
    fillQualityOptions('exportQuality');
    fillQualityOptions('customQuality');
}

// what the advanced-export boxes ask for, as a store query
function exportQuery() {
    const val = (id) => document.getElementById(id)?.value || '';
    switch (val('exportType') || 'complete') {
        case 'dateRange': return (val('exportFromDate') && val('exportToDate')) ? { dateFrom: val('exportFromDate'), dateTo: val('exportToDate') } : {};
        case 'quality': return { quality: val('exportQuality') || 'all' };
        case 'productType': return { productType: val('exportProductType') || 'all' };
        case 'lotNumber': return { lotNumber: val('exportLotNumber').trim() };
        case 'uniqueCode': return { code: val('exportUniqueCode').trim() };
        case 'customFilter': return {
            productType: val('customProductType') || 'all',
            quality: val('customQuality') || 'all',
            stock: val('customStockStatus') || 'all'
        };
        default: return {};
    }
}

function updateExportSummary() {
    const exportType = document.getElementById('exportType')?.value || 'complete';
    const summaryElement = document.getElementById('summaryText');
    const detailsElement = document.getElementById('summaryDetails');
    const summaryContainer = document.getElementById('exportSummary');
    if (!summaryElement || !detailsElement || !summaryContainer) return;

    const val = (id) => document.getElementById(id)?.value || '';
    const count = AlishanStore.query(exportQuery()).length;
    const matching = `Matching Items: <strong>${count}</strong>`;
    const titles = {
        complete: ['📦 Complete Inventory Data', `Total Items: <strong>${count}</strong><br>All records will be exported`],
        dateRange: ['📅 Date Range Export', `From: <strong>${val('exportFromDate') || 'Not set'}</strong><br>To: <strong>${val('exportToDate') || 'Not set'}</strong><br>${matching}`],
        quality: ['🎯 Quality Based Export', `Quality: <strong>${val('exportQuality') || 'All'}</strong><br>${matching}`],
        productType: ['👕 Product Type Export', `Product Type: <strong>${val('exportProductType') || 'All'}</strong><br>${matching}`],
        lotNumber: ['🏷️ Lot Number Export', `Lot Number: <strong>${val('exportLotNumber') || 'Not specified'}</strong><br>${matching}`],
        uniqueCode: ['🔖 Unique Code Export', `Unique Code: <strong>${val('exportUniqueCode') || 'Not specified'}</strong><br>${matching}`],
        customFilter: ['🔧 Custom Filter Export', `Multiple criteria applied<br>${matching}`]
    };
    const [title, details] = titles[exportType] || titles.complete;
    summaryElement.innerHTML = title;
    detailsElement.innerHTML = details;
    summaryContainer.style.display = 'block';
}

function exportFileName(exportType, data) {
    const date = new Date();
    const stamp = `${date.toISOString().split('T')[0]}_${date.getHours()}-${date.getMinutes()}`;
    const val = (id) => document.getElementById(id)?.value || '';
    const parts = {
        dateRange: ['DATE_RANGE', `${val('exportFromDate')}_to_${val('exportToDate')}`],
        quality: ['QUALITY', val('exportQuality')],
        productType: ['PRODUCT_TYPE', val('exportProductType')],
        lotNumber: ['LOT_NUMBER', val('exportLotNumber')],
        uniqueCode: ['UNIQUE_CODE', val('exportUniqueCode')],
        customFilter: ['CUSTOM_FILTER', `items_${data.length}`]
    };
    const [type, criteria] = parts[exportType] || ['COMPLETE_DATA', `all_${data.length}_items`];
    return `ALISHAN_${type}_${criteria}_${stamp}.json`;
}

async function executeAdvancedExport() {
    const exportType = document.getElementById('exportType')?.value || 'complete';
    showNotification('🔄 Processing export...', 'info');

    const data = AlishanStore.query(exportQuery());
    if (data.length === 0) {
        showNotification('❌ No data found for selected criteria!', 'warning');
        return;
    }

    const fileName = document.getElementById('exportFileName')?.value?.trim() || exportFileName(exportType, data);
    try {
        if (data.length > 10000) {
            await exportLargeDataInChunks(data, fileName);
        } else {
            const out = {
                metadata: {
                    exportType: 'ADVANCED_EXPORT',
                    exportedAt: new Date().toISOString(),
                    totalItems: data.length,
                    criteria: { type: exportType, ...exportQuery() },
                    system: 'ALISHAN_INVENTORY',
                    version: '2.0'
                },
                inventory: data
            };
            downloadFile(JSON.stringify(out, null, 2), fileName, 'application/json');
        }
        showNotification(`✅ Exported ${data.length} items successfully!`, 'success');
        closeAdvancedExportModal();
    } catch (error) {
        console.error('Export error: ' + (error && error.message ? error.message : String(error)), error);
        showNotification('❌ Export failed: ' + (error && error.message ? error.message : 'unknown reason'), 'error');
    }
}

// Large data export (10,000+ items): several files
async function exportLargeDataInChunks(data, baseFileName) {
    const chunkSize = 5000;
    const totalChunks = Math.ceil(data.length / chunkSize);

    downloadFile(JSON.stringify({
        metadata: { type: 'LARGE_EXPORT', totalChunks, totalItems: data.length, exportDate: new Date().toISOString(), chunkSize, originalFile: baseFileName }
    }, null, 2), `BACKUP_INFO_${baseFileName}`, 'application/json');

    for (let i = 0; i < totalChunks; i++) {
        const chunkData = data.slice(i * chunkSize, (i + 1) * chunkSize);
        downloadFile(JSON.stringify({
            metadata: { chunkNumber: i + 1, totalChunks, itemsInChunk: chunkData.length },
            inventory: chunkData
        }, null, 2), `CHUNK_${i + 1}_OF_${totalChunks}_${baseFileName}`, 'application/json');
        await new Promise(resolve => setTimeout(resolve, 500));   // give the browser a moment
    }
    showNotification(`📦 Large export completed! ${totalChunks} files generated.`, 'success');
}

// ================= START UP =================

async function initPage() {
    // makes sure every file is there (re-requests a file that did not load); search + loader are optional
    if (typeof AlishanRequire === 'function' && !(await AlishanRequire({
        AlishanDB: 'db.js', AlishanCalc: 'calc.js', AlishanStore: 'store.js',
        ItemForm: 'item-form.js', ItemCard: 'item-card.js', ItemModal: 'item-modal.js'
    }, { AlishanSearch: 'search.js', AlishanLoader: 'loader.js', BulkImport: 'bulk-import.js' }))) return;
    const info = await AlishanStore.init();            // loads qualities, colours, inventory, payments
    if (info.referenceError) showNotification(info.referenceError, 'error');
    if (info.damaged) showNotification(`${info.damaged} damaged item(s) were set aside and backed up.`, 'warning');

    ItemModal.inject();                                 // the shared Edit modal
    await ItemForm.loadColors();
    ItemForm.initColorSelectors(['edit']);

    const editType = document.getElementById('editProductType');
    if (editType) {
        editType.addEventListener('change', function () {
            ItemForm.renderQualitySelector('edit', null, this.value);
        });
    }

    if (typeof AlishanSearch !== 'undefined') AlishanSearch.init({ onSearch });   // the shared search box (search.js)
    refreshUI();
    // redraw whenever the store changes (this page, another page, another tab)
    AlishanStore.subscribe(refreshUI);
}

document.addEventListener('DOMContentLoaded', initPage);
