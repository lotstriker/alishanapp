/* ============================================================
   item-form.js — SINGLE shared implementation of the size-grid
   (dozens+pieces per size) and the quality picker (searchable,
   categorized cards), used by:
     - index.html's Add New Product Entry form   (prefix: '')
     - index.html's Edit Product Entry modal     (prefix: 'edit')
     - inventory.html's Edit Product Entry modal (prefix: 'edit')

   Before this file existed, each of those three had its own
   hand-written copy of this UI + math, and they'd drifted apart —
   Inventory's edit modal didn't even have piece inputs, so editing
   an item there silently dropped its pieces. Now there is exactly
   one implementation; changing it here changes it everywhere.
   ============================================================ */

if (typeof AlishanHas === 'function' && !AlishanHas({ AlishanCalc: 1, AlishanStore: 1 })) { throw new Error('item-form.js: calc.js / store.js not loaded yet'); }

var ItemForm = (() => {
    const SIZES = AlishanCalc.SIZES;
    // NOTE: ItemForm is UI only (pickers, size boxes, previews). All data, prices,
    // colours and maths come from AlishanStore (store.js) and AlishanCalc (calc.js).

    // ---- Field-id sets per mode. '' = Add form, 'edit' = any Edit
    // modal. Both index.html and inventory.html's edit modals use
    // the SAME 'edit' ids, so this one config covers all of them. ----
    function sizeIds(prefix) {
        return prefix
            ? { dozen: (s) => `editSize${s}`, pieces: (s) => `editSize${s}_pieces` }
            : { dozen: (s) => `size${s}`, pieces: (s) => `size${s}_pieces` };
    }

    function qualityIds(prefix) {
        return prefix
            ? {
                hidden: 'editQuality', categories: 'editQualityCategories',
                display: 'editSelectedQualityDisplay', text: 'editSelectedQualityText',
                search: 'editQualitySearch'
              }
            : {
                hidden: 'quality', categories: 'qualityCategories',
                display: 'selectedQualityDisplay', text: 'selectedQualityText',
                search: 'qualitySearch'
              };
    }

    // ================= SIZE GRID (dozens + pieces) =================

    // One size cell (label + dozens box + pieces box). Used by the main
    // grid AND by the per-color cards, so every size input in the app
    // looks and behaves the same. Empty by default: "0" is only a
    // placeholder, so you can type a value straight away.
    function sizeCellHTML(size, cfg = {}) {
        const dv = Number(cfg.dozenValue) > 0 ? Number(cfg.dozenValue) : '';
        const pv = Number(cfg.piecesValue) > 0 ? Number(cfg.piecesValue) : '';
        const idD = cfg.dozenId ? ` id="${cfg.dozenId}"` : '';
        const idP = cfg.piecesId ? ` id="${cfg.piecesId}"` : '';
        const data = cfg.color !== undefined ? ` data-color="${escapeHtml(cfg.color)}"` : '';
        return `
            <div class="size-input-group">
                <label>Size ${size}</label>
                <div class="size-input-row">
                    <input type="number"${idD} class="size-dozen ${cfg.dozenClass || ''}"${data} min="0" step="1" inputmode="numeric" placeholder="0" value="${dv}" aria-label="Size ${size} dozens">
                    <input type="number"${idP} class="size-pieces ${cfg.piecesClass || ''}"${data} min="0" max="11" step="1" inputmode="numeric" placeholder="0" value="${pv}" aria-label="Size ${size} pieces">
                </div>
                <div class="size-input-caption"><span>Dozen</span><span>Pcs</span></div>
            </div>`;
    }

    // Renders the 10-size dozen+pieces grid into `containerId`.
    function renderSizeGrid(containerId, prefix = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        const ids = sizeIds(prefix);

        container.innerHTML = `<div class="size-grid">` + SIZES.map(size =>
            sizeCellHTML(size, { dozenId: ids.dozen(size), piecesId: ids.pieces(size) })
        ).join('') + `</div>`;
    }

    function clearSizeGrid(prefix = '') {
        const ids = sizeIds(prefix);
        SIZES.forEach(size => {
            const d = document.getElementById(ids.dozen(size));
            const p = document.getElementById(ids.pieces(size));
            if (d) d.value = '';
            if (p) p.value = '';
        });
    }

    // Fills the grid from a saved size object, e.g. an item's own
    // top-level fields or a color's `.sizes` object — both use the
    // same `size28` / `size28_pieces` key naming.
    function populateSizeGrid(containerId, prefix, sizesObj) {
        renderSizeGrid(containerId, prefix);
        if (!sizesObj) return;
        const ids = sizeIds(prefix);
        SIZES.forEach(size => {
            const d = document.getElementById(ids.dozen(size));
            const p = document.getElementById(ids.pieces(size));
            if (d) d.value = sizesObj[`size${size}`] || '';
            if (p) p.value = sizesObj[`size${size}_pieces`] || '';
        });
    }

    // ================= QUALITY PICKER (searchable, categorized) =================

    // A quality entry in qualities.json is either a plain string (legacy) or { name, price }.
    function getQualityName(q) {
        return (q && typeof q === 'object') ? q.name : q;
    }
    function getQualityPrice(name) {
        return AlishanStore.getPrice(name);
    }

    function updateCategoryIcons(categoriesEl) {
        categoriesEl.querySelectorAll('.quality-category').forEach((category, index) => {
            const content = category.querySelector('.category-content');
            const icon = category.querySelector('.category-header i');
            if (!content || !icon) return;
            if (index === 0 && !content.classList.contains('expanded')) {
                content.classList.add('expanded');
            }
            icon.classList.toggle('fa-chevron-up', content.classList.contains('expanded'));
            icon.classList.toggle('fa-chevron-down', !content.classList.contains('expanded'));
        });
    }

    // Renders the categorized, searchable quality picker for the given
    // productType into the mode's container (prefix '' or 'edit').
    function renderQualitySelector(prefix, _unused, productType) {
        const qualityData = AlishanStore.getQualityData();   // the store owns qualities.json
        const ids = qualityIds(prefix);
        const categoriesEl = document.getElementById(ids.categories);
        const hiddenSelect = document.getElementById(ids.hidden);
        const displayEl = document.getElementById(ids.display);
        const searchEl = document.getElementById(ids.search);

        if (!categoriesEl || !hiddenSelect) return;

        if (displayEl) displayEl.style.display = 'none';
        hiddenSelect.innerHTML = '<option value="">Select Quality</option>';
        if (searchEl) searchEl.value = '';

        const qualities = qualityData ? qualityData[productType] : null;
        if (!qualities || Object.keys(qualities).length === 0) {
            categoriesEl.innerHTML = `
                <div class="quality-placeholder">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>No qualities found for ${productType || 'this product type'}</p>
                </div>`;
            return;
        }

        let html = '';
        Object.keys(qualities).forEach((category, index) => {
            const list = qualities[category];
            html += `
                <div class="quality-category">
                    <div class="category-header" onclick="ItemForm.toggleCategory(this)">
                        <span>${category}</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="category-content ${index === 0 ? 'expanded' : ''}">
                        ${list.map(q => {
                            const name = getQualityName(q);
                            return `
                            <div class="quality-option" data-quality="${name}" data-prefix="${prefix}"
                                 onclick="ItemForm.selectQuality('${name}', '${prefix}')">
                                <div class="quality-checkbox"></div>
                                <span class="quality-name">${name}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            list.forEach(q => {
                const name = getQualityName(q);
                hiddenSelect.add(new Option(name, name));
            });
        });

        categoriesEl.innerHTML = html;
        updateCategoryIcons(categoriesEl);
    }

    function toggleCategory(header) {
        const content = header.nextElementSibling;
        const isExpanded = content.classList.contains('expanded');
        const scope = header.closest('.quality-categories') || document;

        scope.querySelectorAll('.category-content.expanded').forEach(el => el.classList.remove('expanded'));
        scope.querySelectorAll('.category-header i').forEach(icon => icon.classList.replace('fa-chevron-up', 'fa-chevron-down'));

        if (!isExpanded) {
            content.classList.add('expanded');
            header.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
            content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function selectQuality(name, prefix) {
        const ids = qualityIds(prefix);
        const hiddenSelect = document.getElementById(ids.hidden);
        const displayEl = document.getElementById(ids.display);
        const textEl = document.getElementById(ids.text);
        const categoriesEl = document.getElementById(ids.categories);
        if (!hiddenSelect || !categoriesEl) return;

        categoriesEl.querySelectorAll('.quality-option.selected').forEach(opt => opt.classList.remove('selected'));

        const selectedOption = categoriesEl.querySelector(`.quality-option[data-quality="${name}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
            selectedOption.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        hiddenSelect.value = name;

        if (textEl) {
            const price = getQualityPrice(name);
            textEl.textContent = price > 0
                ? `${name} (₹${price} / dozen)`
                : `${name} (price not set in qualities.json)`;
        }
        if (displayEl) displayEl.style.display = 'block';

        if (typeof showNotification === 'function') {
            showNotification(`Quality selected: ${name}`, 'success');
        }
    }

    function filterQuality(prefix) {
        const ids = qualityIds(prefix);
        const searchEl = document.getElementById(ids.search);
        const categoriesEl = document.getElementById(ids.categories);
        if (!searchEl || !categoriesEl) return;

        const term = searchEl.value.toLowerCase().trim();
        const allOptions = categoriesEl.querySelectorAll('.quality-option');
        const categories = categoriesEl.querySelectorAll('.quality-category');

        if (term === '') {
            allOptions.forEach(opt => {
                opt.style.display = 'flex';
                const nameEl = opt.querySelector('.quality-name');
                if (nameEl) nameEl.innerHTML = nameEl.textContent;
            });
            categories.forEach(cat => cat.style.display = 'block');
            updateCategoryIcons(categoriesEl);
            return;
        }

        let hasMatches = false;
        categories.forEach(category => {
            let categoryHasMatches = false;
            category.querySelectorAll('.quality-option').forEach(opt => {
                const nameEl = opt.querySelector('.quality-name');
                if (!nameEl) return;
                const original = nameEl.textContent;
                const matches = original.toLowerCase().includes(term);
                if (matches) {
                    opt.style.display = 'flex';
                    categoryHasMatches = true;
                    hasMatches = true;
                    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    nameEl.innerHTML = original.replace(regex, '<span class="match-highlight">$1</span>');
                } else {
                    opt.style.display = 'none';
                }
            });
            category.style.display = categoryHasMatches ? 'block' : 'none';
            if (categoryHasMatches) {
                const content = category.querySelector('.category-content');
                const header = category.querySelector('.category-header');
                if (content && header) {
                    content.classList.add('expanded');
                    const icon = header.querySelector('i');
                    if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
                }
            }
        });

        let noResults = categoriesEl.querySelector('.no-results');
        if (!hasMatches && term !== '') {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.innerHTML = `<i class="fas fa-search"></i><p>No qualities found for "${term}"</p>`;
                categoriesEl.appendChild(noResults);
            }
        } else if (noResults) {
            noResults.remove();
        }
    }

    // Pre-selects a quality when opening Edit (populates the hidden
    // select + highlights its card + shows the price line), without
    // the "quality selected" notification toast.
    function setQualitySilently(name, prefix) {
        const ids = qualityIds(prefix);
        const hiddenSelect = document.getElementById(ids.hidden);
        const displayEl = document.getElementById(ids.display);
        const textEl = document.getElementById(ids.text);
        const categoriesEl = document.getElementById(ids.categories);
        if (!hiddenSelect) return;

        hiddenSelect.value = name;
        if (categoriesEl) {
            categoriesEl.querySelectorAll('.quality-option.selected').forEach(opt => opt.classList.remove('selected'));
            const opt = categoriesEl.querySelector(`.quality-option[data-quality="${name}"]`);
            if (opt) opt.classList.add('selected');
        }
        if (textEl) {
            const price = getQualityPrice(name);
            textEl.textContent = name ? (price > 0 ? `${name} (₹${price} / dozen)` : `${name} (price not set in qualities.json)`) : '';
        }
        if (displayEl) displayEl.style.display = name ? 'block' : 'none';
    }

    // ================= COLOR PICKER (searchable, swatch-based) =================

    // colours.json is loaded and owned by the store; this form only draws them
    const colorData = { get colors() { return AlishanStore.getColors(); } };
    const colorSelections = { '': [], 'edit': [] };

    const COLOR_ID_SETS = {
        '': {
            selector: 'colorSelector', dropdown: 'colorDropdown',
            toggle: 'colorDropdownToggle', search: 'colorSearch',
            options: 'colorOptions', selectedContainer: 'selectedColors',
            hidden: 'colorsHidden'
        },
        edit: {
            selector: 'editColorSelector', dropdown: 'editColorDropdown',
            toggle: 'editColorDropdownToggle', search: 'editColorSearch',
            options: 'editColorOptions', selectedContainer: 'editSelectedColors',
            hidden: 'editColorsHidden'
        }
    };

    function colorIds(prefix) {
        return COLOR_ID_SETS[prefix] || COLOR_ID_SETS[''];
    }

    // Draws the colour dropdowns + per-colour CSS (data was already loaded by the store)
    async function loadColors() {
        populateColorDropdowns();
        generateColorCSS();
    }

    function getColorData() {
        return colorData;
    }

    function getColorStyle(colorName) {
        return AlishanStore.getColorStyle(colorName);
    }
    function getColorStyleSafe(colorName) {
        return AlishanStore.getColorStyleSafe(colorName);
    }

    function darkenColor(hex, factor) {
        const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
        if (!match) return '#29313B';
        const value = match[1];
        const channels = [0, 2, 4].map(i => Math.max(0, Math.round(parseInt(value.slice(i, i + 2), 16) * factor)));
        return '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    function generateColorCSS() {
        if (!colorData.colors) return;
        let css = '';
        colorData.colors.forEach(color => {
            // Keep every colour's own palette from colors.json in every theme.
            // Do not replace all dark-theme text with white or merge distinct colour backgrounds.
            css += `
                .color-${color.name.toLowerCase()} {
                    background-color: ${color.backgroundColor} !important;
                    color: ${color.textColor} !important;
                    border: 1px solid ${color.borderColor} !important;
                }
            `;
        });
        let styleTag = document.getElementById('dynamic-colors');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-colors';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = css;
    }

    // Call once per page, for every mode present on that page
    // (e.g. index.html calls initColorSelectors(['', 'edit']),
    // inventory.html calls initColorSelectors(['edit'])).
    function initColorSelectors(prefixes = ['']) {
        prefixes.forEach(prefix => initColorSelector(prefix));
    }

    function initColorSelector(prefix = '') {
        const ids = colorIds(prefix);
        const selector = document.getElementById(ids.selector);
        const dropdown = document.getElementById(ids.dropdown);
        const toggle = document.getElementById(ids.toggle);
        const search = document.getElementById(ids.search);

        if (!selector || !dropdown || !toggle) return;

        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('active');
            selector.classList.toggle('active');
            if (dropdown.classList.contains('active') && search) search.focus();
        });

        document.addEventListener('click', function (e) {
            if (!selector.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
                selector.classList.remove('active');
            }
        });

        if (search) {
            search.addEventListener('input', function (e) {
                filterColorOptions(e.target.value, prefix);
            });
        }
    }

    function populateColorDropdowns(prefixes = ['', 'edit']) {
        prefixes.forEach(prefix => loadColorOptions(prefix));
    }

    function loadColorOptions(prefix = '') {
        const ids = colorIds(prefix);
        const container = document.getElementById(ids.options);
        if (!container || !colorData.colors) return;

        container.innerHTML = '';
        colorData.colors.forEach(color => {
            const option = document.createElement('div');
            option.className = 'color-option';
            option.setAttribute('data-color', color.name);
            option.innerHTML = `
                <div class="color-preview" style="background-color: ${color.backgroundColor}; border-color: ${color.borderColor}"></div>
                <span class="color-name" style="color: ${color.textColor}">${color.displayName}</span>
                <div class="color-checkbox"></div>
            `;
            option.addEventListener('click', () => toggleColorSelection(color.name, prefix));
            container.appendChild(option);
        });
    }

    function toggleColorSelection(colorName, prefix = '') {
        const arr = colorSelections[prefix] || (colorSelections[prefix] = []);
        const i = arr.indexOf(colorName);
        if (i === -1) arr.push(colorName); else arr.splice(i, 1);
        updateSelectedColorsDisplay(prefix);
        updateColorOptionsDisplay(prefix);
        updateColorHiddenInput(prefix);
    }

    function updateSelectedColorsDisplay(prefix = '') {
        const ids = colorIds(prefix);
        const arr = colorSelections[prefix] || [];
        const container = document.getElementById(ids.selectedContainer);
        if (!container) return;

        container.querySelectorAll('.selected-color-tag').forEach(tag => tag.remove());

        if (arr.length === 0) {
            if (!container.querySelector('.no-colors')) {
                container.innerHTML = '<span class="no-colors">No colors selected</span>';
            }
            return;
        }

        const noColors = container.querySelector('.no-colors');
        if (noColors) noColors.remove();

        arr.forEach(colorName => {
            const color = getColorStyleSafe(colorName);
            const tag = document.createElement('span');
            tag.className = 'selected-color-tag';
            tag.style.backgroundColor = color.backgroundColor;
            tag.style.color = color.textColor;
            tag.style.borderColor = color.borderColor;
            tag.innerHTML = `
                ${color.displayName}
                <button type="button" class="remove-color" onclick="ItemForm.removeColor('${colorName}', '${prefix}', event)">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(tag);
        });
    }

    function removeColor(colorName, prefix, event) {
        if (event) event.stopPropagation();
        const arr = colorSelections[prefix] || [];
        const i = arr.indexOf(colorName);
        if (i !== -1) {
            arr.splice(i, 1);
            updateSelectedColorsDisplay(prefix);
            updateColorOptionsDisplay(prefix);
            updateColorHiddenInput(prefix);
        }
    }

    function updateColorOptionsDisplay(prefix = '') {
        const ids = colorIds(prefix);
        const arr = colorSelections[prefix] || [];
        document.querySelectorAll(`#${ids.options} .color-option`).forEach(option => {
            const name = option.getAttribute('data-color');
            option.classList.toggle('selected', arr.includes(name));
        });
    }

    // Pages can ask to be told whenever the chosen colours change
    // (e.g. to keep one size card per chosen colour — so ONE colour picker does everything).
    const colorChangeListeners = {};
    function onColorsChange(prefix, fn) {
        (colorChangeListeners[prefix] = colorChangeListeners[prefix] || []).push(fn);
    }

    // Keeps exactly one size card (.color-size-item) per chosen colour inside `container`:
    // cards of un-chosen colours go, new colours get a card (makeCardHTML(name)), the values
    // typed in the other cards stay, and the cards follow the order the colours were picked.
    function syncColorCards(container, chosen, makeCardHTML) {
        if (!container) return;
        const existing = {};
        container.querySelectorAll(':scope > .color-size-item').forEach(card => { existing[card.getAttribute('data-color')] = card; });
        Object.keys(existing).forEach(name => { if (!chosen.includes(name)) existing[name].remove(); });
        chosen.forEach(name => {
            let card = existing[name];
            if (!card) {
                const holder = document.createElement('div');
                holder.innerHTML = String(makeCardHTML(name)).trim();
                card = holder.firstElementChild;
                if (!card) return;
            }
            container.appendChild(card);      // appending moves it: keeps the picked order
        });
    }

    function updateColorHiddenInput(prefix = '') {
        const ids = colorIds(prefix);
        const hidden = document.getElementById(ids.hidden);
        if (hidden) hidden.value = JSON.stringify(colorSelections[prefix] || []);
        (colorChangeListeners[prefix] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    }

    function filterColorOptions(searchTerm, prefix = '') {
        const ids = colorIds(prefix);
        const term = (searchTerm || '').toLowerCase();
        document.querySelectorAll(`#${ids.options} .color-option`).forEach(option => {
            const name = option.getAttribute('data-color');
            const color = getColorStyle(name);
            const matches = color && (
                color.name.toLowerCase().includes(term) ||
                color.displayName.toLowerCase().includes(term)
            );
            option.style.display = matches ? 'flex' : 'none';
        });
    }

    function selectAllColors(prefix = '') {
        if (!colorData.colors) return;
        colorSelections[prefix] = colorData.colors.map(c => c.name);
        updateSelectedColorsDisplay(prefix);
        updateColorOptionsDisplay(prefix);
        updateColorHiddenInput(prefix);
    }

    function clearAllColors(prefix = '') {
        colorSelections[prefix] = [];
        updateSelectedColorsDisplay(prefix);
        updateColorOptionsDisplay(prefix);
        updateColorHiddenInput(prefix);
    }

    function getSelectedColors(prefix = '') {
        return [...(colorSelections[prefix] || [])];
    }

    // Populates the color selector for editing an existing item —
    // colorsArray can be plain strings or { name, ... } objects.
    function populateColorsForEdit(colorsArray, prefix = 'edit') {
        if (Array.isArray(colorsArray)) {
            colorSelections[prefix] = colorsArray.map(c => (typeof c === 'string' ? c : c.name));
        } else {
            colorSelections[prefix] = [];
        }
        updateSelectedColorsDisplay(prefix);
        updateColorOptionsDisplay(prefix);
        updateColorHiddenInput(prefix);
    }

    function resetColorSelector(prefix = '') {
        colorSelections[prefix] = [];
        updateSelectedColorsDisplay(prefix);
        updateColorOptionsDisplay(prefix);
        updateColorHiddenInput(prefix);
        const ids = colorIds(prefix);
        const search = document.getElementById(ids.search);
        if (search) search.value = '';
        filterColorOptions('', prefix);
    }

    // ================= small UI helpers =================

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // The live line under the Entry Date fields. All the numbers (days, aging level)
    // come from AlishanCalc.entryInfo — this only turns them into HTML.
    function entryPreviewHTML(dateStr, timeStr, inStock = true) {
        const e = AlishanCalc.entryInfo(dateStr, timeStr, inStock);
        if (!e.valid) return '<span class="entry-preview-muted">Pick a date to see how old this entry is.</span>';
        if (e.future) return '<span class="entry-preview-error"><i class="fas fa-exclamation-circle"></i> This date/time is in the future.</span>';

        const dateText = e.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const ago = e.days === 0 ? 'today' : e.days === 1 ? '1 day ago' : `${e.days} days ago`;

        let levelHTML;
        if (!e.level) {
            levelHTML = '<span class="entry-preview-muted">Out of stock — not counted in aging</span>';
        } else {
            const L = AlishanCalc.AGING_LEVELS[e.level];
            levelHTML = `<span class="entry-preview-badge" style="background:${L.color};color:${L.text}">${L.badge}</span>` +
                        `<span class="entry-preview-muted">${AlishanCalc.agingTitle(e.level)}</span>`;
        }
        const old = e.days > 365 ? '<div class="entry-preview-warn"><i class="fas fa-exclamation-triangle"></i> More than a year old — please double-check the date.</div>' : '';
        return `<div class="entry-preview-row"><strong>${dateText}</strong><span>${ago}</span>${levelHTML}</div>${old}`;
    }

    // ---- size inputs: select-all on focus, auto-carry 12 pieces -> 1 dozen ----
    function isSizeInput(el) {
        return el && el.classList && (el.classList.contains('size-dozen') || el.classList.contains('size-pieces'));
    }
    document.addEventListener('focusin', (e) => {
        if (isSizeInput(e.target)) { try { e.target.select(); } catch (err) { /* ignore */ } }
    });
    document.addEventListener('wheel', () => {
        const a = document.activeElement;
        if (isSizeInput(a)) a.blur(); // stops the mouse wheel silently changing quantities
    }, { passive: true });
    document.addEventListener('change', (e) => {
        const el = e.target;
        if (!isSizeInput(el)) return;
        const row = el.closest('.size-input-row');
        const dozenEl = row && row.querySelector('.size-dozen');
        const piecesEl = row && row.querySelector('.size-pieces');
        if (!dozenEl || !piecesEl) {
            const n = parseInt(el.value);
            el.value = Number.isFinite(n) && n > 0 ? n : '';
            return;
        }
        // 12 pieces = 1 dozen and 2.5 dozens = 2 dozens + 6 pieces (the rule lives in AlishanCalc.splitPieces)
        const r = AlishanCalc.splitPieces(dozenEl.value, piecesEl.value);
        dozenEl.value = r.dozens || '';
        piecesEl.value = r.pieces || '';
    });

    return {
        SIZES,
        escapeHtml,
        entryPreviewHTML,
        onColorsChange,
        syncColorCards,
        sizeCellHTML,
        renderSizeGrid,
        clearSizeGrid,
        populateSizeGrid,
        getQualityName,
        renderQualitySelector,
        toggleCategory,
        selectQuality,
        filterQuality,
        setQualitySilently,
        loadColors,
        getColorData,
        getColorStyle,
        getColorStyleSafe,
        initColorSelectors,
        populateColorDropdowns,
        toggleColorSelection,
        removeColor,
        filterColorOptions,
        selectAllColors,
        clearAllColors,
        getSelectedColors,
        populateColorsForEdit,
        resetColorSelector
    };
})();

window.ItemForm = ItemForm;
window.escapeHtml = ItemForm.escapeHtml;
