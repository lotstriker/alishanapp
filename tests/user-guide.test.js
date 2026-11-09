const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('User Guide app version and guide version are synchronized for v90', () => {
  const html = read('frontend/setting.html');
  assert.match(html, /App version: v90 · User Guide version: v90/);
  assert.match(html, /Last verified: 09 Nov 2026/);
});

test('User Guide retains all 29 existing topics and adds the PDF reference library as topic 30', () => {
  const html = read('frontend/setting.html');
  const topics = html.match(/class="guide-topic(?: guide-topic-featured)?"/g) || [];
  assert.equal(topics.length, 30);
  for (const n of [22, 23, 24, 25, 26, 27, 28, 29]) {
    assert.match(html, new RegExp(`<strong(?: id="[^"]+")?>${n}\\.`));
  }
});

test('Visual learning paths, workflow diagrams, examples and report comparison are present', () => {
  const html = read('frontend/setting.html');
  assert.match(html, /guide-learning-map/);
  assert.match(html, /guide-flow-step/);
  assert.match(html, /guide-example/);
  assert.match(html, /guide-report-grid/);
  assert.match(html, /actual app screenshots nahi/);
});

test('Expand/collapse-all controls and search status are wired', () => {
  const html = read('frontend/setting.html');
  const js = read('frontend/user-guide.js');
  assert.match(html, /id="guideExpandAll"/);
  assert.match(html, /id="guideCollapseAll"/);
  assert.match(js, /guideExpandAll/);
  assert.match(js, /guideCollapseAll/);
  assert.match(js, /topics\.length/);
});

test('Release policy is documented as mandatory and append-only', () => {
  const doc = read('PROJECT_SOURCE_OF_TRUTH.md');
  assert.match(doc, /User Guide & Documentation Standards/);
  assert.match(doc, /must match the latest released app version/);
  assert.match(doc, /append-only/);
  assert.match(doc, /ALISHAN-CHG-2026-11-09-007/);
});

test('Service worker v20 precaches the guide page assets', () => {
  const sw = read('frontend/sw.js');
  assert.match(sw, /const VERSION = 'v20'/);
  assert.match(sw, /"setting\.html"/);
  assert.match(sw, /"setting\.css"/);
  assert.match(sw, /"user-guide\.js"/);
});


test('Add Entry form follows locked Quality Type -> Quality -> Cup order', () => {
  const html = read('frontend/add-entry.html');
  const type = html.indexOf('>Quality Type</label>');
  const quality = html.indexOf('for="quality">Quality Name</label>');
  const cup = html.indexOf('for="cupSize">Cup Size</label>');
  assert.ok(type >= 0 && quality > type && cup > quality);
  assert.match(html, /id="productType"/);
  assert.match(html, /id="quality"/);
  assert.match(html, /id="cupSize"/);
});

test('PDF reference gallery contains all 32 individual screenshot assets', () => {
  const html = read('frontend/setting.html');
  const sw = read('frontend/sw.js');
  const fs = require('node:fs');
  for (let i = 1; i <= 32; i++) {
    const n = String(i).padStart(2, '0');
    assert.match(html, new RegExp(`guide-images/screen-${n}\\.jpg`));
    assert.ok(fs.existsSync(path.join(root, `frontend/guide-images/screen-${n}.jpg`)));
    assert.match(sw, new RegExp(`guide-images/screen-${n}\\.jpg`));
  }
  assert.match(html, /current live app.*final maana jayega|Current app ke live labels/i);
});

test('Expand and Collapse controls use delegated clicks and visible status feedback', () => {
  const js = read('frontend/user-guide.js');
  assert.match(js, /section\.addEventListener\('click'/);
  assert.match(js, /target\.closest\('#guideExpandAll, #guideCollapseAll'\)/);
  assert.match(js, /All \$\{visible\.length\} visible guide topics expanded/);
  assert.match(js, /All \$\{visible\.length\} visible guide topics collapsed/);
  assert.match(js, /guideInitialized/);
});

test('Version log documents v86 through v90 in append-only order', () => {
  const doc = read('PROJECT_SOURCE_OF_TRUTH.md');
  const versions = [...doc.matchAll(/^\| v(\d+) \|/gm)].map(m => Number(m[1]));
  for (const v of [86, 87, 88, 89, 90]) assert.ok(versions.includes(v));
  assert.ok(versions.indexOf(86) < versions.indexOf(87));
  assert.ok(versions.indexOf(87) < versions.indexOf(88));
  assert.ok(versions.indexOf(88) < versions.indexOf(89));
  assert.ok(versions.indexOf(89) < versions.indexOf(90));
  assert.match(doc, /ALISHAN-CHG-2026-11-09-008/);
});
