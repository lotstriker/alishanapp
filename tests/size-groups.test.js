const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Calc = require(path.join('..', 'frontend', 'calc.js'));
const { makeCore } = require(path.join('..', 'frontend', 'size-groups.js'));

const core = makeCore(Calc.SIZES, Calc.splitPieces);
const cell = (d, p) => ({ d: d || '', p: p || '' });
const sizes = (obj) => { const s = core.blankSizes(); Object.entries(obj).forEach(([k, v]) => { s[k] = Array.isArray(v) ? cell(v[0], v[1]) : cell(v, ''); }); return s; };
const state = (groups) => { const st = core.newState(); groups.forEach(g => core.addGroup(st, g.colors, sizes(g.sizes || {}))); return st; };

// what calc.js says for the input a form would send (the real maths stays in calc.js)
function totalPieces(input) {
  const q = Calc.buildQuantity(input);
  assert.ok(q.ok, q.error);
  return Calc.itemPieces({ sizeOption: q.sizeOption, colors: q.colors, ...q.sizeFields });
}

test('sizes 48 and 50 are app sizes (12 sizes in order)', () => {
  assert.deepEqual(Calc.SIZES, [28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50]);
});

test('size 48 and 50 quantities are saved, counted and described like every other size', () => {
  const input = { sizeOption: 'same', colors: ['RED', 'BLUE'], sizes: { 48: { dozens: '2', pieces: '3' }, 50: { dozens: '1', pieces: '' } } };
  const q = Calc.buildQuantity(input);
  assert.ok(q.ok);
  assert.equal(q.sizeFields.size48, 2);
  assert.equal(q.sizeFields.size48_pieces, 3);
  assert.equal(q.sizeFields.size50, 1);
  assert.equal(totalPieces(input), (2 * 12 + 3 + 12) * 2);            // (27 + 12 pieces) x 2 colours
  const info = Calc.describeItem({ sizeOption: 'same', colors: ['RED'], size48: 2, size48_pieces: 3, size50: 1 });
  assert.deepEqual(info.sizes.map(s => s.size), [48, 50]);
});

test('one group is saved as "same sizes" (the old shape)', () => {
  const st = state([{ colors: ['RED', 'BLACK'], sizes: { 32: 2, 34: 3 } }]);
  const input = core.toInput(st, ['RED', 'BLACK']);
  assert.equal(input.sizeOption, 'same');
  assert.deepEqual(input.colors, ['RED', 'BLACK']);
  assert.equal(input.sizes[32].dozens, 2);
});

test('splitting one colour keeps the other colours together and saves as "different sizes"', () => {
  const st = state([{ colors: ['RED', 'BLACK', 'BLUE'], sizes: { 32: 2, 34: 3, 36: 1 } }]);
  const moved = core.move(st, 'BLUE', 'new');
  assert.ok(moved.ok);
  assert.equal(st.groups.length, 2);
  assert.deepEqual(st.groups[0].colors, ['RED', 'BLACK']);
  assert.deepEqual(st.groups[1].colors, ['BLUE']);
  assert.equal(st.groups[1].sizes[34].d, 3);                 // the new group starts as a copy
  st.groups[1].sizes[34] = cell(5, '');                      // only Blue changes
  const input = core.toInput(st, ['RED', 'BLACK', 'BLUE']);
  assert.equal(input.sizeOption, 'different');
  assert.deepEqual(input.colorSizes.map(c => c.name), ['RED', 'BLACK', 'BLUE']);
  assert.equal(input.colorSizes[0].sizes[34].dozens, 3);
  assert.equal(input.colorSizes[2].sizes[34].dozens, 5);
  assert.equal(totalPieces(input), (2 + 3 + 1) * 12 * 2 + (2 + 5 + 1) * 12);
});

test('if the split colour gets the same sizes again, the entry is saved as "same" again', () => {
  const st = state([{ colors: ['RED', 'BLACK', 'BLUE'], sizes: { 32: 2, 34: 3 } }]);
  core.move(st, 'BLUE', 'new');
  const input = core.toInput(st, ['RED', 'BLACK', 'BLUE']);          // nothing was changed in Blue
  assert.equal(input.sizeOption, 'same');
  assert.deepEqual(input.colors, ['RED', 'BLACK', 'BLUE']);
});

test('12 pieces and 1 dozen are the same size (groups are compared by meaning)', () => {
  const a = sizes({ 32: [1, 0] });
  const b = sizes({ 32: [0, 12] });
  assert.equal(core.keyOf(a), core.keyOf(b));
});

