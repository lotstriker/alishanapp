/* ============================================================
   size-groups.js — the ONE size editor of the app (v92).

   Used by New Entry (prefix '') and by the Edit window (prefix 'edit').

   An entry has COLOURS, and the colours are put in GROUPS. Every group has ONE size grid:
       Group 1: RED, BLACK      32: 2   34: 3   36: 1
       Group 2: BLUE            32: 2   34: 5   36: 1
   - At the start every picked colour is in the one main group (= the old "same sizes").
   - ⇄ on a colour: "New group" splits only that colour out (its sizes are copied, then you change them),
     or moves it to another group.  Colours with the same sizes can sit together again.
   - Nothing here does maths. When the form is read the groups are turned into the two shapes
     calc.js / store.js already know:
        one group      -> sizeOption 'same'      { colors, sizes }
        several groups -> sizeOption 'different' { colorSizes: [{ name, sizes }] }
     so totals, reports, export, backup and history are not touched.
   - Groups whose sizes are exactly equal are joined when the form is read (and when an old
     "different sizes" entry is opened), so an entry whose colours all have the same sizes is always saved as 'same'.

   Parts: makeCore() = pure rules (no page, tested in tests/size-groups.test.js);
          buildUI()  = the boxes on the page (styling: item-form.css, "SIZE GROUPS").
   ============================================================ */

