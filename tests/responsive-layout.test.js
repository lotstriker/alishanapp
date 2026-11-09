const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '..', 'frontend');
const read = (name) => fs.readFileSync(path.join(frontend, name), 'utf8');

test('responsive enhancements are tablet/desktop-only and hidden by default', () => {
  const css = read('responsive-layout.css');
  assert.match(css, /\.desktop-tablet-only\s*\{\s*display:\s*none;/);
  assert.match(css, /@media\s*\(min-width:\s*769px\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:/);
});

test('all primary pages load the responsive stylesheet after their existing styles', () => {
  for (const page of ['index.html', 'inventory.html', 'reports.html', 'setting.html']) {
    const html = read(page);
    assert.match(html, /responsive-layout\.css/);
    assert.ok(html.indexOf('responsive-layout.css') < html.indexOf('</head>'));
  }
});

test('Inventory overview reuses the existing summary updater IDs', () => {
  const html = read('inventory.html');
  for (const id of ['totalItems', 'totalValue', 'inStockItems', 'agingItems', 'agingLabel']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /class="inventory-overview desktop-tablet-only"/);
  const js = read('inventory.js');
  assert.match(js, /set\('totalItems', summary\.totalItems\)/);
  assert.match(js, /set\('totalValue', AlishanCalc\.fmtMoney\(summary\.totalValue\)\)/);
});

test('Export Data, Import Data and Bulk Import remain Dashboard Quick Actions', () => {
  const html = read('index.html');
  const quickActions = html.match(/<div class="quick-actions">[\s\S]*?<\/div>/)?.[0] || '';
  for (const label of ['Export Data', 'Import Data', 'Bulk Import']) {
    assert.ok(quickActions.includes(label), `${label} missing from Dashboard Quick Actions`);
  }
});

test('service worker caches the responsive stylesheet with a new app-shell version', () => {
  const sw = read('sw.js');
  assert.match(sw, /const VERSION = 'v20'/);
  assert.match(sw, /"responsive-layout\.css"/);
  assert.match(sw, /"user-guide\.js"/);
});


test('tablet and desktop quality cards reuse the phone theme palette instead of product-type gradients', () => {
  const css = read('responsive-layout.css');
  assert.match(css, /QUALITY CARDS — tablet\/desktop use the same restrained palette/);
  assert.match(css, /@media \(min-width: 769px\) \{[\s\S]*?\.inventory-card\.ic-card \.[\s\S]*?background: var\(--bg-hover/);
  assert.match(css, /\.inventory-card\.ic-card\.ic-head|\.inventory-card\.ic-card \.ic-head/);
  assert.match(css, /\.inventory-card\.ic-card\.aging-critical \{ border-left-color: var\(--aging-critical/);
  assert.match(read('sw.js'), /const VERSION = 'v20'/);
});


test('tablet and desktop use a horizontal full-width topbar instead of a left rail', () => {
  const css = read('responsive-layout.css');
  assert.match(css, /v87 — Horizontal topbar \+ consistently roomy 2-column cards/);
  assert.match(css, /\.site-topbar\s*\{[\s\S]*?inset:\s*0 0 auto 0 !important/);
  assert.match(css, /body\s*\{[\s\S]*?padding-left:\s*0 !important;[\s\S]*?padding-top:\s*66px !important/);
});

test('v87 two-column rule is superseded by the latest one-column quality-card rule', () => {
  const css = read('responsive-layout.css');
  assert.match(css, /\.inventory-cards\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.ok(css.lastIndexOf('grid-template-columns: minmax(0, 1fr) !important') > css.lastIndexOf('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'the latest one-column rule must supersede v87 two-column rules');
  assert.match(read('sw.js'), /const VERSION = 'v20'/);
});


test('quality cards use one full-width column and action footer has no separate white panel', () => {
  const css = read('responsive-layout.css');
  assert.match(css, /v88 — One quality card per row \+ seamless action footer/);
  assert.match(css, /\.inventory-cards\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/);
  assert.match(css, /\.inventory-card\.ic-card \.ic-footer\s*\{[\s\S]*?background:\s*transparent !important/);
  assert.match(css, /\.inventory-card\.ic-card \.ic-footer \.card-actions\s*\{[\s\S]*?background:\s*transparent !important[\s\S]*?border-color:\s*transparent !important/);
  assert.match(read('sw.js'), /const VERSION = 'v20'/);
});
