// Extracted unchanged from v96 UI source by the client build. Server only.
module.exports=(AlishanCalc,AlishanStore)=>{let breakdownState={period:'all'};
function breakdownPeriodStart(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (period === 'month') start.setDate(1);
  return period === 'all' ? null : start;
}
function getBreakdownData() {
  const items = AlishanStore.getItems();
  const start = breakdownPeriodStart(breakdownState.period);
  const map = new Map();
  items.forEach(item => {
    const date = AlishanCalc.parseDate(item.dateTime || item.createdAt || item.addedDateTime || '');
    if (start && (!date || Number.isNaN(date.getTime()) || date < start)) return;
    const key = String(item.productType || 'OTHER').trim().toUpperCase();
    if (!map.has(key)) map.set(key, {
      type: key,
      items: [],
      count: 0,
      dozens: 0,
      amount: 0,
      complete: 0,
      incomplete: 0
    });
    const bucket = map.get(key);
    const totals = AlishanCalc.itemTotals(item);
    bucket.items.push(item);
    bucket.count += 1;
    bucket.dozens += Number(totals.dozens) || 0;
    bucket.amount += Number(totals.amount) || 0;
    if (item.inStock === false) bucket.complete += 1;else bucket.incomplete += 1; // Complete = out of stock
  });
  // Keep all four supported product types visible, even when one currently has zero records.
  ['BRA', 'PANTY', 'SET', 'BLOUSE'].forEach(type => {
    if (!map.has(type)) map.set(type, {
      type,
      items: [],
      count: 0,
      dozens: 0,
      amount: 0,
      complete: 0,
      incomplete: 0
    });
  });
  return Array.from(map.values()).map(x => ({
    ...x,
    dozens: Math.round(x.dozens * 100) / 100,
    amount: Math.round(x.amount * 100) / 100
  })).sort((a, b) => {
    const order = ['BRA', 'PANTY', 'SET', 'BLOUSE'];
    const ai = order.indexOf(a.type),
      bi = order.indexOf(b.type);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.dozens - a.dozens || b.count - a.count || a.type.localeCompare(b.type);
  });
}
// Every quality name of the chosen period with the number of entries it has, most entries first.
// A quality name is counted per product type (BRA "Gajri" and PANTY "Gajri" are two rows).
function getQualityRanking() {
  const counts = new Map();
  getBreakdownData().forEach(bucket => bucket.items.forEach(item => {
    const name = String(item.quality || 'Unnamed Quality').trim();
    const type = String(item.productType || 'OTHER').trim().toUpperCase();
    const key = `${type}::${name.toLowerCase()}`;
    if (!counts.has(key)) counts.set(key, {
      name,
      type,
      count: 0
    });
    counts.get(key).count += 1;
  }));
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
return {breakdown(period){breakdownState.period=period;return getBreakdownData();},ranking(period){breakdownState.period=period;return getQualityRanking();}};};
