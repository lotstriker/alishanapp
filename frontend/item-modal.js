/* ============================================================
   item-modal.js — SINGLE shared Edit Product Entry modal.
   Used by index.html (Dashboard) and inventory.html.

   Before this file existed, each page had its own copy of the
   modal's HTML (slightly different — e.g. different nesting,
   different Lot Number placeholder) AND its own copy of
   openEditModal/updateItem/deleteItem/toggleStock/etc, which
   had drifted (adding a new color card while editing never got
   a "pieces" input on either page, only pre-loaded colors did).

   This module owns the modal end-to-end: call ItemModal.inject()
   once at page load to insert the HTML, then use
   ItemModal.open/close/submit/deleteItem/toggleStock from
   item-card.js's buttons and the modal's own form.

   Depends on (already shared): AlishanStore (store.js), ItemForm
   (item-form.js).
   (the page's in-memory array — classic <script> tags share one
   global scope, so this module reads/writes it directly),
   `showNotification(msg, type)`, and `afterItemChange()` — a
   small hook each page defines for its own post-save UI refresh
   (re-render cards, update stats, etc).
   ============================================================ */

// ItemModal is UI only: it shows the form, reads what the user typed, and hands it to
// AlishanStore (store.js): calc.js builds + checks the entry, db.js saves it, every page is told.
var ItemModal = (() => {

    // The entry being edited (set at the start of open(id)).
    let openItem = null;

    function html() {
        return `
    <div class="modal" id="editModal" style="display: none;">
        <div class="modal-content edit-modal-content" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
            <div class="modal-header">
                <div class="edit-modal-title">
                    <h2 id="editModalTitle">Edit Product Entry</h2>
                    <div id="uniqueCodeDisplay" class="unique-code-display"></div>
                </div>
                <button type="button" class="close-btn" onclick="ItemModal.close()" aria-label="Close">&times;</button>
            </div>

            <form id="editForm" class="edit-modal-form">
                <input type="hidden" id="editIndex">

                <div class="edit-modal-body">
                    <section class="edit-section">
                        <h3 class="edit-section-title"><i class="fas fa-info-circle"></i> Basic Details</h3>
                        <div class="edit-grid">
                            <div class="edit-field">
                                <label for="editProductType">Product Type</label>
                                <select id="editProductType" required onchange="ItemForm.renderQualitySelector('edit', null, this.value)">
                                    <option value="">Select Type</option>
                                    <option value="bra">Bra</option>
                                    <option value="panty">Panty</option>
                                    <option value="set">Set</option>
                                    <option value="blouse">Blouse</option>
                                </select>
                            </div>

                            <div class="edit-field">
                                <label for="editCupSize">Cup Size</label>
                                <select id="editCupSize">
                                    <option value="">Select Cup Size</option>
                                    <option value="A">A Cup</option>
                                    <option value="B">B Cup</option>
                                    <option value="C">C Cup</option>
                                    <option value="D">D Cup</option>
                                    <option value="E">E Cup</option>
                                    <option value="F">F Cup</option>
                                </select>
                            </div>

                            <div class="edit-field">
                                <label for="editLotNumber">Lot Number</label>
                                <input type="text" id="editLotNumber"
                                       placeholder="e.g. 123456-789012"
                                       pattern="[0-9\\-]*" title="Only numbers and hyphens are allowed">
                            </div>

                            <div class="edit-field">
                                <label for="editMaterial">Material (meters)</label>
                                <input type="number" id="editMaterial" min="0" step="0.01" placeholder="0">
                            </div>

                            <div class="edit-field">
                                <label for="editWeight">Weight (kg)</label>
                                <input type="number" id="editWeight" min="0" step="0.01" placeholder="0">
                            </div>

                            <div class="edit-field">
                                <label for="editEntryDate">Entry Date</label>
                                <input type="date" id="editEntryDate" required oninput="ItemModal.updateEntryPreview()">
                            </div>

                            <div class="edit-field">
                                <label for="editEntryTime">Entry Time</label>
                                <input type="time" id="editEntryTime" oninput="ItemModal.updateEntryPreview()">
                            </div>

                            <div class="edit-field" id="editCompletedField" style="display:none">
                                <label for="editCompletedDate">Maal Gaya (Completion Date)</label>
                                <input type="date" id="editCompletedDate">
                            </div>
                        </div>
                        <div class="entry-preview" id="editEntryPreview"></div>
                    </section>

                    <section class="edit-section">
                        <h3 class="edit-section-title"><i class="fas fa-tag"></i> Quality</h3>
                        <div class="edit-field">
                            <div class="quality-search-container">
                                <i class="fas fa-search"></i>
                                <input type="text" id="editQualitySearch" placeholder="Search quality by name..."
                                       oninput="ItemForm.filterQuality('edit')">
                            </div>
                            <div class="quality-selector-container">
                                <select id="editQuality" name="editQuality" required style="display: none;">
                                    <option value="">Select Quality</option>
                                </select>
                                <div class="quality-categories" id="editQualityCategories">
                                    <div class="quality-placeholder">
                                        <i class="fas fa-cube"></i>
                                        <p>Please select a product type first</p>
                                    </div>
                                </div>
                            </div>
                            <div class="selected-quality-display" id="editSelectedQualityDisplay" style="display: none;">
                                <strong>Selected:</strong> <span id="editSelectedQualityText"></span>
                            </div>
                            <div class="form-group edit-price-box">
                                <label for="editPrice">Price per dozen (₹)</label>
                                <input type="number" id="editPrice" min="0" step="0.01" inputmode="decimal" placeholder="Price per dozen">
                                <small id="editPriceHint" class="edit-price-hint"></small>
                                <button type="button" class="btn btn-small edit-price-use" id="editPriceUseApp" hidden>Use app price</button>
                            </div>
                        </div>
                    </section>

                    <section class="edit-section">
                        <h3 class="edit-section-title"><i class="fas fa-palette"></i> Colors</h3>
                        <div class="edit-field">
                            <div class="color-selector-container">
                                <div class="color-selector" id="editColorSelector">
                                    <div class="selected-colors" id="editSelectedColors">
                                        <span class="no-colors">No colors selected</span>
                                    </div>
                                    <button type="button" class="color-dropdown-toggle" id="editColorDropdownToggle">
                                        <i class="fas fa-chevron-down"></i>
                                    </button>
                                </div>
                                <div class="color-dropdown" id="editColorDropdown">
                                    <div class="color-search">
                                        <input type="text" id="editColorSearch" placeholder="Search colors...">
                                        <i class="fas fa-search"></i>
                                    </div>
                                    <div class="color-options" id="editColorOptions">
                                        <!-- Colors will be loaded dynamically -->
                                    </div>
                                    <div class="color-actions">
                                        <button type="button" class="btn-select-all" onclick="ItemForm.selectAllColors('edit')">
                                            <i class="fas fa-check-double"></i> Select All
                                        </button>
                                        <button type="button" class="btn-clear-all" onclick="ItemForm.clearAllColors('edit')">
                                            <i class="fas fa-times"></i> Clear All
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <input type="hidden" id="editColorsHidden" name="editColors">
                        </div>
                    </section>

                    <section class="edit-section">
                        <h3 class="edit-section-title"><i class="fas fa-ruler"></i> Size Quantities</h3>
                        <p class="size-groups-lead">All colours share one size grid. For a colour with different sizes, use <b>⇄</b> on that colour → <b>New group</b>.</p>
                        <div id="editSizeGroups" class="size-groups-box"></div>
                    </section>

                    <section class="edit-section">
                        <h3 class="edit-section-title"><i class="fas fa-sticky-note"></i> Notes</h3>
                        <div class="edit-field">
                            <textarea id="editNotes" rows="3" placeholder="Additional notes"></textarea>
                        </div>
                    </section>
                </div>

                <div class="edit-modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="ItemModal.close()">Cancel</button>
                    <button type="submit" class="btn">Update Product Entry</button>
                </div>
            </form>
        </div>
    </div>`;
    }

    // Inserts the modal into the page once. Safe to call more than
    // once (it won't duplicate). Also wires the form's submit event.
    function inject() {
        if (document.getElementById('editModal')) return;
        document.body.insertAdjacentHTML('beforeend', html());
        const form = document.getElementById('editForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                submit(e);
            });
        }
        SizeGroups.init('edit');      // the size groups follow the one colour picker (a changed colour keeps its sizes)
        const priceEl = document.getElementById('editPrice');
        if (priceEl) priceEl.addEventListener('input', refreshPriceHint);
        const useBtn = document.getElementById('editPriceUseApp');
        if (useBtn) useBtn.addEventListener('click', useAppPrice);
        // a quality picked in this window brings its own (app) price; the user can still type another one
        document.addEventListener('alishan:quality-selected', function (e) {
            if (!e.detail || e.detail.prefix !== 'edit') return;
            const app = Number(ItemForm.getQualityPrice(e.detail.name)) || 0;
            const box = document.getElementById('editPrice');
            if (box && app > 0) box.value = app;
            refreshPriceHint();
        });

        const modal = document.getElementById('editModal');
        if (modal) {
            // click on the dark backdrop closes the modal
            modal.addEventListener('mousedown', function (e) {
                if (e.target === modal) close();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                const m = document.getElementById('editModal');
                if (m && m.style.display !== 'none') close();
            }
        });
    }

    // live "how old / which aging level" line under the Entry Date fields
    function updateEntryPreview() {
        const box = document.getElementById('editEntryPreview');
        if (!box) return;
        const stocked = openItem ? openItem.inStock !== false : true;
        box.innerHTML = ItemForm.entryPreviewHTML(
            document.getElementById('editEntryDate').value,
            document.getElementById('editEntryTime').value,
            stocked
        );
    }

    // ================= OPEN / CLOSE / POPULATE =================

    // ---- price per dozen: the user can change it here (no need to wait for a code/json change) ----
    // The hint compares the box with the app's price (qualities.json) of the selected quality.
    function refreshPriceHint() {
        const hint = document.getElementById('editPriceHint');
        const useBtn = document.getElementById('editPriceUseApp');
        const priceEl = document.getElementById('editPrice');
        if (!hint || !priceEl) return;
        const quality = document.getElementById('editQuality').value;
        const app = Number(ItemForm.getQualityPrice(quality)) || 0;
        const typed = priceEl.value === '' ? null : Number(priceEl.value);
        useBtn.hidden = true;
        hint.className = 'edit-price-hint';
        if (!app) {
            hint.classList.add('edit-price-warn');
            hint.textContent = 'This quality is not in qualities.json (or has no price there), so type the price yourself.';
        } else if (typed === null) {
            hint.textContent = `App price is ₹${app} / dozen. Leave this box empty to keep the saved price.`;
        } else if (typed === app) {
            hint.textContent = `Same as the app price (₹${app} / dozen).`;
        } else {
            hint.classList.add('edit-price-diff');
            hint.textContent = `This entry will use ₹${typed} / dozen. The app price of ${quality} is ₹${app}. The entry amount changes with this price.`;
            useBtn.hidden = false;
            useBtn.textContent = `Use app price (₹${app})`;
        }
    }

    function useAppPrice() {
        const app = Number(ItemForm.getQualityPrice(document.getElementById('editQuality').value)) || 0;
        if (app > 0) { document.getElementById('editPrice').value = app; refreshPriceHint(); }
    }

    function open(id) {
        inject();
        const item = AlishanStore.getItem(id);
        if (!item) {
            showNotification('Item not found', 'error');
            return;
        }
        openItem = item;

        document.getElementById('uniqueCodeDisplay').textContent = item.code ? `Code: ${item.code}` : '';
        // we remember the item's id (not its list position) so a list refresh can never make us edit the wrong item
        document.getElementById('editIndex').value = item.id;
        document.getElementById('editProductType').value = String(item.productType || '').toLowerCase();
        ItemForm.renderQualitySelector('edit', null, String(item.productType || '').toLowerCase());
        ItemForm.setQualitySilently(item.quality, 'edit');
        document.getElementById('editPrice').value = Number(item.price) > 0 ? Number(item.price) : '';
        refreshPriceHint();
        document.getElementById('editCupSize').value = (item.cupSize && item.cupSize !== 'N/A') ? item.cupSize : '';
        document.getElementById('editLotNumber').value = item.lotNumber || '';
        document.getElementById('editMaterial').value = item.material || '';
        document.getElementById('editWeight').value = item.weight || '';
        document.getElementById('editNotes').value = item.notes || '';

        const entryWhen = AlishanCalc.parseDate(item.dateTime);
        const dateInput = document.getElementById('editEntryDate');
        dateInput.max = AlishanCalc.localDate(new Date());              // no future dates
        dateInput.value = isNaN(entryWhen) ? '' : AlishanCalc.localDate(entryWhen);
        document.getElementById('editEntryTime').value = isNaN(entryWhen) ? '' : AlishanCalc.localTime(entryWhen);
        updateEntryPreview();

        // the completion date box exists only for a Complete (out of stock) quality
        const doneField = document.getElementById('editCompletedField');
        const doneInput = document.getElementById('editCompletedDate');
        doneField.style.display = item.inStock === false ? '' : 'none';
        doneInput.max = AlishanCalc.localDate(new Date());
        const doneWhen = item.completedAt ? AlishanCalc.parseDate(item.completedAt) : null;
        doneInput.value = doneWhen && !isNaN(doneWhen) ? AlishanCalc.localDate(doneWhen) : '';

        // colours first (they fill the one colour picker), then the size groups of this entry
        // (colours with the same sizes sit together in one group; a colour with its own sizes has its own group)
        const colorNames = (Array.isArray(item.colors) ? item.colors : []).map(c => (typeof c === 'string' ? c : (c && c.name))).filter(Boolean);
        ItemForm.populateColorsForEdit(colorNames, 'edit');
        SizeGroups.load('edit', item);

        document.getElementById('editModal').style.display = 'flex';
        const body = document.querySelector('#editModal .edit-modal-body');
        if (body) body.scrollTop = 0;
        document.body.classList.add('modal-open');
    }

    function close() {
        const modal = document.getElementById('editModal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    // ================= SUBMIT: read the form, hand it to the store =================

    async function submit() {
        const id = document.getElementById('editIndex').value;

        const input = {
            productType: document.getElementById('editProductType').value,
            cupSize: document.getElementById('editCupSize').value,
            lotNumber: document.getElementById('editLotNumber').value,
            quality: document.getElementById('editQuality').value,
            price: document.getElementById('editPrice').value,
            material: document.getElementById('editMaterial').value,
            weight: document.getElementById('editWeight').value,
            notes: document.getElementById('editNotes').value,
            entry: {
                date: document.getElementById('editEntryDate').value,
                time: document.getElementById('editEntryTime').value
            },
            // undefined = the entry is not Complete, so there is no completion date to change
            completedDate: document.getElementById('editCompletedField').style.display === 'none'
                ? undefined : document.getElementById('editCompletedDate').value
        };

        Object.assign(input, SizeGroups.read('edit'));      // sizeOption + colours + sizes (one group = same sizes, several = per-colour sizes)

        const result = await AlishanStore.updateItem(id, input);
        if (!result.ok) {
            showNotification(result.error, 'error');
            return;
        }
        close();
        showNotification(result.message, 'success');   // every page redraws itself: it listens to the store
    }

    // ================= DELETE / STOCK TOGGLE =================

    async function deleteItem(id) {
        const target = AlishanStore.getItem(id);
        if (!target) {
            showNotification('Item not found', 'error');
            return;
        }
        if (!confirm(`Delete ${target.quality} ${target.productType} (Code ${target.code})?\n\nIt moves to Settings → Archives. You can restore it from there, or delete it for good.`)) return;
        const result = await AlishanStore.deleteItem(id);
        showNotification(result.ok ? result.message : result.error, result.ok ? 'success' : 'error');
    }

    async function toggleStock(id) {
        const result = await AlishanStore.toggleStock(id);
        showNotification(result.ok ? result.message : result.error, result.ok ? 'success' : 'error');
    }

    return {
        inject,
        open,
        close,
        submit,
        deleteItem,
        toggleStock,
        updateEntryPreview
    };
})();

window.ItemModal = ItemModal;
