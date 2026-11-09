'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/common-pagination.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/common-pagination.css'), 'utf8');

function createHost() {
  const attrs = new Map();
  return {
    classList: { values: [], add(value) { this.values.push(value); } },
    style: {},
    innerHTML: '',
    onclick: null,
    onchange: null,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    hasAttribute(name) { return attrs.has(name); },
    getAttribute(name) { return attrs.get(name); }
  };
}

function loadPagination() {
  const window = {};
  vm.runInNewContext(source, { window });
  return window.CommonPagination;
}

 test('exposes the supported page sizes without leaking its internal array', () => {
  const pagination = loadPagination();
  assert.deepEqual(Array.from(pagination.PAGE_SIZES), [10, 20, 50, 100]);
  pagination.PAGE_SIZES.push(500);
  assert.deepEqual(Array.from(pagination.PAGE_SIZES), [10, 20, 50, 100, 500]);
  assert.deepEqual(Array.from(loadPagination().PAGE_SIZES), [10, 20, 50, 100]);
});

test('renders accessible controls and clamps invalid page state', () => {
  const pagination = loadPagination();
  const host = createHost();
  pagination.render(host, { page: 99, pageSize: 10, total: 21 });
  assert.equal(host.style.display, 'flex');
  assert.equal(host.getAttribute('role'), 'navigation');
  assert.match(host.innerHTML, /Page 3 of 3/);
  assert.match(host.innerHTML, /aria-label="Previous page"/);
  assert.match(host.innerHTML, /aria-label="Next page"/);
  assert.match(host.innerHTML, /aria-live="polite"/);
  assert.match(host.innerHTML, /value="10" selected/);
  assert.match(host.innerHTML, /data-page-action="next"[^>]*disabled/);
});

test('previous and next callbacks are bounded and ignore disabled/no-op clicks', () => {
  const pagination = loadPagination();
  const host = createHost();
  const changes = [];
  pagination.render(host, { page: 2, pageSize: 10, total: 25, onPageChange: (page) => changes.push(page) });
  const click = (action, disabled = false) => host.onclick({
    target: { closest: () => ({ dataset: { pageAction: action }, disabled }) }
  });
  click('prev');
  click('next');
  click('prev', true);
  assert.deepEqual(changes, [1, 3]);
  pagination.render(host, { page: 3, pageSize: 10, total: 25, onPageChange: (page) => changes.push(page) });
  click('next');
  assert.deepEqual(changes, [1, 3]);
});

test('page-size changes accept only supported values', () => {
  const pagination = loadPagination();
  const host = createHost();
  const changes = [];
  pagination.render(host, { page: 1, pageSize: 20, total: 80, onPageSizeChange: (size) => changes.push(size) });
  host.onchange({ target: { matches: (selector) => selector === '.page-select', value: '100' } });
  host.onchange({ target: { matches: () => true, value: '25' } });
  assert.deepEqual(changes, [100]);
});

test('hides pagination when the current list fits on one page', () => {
  const pagination = loadPagination();
  const host = createHost();
  pagination.render(host, { page: 1, pageSize: 50, total: 50 });
  assert.equal(host.style.display, 'none');
});

test('responsive CSS never clips or requires horizontal scrolling and switches to icon-only controls on narrow phones', () => {
  assert.doesNotMatch(css, /overflow-x\s*:\s*(hidden|auto|scroll)/i);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /\.pagination-label\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /width:\s*38px\s*!important/);
});
