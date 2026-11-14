/* ============================================================
   archive.js — Settings -> Archives (v96).

   "Delete" in the app moves an entry (with its payments) into the Archives. From there:
     restore(id)        -> back to the inventory, with its payments
     deleteForever(id)  -> gone for good, WITHOUT a shadow: its payments, its Quality History rows, the Recent Activity
                           lines that name its code and its copy inside the automatic backups are removed too.
                           (A backup file the user downloaded earlier is outside the app and cannot be changed.)
     scanLeftovers() / cleanLeftovers() -> the same kind of traces of entries that were deleted BEFORE Archives existed.
   calc.js decides WHAT (purgePlan / leftoverPlan / purgeBackup), db.js stores, this file runs the steps.
   The archive record itself is removed LAST, so an interrupted delete can simply be repeated.
   ============================================================ */
var AlishanArchive = (() => {
    const C = AlishanCalc;

    async function readAll() {
        const [inventory, archive, history, activity, payments] = await Promise.all(
            ['inventory', 'archive', 'auditLog', 'editHistory', 'payments'].map(s => AlishanDB.getAllFrom(s)));
        return { inventory, archive, history, activity, payments };
    }

    async function list() {
        const rows = await AlishanDB.getArchive();
        return rows.map(r => ({ record: r, summary: C.archiveSummary(r) }));
    }

    async function restore(id) {
        const r = await AlishanDB.restoreArchived(id);
        if (!r.ok) return r;
        const item = r.item;
        try {
            await AlishanDB.logQualityHistory({
                qualityId: item.id, qualityCode: item.code || '', qualityName: item.quality || '', productType: item.productType || '',
                action: 'Quality Restored', statusModel: 2, actor: 'Current user',
                changes: [{ field: 'Status', oldValue: 'In Archives', newValue: 'Restored' }]
            });
            await AlishanDB.logActivity('add', `Restored ${item.quality} ${item.productType} (${item.code})`);
        } catch (e) { /* the log is best-effort */ }
        return r;
    }

    async function purgeBackups(id) {
        let n = 0;
        const backups = (await AlishanDB.getSetting('autoBackups', [])) || [];
        const cleaned = backups.map(b => { const r = C.purgeBackup(b, id); if (r.changed) n += 1; return r.backup; });
        if (n) await AlishanDB.setSetting('autoBackups', cleaned);
        const broken = (await AlishanDB.getSetting('corruptedItemsBackup', [])) || [];
        const keptBroken = broken.filter(x => !(x && x.item && String(x.item.id) === String(id)));
        if (keptBroken.length !== broken.length) { await AlishanDB.setSetting('corruptedItemsBackup', keptBroken); n += 1; }
        return n;
    }

    async function deleteForever(id) {
        const data = await readAll();
        const record = data.archive.find(r => String(r.id) === String(id));
        if (!record) return { ok: false, error: 'This entry is not in the Archives (any more).' };
        const plan = C.purgePlan(record, data);
        await AlishanDB.removeMany('payments', plan.paymentIds);
        await AlishanDB.removeMany('auditLog', plan.historyIds);
        await AlishanDB.removeMany('editHistory', plan.activityIds);
        const backups = await purgeBackups(record.id);
        await AlishanDB.removeMany('archive', [record.id]);           // last
        return { ok: true, removed: { payments: plan.paymentIds.length + (record.payments || []).length, history: plan.historyIds.length, activity: plan.activityIds.length, backups } };
    }

    async function scanLeftovers() {
        const plan = C.leftoverPlan(await readAll());
        return { plan, total: plan.paymentIds.length + plan.historyIds.length + plan.activityIds.length };
    }

    async function cleanLeftovers() {
        const { plan, total } = await scanLeftovers();
        await AlishanDB.removeMany('payments', plan.paymentIds);
        await AlishanDB.removeMany('auditLog', plan.historyIds);
        await AlishanDB.removeMany('editHistory', plan.activityIds);
        return { ok: true, removed: total, plan };
    }

    return { list, restore, deleteForever, scanLeftovers, cleanLeftovers };
})();

if (typeof window !== 'undefined') window.AlishanArchive = AlishanArchive;
