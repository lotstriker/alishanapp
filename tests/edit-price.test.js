const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Calc = require(path.join('..', 'frontend', 'calc.js'));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'frontend', p), 'utf8');

const PRICES = { 'SUZEN-MOLD': 16, 'AMIRI-MOLD': 37 };
const ctx = { items: [], priceOf: (n) => PRICES[n] || 0, colorLabel: (n) => n };
const sizes = () => { const m = {}; Calc.SIZES.forEach((s) => { m[s] = { dozens: '', pieces: '' }; }); m[32] = { dozens: '2', pieces: '' }; return m; };
const input = (quality, extra = {}) => {
  const t = new Date(Date.now() - 5 * 60 * 1000);
  return { productType: 'bra', cupSize: 'B', quality, material: '', weight: '', notes: '', entry: { date: Calc.localDate(t), time: Calc.localTime(t) }, sizeOption: 'same', colors: ['MOKA'], sizes: sizes(), ...extra };
};
const created = (quality, extra) => { const r = Calc.buildNewItem(input(quality, extra), ctx); assert.ok(r.ok, r.error); return r.item; };

test('Edit: a price typed in the Edit window wins and the amount follows it', () => {
  const current = created('SUZEN-MOLD');
  assert.equal(current.price, 16);
  const r = Calc.buildUpdatedItem(current, input('SUZEN-MOLD', { price: '20' }), ctx);
  assert.ok(r.ok, r.error);
  assert.equal(r.item.price, 20);
  assert.equal(r.item.totalAmount, 2 * 20);               // 2 dozen x 20
});

test('Edit: an empty price keeps the saved price; a changed quality takes the quality price', () => {
  const current = created('SUZEN-MOLD', { price: 18 });    // price from paper, not from qualities.json
  assert.equal(current.price, 18);
  assert.equal(Calc.buildUpdatedItem(current, input('SUZEN-MOLD', { price: '' }), ctx).item.price, 18);
  assert.equal(Calc.buildUpdatedItem(current, input('SUZEN-MOLD'), ctx).item.price, 18);
  assert.equal(Calc.buildUpdatedItem(current, input('AMIRI-MOLD', { price: '' }), ctx).item.price, 37);
});

test('Edit: a price that is not a number above 0 is refused with a clear message', () => {
  const current = created('SUZEN-MOLD');
  for (const bad of ['0', '-3', 'abc']) {
    const r = Calc.buildUpdatedItem(current, input('SUZEN-MOLD', { price: bad }), ctx);
    assert.equal(r.ok, false);
    assert.match(r.error, /price must be a number above 0/);
  }
});

test('Edit: an entry whose quality is not in qualities.json can still be edited (price kept or typed)', () => {
  const current = created('OLD-RENAMED-QUALITY', { price: 24 });     // typed from the paper
  assert.equal(current.price, 24);
  const keep = Calc.buildUpdatedItem(current, input('OLD-RENAMED-QUALITY', { price: '' }), ctx);
  assert.ok(keep.ok, keep.error);
  assert.equal(keep.item.price, 24);
  const typed = Calc.buildUpdatedItem(current, input('OLD-RENAMED-QUALITY', { price: '30' }), ctx);
  assert.equal(typed.item.price, 30);
});

test('Edit window: price box, hint, "use app price", and the old-quality fallback are in the code', () => {
  const modal = read('item-modal.js');
  assert.match(modal, /id="editPrice"/);
  assert.match(modal, /id="editPriceHint"/);
  assert.match(modal, /id="editPriceUseApp"/);
  assert.match(modal, /price: document\.getElementById\('editPrice'\)\.value/);
  assert.match(modal, /alishan:quality-selected/);
  const form = read('item-form.js');
  assert.match(form, /document\.createElement\('option'\)/);          // the saved quality becomes a choice of the hidden select
  assert.match(form, /alishan:quality-selected/);
  assert.match(read('store.js'), /'Price \/ Dozen \(₹\)'/);            // a price change is written to the Quality History
});

test('Card: colours that share one size table are own-colour cards; one-colour tables keep the old header', () => {
  const card = read('item-card.js');
  assert.match(card, /const many = g\.names\.length > 1;/);
  assert.match(card, /color-group-header/);
  assert.match(card, /color-tag cg-card color-\$\{String\(n\)\.toLowerCase\(\)\}/);
  assert.match(card, /<div class="color-header color-\$\{String\(g\.names\[0\]\)\.toLowerCase\(\)\}">/);
  assert.match(read('item-card.css'), /\.color-group-header/);
});
