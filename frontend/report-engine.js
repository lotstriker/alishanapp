/* ====================================================================================================
 * report-engine.js — READ-ONLY data for the Report Page (ALISHAN-CHG-2026-11-06-003)
 *
 * What this file is:   it turns the saved quality entries and payments into "view models" (summary tiles, chart
 *                      data, table rows) for the eight reports.
 * What it never does:  it never saves, edits or deletes anything, and it has NO formula of its own for money,
 *                      quantity, pending or aging. Every such value comes from the existing code:
 *                        amount / quantity of an entry ... AlishanCalc.itemAmount / itemDozens / itemPieces / itemPrice
 *                        received / pending ............. AlishanStore.itemPayment (= AlishanCalc.paymentStatus)
 *                        valuation ...................... AlishanStore.qualitySummary / summary
 *                        aging .......................... AlishanStore.agingReport (AlishanCalc.agingLevel, entry date)
 *                        completion day ................. item.completedAt (AlishanCalc.completionInfo, v75)
 *                      What is added here is only choosing records (filters, weeks, months), adding up the existing
 *                      numbers of those records, and arranging them for the screen.
 * ==================================================================================================== */
const ReportEngine = (() => {
  'use strict';

  const C = AlishanCalc;
  const S = AlishanStore;

  /* ------------------------------ filters ------------------------------ */
  const freshFilters = () => ({
    from: '', to: '',                                   // date range (which date it means depends on the report)
    qualities: [], ids: [], types: [], lots: [], colours: [], cups: [],
    status: '',                                         // '' | 'Complete' | 'Incomplete'   (Complete = out of stock)
    payment: '',                                        // '' | 'Pending' | 'Partially Received' | 'Received'
    min: '', max: '',                                   // amount range (which amount depends on the report)
    search: ''
  });

  /* ------------------------------ dates (local business calendar) ------------------------------ */
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  // 'YYYY-MM-DD' (a payment date, the date boxes) -> local Date, never shifted by a time zone
  const localDay = (v) => {
    if (v instanceof Date) return isNaN(v) ? null : v;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = C.parseDate(v);
    return d && !isNaN(d) ? d : null;
  };

  // Monday 00:00 .. Sunday 23:59:59.999
  function weekRange(anchor) {
    const d = dayStart(anchor || new Date());
    const start = addDays(d, -((d.getDay() + 6) % 7));
    const end = endOfDay(addDays(start, 6));
    return { kind: 'week', start, end, label: `${C.fmtDate(start)} – ${C.fmtDate(end)}`, title: C.weekInfo(start).label };
  }
  function monthRange(anchor) {
    const d = anchor || new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { kind: 'month', start, end, label: `${C.fmtDate(start)} – ${C.fmtDate(end)}`, title: start.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) };
  }
  function customRange(from, to) {
    const start = localDay(from), stop = localDay(to);
    if (!start || !stop || stop < start) return null;
    return { kind: 'custom', start: dayStart(start), end: endOfDay(stop), label: `${C.fmtDate(start)} – ${C.fmtDate(stop)}`, title: 'Custom range' };
  }
  function shiftRange(range, steps) {
    if (range.kind === 'week') return weekRange(addDays(range.start, 7 * steps));
    if (range.kind === 'month') return monthRange(new Date(range.start.getFullYear(), range.start.getMonth() + steps, 1));
    const days = Math.round((dayStart(range.end) - range.start) / 86400000) + 1;                 // custom: same length, just before
    const start = addDays(range.start, days * steps);
    return { kind: 'custom', start, end: endOfDay(addDays(start, days - 1)), label: `${C.fmtDate(start)} – ${C.fmtDate(addDays(start, days - 1))}`, title: 'Previous range' };
  }
  const within = (d, range) => !!d && d >= range.start && d <= range.end;
  const inFilterDates = (d, f) => {
    if (!f.from && !f.to) return true;
    if (!d) return false;                                // no date = not inside a chosen date range
    const a = f.from ? localDay(f.from) : null, b = f.to ? localDay(f.to) : null;
    return (!a || d >= dayStart(a)) && (!b || d <= endOfDay(b));
  };
  const amountIn = (value, f) => {
    const lo = f.min === '' || f.min === undefined ? null : Number(f.min), hi = f.max === '' || f.max === undefined ? null : Number(f.max);
    return (lo === null || isNaN(lo) || value >= lo) && (hi === null || isNaN(hi) || value <= hi);
  };

  // is a payment date (and amount) inside the Payment Report's range? Used by the old sections shown inside it.
  function paymentInRange(value, amount, f) { return inFilterDates(localDay(value), f) && amountIn(Number(amount) || 0, f); }

  /* ------------------------------ one quality entry as a flat row ------------------------------ */
  function rowOf(item) {
    const pay = S.itemPayment(item);                     // { expected, received, pending, status }
    const info = C.completionInfo(item);
    const when = C.parseDate(item.dateTime);
    return {
      item, id: String(item.id), code: item.code || '', quality: item.quality || '', type: String(item.productType || '').toUpperCase(),
      lot: String(item.lotNumber || '').trim(), cup: item.cupSize && item.cupSize !== 'N/A' ? item.cupSize : '',
      colours: (item.colors || []).map(C.colorName).filter(Boolean),
      entry: when && !isNaN(when) ? when : null,         // Entry Date = the date the entry carries (same as Aging)
      completedAt: info && info.hasDate ? info.date : null,
      completed: item.inStock === false,                 // Complete = out of stock
      status: item.inStock === false ? 'Complete' : 'Incomplete',
      dozens: C.itemDozens(item), pieces: C.itemPieces(item), price: C.itemPrice(item), amount: C.itemAmount(item),
      received: pay.received, pending: pay.pending, payStatus: pay.status, days: C.daysInStock(item)
    };
  }

  // the entries that match the quality-level filters (exact matching, done by the existing export filter rules)
  function selectItems(f) {
    return S.exportFilterItems({
      types: f.types, qualities: f.qualities, ids: f.ids, lots: f.lots, colours: f.colours, cups: f.cups,
      status: f.status === 'Complete' ? 'Out of Stock' : f.status === 'Incomplete' ? 'In Stock' : '',
      payment: f.payment || '', search: f.search || ''
    }, false);
  }
  const selectRows = (f) => selectItems(f).map(rowOf);

  // choices for the filter lists, narrowed the way the Export Center does it
  function filterOptions(f) {
    const items = S.getItems();
    const low = (v) => String(v || '').trim().toLowerCase();
    const types = new Set((f.types || []).map(low)), names = new Set((f.qualities || []).map(low));
    const byType = items.filter((i) => !types.size || types.has(low(i.productType)));
    const byName = byType.filter((i) => !names.size || names.has(low(i.quality)));
    return {
      qualities: byType.map((i) => i.quality), ids: byName.map((i) => i.code || i.id), types: items.map((i) => String(i.productType || '').toUpperCase()),
      lots: byName.map((i) => i.lotNumber), colours: byName.flatMap((i) => (i.colors || []).map(C.colorName)),
      cups: byType.map((i) => i.cupSize).filter((v) => v && v !== 'N/A')
    };
  }

  /* ------------------------------ small helpers for view models ------------------------------ */
  const sum = (list, fn) => C.round2(list.reduce((t, x) => t + (Number(fn(x)) || 0), 0));
  const tile = (label, value, kind, hint) => ({ label, value, kind, hint: hint || '' });
  const col = (key, label, kind) => ({ key, label, kind: kind || 'text' });
  const pct = (now, before) => (before ? C.round2(((now - before) / Math.abs(before)) * 100) : null);
  const topBy = (rows, keyFn, valFn, n) => {
    const map = new Map();
    rows.forEach((r) => { const k = keyFn(r) || '—'; map.set(k, (map.get(k) || 0) + (Number(valFn(r)) || 0)); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n || 10).map(([label, value]) => [label, C.round2(value)]);
  };
  const chart = (kind, title, labels, series, extra) => ({ kind, title, labels, series, ...(extra || {}) });
  const colourSummary = (rows) => {
    const map = new Map();
    rows.forEach((r) => r.colours.forEach((c) => map.set(c, (map.get(c) || 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byDate = (key) => (a, b) => (b[key] ? b[key].getTime() : 0) - (a[key] ? a[key].getTime() : 0);

  /* ------------------------------ 1. Weekly Report (by Quality Completion Date) ------------------------------ */
  // The work of a week = the qualities whose completion day is inside it. A quality with no completion date
  // is NOT counted in any week (it is only counted separately, never as week work).
  function periodMetrics(rows, range, payments, allowed) {
    const list = rows.filter((r) => r.completedAt && within(r.completedAt, range));
    const cash = payments.filter((p) => allowed.has(String(p.inventoryId)) && within(localDay(p.date), range));
    return {
      list, count: list.length, dozens: sum(list, (r) => r.dozens), amount: sum(list, (r) => r.amount),
      received: sum(list, (r) => r.received), pending: sum(list, (r) => r.pending), cash: sum(cash, (p) => p.amount), cashCount: cash.length
    };
  }
  function compareTable(now, before) {
    const line = (key, label, kind) => ({ key, label, kind, current: now[key], previous: before[key], change: C.round2(now[key] - before[key]), percent: pct(now[key], before[key]) });
    return [line('count', 'Qualities completed', 'int'), line('dozens', 'Quantity (dozens)', 'qty'), line('amount', 'Work amount', 'money'),
      line('received', 'Amount received (for these qualities)', 'money'), line('pending', 'Pending amount (for these qualities)', 'money')];
  }

  function weekly(f, range) {
    const rows = selectRows(f).filter((r) => amountIn(r.amount, f));
    const payments = S.getPayments();
    const allowed = new Set(rows.map((r) => r.id));
    const now = periodMetrics(rows, range, payments, allowed);
    const prevRange = shiftRange(range, -1);
    const before = periodMetrics(rows, prevRange, payments, allowed);
    const notDone = rows.filter((r) => !r.completed);
    const noDate = rows.filter((r) => r.completed && !r.completedAt);

    // last 8 periods (the selected one is the last), same definition each time
    const trend = [];
    for (let k = 7; k >= 0; k -= 1) { const rg = shiftRange(range, -k); trend.push({ rg, m: periodMetrics(rows, rg, payments, allowed) }); }
    const dayLabels = [], dayValues = [];
    if (range.kind !== 'custom' || (range.end - range.start) / 86400000 <= 62) {
      for (let d = dayStart(range.start); d <= range.end; d = addDays(d, 1)) {
        dayLabels.push(`${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${d.getDate()}`);
        dayValues.push(sum(now.list.filter((r) => dayStart(r.completedAt).getTime() === d.getTime()), (r) => r.amount));
      }
    }
    const colours = colourSummary(now.list);
    return {
      key: 'weekly', range, prevRange, count: now.count, noDateCount: noDate.length,
      summary: [
        tile('Qualities completed', now.count, 'int', 'by Quality Completion Date'), tile('Total quantity', now.dozens, 'qty'),
        tile('Work amount', now.amount, 'money'), tile('Amount received', now.received, 'money', 'for these qualities, till today'),
        tile('Pending amount', now.pending, 'money', 'for these qualities'), tile('Cash received this period', now.cash, 'money', `${now.cashCount} payment entr${now.cashCount === 1 ? 'y' : 'ies'} dated in it`),
        tile('Incomplete qualities', notDone.length, 'int', 'not completed yet — not counted as work'),
        tile('Completed without a date', noDate.length, 'int', 'not counted in any week')
      ],
      notes: colours.length ? [`Colours: ${colours.map(([c, n]) => `${c} ×${n}`).join(', ')}`] : [],
      compare: compareTable(now, before), compareLabel: { current: range.title, previous: prevRange.title },
      charts: [
        ...(dayLabels.length ? [chart('bar', 'Work amount by day', dayLabels, [{ label: 'Work amount (₹)', data: dayValues, money: true }])] : []),
        chart('doughnut', 'Received vs pending', ['Received', 'Pending'], [{ label: 'Amount (₹)', data: [now.received, now.pending], money: true }]),
        chart('line', 'Quantity trend (dozens)', trend.map((t) => t.rg.title), [{ label: 'Quantity (dozens)', data: trend.map((t) => t.m.dozens) }]),
        chart('line', 'Quality-count trend', trend.map((t) => t.rg.title), [{ label: 'Qualities completed', data: trend.map((t) => t.m.count) }])
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('type', 'Type'), col('completedAt', 'Completion date', 'date'), col('lot', 'Lot'),
        col('dozens', 'Quantity (dozens)', 'qty'), col('amount', 'Amount', 'money'), col('received', 'Received', 'money'), col('pending', 'Pending', 'money'), col('status', 'Status')],
      rows: now.list.slice().sort(byDate('completedAt'))
    };
  }

  /* ------------------------------ 2. Payment Report (actual saved payments) ------------------------------ */
  function payments(f) {
    const rows = selectRows(f);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const list = S.getPayments()
      .filter((p) => byId.has(String(p.inventoryId)) && inFilterDates(localDay(p.date), f) && amountIn(Number(p.amount) || 0, f))
      .map((p) => ({ payment: p, row: byId.get(String(p.inventoryId)), id: String(p.inventoryId), date: localDay(p.date), amount: Number(p.amount) || 0, quality: byId.get(String(p.inventoryId)).quality,
        code: byId.get(String(p.inventoryId)).code, lot: byId.get(String(p.inventoryId)).lot, type: byId.get(String(p.inventoryId)).type, notes: p.notes || '' }))
      .sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
    const total = sum(list, (x) => x.amount);
    const months = new Map();
    list.forEach((x) => { if (!x.date) return; const k = `${x.date.getFullYear()}-${String(x.date.getMonth() + 1).padStart(2, '0')}`; months.set(k, (months.get(k) || 0) + x.amount); });
    const monthKeys = [...months.keys()].sort();
    const types = topBy(list, (x) => x.type, (x) => x.amount, 8);
    return {
      key: 'payments', count: list.length,
      summary: [tile('Total amount received', total, 'money'), tile('Payment entries', list.length, 'int'),
        ...(list.length ? [tile('Average payment', C.round2(total / list.length), 'money', 'total ÷ entries')] : [])],
      notes: [],
      charts: [
        chart('bar', 'Monthly received amount', monthKeys.map((k) => { const [y, m] = k.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' }); }),
          [{ label: 'Received (₹)', data: monthKeys.map((k) => C.round2(months.get(k))), money: true }]),
        chart('doughnut', 'Received by quality type', types.map((t) => t[0]), [{ label: 'Received (₹)', data: types.map((t) => t[1]), money: true }], { filterKey: 'types' })
      ],
      columns: [col('date', 'Payment date', 'date'), col('quality', 'Quality'), col('code', 'Quality ID'), col('lot', 'Lot'), col('type', 'Type'), col('amount', 'Amount', 'money'), col('notes', 'Notes')],
      rows: list
    };
  }

  /* ------------------------------ 3. Pending Report ------------------------------ */
  function pending(f) {
    const rows = selectRows(f).filter((r) => r.pending > 0 && inFilterDates(r.entry, f) && amountIn(r.pending, f));   // fully paid never appears
    const oldest = rows.slice().sort((a, b) => (a.entry ? a.entry.getTime() : Infinity) - (b.entry ? b.entry.getTime() : Infinity))[0];
    return {
      key: 'pending', count: rows.length,
      summary: [tile('Total pending amount', sum(rows, (r) => r.pending), 'money', 'after partial payments'), tile('Pending qualities', rows.length, 'int'),
        tile('Pending quantity', sum(rows, (r) => r.dozens), 'qty', 'dozens of those qualities'),
        tile('Oldest pending record', oldest ? `${oldest.quality} · ${oldest.days} day${oldest.days === 1 ? '' : 's'}` : '—', 'text', oldest ? `entered ${C.fmtDate(oldest.entry)}` : '')],
      notes: [],
      charts: [
        chart('doughnut', 'Pending by quality type', ...(() => { const t = topBy(rows, (r) => r.type, (r) => r.pending, 8); return [t.map((x) => x[0]), [{ label: 'Pending (₹)', data: t.map((x) => x[1]), money: true }], { filterKey: 'types' }]; })()),
        chart('bar', 'Highest pending by quality', ...(() => { const t = topBy(rows, (r) => r.quality, (r) => r.pending, 10); return [t.map((x) => x[0]), [{ label: 'Pending (₹)', data: t.map((x) => x[1]), money: true }], { filterKey: 'qualities' }]; })())
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('type', 'Type'), col('lot', 'Lot'), col('entry', 'Entry date', 'date'), col('completedAt', 'Completion date', 'date'),
        col('amount', 'Total amount', 'money'), col('received', 'Received', 'money'), col('pending', 'Remaining', 'money'), col('status', 'Status')],
      rows: rows.sort((a, b) => b.pending - a.pending)
    };
  }

  /* ------------------------------ 4. Quality Report ------------------------------ */
  function quality(f) {
    const rows = selectRows(f).filter((r) => inFilterDates(r.entry, f) && amountIn(r.amount, f));
    const total = sum(rows, (r) => r.amount);
    const types = topBy(rows, (r) => r.type, () => 1, 8), lead = topBy(rows, (r) => r.quality, (r) => r.dozens, 10), amt = topBy(rows, (r) => r.quality, (r) => r.amount, 10);
    return {
      key: 'quality', count: rows.length,
      summary: [tile('Qualities', rows.length, 'int'), tile('Total quantity', sum(rows, (r) => r.dozens), 'qty'), tile('Total quality amount', total, 'money'),
        ...(rows.length ? [tile('Average amount', C.round2(total / rows.length), 'money', 'total ÷ qualities')] : [])],
      notes: [],
      charts: [
        chart('doughnut', 'Quality-type breakdown (entries)', types.map((x) => x[0]), [{ label: 'Entries', data: types.map((x) => x[1]) }], { filterKey: 'types' }),
        chart('bar', 'Leading qualities by quantity (dozens)', lead.map((x) => x[0]), [{ label: 'Dozens', data: lead.map((x) => x[1]) }], { filterKey: 'qualities' }),
        chart('bar', 'Quality-wise amount', amt.map((x) => x[0]), [{ label: 'Amount (₹)', data: amt.map((x) => x[1]), money: true }], { filterKey: 'qualities' })
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('type', 'Type'), col('lot', 'Lot'), col('coloursText', 'Colours'), col('cup', 'Cup'), col('entry', 'Entry date', 'date'),
        col('dozens', 'Quantity (dozens)', 'qty'), col('amount', 'Amount', 'money'), col('status', 'Status')],
      rows: rows.map((r) => ({ ...r, coloursText: r.colours.join(', ') })).sort(byDate('entry'))
    };
  }

  /* ------------------------------ 5. Valuation Report (the app's own valuation) ------------------------------ */
  function valuation(f) {
    const rows = selectRows(f).filter((r) => inFilterDates(r.entry, f) && amountIn(r.amount, f));
    const scope = rows.map((r) => r.item);
    const q = S.qualitySummary(scope), s = S.summary(scope);       // the same calls the old Inventory Valuation tab used
    const byQuality = q.rows.slice().sort((a, b) => b.value - a.value).slice(0, 10);
    const byQty = q.rows.slice().sort((a, b) => b.dozens - a.dozens).slice(0, 10);
    const types = Object.entries(s.byType).map(([t, b]) => [t, b.value]).sort((a, b) => b[1] - a[1]);
    return {
      key: 'valuation', count: rows.length,
      summary: [tile('Current inventory value', q.totalValue, 'money', 'valuation of the selected entries'), tile('Qualities', rows.length, 'int'), tile('Quantity', q.totalDozens, 'qty'),
        ...(rows.length ? [tile('Average value', C.round2(q.totalValue / rows.length), 'money', 'value ÷ qualities')] : [])],
      notes: ['Valuation is the existing value of the selected entries. It is not the cash received.'],
      charts: [
        chart('bar', 'Quality-wise value', byQuality.map((x) => x.quality), [{ label: 'Value (₹)', data: byQuality.map((x) => x.value), money: true }], { filterKey: 'qualities' }),
        chart('doughnut', 'Quality-type-wise value', types.map((x) => x[0]), [{ label: 'Value (₹)', data: types.map((x) => x[1]), money: true }], { filterKey: 'types' }),
        chart('bar', 'Quantity distribution (dozens)', byQty.map((x) => x.quality), [{ label: 'Dozens', data: byQty.map((x) => C.round2(x.dozens)) }], { filterKey: 'qualities' })
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('type', 'Type'), col('lot', 'Lot'), col('dozens', 'Quantity (dozens)', 'qty'), col('price', 'Price per dozen', 'money'), col('amount', 'Value', 'money')],
      rows: rows.sort((a, b) => b.amount - a.amount)
    };
  }

  /* ------------------------------ 6. Aging Report (entry date; buckets 0–7 / 8–15 / 16–30 / 31+) ------------------------------ */
  function aging(f, level) {
    const rows = selectRows(f).filter((r) => inFilterDates(r.entry, f) && amountIn(r.amount, f));
    const report = S.agingReport(rows.map((r) => r.item));
    const byItem = new Map(rows.map((r) => [r.id, r]));
    const buckets = C.AGING_ORDER.map((key) => ({ key, title: C.agingTitle(key), range: C.agingRange(key), count: report[key].items.length, value: report[key].totalValue }));
    const all = [];
    C.AGING_ORDER.forEach((key) => report[key].items.forEach((e) => all.push({ ...byItem.get(String(e.item.id)), bucket: key, bucketTitle: C.agingTitle(key), days: e.days })));
    const shown = (level ? all.filter((r) => r.bucket === level) : all).sort((a, b) => b.days - a.days);
    return {
      key: 'aging', count: all.length, buckets, level: level || '',
      // the four age groups are the clickable cards under these tiles, so the tiles show the totals (not the same four numbers twice)
      summary: [tile('Entries in stock', all.length, 'int'), tile('Value of these entries', sum(all, (r) => r.amount), 'money'),
        tile('Oldest entry', all.length ? `${all.slice().sort((a, b) => b.days - a.days)[0].quality} · ${all.slice().sort((a, b) => b.days - a.days)[0].days} days` : '—', 'text')],
      notes: ['Only entries that are still in stock (Incomplete) age. Age is counted from the Entry Date.'],
      charts: [
        chart('bar', 'Entries by age', buckets.map((b) => b.title), [{ label: 'Entries', data: buckets.map((b) => b.count) }], { bucketKeys: buckets.map((b) => b.key) }),
        chart('doughnut', 'Value by age', buckets.map((b) => b.title), [{ label: 'Value (₹)', data: buckets.map((b) => b.value), money: true }], { bucketKeys: buckets.map((b) => b.key) })
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('entry', 'Entry date', 'date'), col('days', 'Aging days', 'days'), col('bucketTitle', 'Group'),
        col('dozens', 'Quantity (dozens)', 'qty'), col('amount', 'Amount', 'money'), col('status', 'Status')],
      rows: shown
    };
  }

  /* ------------------------------ 7. History Report (Quality History + Activity Log) ------------------------------ */
  async function history(f) {
    const items = S.getItems(), byCode = new Map(items.map((i) => [String(i.code), i]));
    const low = (v) => String(v || '').trim().toLowerCase();
    const types = new Set((f.types || []).map(low)), names = new Set((f.qualities || []).map(low)), ids = new Set((f.ids || []).map(low));
    const q = low(f.search);
    const records = ((await S.getQualityHistory()) || []).map(S.normalizeQualityHistory).filter((r) =>
      (!types.size || types.has(low(r.productType))) && (!names.size || names.has(low(r.qualityName))) && (!ids.size || ids.has(low(r.qualityCode))));
    const events = records.map((r) => ({
      at: new Date(r.at), source: 'Quality History', event: r.action, quality: r.qualityName || '', code: r.qualityCode || '', itemId: byCode.has(String(r.qualityCode)) ? String(byCode.get(String(r.qualityCode)).id) : '',
      details: r.action === 'New Quality Added' ? 'New quality added' : (r.changes || []).map((c) => `${c.field}: ${c.oldValue} → ${c.newValue}`).join(' | '),
      previousValue: (r.changes || []).map((c) => `${c.field}: ${c.oldValue}`).join(' | '), newValue: (r.changes || []).map((c) => `${c.field}: ${c.newValue}`).join(' | ')
    }));
    const hasQualityFilter = types.size || names.size || ids.size;          // the activity log has no quality fields, so these filters hide it
    if (!hasQualityFilter) ((await S.getRecentActivity(1000)) || []).forEach((a) => events.push({ at: new Date(a.at), source: 'Activity Log', event: a.type || '', quality: '', code: '', itemId: '', details: a.text || '' }));
    const list = events.filter((e) => !isNaN(e.at) && inFilterDates(e.at, f) && (!q || JSON.stringify(e).toLowerCase().includes(q))).sort((a, b) => b.at - a.at);
    const days = [], values = [];
    for (let k = 13; k >= 0; k -= 1) {
      const d = addDays(dayStart(new Date()), -k);
      days.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
      values.push(list.filter((e) => dayStart(e.at).getTime() === d.getTime()).length);
    }
    return {
      key: 'history', count: list.length,
      summary: [tile('Recorded events', list.length, 'int'), tile('Quality History', list.filter((e) => e.source === 'Quality History').length, 'int'),
        tile('Activity Log', list.filter((e) => e.source === 'Activity Log').length, 'int'), tile('Latest event', list[0] ? C.fmtDateTime(list[0].at) : '—', 'text')],
      notes: ['Shows only events that were really recorded. The Activity Log keeps the newest 1000 actions.', ...(hasQualityFilter ? ['Quality filters hide the Activity Log (its records are not tied to a quality).'] : [])],
      charts: [chart('bar', 'Events in the last 14 days', days, [{ label: 'Events', data: values }])],
      columns: [col('at', 'Date and time', 'datetime'), col('source', 'Source'), col('event', 'Event'), col('quality', 'Quality'), col('code', 'Quality ID'), col('details', 'Details')],
      rows: list
    };
  }

  /* ------------------------------ 8. Business Analysis (week / month against the one before) ------------------------------ */
  // Same definitions as the Weekly Report (work, quantity, count, pending: by completion date of the quality)
  // and the Payment Report (cash: payment entries dated inside the period).
  function analysis(f, range) {
    const rows = selectRows(f).filter((r) => amountIn(r.amount, f));
    const pays = S.getPayments(), allowed = new Set(rows.map((r) => r.id));
    const now = periodMetrics(rows, range, pays, allowed), prevRange = shiftRange(range, -1), before = periodMetrics(rows, prevRange, pays, allowed);
    const line = (key, label, kind) => ({ key, label, kind, current: now[key], previous: before[key], change: C.round2(now[key] - before[key]), percent: pct(now[key], before[key]) });
    const trend = [];
    for (let k = 5; k >= 0; k -= 1) { const rg = shiftRange(range, -k); trend.push({ rg, m: periodMetrics(rows, rg, pays, allowed) }); }
    return {
      key: 'analysis', range, prevRange, count: now.count,
      summary: [tile('Work amount', now.amount, 'money', range.title), tile('Quantity', now.dozens, 'qty'), tile('Qualities', now.count, 'int'),
        tile('Cash received', now.cash, 'money', 'payments dated in the period'), tile('Pending amount', now.pending, 'money', 'of these qualities')],
      notes: ['Work, quantity, quality count and pending use the Quality Completion Date. Cash received uses the payment dates. Qualities without a completion date are not counted.'],
      compare: [line('amount', 'Work amount', 'money'), line('dozens', 'Quantity (dozens)', 'qty'), line('count', 'Quality count', 'int'), line('cash', 'Cash received', 'money'), line('pending', 'Pending amount', 'money')],
      compareLabel: { current: range.title, previous: prevRange.title },
      charts: [
        chart('bar', 'This period vs previous period', ['Work amount', 'Cash received', 'Pending amount'],
          [{ label: range.title, data: [now.amount, now.cash, now.pending], money: true }, { label: prevRange.title, data: [before.amount, before.cash, before.pending], money: true }]),
        chart('line', 'Work amount and cash received (last 6 periods)', trend.map((t) => t.rg.title),
          [{ label: 'Work amount (₹)', data: trend.map((t) => t.m.amount), money: true }, { label: 'Cash received (₹)', data: trend.map((t) => t.m.cash), money: true }])
      ],
      columns: [col('quality', 'Quality'), col('code', 'Quality ID'), col('type', 'Type'), col('completedAt', 'Completion date', 'date'), col('dozens', 'Quantity (dozens)', 'qty'), col('amount', 'Work amount', 'money'), col('pending', 'Pending', 'money')],
      rows: now.list.slice().sort(byDate('completedAt'))
    };
  }

  // The entries the old report sections (pending cards, amount history, valuation tab, aging cards) must draw from while a
  // report is open, so that they follow the same filters as the new summaries, charts and tables.
  function scopeItems(key, f) {
    let rows = selectRows(f);
    if (['quality', 'valuation', 'aging'].includes(key)) rows = rows.filter((r) => inFilterDates(r.entry, f) && amountIn(r.amount, f));
    else if (key === 'pending') rows = rows.filter((r) => inFilterDates(r.entry, f) && amountIn(r.pending, f));
    return rows.map((r) => r.item);
  }

  /* ------------------------------ numbers for the cards on the Report home ------------------------------ */
  function overview() {
    const f = freshFilters(), rows = selectRows(f), pays = S.getPayments();
    const wk = weekRange(new Date()), allowed = new Set(rows.map((r) => r.id));
    const thisWeek = periodMetrics(rows, wk, pays, allowed);
    const sm = S.summary(S.getItems());
    const pend = rows.filter((r) => r.pending > 0);
    return {
      weekly: { count: thisWeek.count, amount: thisWeek.amount, title: wk.title },
      payments: { total: sum(pays.filter((p) => allowed.has(String(p.inventoryId))), (p) => p.amount), count: pays.filter((p) => allowed.has(String(p.inventoryId))).length },
      pending: { total: sum(pend, (r) => r.pending), count: pend.length },
      quality: { count: rows.length }, valuation: { value: S.qualitySummary(S.getItems()).totalValue }, aging: { count: sm.agingItems }
    };
  }

  /* ------------------------------ hand-over to the Export Center (what it can express) ------------------------------ */
  // Returns { datasets, filters, ignoresAmount } for the Export Center. Every report can be handed over:
  // Weekly Report and Business Analysis use the 'Completed Work' data set with the completion date range of the
  // week / month that is open. `range` is that period (state of the screen).
  function exportPreset(key, f, range) {
    const map = { weekly: ['completed'], analysis: ['completed'], pending: ['pending'], payments: ['received'], quality: ['inventory', 'sizes'], valuation: ['valuation'], aging: ['aging'], history: ['history'] };
    if (!map[key]) return null;
    const dated = ['pending', 'payments', 'quality', 'valuation', 'aging', 'history'].includes(key);
    const historyOnly = key === 'history';
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const useRange = (key === 'weekly' || key === 'analysis') && range;
    return {
      name: 'Report export', datasets: map[key], format: 'excel',
      ignoresAmount: ['valuation', 'history'].includes(key) && (f.min !== '' || f.max !== ''),
      filters: {
        types: f.types, qualities: f.qualities, ids: f.ids, lots: historyOnly ? [] : f.lots, colours: historyOnly ? [] : f.colours, cups: historyOnly ? [] : f.cups,
        status: key === 'weekly' || key === 'analysis' ? '' : (f.status === 'Complete' ? 'Out of Stock' : f.status === 'Incomplete' ? 'In Stock' : ''), payment: f.payment || '', search: f.search || '',
        from: dated ? f.from : '', to: dated ? f.to : '', preset: dated && (f.from || f.to) ? 'custom' : 'all',
        completedFrom: useRange ? iso(range.start) : '', completedTo: useRange ? iso(range.end) : '',
        min: f.min, max: f.max
      }
    };
  }

  return {
    freshFilters, weekRange, monthRange, customRange, shiftRange, filterOptions, rowOf, scopeItems, paymentInRange, overview, exportPreset,
    weekly, payments, pending, quality, valuation, aging, history, analysis
  };
})();

if (typeof window !== 'undefined') window.ReportEngine = ReportEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = ReportEngine;
