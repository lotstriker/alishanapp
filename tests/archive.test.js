const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require(path.join('..', 'frontend', 'calc.js'));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'frontend', p), 'utf8');

const item = (id, code, extra = {}) => ({ id, code, quality: 'AMIRI-MOLD', productType: 'bra', cupSize: 'B', colors: ['MOKA', 'RED'], sizeOption: 'same', size32: 2, price: 37, totalAmount: 888, ...extra });
const data = (over = {}) => ({ inventory: [], archive: [], history: [], activity: [], payments: [], ...over });

test('an archive record keeps a copy of the entry and its payments (nothing shares memory with the live entry)', () => {
  const it = item(1, '111111');
  const rec = C.makeArchiveRecord(it, [{ id: 'p1', inventoryId: 1, amount: 5 }], new Date('2026-11-13T10:00:00Z'));
  assert.equal(rec.id, 1);
  assert.equal(rec.code, '111111');
  assert.equal(rec.deletedAt, '2026-11-13T10:00:00.000Z');
  it.quality = 'CHANGED';
  assert.equal(rec.item.quality, 'AMIRI-MOLD');
  assert.equal(rec.payments.length, 1);
});

test('delete for good: every trace of the entry is planned for removal, nothing of other entries', () => {
  const rec = C.makeArchiveRecord(item(1, '111111'), [{ id: 'p1', inventoryId: 1 }]);
  const plan = C.purgePlan(rec, data({
    archive: [rec],
    inventory: [item(2, '222222')],
    history: [{ id: 'h1', qualityId: 1, qualityCode: '111111' }, { id: 'h2', qualityId: 2, qualityCode: '222222' }, { id: 'h3', qualityId: 999, qualityCode: '111111' }],
    activity: [{ id: 'a1', text: 'Added AMIRI-MOLD BRA (111111)' }, { id: 'a2', text: 'AMIRI-MOLD BRA (111111) marked Out of Stock' }, { id: 'a3', text: 'Added SUZEN-MOLD BRA (222222)' }, { id: 'a4', text: 'Imported 3 old entries (batch-1)' }],
    payments: [{ id: 'p1', inventoryId: 1 }, { id: 'p2', inventoryId: 2 }]
  }));
  assert.deepEqual(plan.historyIds.sort(), ['h1', 'h3']);
  assert.deepEqual(plan.activityIds.sort(), ['a1', 'a2']);
  assert.deepEqual(plan.paymentIds, ['p1']);
});

test('if another entry has the same code, lines are matched by id only (no wrong entry is touched)', () => {
  const rec = C.makeArchiveRecord(item(1, '111111'), []);
  const plan = C.purgePlan(rec, data({
    archive: [rec], inventory: [item(2, '111111')],
    history: [{ id: 'h1', qualityId: 1, qualityCode: '111111' }, { id: 'h2', qualityId: 2, qualityCode: '111111' }],
    activity: [{ id: 'a1', text: 'Added X BRA (111111)' }]
  }));
  assert.deepEqual(plan.historyIds, ['h1']);
  assert.deepEqual(plan.activityIds, []);
});

test('a backup copy loses the entry and its payments; a backup without it is returned unchanged', () => {
  const backup = { metadata: { totalItems: 2, totalPayments: 2, type: 'AUTO_BACKUP' }, inventory: [item(1, '1'), item(2, '2')], payments: [{ id: 'p1', inventoryId: 1 }, { id: 'p2', inventoryId: 2 }] };
  const r = C.purgeBackup(backup, 1);
  assert.equal(r.changed, true);
  assert.deepEqual(r.backup.inventory.map((i) => i.id), [2]);
  assert.deepEqual(r.backup.payments.map((p) => p.id), ['p2']);
  assert.equal(r.backup.metadata.totalItems, 1);
  assert.equal(r.backup.metadata.totalPayments, 1);
  assert.equal(backup.inventory.length, 2, 'the original is not changed');
  const same = C.purgeBackup(r.backup, 1);
  assert.equal(same.changed, false);
  assert.equal(same.backup, r.backup);
  assert.equal(C.purgeBackup(null, 1).changed, false);
});