test('an old "different sizes" entry opens grouped: same sizes together, other sizes alone', () => {
  const mk = (name, s34) => ({ name, sizes: { size32: 2, size34: s34, size34_pieces: 0 } });
  const item = { sizeOption: 'different', colors: [mk('RED', 3), mk('BLACK', 3), mk('BLUE', 5)] };
  const st = core.newState();
  core.loadItem(st, item);
  assert.equal(st.groups.length, 2);
  assert.deepEqual(st.groups[0].colors, ['RED', 'BLACK']);
  assert.deepEqual(st.groups[1].colors, ['BLUE']);
  // an old "different" entry whose colours are all equal opens as ONE group
  const same = core.newState();
  core.loadItem(same, { sizeOption: 'different', colors: [mk('RED', 3), mk('BLACK', 3)] });
  assert.equal(same.groups.length, 1);
});

test('an old "same sizes" entry opens as one group with its sizes', () => {
  const st = core.newState();
  core.loadItem(st, { sizeOption: 'same', colors: ['RED', 'BLACK'], size32: 2, size48: 1, size48_pieces: 6 });
  assert.equal(st.groups.length, 1);
  assert.equal(st.groups[0].sizes[32].d, 2);
  assert.equal(st.groups[0].sizes[48].p, 6);
});

test('colour picker changes: new colours join the main group, removed colours leave, empty groups go', () => {
  const st = state([{ colors: ['RED', 'BLACK'], sizes: { 32: 2 } }, { colors: ['BLUE'], sizes: { 32: 9 } }]);
  core.syncColours(st, ['RED', 'BLACK', 'BLUE', 'GREEN']);
  assert.deepEqual(st.groups[0].colors, ['RED', 'BLACK', 'GREEN']);
  core.syncColours(st, ['RED', 'BLACK', 'GREEN']);                   // BLUE removed: its group disappears
  assert.equal(st.groups.length, 1);
  core.syncColours(st, []);                                          // no colours: one empty group stays (sizes can be typed first)
  assert.equal(st.groups.length, 1);
  assert.deepEqual(st.groups[0].colors, []);
});

test('moving a colour to another group; a group that becomes empty disappears', () => {
  const st = state([{ colors: ['RED', 'BLACK'], sizes: { 32: 2 } }, { colors: ['BLUE'], sizes: { 32: 9 } }]);
  const g1 = st.groups[0].id;
  assert.ok(core.move(st, 'BLUE', g1).ok);
  assert.equal(st.groups.length, 1);
  assert.deepEqual(st.groups[0].colors, ['RED', 'BLACK', 'BLUE']);
  assert.equal(core.move(st, 'RED', 'new').ok, true);
  assert.equal(core.move(st, 'RED', 'new').ok, false);               // already alone in its group
});

test('a colour renamed in the picker keeps its group and its sizes', () => {
  const st = state([{ colors: ['RED', 'BLACK'], sizes: { 32: 2 } }, { colors: ['BLUE'], sizes: { 32: 9 } }]);
  core.rename(st, 'BLUE', 'NAVY');
  assert.deepEqual(st.groups[1].colors, ['NAVY']);
  assert.equal(st.groups[1].sizes[32].d, 9);
});

test('groups with exactly the same sizes are reported (they will be joined on save)', () => {
  const st = state([{ colors: ['A'], sizes: { 32: 2 } }, { colors: ['B'], sizes: { 32: 3 } }, { colors: ['C'], sizes: { 32: 2 } }]);
  assert.deepEqual(core.equalPairs(st.groups), [[1, 3]]);
});

test('before colours are picked the typed sizes are kept in the one empty group', () => {
  const st = state([{ colors: [], sizes: { 32: 4 } }]);
  core.syncColours(st, ['RED']);
  const input = core.toInput(st, ['RED']);
  assert.equal(input.sizeOption, 'same');
  assert.equal(input.sizes[32].dozens, 4);
});

test('the card shows colours with the same sizes together (describeItem.groups)', () => {
  const mk = (name, s34) => ({ name, sizes: { size32: 2, size34: s34 } });
  const item = { sizeOption: 'different', colors: [mk('RED', 3), mk('BLACK', 3), mk('BLUE', 5)] };
  const info = Calc.describeItem(item);
  assert.equal(info.tables.length, 3);
  assert.equal(info.groups.length, 2);
  assert.deepEqual(info.groups[0].names, ['RED', 'BLACK']);
  assert.equal(info.groups[0].eachDozens, 5);
  assert.equal(info.groups[0].totalDozens, 10);
  assert.deepEqual(info.groups[1].names, ['BLUE']);
  assert.equal(info.totalDozens, 17);                                // totals are unchanged by the grouping
});
