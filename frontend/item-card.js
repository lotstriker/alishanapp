/* ============================================================
   item-card.js — the ONE inventory card, used by the Dashboard
   (index.html) and Inventory (inventory.html).

   The card is COLLAPSED by default and shows what matters at a glance:
     coloured header (quality, lot, code, date, type, aging) +
     total dozens / amount, colours, stock status and the buttons.
   Click the header (or "Show details") to open it:
     the size quantities + calculation, and a "Details" group
     (Product Details + Additional Info together — one toggle).

   CLOSED: the totals row (dozens, amount, status, colours) + Edit / Delete / Stock sit right
   under the header.  OPEN: that row is hidden and everything is back in its old place —
   sizes, colours and the calculation in the body, and the footer bar at the bottom:
   Edit | Delete | Complete | Total Amount.

   Which cards are open is remembered here, so a card you opened
   stays open when the page redraws (search, filter, edit, stock,
   a change in another tab). A reload closes everything.
   "Collapse all" (ItemCard.collapseAll) closes every open card.

   The card does no maths and no saving: numbers come from
   AlishanCalc, the buttons call ItemModal -> AlishanStore.
   Styling: item-card.css.
   ============================================================ */

var ItemCard = (() => {
    const openCards = new Set();      // ids of cards that are open
    const openDetails = new Set();    // ids whose "Details" group is open

    const TYPE_ICONS = { BRA: 'fa-heart', PANTY: 'fa-gem', SET: 'fa-layer-group', BLOUSE: 'fa-tshirt' };

    // ---------- open / close (changes the page in place, no redraw) ----------

    function cardEl(id) {
        return document.querySelector(`.inventory-card[data-id="${CSS.escape(String(id))}"]`);
    }

    function refreshCollapseButtons() {
        document.querySelectorAll('[data-collapse-all]').forEach(btn => {
            btn.disabled = openCards.size === 0;
            const n = btn.querySelector('.ic-open-count');
            if (n) n.textContent = openCards.size ? ` (${openCards.size})` : '';
        });
    }

    function paint(el, id) {
        if (!el) return;
        const open = openCards.has(String(id));
        if (open && el._icBuild) el._icBuild();          // the inside is built only when first opened
        el.classList.toggle('ic-open', open);

        el.querySelectorAll('[data-ic-toggle]').forEach(b => b.setAttribute('aria-expanded', open ? 'true' : 'false'));
        const label = el.querySelector('.ic-expand-label');
        if (label) label.textContent = open ? 'Hide details' : 'Show details';

        const detailsOpen = openDetails.has(String(id));
        el.classList.toggle('ic-details-open', detailsOpen);
        const dbtn = el.querySelector('[data-ic-details]');
        if (dbtn) dbtn.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
    }

    function toggle(id) {
        id = String(id);
        if (openCards.has(id)) { openCards.delete(id); openDetails.delete(id); } else openCards.add(id);
        paint(cardEl(id), id);
        refreshCollapseButtons();
    }

    // Product Details + Additional Info open and close TOGETHER
    function toggleDetails(id) {
        id = String(id);
        if (openDetails.has(id)) openDetails.delete(id); else openDetails.add(id);
        paint(cardEl(id), id);
    }

    function collapseAll() {
        const ids = [...openCards];
        openCards.clear();
        openDetails.clear();
        ids.forEach(id => paint(cardEl(id), id));
        refreshCollapseButtons();
    }

    // ---------- building the card ----------

    // Mobile-only full-screen viewer. It is strictly read-only and does not touch saved data.
    async function openSizeFocus(item, info, colorIndex = null) {
        if (!window.matchMedia('(max-width: 768px)').matches) return;

        closeSizeFocus();
        let selectedColor = null;
        if (info.mode === 'different') selectedColor = info.tables[Number(colorIndex)];
        const colorsTitle = info.mode === 'same' ? info.colorNames.join(' · ') : (selectedColor ? selectedColor.name : '');
        const sizes = info.mode === 'same' ? info.sizes : (selectedColor ? selectedColor.sizes : []);
        const overlay = document.createElement('section');
        overlay.className = 'ic-size-focus';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Size focus view');
        overlay.innerHTML = `
            <header class="ic-size-focus-head">
                <div class="ic-size-focus-title">
                    <span class="ic-size-focus-eyebrow">${info.mode === 'same' ? 'COLOURS' : 'COLOUR'}</span>
                    <div class="ic-size-focus-title-row">
                        <h2>${escapeHtml(colorsTitle || 'N/A')}</h2>
                        ${selectedColor ? `<span class="ic-size-focus-total">${AlishanCalc.fmtDozens(selectedColor.totalDozens)} Dozen</span>` : ''}
                    </div>
                </div>
                <button type="button" class="ic-size-focus-close" aria-label="Close size view"><i class="fas fa-times"></i><span>Close</span></button>
            </header>
            <main class="ic-size-focus-main">
                ${sizes.length ? `<div class="ic-size-focus-grid">${sizes.map(s => `
                    <div class="ic-size-focus-cell">
                        <div class="ic-size-focus-size">${escapeHtml(s.size)}</div>
                        <div class="ic-size-focus-value">${escapeHtml(s.displayValue || s.value)}</div>
                    </div>`).join('')}</div>` : '<p class="ic-size-focus-empty">No sizes filled in</p>'}
            </main>`;
        document.body.appendChild(overlay);
        document.body.classList.add('ic-size-focus-active');
        overlay.querySelector('.ic-size-focus-close').addEventListener('click', closeSizeFocus);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeSizeFocus(); });
        document.addEventListener('keydown', sizeFocusKeydown);
        try {
            if (overlay.requestFullscreen) await overlay.requestFullscreen();
        } catch (_) { /* Full-screen is best effort; fixed overlay still fills the viewport. */ }
        overlay.querySelector('.ic-size-focus-close')?.focus({ preventScroll: true });
    }

    function sizeFocusKeydown(e) {
        if (e.key === 'Escape') closeSizeFocus();
    }

    function closeSizeFocus() {
        const overlay = document.querySelector('.ic-size-focus');
        if (!overlay) return;
        document.removeEventListener('keydown', sizeFocusKeydown);
        document.body.classList.remove('ic-size-focus-active');
        overlay.remove();
        try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (_) {}
    }

    function sizeChartHTML(info) {
        if (info.mode === 'same') {
            return `
                <button type="button" class="ic-size-focus-trigger" data-ic-focus="same" aria-label="Open full-screen size view" title="Open large size view"><i class="fas fa-eye"></i><span>Large view</span></button>
                <div class="size-chart-simple">
                    ${info.sizes.map(s => `
                        <div class="size-item-simple">
                            <div class="size-label">Size ${s.size}</div>
                            <div class="size-value">${escapeHtml(s.displayValue || s.value)}</div>
                        </div>`).join('')}
                </div>`;
        }
        if (info.mode === 'different') {
            // every colour: its coloured header + ONLY the sizes that were filled in
            // (the same look as the same-colour card)
            return `
                <div class="color-size-tables">
                    ${info.tables.map(t => `
                        <div class="color-size-table">
                            <div class="color-header color-${t.name.toLowerCase()}">
                                <i class="fas fa-circle" style="color: inherit;"></i>
                                <span class="ic-color-header-label">${escapeHtml(t.name)} - TOTAL: ${AlishanCalc.fmtDozens(t.totalDozens)} DOZENS</span>
                                <button type="button" class="ic-size-focus-trigger" data-ic-focus="color" data-color-index="${info.tables.indexOf(t)}" aria-label="Open ${escapeHtml(t.name)} size view" title="Open this colour in large view"><i class="fas fa-eye"></i><span>Large view</span></button>
                            </div>
                            <div class="size-chart-simple">
                                ${t.sizes.map(s => `
                                    <div class="size-item-simple">
                                        <div class="size-label">Size ${s.size}</div>
                                        <div class="size-value">${escapeHtml(s.displayValue || s.value)}</div>
                                    </div>`).join('') || '<div class="ic-none">No sizes filled in</div>'}
                            </div>
                        </div>`).join('')}
                </div>`;
        }
        return '';
    }

    function calculationHTML(item, info) {
        const money = AlishanCalc.fmtMoney;
        const steps = `
            <div class="calculation-steps">
                <div class="calculation-step">
                    <span class="step-label">TOTAL DOZENS:</span>
                    <span class="step-value">${info.mode === 'same' ? info.summary : AlishanCalc.fmtDozens(info.totalDozens)}</span>
                </div>
                <div class="calculation-step">
                    <span class="step-label">PRICE PER DOZEN:</span>
                    <span class="step-value">${money(item.price || 0)}</span>
                </div>
                <div class="calculation-step total-amount-step">
                    <span class="step-label">TOTAL AMOUNT:</span>
                    <span class="step-value">${money(info.amount)}</span>
                </div>
            </div>`;

        const colorTags = info.colorNames.map(name =>
            `<span class="color-tag color-${name.toLowerCase()}">${escapeHtml(name)}</span>`).join('');
        const divider = (icon) => `
            <div class="divider"><div class="divider-line"></div><i class="fas ${icon} divider-icon"></i><div class="divider-line"></div></div>`;

        if (info.mode === 'same') {
            return `
                <div class="calculation-flow">
                    <div class="flow-box">
                        <h4><i class="fas fa-ruler"></i> SIZE QUANTITIES (DOZENS)</h4>
                        ${sizeChartHTML(info)}
                    </div>
                    ${divider('fa-times')}
                    <div class="flow-box">
                        <h4><i class="fas fa-palette"></i> COLORS</h4>
                        <div class="color-tags">${colorTags || 'No colors specified'}</div>
                        <div class="calculation-step">
                            <span class="step-label">NUMBER OF COLORS:</span>
                            <span class="step-value">${info.colorNames.length}</span>
                        </div>
                    </div>
                    ${divider('fa-equals')}
                    <div class="flow-box">
                        <h4><i class="fas fa-calculator"></i> TOTAL CALCULATION</h4>
                        ${steps}
                    </div>
                </div>`;
        }
        if (info.mode === 'different') {
            return `
                <div class="calculation-flow">
                    <div class="flow-box">
                        <h4><i class="fas fa-palette"></i> COLORS</h4>
                        <div class="color-tags">${colorTags}</div>
                    </div>
                    <div class="flow-box">
                        <h4><i class="fas fa-ruler"></i> SIZE QUANTITIES BY COLOR (DOZENS)</h4>
                        ${sizeChartHTML(info)}
                    </div>
                    ${divider('fa-equals')}
                    <div class="flow-box">
                        <h4><i class="fas fa-calculator"></i> TOTAL CALCULATION</h4>
                        ${steps}
                    </div>
                </div>`;
        }
        return `
            <div class="calculation-flow">
                <div class="flow-box"><h4><i class="fas fa-palette"></i> COLORS</h4><p>No colors specified for this item.</p></div>
            </div>`;
    }

    function create(item) {
        const card = document.createElement('div');
        card.className = 'inventory-card ic-card';
        if (!item) return card;

        const id = String(item.id);
        card.dataset.id = id;

        const type = String(item.productType || '').toUpperCase();
        card.classList.add(`ic-type-${type.toLowerCase() || 'other'}`);

        // The card does no maths: quantities, totals and the calculation text come from AlishanCalc.
        const info = AlishanCalc.describeItem(item);

        // aging level (out-of-stock items have none, so no aging badge)
        const level = AlishanCalc.agingLevel(item);
        const days = AlishanCalc.daysInStock(item);
        let badges = `<span class="card-badge ic-badge-type">${escapeHtml(item.productType || 'N/A')}</span>`;
        if (item.cupSize && item.cupSize !== 'N/A') badges += `<span class="card-badge ic-badge-cup">${escapeHtml(item.cupSize)} CUP</span>`;
        if (item.importBatch) badges += `<span class="card-badge ic-badge-import" title="Added by Bulk Import (${escapeHtml(item.importBatch)})${item.source ? ' — ' + escapeHtml(item.source) : ''}">IMPORTED</span>`;
        if (item.isManualEntry) badges += '<span class="card-badge badge-manual" title="Manually dated entry">OLD ENTRY</span>';
        if (level) {
            const L = AlishanCalc.AGING_LEVELS[level];
            badges += `<span class="card-badge badge-aging badge-aging-${level}" title="${AlishanCalc.agingTitle(level)} - ${days} day(s) in stock">${L.badge} · ${days}d</span>`;
            card.classList.add(`aging-${level}`);
        }

        const inStock = item.inStock !== false;
        const colorChips = info.colorNames.map(name =>
            `<span class="color-tag color-${name.toLowerCase()}">${escapeHtml(name)}</span>`).join('');

        const modified = item.lastModified ? `
            <div class="detail-item">
                <span class="detail-label">LAST UPDATED:</span>
                <span class="detail-value">${AlishanCalc.fmtDateTime(item.lastModified)}</span>
            </div>` : '';

        card.innerHTML = `
        <div class="ic-head" data-ic-toggle role="button" tabindex="0" aria-expanded="false" title="Click to open / close">
            <div class="ic-type-icon"><i class="fas ${TYPE_ICONS[type] || 'fa-tag'}"></i></div>
            <div class="ic-title">
                <h3 class="ic-name">${escapeHtml(item.quality || 'N/A')}<span class="ic-name-date">${AlishanCalc.fmtDateLong(item.dateTime)}</span></h3>
                <div class="ic-chips">
                    <span class="ic-chip">Lot: ${escapeHtml(item.lotNumber || 'N/A')}</span>
                    <span class="ic-chip ic-chip-code">Code: ${escapeHtml(item.code || 'N/A')}</span>
                    <span class="ic-chip"><i class="fas fa-calendar-alt"></i> ${AlishanCalc.fmtDateLong(item.dateTime)}</span>
                </div>
            </div>
            <div class="ic-badges">${badges}</div>
            <span class="ic-chevron" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>
        </div>

        <div class="ic-summary">
            <div class="ic-numbers">
                <div class="ic-stat"><span class="ic-stat-label">Total</span><strong>${AlishanCalc.fmtDozens(info.totalDozens)} dozens</strong></div>
                <div class="ic-stat ic-stat-amount"><span class="ic-stat-label">Amount</span><strong>${AlishanCalc.fmtMoney(info.amount)}</strong></div>
                <div class="ic-stat"><span class="ic-stat-label">Status</span><strong class="ic-status ${inStock ? 'ic-in' : 'ic-out'}">${inStock ? 'In stock' : 'Out of stock'}</strong></div>
            </div>
            <div class="ic-colors">${colorChips}</div>
            <div class="card-actions ic-actions">
                <button class="action-btn btn-edit" onclick="ItemModal.open('${item.id}')">
                    <i class="fas fa-edit"></i><span>Edit</span>
                </button>
                <button class="action-btn btn-delete" onclick="ItemModal.deleteItem('${item.id}')">
                    <i class="fas fa-trash"></i><span>Delete</span>
                </button>
                <button class="action-btn btn-stock ${inStock ? '' : 'stock-out'}" onclick="ItemModal.toggleStock('${item.id}')" title="Click to mark ${inStock ? 'Out of Stock (leaves Aging)' : 'In Stock (back in Aging)'}">
                    <i class="fas ${inStock ? 'fa-check' : 'fa-times'}"></i><span>${inStock ? 'Complete' : 'Pending'}</span>
                </button>
            </div>
        </div>

        <button type="button" class="ic-expand-bar" data-ic-toggle aria-expanded="false">
            <i class="fas fa-chevron-down"></i> <span class="ic-expand-label">Show details</span>
        </button>

        <div class="ic-body card-content"></div>

        <div class="card-footer ic-footer">
            <div class="card-actions">
                <button class="action-btn btn-edit" onclick="ItemModal.open('${item.id}')">
                    <i class="fas fa-edit"></i><span>Edit</span>
                </button>
                <button class="action-btn btn-delete" onclick="ItemModal.deleteItem('${item.id}')">
                    <i class="fas fa-trash"></i><span>Delete</span>
                </button>
                <button class="action-btn btn-stock ${inStock ? '' : 'stock-out'}" onclick="ItemModal.toggleStock('${item.id}')" title="Click to mark ${inStock ? 'Out of Stock (leaves Aging)' : 'In Stock (back in Aging)'}">
                    <i class="fas ${inStock ? 'fa-check' : 'fa-times'}"></i><span>${inStock ? 'Complete' : 'Pending'}</span>
                </button>
                <div class="action-btn total-price">
                    <span class="total-amount">${AlishanCalc.fmtMoney(info.amount)}</span>
                    <span class="total-label">Total Amount</span>
                </div>
            </div>
        </div>`;

        // The inside of the card (sizes, calculation, details) is built only when the card is
        // first opened: 50 collapsed cards cost far less than 50 fully built ones.
        let built = false;
        card._icBuild = () => {
            if (built) return;
            built = true;
            card.querySelector('.ic-body').innerHTML = `
            ${calculationHTML(item, info)}

            <button type="button" class="ic-details-btn" data-ic-details aria-expanded="false">
                <i class="fas fa-info-circle"></i> Product details &amp; additional info
                <i class="fas fa-chevron-down ic-details-chevron"></i>
            </button>
            <div class="details-container ic-details">
                <div class="detail-box">
                    <h4><i class="fas fa-info-circle"></i> PRODUCT DETAILS</h4>
                    <div class="detail-item"><span class="detail-label">MATERIAL:</span><span class="detail-value">${item.material || 0} M</span></div>
                    <div class="detail-item"><span class="detail-label">CUP SIZE:</span><span class="detail-value">${escapeHtml(item.cupSize || 'N/A')}</span></div>
                    <div class="detail-item"><span class="detail-label">WEIGHT:</span><span class="detail-value">${item.weight || 0} KG</span></div>
                    <div class="detail-item"><span class="detail-label">STATUS:</span><span class="detail-value">${inStock ? 'IN STOCK' : 'OUT OF STOCK'}</span></div>
                </div>
                <div class="detail-box">
                    <h4><i class="fas fa-sticky-note"></i> ADDITIONAL INFO</h4>
                    <div class="detail-item"><span class="detail-label">LOT NUMBER:</span><span class="detail-value">${escapeHtml(item.lotNumber || 'N/A')}</span></div>
                    <div class="detail-item"><span class="detail-label">ENTRY DATE:</span><span class="detail-value"><i class="fas fa-calendar"></i> ${AlishanCalc.fmtDateLong(item.addedDateTime || item.dateTime)}</span></div>
                    <div class="detail-item"><span class="detail-label">NOTES:</span><span class="detail-value">${escapeHtml(item.notes || 'N/A')}</span></div>
                    ${modified}
                </div>
            </div>`;
        };

        // clicks: header / bar open and close the card; the Details button opens both detail boxes together
        card.addEventListener('click', (e) => {
            if (e.target.closest('.ic-actions')) return;                       // Edit / Delete / Stock keep their own job
            const focusButton = e.target.closest('[data-ic-focus]');
            if (focusButton) {
                e.preventDefault();
                e.stopPropagation();
                if (focusButton.dataset.icFocus === 'same') openSizeFocus(item, info);
                else openSizeFocus(item, info, focusButton.dataset.colorIndex);
                return;
            }
            if (e.target.closest('[data-ic-details]')) { toggleDetails(id); return; }
            if (e.target.closest('[data-ic-toggle]')) toggle(id);
        });
        card.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ic-head')) { e.preventDefault(); toggle(id); }
        });

        paint(card, id);                       // a card that was open before the redraw stays open
        queueMicrotask(refreshCollapseButtons);
        return card;
    }

    return { create, toggle, toggleDetails, collapseAll, openCount: () => openCards.size };
})();

window.ItemCard = ItemCard;
