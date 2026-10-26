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

    // Set at the start of open(index); used by handleSizeOptionChange()
    // to know whether the item currently being edited was originally
    // saved in "same" mode, so switching to "different" mid-edit can
    // auto-convert its size data instead of starting from blank.
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
                        <div class="size-option">
                            <label>
                                <input type="radio" name="editSizeOption" value="same" checked onchange="ItemModal.handleSizeOptionChange()">
                                Same sizes for all colors
                            </label>
                            <label>
                                <input type="radio" name="editSizeOption" value="different" onchange="ItemModal.handleSizeOptionChange()">
                                Different sizes for each color
                            </label>
                        </div>

                        <div id="editSameSizesContainer"></div>

                        <div id="editDifferentSizesContainer" class="color-size-container" style="display: none;">
                            <p class="different-sizes-hint" id="editColorSizeHint">
                                <i class="fas fa-info-circle"></i>
                                Pick the colors in the <strong>Colors</strong> box above — a size card appears here for each color you pick.
                            </p>
                            <div id="editColorSizeItems">
                                <!-- Color size items will be added dynamically -->
                            </div>
                        </div>
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
        ItemForm.onColorsChange('edit', syncEditCards);      // size cards follow the one colour picker

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

    // ---- per-color "different sizes" card (used by both the Add
    // Color button and pre-filling colors when the modal opens) ----
    function colorSizeItemHTMLWithValues(colorName, sizesObj) {
        const color = ItemForm.getColorStyleSafe(colorName);
        const safeName = escapeHtml(colorName);
        const cells = ItemForm.SIZES.map(size => ItemForm.sizeCellHTML(size, {
            dozenClass: `edit-color-size-${size}`,
            piecesClass: `edit-color-size-${size}_pieces`,
            dozenValue: sizesObj ? sizesObj[`size${size}`] : 0,
            piecesValue: sizesObj ? sizesObj[`size${size}_pieces`] : 0,
            color: colorName
        })).join('');
        return `
            <div class="color-size-item" data-color="${safeName}">
                <div class="color-size-header" style="background-color: ${color.backgroundColor}; color: ${color.textColor}; border-color: ${color.borderColor}">
                    <h4><i class="fas fa-palette"></i> ${escapeHtml(color.displayName)}</h4>
                    <button type="button" class="remove-color-btn" onclick="ItemModal.removeColorSizeItem(this)">Remove</button>
                </div>
                <div class="size-grid">${cells}</div>
            </div>`;
    }

    function colorSizeItemHTML(colorName) {
        return colorSizeItemHTMLWithValues(colorName, null);
    }

    function toggleSizeOption() {
        const same = document.querySelector('input[name="editSizeOption"][value="same"]');
        const sameContainer = document.getElementById('editSameSizesContainer');
        const diffContainer = document.getElementById('editDifferentSizesContainer');
        if (!same || !sameContainer || !diffContainer) return;
        if (same.checked) {
            sameContainer.style.display = 'block';
            diffContainer.style.display = 'none';
        } else {
            sameContainer.style.display = 'none';
            diffContainer.style.display = 'block';
        }
    }

    // Called on every size-option radio change. If the item being
    // edited was originally "same" mode and the user just switched
    // to "different", auto-convert its size data into per-color
    // cards instead of leaving the list empty.
    // ONE colour picker does everything: in "different sizes" mode a size card appears for
    // every colour picked in the Colors box (and goes when the colour is un-picked).
    function syncEditCards() {
        const selected = document.querySelector('input[name="editSizeOption"]:checked');
        if (!selected || selected.value !== 'different') return;
        const chosen = ItemForm.getSelectedColors('edit');
        ItemForm.syncColorCards(document.getElementById('editColorSizeItems'), chosen, name => colorSizeItemHTMLWithValues(name, null));
        const hint = document.getElementById('editColorSizeHint');
        if (hint) hint.style.display = chosen.length ? 'none' : '';
    }

    function handleSizeOptionChange() {
        const selected = document.querySelector('input[name="editSizeOption"]:checked');
        const container = document.getElementById('editColorSizeItems');
        if (selected && selected.value === 'different' && container && container.children.length === 0) {
            convertSameToDifferentSizes();      // copies what is typed in the same-size boxes into every colour
        }
        toggleSizeOption();
        syncEditCards();
    }

    // the card's Remove button un-picks the colour in the one colour picker
    function removeColorSizeItem(button) {
        const card = button.closest('.color-size-item');
        if (card) ItemForm.removeColor(card.getAttribute('data-color'), 'edit');
    }

    // Switching "same sizes" -> "different sizes" while editing: copies the
    // quantities currently typed in the same-size grid into a card for
    // every currently-selected color (so unsaved edits are not lost).
    function convertSameToDifferentSizes() {
        const container = document.getElementById('editColorSizeItems');
        if (!container) return;

        const colors = ItemForm.getSelectedColors('edit');
        if (colors.length === 0) return; // nothing picked yet: cards appear when colours are picked

        const sizesObj = {};
        ItemForm.SIZES.forEach(size => {
            sizesObj[`size${size}`] = parseInt(document.getElementById(`editSize${size}`)?.value) || 0;
            sizesObj[`size${size}_pieces`] = parseInt(document.getElementById(`editSize${size}_pieces`)?.value) || 0;
        });

        container.innerHTML = '';
        colors.forEach(colorName => {
            container.insertAdjacentHTML('beforeend', colorSizeItemHTMLWithValues(colorName, sizesObj));
        });
        showNotification('Sizes copied to every color — change them per color below.', 'success');
    }

    // ================= OPEN / CLOSE / POPULATE =================

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

        const cardBox = document.getElementById('editColorSizeItems');
        if (cardBox) cardBox.innerHTML = '';          // never show the previous item's cards

        // Always render the same-sizes grid structure (even if the
        // item currently uses "different" mode) so switching the
        // radio later has valid fields to show.
        ItemForm.renderSizeGrid('editSameSizesContainer', 'edit');

        if (item.sizeOption === 'same') {
            document.querySelector('input[name="editSizeOption"][value="same"]').checked = true;
            ItemForm.populateColorsForEdit(Array.isArray(item.colors) && typeof item.colors[0] === 'string' ? item.colors : [], 'edit');
            ItemForm.populateSizeGrid('editSameSizesContainer', 'edit', item);
            document.getElementById('editSameSizesContainer').style.display = 'block';
            document.getElementById('editDifferentSizesContainer').style.display = 'none';
        } else {
            document.querySelector('input[name="editSizeOption"][value="different"]').checked = true;
            ItemForm.populateColorsForEdit(Array.isArray(item.colors) && typeof item.colors[0] === 'object' ? item.colors : [], 'edit');

            const container = document.getElementById('editColorSizeItems');
            if (container) {
                container.innerHTML = '';
                (item.colors || []).forEach(colorObj => {
                    if (colorObj) container.insertAdjacentHTML('beforeend', colorSizeItemHTMLWithValues(colorObj.name, colorObj.sizes));
                });
            }
            document.getElementById('editSameSizesContainer').style.display = 'none';
            document.getElementById('editDifferentSizesContainer').style.display = 'block';
        }

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
        const sizeOption = document.querySelector('input[name="editSizeOption"]:checked').value;

        const input = {
            productType: document.getElementById('editProductType').value,
            cupSize: document.getElementById('editCupSize').value,
            lotNumber: document.getElementById('editLotNumber').value,
            quality: document.getElementById('editQuality').value,
            material: document.getElementById('editMaterial').value,
            weight: document.getElementById('editWeight').value,
            notes: document.getElementById('editNotes').value,
            sizeOption,
            entry: {
                date: document.getElementById('editEntryDate').value,
                time: document.getElementById('editEntryTime').value
            }
        };

        if (sizeOption === 'same') {
            input.colors = ItemForm.getSelectedColors('edit');
            input.sizes = readSizeBoxes(
                size => document.getElementById(`editSize${size}`),
                size => document.getElementById(`editSize${size}_pieces`)
            );
        } else {
            const container = document.getElementById('editColorSizeItems');
            const cards = container ? Array.from(container.getElementsByClassName('color-size-item')) : [];
            input.colorSizes = cards.map(card => ({
                name: card.getAttribute('data-color'),
                sizes: readSizeBoxes(
                    size => card.querySelector(`.edit-color-size-${size}`),
                    size => card.querySelector(`.edit-color-size-${size}_pieces`)
                )
            }));
        }

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
        if (!confirm(`Delete ${target.quality} ${target.productType} (Code ${target.code})?\n\nThis cannot be undone.`)) return;
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
        toggleSizeOption,
        updateEntryPreview,
        handleSizeOptionChange,
        removeColorSizeItem,
        convertSameToDifferentSizes
    };
})();

window.ItemModal = ItemModal;
