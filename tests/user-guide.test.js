const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('User Guide app version and guide version are synchronized with the latest Version log row', () => {
  const html = read('frontend/setting.html');
  const log = read('PROJECT_SOURCE_OF_TRUTH.md');
  const versions = [...log.matchAll(/^\| v(\d+) \|/gm)].map((m) => Number(m[1]));
  const latest = Math.max(...versions);
  assert.ok(latest >= 93);
  assert.ok(html.includes(`App version: v${latest} · User Guide version: v${latest}`));
  assert.match(html, /Last verified: \d{1,2} [A-Z][a-z]{2} 20\d{2}/);
});

test('User Guide keeps its topics 1 to 29, 2A (Size Groups), 3A (Archives) and 30 (What\'s new)', () => {
  const html = read('frontend/setting.html');
  const topics = html.match(/class="guide-topic(?: guide-topic-featured)?"/g) || [];
  assert.equal(topics.length, 32);
  for (const n of ['2A', '3A', 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    assert.match(html, new RegExp(`<strong(?: id="[^"]+")?>${n}\\.`));
  }
});

test('Visual learning paths, workflow diagrams, examples and report comparison are present', () => {
  const html = read('frontend/setting.html');
  assert.match(html, /guide-learning-map/);
  assert.match(html, /guide-flow-step/);
  assert.match(html, /guide-example/);
  assert.match(html, /guide-report-grid/);
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

test('Service worker precaches the text guide', () => {
  const sw = read('frontend/sw.js');
  assert.match(sw, /const VERSION = 'v2\d'/);        // the cache version is bumped whenever precached files change
  assert.match(sw, /"setting\.html"/);
  assert.match(sw, /"setting\.css"/);
  assert.match(sw, /"user-guide\.js"/);
});


test('Guide and service worker are free of guide image references', () => {
  const guideSection = read('frontend/setting.html').split('id="user-guide"')[1].split('id="general"')[0];
  assert.doesNotMatch(guideSection, /<img\b|assets\/user-guide/i);
  assert.doesNotMatch(read('frontend/sw.js'), /assets\/user-guide/);
  assert.equal(fs.existsSync(path.join(root, 'frontend', 'assets', 'user-guide')), false);
});

// ---- the guide is for the USER (rule 11 / protocol section 18) ----
const guide = () => { const h = read('frontend/setting.html'); const a = h.indexOf('class="guide-header"'); const b = h.indexOf('id="general"'); return h.slice(a, b); };

test('User Guide has a Quick Start and a Size Groups topic written for the user', () => {
  const g = guide();
  assert.match(g, /class="guide-quickstart"/);
  assert.match(g, /id="guide-sizegroups"/);
  assert.match(g, /Sawal:/);
});

test('User Guide has no developer or release-process wording', () => {
  const g = guide();
  for (const bad of [/supplied/i, /mandatory/i, /implemented feature/i, /current build/i, /guide audit/i, /AlishanApp-v\d+/, /ALISHAN-CHG/, /release par/i, /individual screenshots/i]) {
    assert.doesNotMatch(g, bad, `developer wording found: ${bad}`);
  }
});

test('"What\'s new" in the User Guide lists the latest app version (every new feature must be written in the guide)', () => {
  const html = read('frontend/setting.html');
  const log = read('PROJECT_SOURCE_OF_TRUTH.md');
  const latest = Math.max(...[...log.matchAll(/^\| v(\d+) \|/gm)].map((m) => Number(m[1])));
  const a = html.indexOf('id="guide-whatsnew"');
  assert.ok(a > 0, 'topic "Naya kya hai" is missing');
  const block = html.slice(a, html.indexOf('</details>', a));
  assert.match(block, new RegExp(`guide-whatsnew-version">v${latest} `), `"What's new" has no entry for v${latest}`);
});

test('The compulsory User Guide rule is documented', () => {
  assert.match(read('PROJECT_SOURCE_OF_TRUTH.md'), /The User Guide is compulsory/);
  assert.match(read('AI_HANDOVER_PROTOCOL.md'), /The User Guide is compulsory/);
});