function makeCore(SIZES, split) {
    const cell = (d, p) => ({ d: d || '', p: p || '' });
    const blankSizes = () => { const o = {}; SIZES.forEach(s => { o[s] = cell('', ''); }); return o; };
    const copySizes = (sizes) => { const o = {}; SIZES.forEach(s => { o[s] = cell(sizes[s] && sizes[s].d, sizes[s] && sizes[s].p); }); return o; };

    // what the size boxes mean (12 pieces = 1 dozen is calc.js' rule: splitPieces)
    function keyOf(sizes) {
        return SIZES.map(s => {
            const r = split(sizes[s] && sizes[s].d, sizes[s] && sizes[s].p);
            return (r.dozens || r.pieces) ? `${s}:${r.dozens}:${r.pieces}` : '';
        }).filter(Boolean).join('|');
    }

    function fromFields(obj) {
        const o = {};
        SIZES.forEach(s => { o[s] = cell(obj && obj[`size${s}`], obj && obj[`size${s}_pieces`]); });
        return o;
    }

    function newState() { return { groups: [], seq: 0 }; }
    function addGroup(st, colors, sizes) {
        const g = { id: ++st.seq, colors: colors.slice(), sizes: sizes || blankSizes() };
        st.groups.push(g);
        return g;
    }
    function resetState(st) { st.groups = []; addGroup(st, []); return st; }

    // groups with equal sizes become one (first appearance wins, colour order kept)
    function mergeEqual(groups) {
        const out = [];
        const seen = {};
        groups.forEach(g => {
            const k = keyOf(g.sizes);
            if (seen[k]) { g.colors.forEach(c => { if (!seen[k].colors.includes(c)) seen[k].colors.push(c); }); return; }
            const copy = { id: g.id, colors: g.colors.slice(), sizes: g.sizes };
            seen[k] = copy;
            out.push(copy);
        });
        return out;
    }

    // a saved entry -> groups
    function loadItem(st, item) {
        st.groups = [];
        const colors = Array.isArray(item && item.colors) ? item.colors : [];
        if (item && item.sizeOption !== 'different' && !(colors.length && typeof colors[0] === 'object')) {
            addGroup(st, colors.map(c => String(c)), fromFields(item));
            return st;
        }
        const list = colors.filter(c => c && typeof c === 'object').map(c => ({ colors: [String(c.name || '')], sizes: fromFields(c.sizes) }));
        mergeEqual(list).forEach(g => addGroup(st, g.colors, g.sizes));
        if (st.groups.length === 0) addGroup(st, []);
        return st;
    }

    // the colour picker changed: colours that are gone leave, new colours join the main (first) group
    function syncColours(st, chosen) {
        st.groups.forEach(g => { g.colors = g.colors.filter(c => chosen.includes(c)); });
        const inGroup = new Set(st.groups.flatMap(g => g.colors));
        const fresh = chosen.filter(c => !inGroup.has(c));
        if (st.groups.length === 0) addGroup(st, []);
        fresh.forEach(c => st.groups[0].colors.push(c));
        dropEmpty(st);
        return st;
    }

    // empty groups go, but one group always stays (sizes may be typed before the colours are picked)
    function dropEmpty(st) {
        const keep = st.groups.filter(g => g.colors.length > 0);
        if (keep.length === 0) { st.groups = st.groups.slice(0, 1); if (st.groups.length === 0) addGroup(st, []); return; }
        st.groups = keep;
    }

    function rename(st, from, to) {
        st.groups.forEach(g => { g.colors = g.colors.map(c => (c === from ? to : c)); });
        return st;
    }

    function groupOf(st, color) { return st.groups.find(g => g.colors.includes(color)); }

    // target 'new' = a new group (sizes copied from where the colour was); otherwise a group id
    function move(st, color, target) {
        const from = groupOf(st, color);
        if (!from) return { ok: false };
        if (target === 'new') {
            if (from.colors.length < 2) return { ok: false };      // already alone in its group
            from.colors = from.colors.filter(c => c !== color);
            const g = addGroup(st, [color], copySizes(from.sizes));
            return { ok: true, groupId: g.id };
        }
        const to = st.groups.find(g => String(g.id) === String(target));
        if (!to || to === from) return { ok: false };
        from.colors = from.colors.filter(c => c !== color);
        to.colors.push(color);
        dropEmpty(st);
        return { ok: true, groupId: to.id };
    }

    // do two or more groups have exactly the same sizes?  -> [[groupNo, groupNo], ...] (1-based)
    function equalPairs(groups) {
        const byKey = {};
        groups.forEach((g, i) => { (byKey[keyOf(g.sizes)] = byKey[keyOf(g.sizes)] || []).push(i + 1); });
        return Object.values(byKey).filter(list => list.length > 1);
    }

    const toMap = (sizes) => { const m = {}; SIZES.forEach(s => { m[s] = { dozens: sizes[s].d, pieces: sizes[s].p }; }); return m; };

    // groups -> the input calc.js / store.js already understand
    function toInput(st, order) {
        const used = st.groups.filter(g => g.colors.length > 0);
        const merged = mergeEqual(used);
        if (merged.length === 0) return { sizeOption: 'same', colors: [], sizes: toMap(st.groups[0] ? st.groups[0].sizes : blankSizes()) };
        if (merged.length === 1) {
            const names = merged[0].colors.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
            return { sizeOption: 'same', colors: names, sizes: toMap(merged[0].sizes) };
        }
        const colorSizes = [];
        merged.forEach(g => g.colors.forEach(name => colorSizes.push({ name, sizes: toMap(g.sizes) })));
        colorSizes.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
        return { sizeOption: 'different', colorSizes };
    }

    return { newState, resetState, addGroup, loadItem, syncColours, rename, move, equalPairs, toInput, mergeEqual, keyOf, blankSizes, groupOf };
}