test('old traces: only what belongs to NO live and NO archived entry is found', () => {
  const live = item(2, '222222');
  const arch = C.makeArchiveRecord(item(3, '333333'), []);
  const plan = C.leftoverPlan(data({
    inventory: [live], archive: [arch],
    payments: [{ id: 'p-live', inventoryId: 2 }, { id: 'p-orphan', inventoryId: 77 }],
    history: [{ id: 'h-live', qualityId: 2, qualityCode: '222222' }, { id: 'h-arch', qualityId: 3, qualityCode: '333333' }, { id: 'h-old', qualityId: 77, qualityCode: '777777' }],
    activity: [{ id: 'a-live', text: 'Added A BRA (222222)' }, { id: 'a-arch', text: 'Moved B BRA (333333) to Archives' }, { id: 'a-old', text: 'Deleted C BRA (777777)' }, { id: 'a-none', text: 'Imported 3 old entries (batch-9)' }]
  }));
  assert.deepEqual(plan.paymentIds, ['p-orphan']);
  assert.deepEqual(plan.historyIds, ['h-old']);
  assert.deepEqual(plan.activityIds, ['a-old']);
});

test('the Archives list shows quality, colours, dozens, payments and the deleted time', () => {
  const rec = C.makeArchiveRecord(item(1, '111111'), [{ id: 'p1', inventoryId: 1 }], new Date('2026-11-13T10:00:00Z'));
  const s = C.archiveSummary(rec);
  assert.equal(s.quality, 'AMIRI-MOLD');
  assert.equal(s.cupSize, 'B');
  assert.deepEqual(s.colors, ['MOKA', 'RED']);
  assert.equal(s.payments, 1);
  assert.equal(s.deletedAt, '2026-11-13T10:00:00.000Z');
  assert.equal(s.dozens, C.itemDozens(rec.item));
});

test('Archives are wired: storage v2, delete = archive, settings screen, delete-for-good removes the archive record last', () => {
  const db = read('db.js');
  assert.match(db, /DB_VERSION = 2/);
  assert.match(db, /'auditLog', 'archive'/);
  assert.match(db, /archiveInventoryItem\(record\)/);
  assert.match(db, /restoreArchived\(id\)/);
  const store = read('store.js');
  assert.match(store, /AlishanDB\.archiveInventoryItem\(record\)/);
  assert.doesNotMatch(store, /AlishanDB\.deleteInventoryItem\(removed\.id\)/, 'Delete must not remove the entry for good any more');
  const html = read('setting.html');
  assert.match(html, /data-section="archives"/);
  assert.match(html, /id="archives"/);
  assert.match(html, /src="archive\.js"/);
  assert.match(html, /src="settings-archive\.js"/);
  const arc = read('archive.js');
  assert.ok(arc.indexOf("removeMany('payments'") < arc.indexOf("removeMany('archive'"), 'the archive record must be removed LAST');
  assert.ok(arc.indexOf("removeMany('auditLog'") < arc.indexOf("removeMany('archive'"));
  assert.ok(arc.indexOf('purgeBackups(record.id)') < arc.indexOf("removeMany('archive'"));
  const ui = read('settings-archive.js');
  assert.match(ui, /disabled = !pending \|\| \$\('archiveConfirmInput'\)\.value\.trim\(\) !== String\(pending\.summary\.code\)/);   // the code must be typed
  const sw = read('sw.js');
  assert.ok(sw.includes('"archive.js"') && sw.includes('"settings-archive.js"'));
});

test('new activity lines of stock / completion changes carry the entry code (so they can be removed with the entry)', () => {
  const store = read('store.js');
  assert.match(store, /\(\$\{item\.code\}\) marked/);
  assert.match(store, /\(\$\{item\.code\}\) completion date set/);
});
