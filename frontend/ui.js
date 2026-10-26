// ui.js — small helpers for the PHONE layout (mobile.css). It only opens and closes things:
// no data, no maths, no saving.
//   * the Filters bottom sheet on the Inventory page
//   * the "+" tab opens the New entry form (index.html#add)
//   * a shorter search hint on small screens
document.addEventListener('DOMContentLoaded', function () {
    var phone = window.matchMedia('(max-width: 768px)');

    // ---- Filters bottom sheet ----
    var sheet = document.querySelector('.inv-tools ~ .filters');
    var scrim = document.querySelector('.sheet-scrim');
    function setSheet(open) {
        if (!sheet) return;
        sheet.classList.toggle('open', open);
        if (scrim) scrim.classList.toggle('open', open);
    }
    document.querySelectorAll('[data-open-filters]').forEach(function (b) {
        b.addEventListener('click', function () { setSheet(true); });
    });
    if (scrim) scrim.addEventListener('click', function () { setSheet(false); });
    if (sheet) {
        // Apply / Clear keep doing their own job (inline onclick); the sheet just closes afterwards
        sheet.querySelectorAll('button').forEach(function (b) {
            if (/apply|clear/i.test(b.textContent)) b.addEventListener('click', function () { setSheet(false); });
        });
    }

    // ---- "+" tab -> the New entry form ----
    if (location.hash === '#add' && typeof window.scrollToForm === 'function') {
        setTimeout(window.scrollToForm, 400);
    }

    // ---- shorter search hint (search.js builds the box a moment after the page loads) ----
    var tries = 0;
    (function shorten() {
        var input = document.getElementById('searchInput');
        if (input) { if (phone.matches) input.placeholder = 'Search quality, lot, code, colour'; return; }
        if (++tries < 30) setTimeout(shorten, 150);
    })();
});