function buildUI(core) {
    const SIZES = ItemForm.SIZES;
    const states = {};            // prefix -> { groups, seq }
    const wired = {};             // prefix -> true once its box has listeners
    const hooked = {};            // prefix -> true once the colour picker is connected
    const boxId = (prefix) => (prefix ? 'editSizeGroups' : 'sizeGroups');
    const boxOf = (prefix) => document.getElementById(boxId(prefix));
    const stateOf = (prefix) => states[prefix] || (states[prefix] = core.resetState(core.newState()));

    // typed values (they live in the boxes between redraws) -> state
    function capture(prefix) {
        const box = boxOf(prefix);
        if (!box) return;
        const st = stateOf(prefix);
        st.groups.forEach(g => {
            const el = box.querySelector(`.sg-group[data-gid="${g.id}"]`);
            if (!el) return;
            SIZES.forEach(size => {
                const d = el.querySelector(`.sg-d-${size}`);
                const p = el.querySelector(`.sg-p-${size}`);
                g.sizes[size] = { d: d ? d.value : '', p: p ? p.value : '' };
            });
        });
    }

    function chipHTML(prefix, st, g, name) {
        const color = ItemForm.getColorStyleSafe(name);
        const others = st.groups.filter(o => o.id !== g.id);
        const canSplit = g.colors.length > 1;
        let move = '';
        if (canSplit || others.length) {
            move = `<select class="sg-move" data-sg-move="${escapeHtml(name)}" aria-label="Move ${escapeHtml(color.displayName)} to another group" title="Move this colour to another group">
                <option value="">⇄</option>
                ${canSplit ? '<option value="new">New group (own sizes)</option>' : ''}
                ${others.map(o => `<option value="${o.id}">Move to Group ${st.groups.indexOf(o) + 1}</option>`).join('')}
            </select>`;
        }
        return `<span class="sg-chip" style="background-color:${color.backgroundColor};color:${color.textColor};border-color:${color.borderColor}">
            <span class="sg-chip-name">${escapeHtml(color.displayName)}</span>${move}
            <button type="button" class="sg-chip-x" data-sg-remove="${escapeHtml(name)}" aria-label="Remove ${escapeHtml(color.displayName)}"><i class="fas fa-times"></i></button>
        </span>`;
    }

    function groupHTML(prefix, st, g, index) {
        const multi = st.groups.length > 1;
        const title = multi ? `Group ${index + 1}` : 'All colours · same sizes';
        const cells = SIZES.map(size => ItemForm.sizeCellHTML(size, {
            dozenClass: `sg-d-${size}`, piecesClass: `sg-p-${size}`,
            dozenValue: g.sizes[size].d, piecesValue: g.sizes[size].p
        })).join('');
        const chips = g.colors.length
            ? g.colors.map(name => chipHTML(prefix, st, g, name)).join('')
            : '<span class="sg-nocolor">Pick the colours in the Colors box above</span>';
        return `<section class="sg-group" data-gid="${g.id}">
            <div class="sg-head"><h4 class="sg-title">${title}</h4><div class="sg-chips">${chips}</div></div>
            <div class="size-grid">${cells}</div>
        </section>`;
    }

    function refreshPreview(prefix) {
        if (typeof AlishanEntryPreview === 'undefined') return;
        const box = boxOf(prefix);
        if (!box) return;
        const field = document.getElementById(prefix ? 'editQuality' : 'quality');
        const typed = prefix ? document.getElementById('editPrice')?.value : '';
        const quality = field?.value.trim().toUpperCase();
        let defaultPrice = 0;
        for (const categories of Object.values(AlishanStore.getQualityData() || {})) {
            for (const list of Object.values(categories)) {
                const match = list.find(entry => entry?.name === quality);
                if (match) defaultPrice = Number(match.price) || 0;
            }
        }
        const price = typed ? Math.round(Number(typed) * 100) / 100 : defaultPrice;
        const totals = AlishanEntryPreview.totals(read(prefix), price);
        let output = box.querySelector('.sg-preview');
        if (!output) {
            output = document.createElement('p');
            output.className = 'sg-preview sg-note';
            box.appendChild(output);
        }
        output.hidden = !totals;
        output.textContent = totals ? `Preview · ${totals.pieces} pcs · ${Number(totals.dozens.toFixed(2))} dozen · ₹${totals.amount.toFixed(2)}` : '';
    }

    function render(prefix) {
        const box = boxOf(prefix);
        if (!box) return;
        const st = stateOf(prefix);
        const hint = st.groups.length < 2 && st.groups[0] && st.groups[0].colors.length > 1
            ? '<p class="sg-hint"><i class="fas fa-info-circle"></i> One colour needs different sizes? Use <b>⇄</b> on that colour and choose <b>New group</b>. The other colours stay together.</p>' : '';
        box.innerHTML = `<div class="sg-wrap">${st.groups.map((g, i) => groupHTML(prefix, st, g, i)).join('')}
            <p class="sg-note" hidden></p>${hint}</div>`;
        refreshNote(prefix);
        refreshPreview(prefix);
    }

    function refreshNote(prefix) {
        const box = boxOf(prefix);
        const note = box && box.querySelector('.sg-note');
        if (!note) return;
        const pairs = core.equalPairs(stateOf(prefix).groups);
        if (!pairs.length) { note.hidden = true; note.textContent = ''; return; }
        note.hidden = false;
        note.textContent = pairs.map(list => `Group ${list.join(' and Group ')}`).join('; ') + ' have exactly the same sizes — they are joined into one when you save.';
    }

    function sync(prefix) {
        capture(prefix);
        core.syncColours(stateOf(prefix), ItemForm.getSelectedColors(prefix));
        render(prefix);
    }

    function wire(prefix) {
        const box = boxOf(prefix);
        if (!box || wired[prefix]) return;
        wired[prefix] = true;
        const form = box.closest('form');
        form?.addEventListener('input', () => refreshPreview(prefix));
        form?.addEventListener('change', () => refreshPreview(prefix));
        box.addEventListener('change', (e) => {
            const sel = e.target.closest && e.target.closest('.sg-move');
            if (sel) {
                const name = sel.getAttribute('data-sg-move');
                const target = sel.value;
                capture(prefix);
                const r = core.move(stateOf(prefix), name, target);
                render(prefix);
                if (r.ok) {
                    const g = box.querySelector(`.sg-group[data-gid="${r.groupId}"]`);
                    if (g && target === 'new') { try { g.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) { /* ignore */ } }
                }
                return;
            }
            if (e.target.closest && e.target.closest('.sg-group')) setTimeout(() => { capture(prefix); refreshNote(prefix); }, 0);   // after the shared pieces->dozen carry ran
        });
        box.addEventListener('click', (e) => {
            const x = e.target.closest && e.target.closest('[data-sg-remove]');
            if (x) ItemForm.removeColor(x.getAttribute('data-sg-remove'), prefix, e);      // un-picks it in the one colour picker
        });
    }

    function init(prefix = '') {
        if (!boxOf(prefix)) return;
        wire(prefix);
        if (!hooked[prefix]) {
            hooked[prefix] = true;
            ItemForm.onColorsChange(prefix, () => sync(prefix));
            ItemForm.onColorRename(prefix, (from, to) => { capture(prefix); core.rename(stateOf(prefix), from, to); render(prefix); });
        }
        render(prefix);
    }

    function reset(prefix = '') {
        core.resetState(stateOf(prefix));
        render(prefix);
    }

    // Edit: show a saved entry (call AFTER the colour picker was filled)
    function load(prefix, item) {
        core.loadItem(stateOf(prefix), item);
        render(prefix);
    }

    // what to hand to AlishanStore.addItem / updateItem: { sizeOption, colors+sizes | colorSizes }
    function read(prefix = '') {
        capture(prefix);
        return core.toInput(stateOf(prefix), ItemForm.getSelectedColors(prefix));
    }

    return { init, load, reset, read, sync };
}

var SizeGroups;     // stays undefined until calc.js and item-form.js are there (so the loader can ask for this file again)
if (typeof AlishanCalc !== 'undefined' && typeof ItemForm !== 'undefined') SizeGroups = buildUI(makeCore(AlishanCalc.SIZES, AlishanCalc.splitPieces));

if (typeof window !== 'undefined' && SizeGroups) window.SizeGroups = SizeGroups;
if (typeof module !== 'undefined' && module.exports) module.exports = { makeCore };
