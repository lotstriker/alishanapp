const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const doc = read('PROJECT_SOURCE_OF_TRUTH.md');
const ROW = /^\| v(\d+) \| (.+?) \| (\d{4}-\d{2}-\d{2}) \| (.+?) \| (.+) \|$/;
const rows = doc.split('\n').map((l) => l.match(ROW)).filter(Boolean).map((m) => ({
  v: Number(m[1]), zip: m[2], date: m[3], ids: m[4], summary: m[5],
}));

test('Version log has rows and they are consecutive (no missing, reused or reordered version)', () => {
  assert.ok(rows.length > 0, 'Version log has no rows');
  for (let i = 1; i < rows.length; i += 1) {
    assert.equal(rows[i].v, rows[i - 1].v + 1,
      `Version log gap or disorder: v${rows[i - 1].v} is followed by v${rows[i].v}`);
  }
});

test('Every Version log row has ZIP name, date, change ID and summary', () => {
  for (const r of rows) {
    const nameOk = new RegExp(`^\`AlishanApp-v${r.v}-[A-Za-z0-9-]+\\.zip\`$`).test(r.zip)
      || /ZIP filename not preserved/.test(r.zip);
    assert.ok(nameOk, `v${r.v}: ZIP file name must be AlishanApp-v${r.v}-<Short-Description>.zip`);
    assert.ok(/ALISHAN-CHG-\d{4}-\d{2}-\d{2}-\d{3}/.test(r.ids), `v${r.v}: change ID missing`);
    assert.ok(r.summary.trim().length > 20, `v${r.v}: summary missing`);
  }
});

test('Change IDs of recent versions (v85 onward) exist as change records in this file', () => {
  for (const r of rows.filter((x) => x.v >= 85)) {
    for (const id of r.ids.match(/ALISHAN-CHG-\d{4}-\d{2}-\d{2}-\d{3}/g)) {
      assert.ok(doc.includes(`### ${id}`), `v${r.v}: no change record "### ${id}"`);
    }
  }
});

test('Latest Version log row equals the version in README and the User Guide footer', () => {
  const latest = rows[rows.length - 1].v;
  assert.match(read('README.md'), new RegExp(`Current: \\*\\*v${latest}\\*\\*`));
  assert.ok(read('frontend/setting.html').includes(`App version: v${latest} · User Guide version: v${latest}`));
});

test('The compulsory Version log rule is documented', () => {
  assert.match(doc, /The Version log is compulsory/);
  assert.match(read('AI_HANDOVER_PROTOCOL.md'), /The Version log is compulsory/);
});
