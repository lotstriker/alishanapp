/* ============================================================
   settings-archive.js — the Archives screen (Settings -> Archives). UI only; the work is done by archive.js.
   ============================================================ */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'success'); };
    const requiresApproval = Boolean(window.AlishanRemote);
    let rows = [];
    let pending = null;      // the entry waiting in the "delete for good" window

    const when = (iso) => {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    function cardHTML({ record, summary: s }) {
        const title = [s.quality, s.productType.toUpperCase(), s.cupSize && `${s.cupSize} CUP`].filter(Boolean).join(' · ');
        const colours = s.colors.map((c) => `<span class="archive-chip">${esc(c)}</span>`).join('');
        return `<article class="archive-card" data-id="${esc(record.id)}">
            <div class="archive-card-main">
                <h3 class="archive-title">${esc(title)}</h3>
                <div class="archive-chips">${colours}</div>
                <p class="archive-meta">Deleted ${esc(when(s.deletedAt))} · Code ${esc(s.code)} · ${esc(AlishanCalc.fmtDozens ? AlishanCalc.fmtDozens(s.dozens) : s.dozens)} dozen · ₹${esc(Math.round(s.amount).toLocaleString('en-IN'))}${s.payments ? ` · ${s.payments} payment${s.payments > 1 ? 's' : ''}` : ''}</p>
            </div>
            <div class="archive-card-actions">
                <button class="btn btn-primary" type="button" ${requiresApproval ? 'disabled' : ''} data-archive-restore="${esc(record.id)}"><i class="fas fa-undo"></i> Restore</button>
                <button class="btn btn-danger" type="button" ${requiresApproval ? 'disabled title="Permanent deletion requires Manager approval."' : ''} data-archive-forever="${esc(record.id)}"><i class="fas fa-trash"></i> Delete for good${requiresApproval ? '<small class="archive-delete-note">Manager approval</small>' : ''}</button>
            </div>
        </article>`;
    }

    function render() {
        const q = ($('archiveSearch').value || '').trim().toLowerCase();
        const shown = rows.filter(({ summary: s }) => !q || [s.quality, s.productType, s.code, ...s.colors].join(' ').toLowerCase().includes(q));
        $('archiveCount').textContent = String(rows.length);
        $('archiveList').innerHTML = shown.length
            ? shown.map(cardHTML).join('')
            : `<p class="archive-empty">${rows.length ? 'Nothing matches your search.' : 'The Archives are empty.'}</p>`;
    }

    async function refresh() {
        try { rows = await AlishanArchive.list(); } catch (e) { console.error(e); rows = []; }
        render();
    }

    async function restore(id) {
        const found = rows.find((x) => String(x.record.id) === String(id));      // the stored id is a number, the button holds text
        if (!found) return;
        const r = await AlishanArchive.restore(found.record.id);
        toast(r.ok ? 'Restored. It is back in Inventory.' : r.error, r.ok ? 'success' : 'error');
        refresh();
    }

    function openForever(id) {
        const found = rows.find((x) => String(x.record.id) === String(id));
        if (!found) return;
        pending = found;
        const s = found.summary;
        $('archiveModalBody').innerHTML = `<p><b>${esc(s.quality)} ${esc(s.productType.toUpperCase())}</b> (Code ${esc(s.code)}) will be removed completely:</p>
            <ul><li>the entry itself</li><li>${s.payments ? `its ${s.payments} payment${s.payments === 1 ? '' : 's'}` : 'its payments (it has none)'}</li><li>its Quality History lines and Recent Activity lines</li><li>its copies in the automatic backups</li></ul>
            <p class="archive-warn">This cannot be undone. A backup file that you downloaded earlier is outside the app and is not changed.</p>`;
        $('archiveConfirmCode').textContent = s.code;
        $('archiveConfirmInput').value = '';
        $('archiveModalOk').disabled = true;
        $('archiveModal').hidden = false;
        $('archiveConfirmInput').focus();
    }

    function closeForever() { $('archiveModal').hidden = true; pending = null; }

    async function confirmForever() {
        if (!pending) return;
        const { record } = pending;
        $('archiveModalOk').disabled = true;
        const r = await AlishanArchive.deleteForever(record.id);
        closeForever();
        toast(r.ok ? 'Deleted for good. Nothing of it is left.' : r.error, r.ok ? 'success' : 'error');
        refresh();
    }

    async function scan() {
        const out = $('archiveScanResult');
        const { plan, total } = await AlishanArchive.scanLeftovers();
        $('archiveCleanBtn').hidden = total === 0;
        out.textContent = total === 0
            ? 'No old traces found. Everything is clean.'
            : `Found ${plan.paymentIds.length} payment${plan.paymentIds.length === 1 ? '' : 's'}, ${plan.historyIds.length} history line${plan.historyIds.length === 1 ? '' : 's'} and ${plan.activityIds.length} activity line${plan.activityIds.length === 1 ? '' : 's'} of entries that were deleted earlier.`;
    }

    async function clean() {
        if (!confirm('Delete these old traces for good?\n\nThey belong to entries that were deleted earlier. This cannot be undone.')) return;
        const r = await AlishanArchive.cleanLeftovers();
        toast(`${r.removed} old trace${r.removed === 1 ? '' : 's'} deleted.`);
        $('archiveCleanBtn').hidden = true;
        $('archiveScanResult').textContent = 'No old traces found. Everything is clean.';
    }

    function wire() {
        $('archiveSearch').addEventListener('input', render);
        $('archiveList').addEventListener('click', (e) => {
            if (requiresApproval) return;
            const r = e.target.closest('[data-archive-restore]');
            const f = e.target.closest('[data-archive-forever]');
            if (r) restore(r.getAttribute('data-archive-restore'));
            if (f) openForever(f.getAttribute('data-archive-forever'));
        });
        $('archiveConfirmInput').addEventListener('input', () => {
            $('archiveModalOk').disabled = !pending || $('archiveConfirmInput').value.trim() !== String(pending.summary.code);
        });
        $('archiveModalOk').addEventListener('click', confirmForever);
        $('archiveModalCancel').addEventListener('click', closeForever);
        $('archiveModal').addEventListener('click', (e) => { if (e.target === $('archiveModal')) closeForever(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('archiveModal').hidden) closeForever(); });
        $('archiveScanBtn').addEventListener('click', scan);
        $('archiveCleanBtn').addEventListener('click', clean);
        document.addEventListener('alishan:settings-section', event => {
            if (event.detail === 'archives') void refresh();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('archives') || typeof AlishanArchive === 'undefined') return;
        if (requiresApproval) {
            const help = $('archiveApprovalHelp');
            help.hidden = true;
            help.closest('.card').classList.add('archive-approval-required');
        }
        wire();
        if ($('archives').classList.contains('active')) void refresh();
        AlishanDB.onChange && AlishanDB.onChange('archive', () => { if ($('archives').classList.contains('active')) void refresh(); });
        if (location.hash === '#archives') { const a = document.querySelector('.nav-link[data-section="archives"]'); if (a) a.click(); }
    });
})();
