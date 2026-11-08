/* ====================================================================================================
 * report-views.js — the screens of the Report Page (ALISHAN-CHG-2026-11-06-003)
 *
 * UI ONLY. It asks ReportEngine for a view model (summary tiles, charts, table rows) and draws it.
 * It saves nothing, changes no quality and no payment, and calculates nothing: every number is formatted from what
 * ReportEngine / AlishanCalc / AlishanStore return. Opening or filtering a report never writes a record.
 *
 * Screens: the Report home (eight cards) and one detail view per report (Back returns to the home).
 * The page address carries the open report (reports.html#pending), so the browser's Back button also works.
 * ==================================================================================================== */
const ReportViews = (() => {
  'use strict';

  const C = AlishanCalc;
  const E = ReportEngine;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const low = (v) => String(v === undefined || v === null ? '' : v).trim().toLowerCase();

  const ORDER = ['weekly', 'payments', 'pending', 'quality', 'valuation', 'aging', 'history', 'analysis'];
  // filters: which filter boxes a report shows (only filters its records support). date = what the date range means.
  const REPORTS = {
    weekly: { title: 'Weekly Report', icon: 'fa-calendar-week', desc: 'Work completed in a Monday–Sunday week', period: 'week', filters: ['qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'status', 'amount'], amount: 'Quality amount (₹)', existing: [] },
    payments: { title: 'Payment Report', icon: 'fa-money-bill-wave', desc: 'Amounts really received', filters: ['date', 'qualities', 'ids', 'types', 'lots', 'amount'], date: 'Payment date', amount: 'Payment amount (₹)', existing: ['history', 'weekly'] },
    pending: { title: 'Pending Report', icon: 'fa-wallet', desc: 'Qualities with money still to receive', filters: ['date', 'qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'status', 'amount'], date: 'Entry date', amount: 'Remaining amount (₹)', existing: ['pending'] },
    quality: { title: 'Quality Report', icon: 'fa-boxes', desc: 'Qualities, quantities and amounts', filters: ['date', 'qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'status', 'amount'], date: 'Entry date', amount: 'Quality amount (₹)', existing: [] },
    valuation: { title: 'Valuation Report', icon: 'fa-chart-bar', desc: 'Value of the inventory', filters: ['date', 'qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'status', 'amount'], date: 'Entry date', amount: 'Value (₹)', existing: ['valuation'] },
    aging: { title: 'Aging Report', icon: 'fa-hourglass-half', desc: 'How long stock has been waiting', filters: ['date', 'qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'amount'], date: 'Entry date', amount: 'Amount (₹)', existing: ['aging'] },
    history: { title: 'History Report', icon: 'fa-clock-rotate-left', desc: 'Quality History and Activity Log together', filters: ['date', 'qualities', 'ids', 'types'], date: 'Event date', existing: [] },
    analysis: { title: 'Business Analysis', icon: 'fa-chart-line', desc: 'Weekly and monthly comparison', period: 'analysis', filters: ['qualities', 'ids', 'types', 'lots', 'colours', 'cups', 'amount'], amount: 'Quality amount (₹)', existing: [] }
  };
  const FIELDS = { qualities: 'Quality', ids: 'Quality ID', types: 'Quality Type', lots: 'Lot Number', colours: 'Colour', cups: 'Cup' };
  const PALETTE = ['#4361ee', '#f72585', '#4cc9f0', '#f8961e', '#7209b7', '#2a9d8f', '#e76f51', '#8ac926', '#ff595e', '#6a4c93'];

  const state = {
    key: '', filters: E.freshFilters(), range: null, analysisMode: 'week', customMode: false,
    bucket: '', page: 1, pageSize: 50, paging: {}, sort: 'latest', model: null, charts: [], token: 0
  };

  /* ------------------------------ formatting (numbers come ready from the engine) ------------------------------ */
  const num = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  function fmt(kind, v) {
    if (v === undefined || v === null || v === '') return '—';
    switch (kind) {
      case 'money': return C.fmtMoney(v);
      case 'qty': return `${C.fmtDozens(v)} dozens`;
      case 'int': return num(v);
      case 'days': return `${num(v)} ${v === 1 ? 'day' : 'days'}`;
      case 'date': return v instanceof Date ? (isNaN(v) ? '—' : C.fmtDate(v)) : String(v);
      case 'datetime': return v instanceof Date ? (isNaN(v) ? '—' : C.fmtDateTime(v)) : String(v);
      default: return String(v);
    }
  }
  const cell = (kind, v) => (kind === 'qty' && v !== '' && v !== undefined ? C.fmtDozens(v) : fmt(kind, v));
  const notify = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'info'); };

  /* ------------------------------ Report home (the eight cards) ------------------------------ */
  function renderHome() {
    const host = $('reportHome'); if (!host) return;
    let o = null;
    try { o = E.overview(); } catch (e) { console.error('Report overview failed:', e); }
    const line = {
      weekly: o && `${num(o.weekly.count)} completed this week · ${C.fmtMoney(o.weekly.amount)}`,
      payments: o && `${C.fmtMoney(o.payments.total)} · ${num(o.payments.count)} entries`,
      pending: o && `${C.fmtMoney(o.pending.total)} · ${num(o.pending.count)} qualities`,
      quality: o && `${num(o.quality.count)} qualities`,
      valuation: o && `${C.fmtMoney(o.valuation.value)} inventory value`,
      aging: o && `${num(o.aging.count)} in stock older than ${C.CONFIG.AGING_AFTER_DAYS} days`,
      history: 'Quality History + Activity Log',
      analysis: 'Weekly + Monthly comparison'
    };
    host.innerHTML = ORDER.map((k) => `<button class="rp-card" data-report="${k}" type="button"><span class="rp-card-icon"><i class="fas ${REPORTS[k].icon}"></i></span><span class="rp-card-text"><b>${esc(REPORTS[k].title)}</b><small>${esc(REPORTS[k].desc)}</small><em>${esc(line[k] || '')}</em></span><i class="fas fa-chevron-right rp-card-go"></i></button>`).join('');
  }

  /* ------------------------------ navigation ------------------------------ */
  function route() {
    const key = (location.hash || '').replace(/^#/, '');
    if (ORDER.includes(key)) openView(key); else showHome();
  }
  function showHome() {
    if (state.key) state.paging[state.key] = { page: state.page, pageSize: state.pageSize };
    state.key = ''; state.token += 1; destroyCharts();
    document.body.classList.remove('rp-in-view');
    $('reportView').hidden = true; $('reportHome').hidden = false;
    document.querySelectorAll('#reportHome [data-report]').forEach((card) => card.classList.remove('active'));
    returnExisting();
    if (typeof refreshAllReports === 'function') refreshAllReports(true);   // the old top cards follow the old filters again
    renderHome();
  }
  function openView(key) {
    if (state.key !== key) {
      if (state.key) state.paging[state.key] = { page: state.page, pageSize: state.pageSize };
      state.key = key; state.filters = E.freshFilters(); state.bucket = '';
      // Every newly opened report starts with its legacy detail cards collapsed.
      document.querySelectorAll('.rp-extra-card').forEach(card => { card.open = false; });
      const savedPaging = state.paging[key] || { page: 1, pageSize: 50 }; state.page = savedPaging.page; state.pageSize = savedPaging.pageSize; state.sort = 'latest'; state.customMode = false;
      state.range = REPORTS[key].period === 'analysis' ? E.weekRange(new Date()) : E.weekRange(new Date());
      state.analysisMode = 'week';
      buildFilterBar();
    }
    document.body.classList.add('rp-in-view');
    $('reportHome').hidden = true; $('reportView').hidden = false;
    document.querySelectorAll('#reportHome [data-report]').forEach((card) => card.classList.toggle('active', card.dataset.report === key));
    $('rpTitle').textContent = REPORTS[key].title;
    $('rpSubtitle').textContent = REPORTS[key].desc;
    window.scrollTo(0, 0);
    render();
  }

  /* ------------------------------ the old report sections live inside a view ------------------------------ */
  const EXISTING_IDS = { pending: 'pending-tab', weekly: 'weekly-tab', history: 'history-tab', valuation: 'valuation-tab', aging: 'aging-tab' };
  function returnExisting() {
    const store = $('rpExistingStore'); if (!store) return;
    Object.values(EXISTING_IDS).forEach((id) => { const el = $(id); if (el && el.parentElement !== store) store.appendChild(el); if (el) el.classList.remove('active'); });
    $('rpExtraWrap').hidden = true;
  }
  function placeExisting(key) {
    returnExisting();
    const names = REPORTS[key].existing || [];
    const host = $('rpExtra');
    $('rpExtraWrap').hidden = !names.length;
    names.forEach((n) => { const el = $(EXISTING_IDS[n]); if (el) { host.appendChild(el); el.classList.add('active'); } });
    if (names.length && typeof drawTab === 'function') names.forEach((n) => drawTab(n));
  }
  // the old sections (pending cards with "Add Amount", amount history, valuation tab, aging cards) draw from this scope
  function scopeItems() {
    return state.key ? E.scopeItems(state.key, state.filters) : null;
  }
  function currentExisting() { return state.key ? (REPORTS[state.key].existing[0] || '') : ''; }
  // the old Amount History / weekly-received sections inside the Payment Report follow its date and amount range
  function paymentInRange(value, amount) {
    return state.key === 'payments' ? E.paymentInRange(value, amount, state.filters) : true;
  }

  /* ------------------------------ filter bar ------------------------------ */
  const multiHTML = (k) => `<div class="xc-multi rp-multi" data-key="${k}"><label class="xc-label">${FIELDS[k]}</label><div aria-expanded="false" class="xc-multi-box" role="combobox" tabindex="0"><div class="xc-multi-tags"></div><i class="fas fa-chevron-down"></i></div><div class="xc-multi-panel" hidden><input aria-label="Search ${FIELDS[k]}" class="xc-multi-search" placeholder="Search…" type="search"/><div class="xc-multi-list"></div><div class="xc-multi-actions"><button class="xc-link" data-act="all" type="button">Select shown</button><button class="xc-link" data-act="none" type="button">Clear</button></div></div></div>`;

  function buildFilterBar() {
    const cfg = REPORTS[state.key], host = $('rpFilters');
    const f = cfg.filters;
    const date = f.includes('date') ? `<div class="rp-range"><div class="form-group"><label for="rpFrom">${esc(cfg.date)} — from</label><input id="rpFrom" type="date"/></div><div class="form-group"><label for="rpTo">${esc(cfg.date)} — to</label><input id="rpTo" type="date"/></div></div>` : '';
    const multis = ['qualities', 'ids', 'types', 'lots', 'colours', 'cups'].filter((k) => f.includes(k)).map(multiHTML).join('');
    const status = f.includes('status') ? `<div><div class="xc-field-label">Status</div><div class="xc-chips" id="rpStatus">${[['', 'All'], ['Complete', 'Complete'], ['Incomplete', 'Incomplete']].map(([v, l]) => `<button class="xc-chip" data-status="${v}" type="button">${l}</button>`).join('')}</div></div>` : '';
    const amount = f.includes('amount') ? `<div class="rp-range"><div class="form-group"><label for="rpMin">${esc(cfg.amount)} — min</label><input id="rpMin" inputmode="decimal" min="0" placeholder="0" type="number"/></div><div class="form-group"><label for="rpMax">${esc(cfg.amount)} — max</label><input id="rpMax" inputmode="decimal" min="0" placeholder="No limit" type="number"/></div></div>` : '';
    host.innerHTML = `<details class="rp-filter-box"><summary><i class="fas fa-filter"></i> Filters <span id="rpFilterCount"></span></summary><div class="rp-filter-body">${date}<div class="xc-filter-grid">${multis}</div>${status}${amount}<div class="rp-filter-foot"><button class="btn btn-secondary" id="rpClear" type="button">Clear filters</button></div></div></details>`;
  }
  function syncFilterBox() {
    const f = state.filters, cfg = REPORTS[state.key];
    if ($('rpFrom')) { $('rpFrom').value = f.from; $('rpTo').value = f.to; }
    if ($('rpMin')) { $('rpMin').value = f.min; $('rpMax').value = f.max; }
    document.querySelectorAll('#rpStatus .xc-chip').forEach((b) => b.classList.toggle('active', b.dataset.status === f.status));
    const options = E.filterOptions(f);
    cfg.filters.filter((k) => FIELDS[k]).forEach((k) => renderMulti(k, options));
    const active = Object.keys(FIELDS).filter((k) => f[k] && f[k].length).length + (f.from || f.to ? 1 : 0) + (f.status ? 1 : 0) + (f.min !== '' || f.max !== '' ? 1 : 0);
    $('rpFilterCount').textContent = active ? `· ${active} active` : '';
  }
  function countValues(values) {
    const map = new Map();
    values.forEach((v) => { const t = String(v === undefined || v === null ? '' : v).trim(); if (t) { const k = low(t); const e = map.get(k) || { value: t, n: 0 }; e.n += 1; map.set(k, e); } });
    return [...map.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }));
  }
  function renderMulti(k, options) {
    const box = document.querySelector(`.rp-multi[data-key="${k}"]`); if (!box) return;
    const list = countValues(options[k] || []);
    const available = new Set(list.map((o) => low(o.value)));
    const kept = state.filters[k].filter((v) => available.has(low(v)));
    if (kept.length !== state.filters[k].length) state.filters[k] = kept;              // a choice that no longer exists is dropped
    const chosen = new Set(state.filters[k].map(low));
    box.querySelector('.xc-multi-tags').innerHTML = state.filters[k].length
      ? state.filters[k].map((v) => `<span class="xc-tag"><span title="${esc(v)}">${esc(v.length > 26 ? `${v.slice(0, 25)}…` : v)}</span><button aria-label="Remove ${esc(v)}" data-remove="${esc(v)}" type="button"><i class="fas fa-times"></i></button></span>`).join('')
      : '<span class="xc-multi-empty">All</span>';
    const term = low(box.querySelector('.xc-multi-search').value);
    const shown = list.filter((o) => !term || low(o.value).includes(term));
    box.querySelector('.xc-multi-list').innerHTML = shown.length
      ? shown.map((o) => `<label class="xc-option"><input ${chosen.has(low(o.value)) ? 'checked' : ''} data-value="${esc(o.value)}" type="checkbox"/><span title="${esc(o.value)}">${esc(o.value.length > 44 ? `${o.value.slice(0, 43)}…` : o.value)}</span><em>${o.n}</em></label>`).join('')
      : '<div class="xc-multi-none">Nothing to choose</div>';
  }
  const closePanels = (except) => document.querySelectorAll('.rp-multi.open').forEach((m) => { if (m !== except) { m.classList.remove('open'); m.querySelector('.xc-multi-panel').hidden = true; m.querySelector('.xc-multi-box').setAttribute('aria-expanded', 'false'); } });

  /* ------------------------------ period bar (Weekly Report and Business Analysis) ------------------------------ */
  function renderPeriod() {
    const cfg = REPORTS[state.key], host = $('rpPeriod');
    if (!cfg.period) { host.innerHTML = ''; return; }
    const r = state.range;
    const mode = cfg.period === 'analysis'
      ? `<div class="xc-chips">${[['week', 'Weekly'], ['month', 'Monthly']].map(([v, l]) => `<button class="xc-chip${state.analysisMode === v ? ' active' : ''}" data-amode="${v}" type="button">${l}</button>`).join('')}</div>`
      : `<div class="xc-chips"><button class="xc-chip${state.customMode ? '' : ' active'}" data-wmode="week" type="button">Week</button><button class="xc-chip${state.customMode ? ' active' : ''}" data-wmode="custom" type="button">Custom range</button></div>`;
    const custom = state.customMode && cfg.period === 'week'
      ? `<div class="rp-range"><div class="form-group"><label for="rpCFrom">Completion date — from</label><input id="rpCFrom" type="date" value="${isoDay(r.start)}"/></div><div class="form-group"><label for="rpCTo">Completion date — to</label><input id="rpCTo" type="date" value="${isoDay(r.end)}"/></div></div>` : '';
    host.innerHTML = `<div class="rp-period">${mode}<div class="rp-nav"><button class="btn btn-secondary" data-nav="-1" type="button" aria-label="Previous"><i class="fas fa-chevron-left"></i></button><div class="rp-nav-label"><b>${esc(r.title)}</b><small>${esc(r.label)}</small></div><button class="btn btn-secondary" data-nav="1" type="button" aria-label="Next"><i class="fas fa-chevron-right"></i></button><button class="xc-link" data-nav="0" type="button">${r.kind === 'month' ? 'This month' : 'This week'}</button></div></div>${custom}`;
  }
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function moveRange(step) {
    state.page = 1;
    if (step === 0) state.range = state.range.kind === 'month' ? E.monthRange(new Date()) : E.weekRange(new Date());
    else state.range = E.shiftRange(state.range, step);
    render();
  }

  /* ------------------------------ drawing a model ------------------------------ */
  async function render() {
    const token = ++state.token, key = state.key;
    if (!key) return;
    let model;
    try {
      const f = state.filters;
      if (typeof AlishanSearch !== 'undefined') f.search = AlishanSearch.getTerm() || '';      // the page's quick search narrows every report
      if (key === 'weekly') model = E.weekly(f, state.range);
      else if (key === 'payments') model = E.payments(f);
      else if (key === 'pending') model = E.pending(f);
      else if (key === 'quality') model = E.quality(f);
      else if (key === 'valuation') model = E.valuation(f);
      else if (key === 'aging') model = E.aging(f, state.bucket);
      else if (key === 'history') model = await E.history(f);
      else model = E.analysis(f, state.analysisMode === 'month' ? (state.range.kind === 'month' ? state.range : E.monthRange(state.range.start)) : (state.range.kind === 'week' ? state.range : E.weekRange(state.range.start)));
    } catch (err) {
      console.error(`Report ${key} failed:`, err);
      $('rpSummary').innerHTML = `<div class="xc-empty">This report could not be built. ${esc(err.message || '')}</div>`;
      return;
    }
    if (token !== state.token) return;                       // a newer request replaced this one
    state.model = model;
    if (REPORTS[key].period === 'analysis') state.range = model.range;
    syncFilterBox(); renderPeriod();
    renderSummary(model); renderNotes(model); renderCompare(model); renderBuckets(model); renderTable(model);
    renderCharts(model, token);
    // the old sections (pending cards, amount history, valuation tab, aging cards) follow the same filters
    try { if (typeof refreshAllReports === 'function') refreshAllReports(true); placeExisting(key); } catch (e) { console.error('Report sections failed', e); }
    $('rpExport').disabled = false;
    $('rpExport').title = 'Open this report in the Export Center';
  }

  function renderSummary(m) {
    $('rpSummary').innerHTML = `<div class="rp-tiles">${m.summary.map((t) => `<div class="rp-tile"><small>${esc(t.label)}</small><b>${esc(fmt(t.kind, t.value))}</b>${t.hint ? `<span>${esc(t.hint)}</span>` : ''}</div>`).join('')}</div>`;
  }
  function renderNotes(m) {
    const link = m.noDateCount ? `<p class="rp-note"><i class="fas fa-calendar-check"></i> ${num(m.noDateCount)} Complete ${m.noDateCount === 1 ? 'quality has' : 'qualities have'} no completion date. <a href="missing-completion.html">Add the missing dates</a></p>` : '';
    $('rpNotes').innerHTML = (m.notes || []).map((n) => `<p class="rp-note"><i class="fas fa-info-circle"></i> ${esc(n)}</p>`).join('') + link;
  }
  function renderCompare(m) {
    const host = $('rpCompare');
    if (!m.compare) { host.innerHTML = ''; return; }
    const items = m.compare.map((c) => {
      const up = c.change > 0, down = c.change < 0;
      return `<div class="rp-cmp-item"><b>${esc(c.label)}</b><div class="rp-cmp-cols"><div><small>${esc(m.compareLabel.current)}</small><span>${esc(fmt(c.kind, c.current))}</span></div><div><small>${esc(m.compareLabel.previous)}</small><span>${esc(fmt(c.kind, c.previous))}</span></div><div><small>Change</small><span class="rp-${up ? 'up' : down ? 'down' : 'flat'}">${up ? '▲' : down ? '▼' : '•'} ${esc(fmt(c.kind, Math.abs(c.change)))}${c.percent === null ? '' : ` (${c.percent > 0 ? '+' : ''}${num(c.percent)}%)`}</span></div></div></div>`;
    }).join('');
    host.innerHTML = `<section class="rp-section"><h3><i class="fas fa-code-compare"></i> Compared with the previous ${m.range.kind === 'month' ? 'month' : (m.range.kind === 'week' ? 'week' : 'period')}</h3><div class="rp-cmp">${items}</div></section>`;
  }
  function renderBuckets(m) {
    const host = $('rpBuckets');
    if (m.key !== 'aging') { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="rp-buckets">${m.buckets.map((b) => `<button class="rp-bucket rp-b-${b.key}${m.level === b.key ? ' active' : ''}" data-bucket="${b.key}" type="button"><b>${esc(b.title)}</b><strong>${num(b.count)} ${b.count === 1 ? 'entry' : 'entries'}</strong><em>${esc(C.fmtMoney(b.value))}</em></button>`).join('')}${m.level ? '<button class="xc-link" data-bucket="" type="button">Show all groups</button>' : ''}</div>`;
  }

  /* ------------------------------ table ------------------------------ */
  function sortedRows(m) {
    const rows = m.rows.slice();
    const dateKey = state.key === 'payments' ? 'date' : state.key === 'history' ? 'at' : state.key === 'weekly' || state.key === 'analysis' ? 'completedAt' : 'entry';
    const amountKey = state.key === 'pending' ? 'pending' : state.key === 'payments' ? 'amount' : 'amount';
    const qualityKey = 'quality';
    const dateValue = (r) => r[dateKey] instanceof Date ? r[dateKey].getTime() : (r[dateKey] ? new Date(r[dateKey]).getTime() || 0 : 0);
    if (state.sort === 'oldest') return rows.sort((a,b) => dateValue(a)-dateValue(b));
    if (state.sort === 'quality-asc') return rows.sort((a,b) => low(a[qualityKey]).localeCompare(low(b[qualityKey])));
    if (state.sort === 'quality-desc') return rows.sort((a,b) => low(b[qualityKey]).localeCompare(low(a[qualityKey])));
    if (state.sort === 'amount-desc') return rows.sort((a,b) => (Number(b[amountKey])||0)-(Number(a[amountKey])||0));
    if (state.sort === 'amount-asc') return rows.sort((a,b) => (Number(a[amountKey])||0)-(Number(b[amountKey])||0));
    return rows.sort((a,b) => dateValue(b)-dateValue(a));
  }
  function itemIdOf(r) { return r.itemId || (r.item && r.item.id !== undefined ? String(r.item.id) : (r.id !== undefined ? String(r.id) : '')); }
  function resultFields(r) {
    const field = (label, kind, value) => ({ label, kind: kind || 'text', value });
    const date = state.key === 'payments' ? r.date : state.key === 'history' ? r.at : (state.key === 'weekly' || state.key === 'analysis' ? r.completedAt : r.entry);
    if (state.key === 'weekly') return [field('Amount','money',r.amount),field('Total Dozen','qty',r.dozens),field('Completion Date','date',date),field('Status','text',r.status)];
    if (state.key === 'pending') return [field('Lot Number','text',r.lot),field('Pending Amount','money',r.pending),field('Total Dozen','qty',r.dozens),field('Completion Date','date',r.completedAt)];
    if (state.key === 'payments') return [field('Received Amount','money',r.amount),field('Payment Date','date',r.date),field('Total Dozen','qty',r.row && r.row.dozens),field('Lot Number','text',r.lot)];
    if (state.key === 'history') return r.previousValue || r.newValue ? [field('Change Type','text',r.event || r.source),field('Date','datetime',r.at),field('Previous Value','text',r.previousValue),field('New Value','text',r.newValue)] : [field('Change Type','text',r.event || r.source),field('Date','datetime',r.at),field('Source','text',r.source),field('Details','text',r.details)];
    if (state.key === 'valuation') return [field('Quality Value','money',r.amount),field('Total Dozen','qty',r.dozens),field('Lot Number','text',r.lot),field('Status','text',r.status)];
    if (state.key === 'aging') return [field('Lot Number','text',r.lot),field('Aging Days','days',r.days),field('Stock Group','text',r.bucketTitle),field('Total Dozen','qty',r.dozens)];
    if (state.key === 'analysis') return [field('Amount','money',r.amount),field('Total Dozen','qty',r.dozens),field('Completion Date','date',r.completedAt),field('Pending Amount','money',r.pending)];
    return [field('Total Dozen','qty',r.dozens),field('Total Colours','int',Array.isArray(r.colours) ? r.colours.length : undefined),field('Entry Date','date',r.entry),field('Status','text',r.status)];
  }
  function renderTable(m) {
    const host = $('rpTable'), rows = sortedRows(m);
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(totalPages, Math.max(1, state.page));
    const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    const cards = pageRows.map((r, index) => {
      const id = itemIdOf(r), rowIndex = (state.page - 1) * state.pageSize + index, title = r.quality || r.event || r.source || 'Report Record';
      const fields = resultFields(r).filter((f) => f.value !== undefined && f.value !== null && f.value !== '');
      const data = `${id ? `data-open="${esc(id)}"` : ''} data-row-index="${rowIndex}"`;
      return `<button type="button" class="rp-result-card" ${data}><span class="rp-result-title">${esc(title)}</span><span class="rp-result-fields">${fields.map((f) => `<span class="rp-result-field"><small>${esc(f.label)}</small><b>${esc(f.kind === 'qty' ? C.fmtDozens(f.value) : fmt(f.kind,f.value))}</b></span>`).join('')}</span></button>`;
    }).join('');
    const sortOptions = [['latest','Latest First'],['oldest','Oldest First'],['quality-asc','Quality A–Z'],['quality-desc','Quality Z–A']];
    if (state.key !== 'history') sortOptions.push(['amount-desc','Amount: High to Low'],['amount-asc','Amount: Low to High']);
    host.innerHTML = `<section class="rp-section"><div class="rp-section-head"><h3><i class="fas fa-list"></i> Results</h3><span class="rp-count">${num(rows.length)} ${rows.length === 1 ? 'record' : 'records'}</span><select id="rpSortSelect" class="rp-sort-select" aria-label="Sort results">${sortOptions.map(([v,l])=>`<option value="${v}" ${state.sort===v?'selected':''}>${l}</option>`).join('')}</select></div>${rows.length ? `<div class="rp-result-grid">${cards}</div>` : '<div class="xc-empty">No matching records were found.</div>'}</section>`;
    state.paging[state.key] = { page: state.page, pageSize: state.pageSize };
    const pagination = $('rpPagination');
    if (pagination && window.CommonPagination) CommonPagination.render(pagination, {
      page: state.page, pageSize: state.pageSize, total: rows.length,
      onPageChange: (page) => { state.page = page; renderTable(state.model); },
      onPageSizeChange: (size) => { state.pageSize = size; state.page = 1; renderTable(state.model); }
    });
  }

  /* ------------------------------ charts (Chart.js, loaded only when needed) ------------------------------ */
  function destroyCharts() { state.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* already gone */ } }); state.charts = []; }
  async function renderCharts(m, token) {
    destroyCharts();
    const host = $('rpCharts');
    host.innerHTML = m.charts.map((c, i) => `<section class="rp-chart"><h4>${esc(c.title)}</h4><div class="rp-chart-box">${c.labels.length ? `<canvas id="rpChart${i}"></canvas>` : '<div class="xc-empty">No data for this chart.</div>'}</div></section>`).join('');
    if (!m.charts.some((c) => c.labels.length)) return;
    try { await AlishanLoader.chart(); } catch (e) { host.innerHTML = '<p class="rp-note"><i class="fas fa-exclamation-triangle"></i> Charts could not be loaded (no internet and no local chart library). The summary and the table are complete.</p>'; return; }
    if (token !== state.token) return;
    const css = getComputedStyle(document.body);
    const text = (css.getPropertyValue('--dark') || '#222').trim(), grid = (css.getPropertyValue('--light-gray') || '#ddd').trim();
    m.charts.forEach((c, i) => {
      const canvas = $(`rpChart${i}`); if (!canvas) return;
      const round = c.kind === 'doughnut';
      const datasets = c.series.map((s, k) => ({
        label: s.label, data: s.data, borderWidth: round ? 1 : 2, tension: .25,
        backgroundColor: round ? s.data.map((_, j) => PALETTE[j % PALETTE.length]) : (c.kind === 'line' ? `${PALETTE[k % PALETTE.length]}33` : PALETTE[k % PALETTE.length]),
        borderColor: round ? (css.getPropertyValue('--white') || '#fff').trim() : PALETTE[k % PALETTE.length], fill: false
      }));
      const money = c.series.some((s) => s.money);
      const chartObj = new Chart(canvas, {
        type: c.kind, data: { labels: c.labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: round || c.series.length > 1, labels: { color: text } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${money ? C.fmtMoney(ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed) : num(ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed)}` } }
          },
          scales: round ? {} : { x: { ticks: { color: text, maxRotation: 60 }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } } },
          onClick: (evt, els) => {
            if (!els.length) return;
            const idx = els[0].index;
            if (c.bucketKeys) { state.bucket = c.bucketKeys[idx]; state.page = 1; render(); return; }          // a chart bar opens its list
            if (c.filterKey && state.filters[c.filterKey] !== undefined && REPORTS[state.key].filters.includes(c.filterKey)) {
              const v = c.labels[idx];
              if (!state.filters[c.filterKey].some((x) => low(x) === low(v))) state.filters[c.filterKey] = [...state.filters[c.filterKey], v];
              state.page = 1; render();
            }
          }
        }
      });
      state.charts.push(chartObj);
    });
  }

  /* ------------------------------ read-only quality window ------------------------------ */
  function openDetail(itemId, reportRow) {
    const item = itemId ? AlishanStore.getItem(itemId) : null;
    if (!item && !reportRow) { notify('This report record is no longer available.', 'error'); return; }
    let modal = $('rpDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rpDetailModal'; modal.className = 'rp-modal'; modal.hidden = true;
      modal.innerHTML = '<section class="rp-modal-card" role="dialog" aria-modal="true" aria-labelledby="rpDetailTitle"><div class="rp-modal-head"><h3 id="rpDetailTitle"></h3><button aria-label="Close" class="xc-close" id="rpDetailClose" type="button"><i class="fas fa-times"></i></button></div><div id="rpDetailBody"></div></section>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('#rpDetailClose')) modal.hidden = true; });
    }
    $('rpDetailTitle').textContent = item ? `${item.quality || 'Quality'} · ${item.code || ''}` : `${reportRow.quality || reportRow.event || reportRow.source || 'Report Details'}`;
    const body = $('rpDetailBody'); body.innerHTML = '';
    const totals = item ? C.itemTotals(item) : null, pay = item ? AlishanStore.itemPayment(item) : null, completion = item ? (C.completionInfo(item) || { hasDate:false }) : { hasDate:false };
    const paymentRows = item ? (AlishanStore.getPayments() || []).filter((p) => String(p.inventoryId) === String(item.id)) : [];
    const sizeSets = !item ? [] : item.sizeOption === 'different' ? (item.colors || []).map((c) => ({ name: c && (c.name || c.color || c.colour) || 'Colour', sizes: c && c.sizes || {} })) : [{ name: 'All colours', sizes: item }];
    const sizeLines = sizeSets.map((set) => {
      const values = [];
      Object.keys(set.sizes || {}).filter((k) => /^size\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4))).forEach((k) => {
        const d = Number(set.sizes[k]) || 0, pcs = Number(set.sizes[`${k}_pieces`]) || 0;
        if (d || pcs) values.push(`${k.slice(4)}: ${C.fmtDozens(d + pcs / 12)}`);
      });
      return values.length ? `${set.name}: ${values.join(' · ')}` : '';
    }).filter(Boolean).join(' | ');
    const entries = item ? [
      ['Quality ID', item.code || item.id], ['Quality Type', item.productType], ['Cup', item.cupSize], ['Lot Number', item.lotNumber],
      ['Colours', (item.colors || []).map((c) => typeof c === 'string' ? c : C.colorName(c)).filter(Boolean).join(', ')],
      ['Size & Quantity', sizeLines], ['Total Dozen', C.fmtDozens(totals.dozens)], ['Weight', item.weight], ['Meter', item.material],
      ['Price', C.fmtMoney(C.itemPrice(item))], ['Quality Value', C.fmtMoney(totals.amount)], ['Received Amount', C.fmtMoney(pay.received)], ['Pending Amount', C.fmtMoney(pay.pending)],
      ['Entry Date', C.fmtDateLong(item.addedDateTime || item.dateTime)], ['Completion Date', completion.hasDate ? C.fmtDateLong(completion.date) : '—'],
      ['Status', item.inStock === false ? 'Complete' : 'Incomplete'], ['Notes', item.notes], ['Maal Gaya', item.maalGaya || item.maalGayaTo],
      ['Last Modified', item.lastModified ? C.fmtDateTime(item.lastModified) : ''], ['Import Batch', item.importBatch], ['Entry Source', item.source], ['Manual Entry', item.isManualEntry ? 'Yes' : 'No'],
      ['Payment History', paymentRows.length ? paymentRows.map((p) => `${C.fmtDate(p.date)} — ${C.fmtMoney(p.amount)}${p.notes ? ` (${p.notes})` : ''}`).join(' | ') : 'No payment entries']
    ].filter(([,v]) => v !== undefined && v !== null && v !== '') : [];
    const reportDetails = reportRow && state.key === 'history' ? [['History Event', reportRow.event], ['History Source', reportRow.source], ['Event Date', C.fmtDateTime(reportRow.at)], ['Previous Value', reportRow.previousValue], ['New Value', reportRow.newValue], ['Change Details', reportRow.details]] : reportRow && state.key === 'payments' ? [['Payment Date', C.fmtDate(reportRow.date)], ['This Payment', C.fmtMoney(reportRow.amount)], ['Payment Notes', reportRow.notes || '—']] : [];
    body.innerHTML = `<div class="rp-detail-grid">${entries.concat(reportDetails).filter(([,value]) => value !== undefined && value !== null && value !== '').map(([label,value]) => `<div class="rp-detail-field"><small>${esc(label)}</small><span>${esc(value)}</span></div>`).join('')}</div>`;
    modal.hidden = false;
  }

  /* ------------------------------ export: Export Center first, Excel for what it cannot express ------------------------------ */
  function exportCenter() {
    const preset = E.exportPreset(state.key, state.filters, state.model && state.model.range);
    if (!preset) { notify('This report cannot be opened in the Export Center.', 'info'); return; }
    if (preset.ignoresAmount) notify('The amount range does not apply to this data set in the Export Center.', 'info');
    try { sessionStorage.setItem('alishanExportPreset', JSON.stringify(preset)); } catch (e) { notify('Could not hand the report over to the Export Center.', 'error'); return; }
    location.href = 'index.html';
  }
  async function excel() {
    const m = state.model; if (!m) return;
    try { await AlishanLoader.xlsx(); } catch (e) { notify(e.message || 'The Excel library could not be loaded.', 'error'); return; }
    const raw = (kind, v) => (v instanceof Date ? (isNaN(v) ? '' : (kind === 'datetime' ? C.fmtDateTime(v) : C.fmtDate(v))) : (v === undefined || v === null ? '' : v));
    const rows = sortedRows(m).map((r) => Object.fromEntries(m.columns.map((c) => [c.label, raw(c.kind, r[c.key])])));
    if (!rows.length) { notify('There are no records to export.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    const summary = [[REPORTS[state.key].title], ['Created', new Date().toLocaleString('en-IN')], ...(state.range && REPORTS[state.key].period ? [['Period', `${state.range.title} (${state.range.label})`]] : []), [], ...m.summary.map((t) => [t.label, fmt(t.kind, t.value)])];
    if (m.compare) { summary.push([], ['Measure', m.compareLabel.current, m.compareLabel.previous, 'Change']); m.compare.forEach((c) => summary.push([c.label, fmt(c.kind, c.current), fmt(c.kind, c.previous), fmt(c.kind, c.change)])); }
    XLSX.utils.book_append_sheet(wb, AlishanLoader.fitColumns(XLSX.utils.aoa_to_sheet(summary)), 'Summary');
    XLSX.utils.book_append_sheet(wb, AlishanLoader.fitColumns(XLSX.utils.json_to_sheet(rows)), 'Details');
    const d = new Date();
    AlishanLoader.saveWorkbook(wb, `ALISHAN_${REPORTS[state.key].title.replace(/\s+/g, '_')}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.xlsx`);
    notify('Excel file created.', 'success');
  }

  /* ------------------------------ events ------------------------------ */
  function bind() {
    $('reportHome').addEventListener('click', (e) => { const c = e.target.closest('[data-report]'); if (c) { if (location.hash !== `#${c.dataset.report}`) location.hash = c.dataset.report; else openView(c.dataset.report); } });
    $('rpBackToReports').addEventListener('click', () => { if (location.hash) location.hash = ''; else showHome(); });
    $('rpExport').addEventListener('click', exportCenter);
    $('rpExcel').addEventListener('click', excel);
    window.addEventListener('hashchange', route);
    document.addEventListener('click', (e) => { if (state.key && !e.target.closest('.rp-multi')) closePanels(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = $('rpDetailModal'); if (modal && !modal.hidden) { modal.hidden = true; return; }
      if (document.querySelector('.rp-multi.open')) closePanels();
    });
    const view = $('reportView');
    view.addEventListener('click', (e) => {
      const t = e.target, f = state.filters;
      const resultCard = t.closest('.rp-result-card'); if (resultCard) { const row = state.model ? sortedRows(state.model)[Number(resultCard.dataset.rowIndex)] : null; if (row) openDetail(resultCard.dataset.open || '', row); return; }
      const bucket = t.closest('[data-bucket]'); if (bucket) { state.bucket = bucket.dataset.bucket; state.page = 1; render(); return; }
      const nav = t.closest('[data-nav]'); if (nav) { moveRange(Number(nav.dataset.nav)); return; }
      const amode = t.closest('[data-amode]'); if (amode) { state.analysisMode = amode.dataset.amode; state.range = amode.dataset.amode === 'month' ? E.monthRange(new Date()) : E.weekRange(new Date()); render(); return; }
      const wmode = t.closest('[data-wmode]'); if (wmode) { state.customMode = wmode.dataset.wmode === 'custom'; if (!state.customMode) state.range = E.weekRange(new Date()); render(); return; }
      const status = t.closest('[data-status]'); if (status) { f.status = status.dataset.status; state.page = 1; render(); return; }
      if (t.closest('#rpClear')) { state.filters = E.freshFilters(); state.bucket = ''; state.page = 1; document.querySelectorAll('.rp-multi .xc-multi-search').forEach((i) => { i.value = ''; }); render(); return; }
      const multi = t.closest('.rp-multi');
      if (multi) {
        const k = multi.dataset.key;
        const remove = t.closest('[data-remove]'); if (remove) { f[k] = f[k].filter((v) => v !== remove.dataset.remove); state.page = 1; render(); return; }
        const act = t.closest('[data-act]');
        if (act) {
          if (act.dataset.act === 'none') f[k] = [];
          else f[k] = [...new Set([...f[k], ...[...multi.querySelectorAll('.xc-option input')].map((i) => i.dataset.value)])];
          state.page = 1; render(); return;
        }
        if (t.closest('.xc-multi-box')) {
          const was = multi.classList.contains('open'); closePanels(multi);
          multi.classList.toggle('open', !was); multi.querySelector('.xc-multi-panel').hidden = was; multi.querySelector('.xc-multi-box').setAttribute('aria-expanded', String(!was));
          if (!was) multi.querySelector('.xc-multi-search').focus();
        }
      }
    });
    
    view.addEventListener('change', (e) => {
      const t = e.target, f = state.filters;
      if (t.id === 'rpSortSelect') { state.sort = t.value; state.page = 1; renderTable(state.model); return; }
      if (t.matches('.xc-option input')) {
        const k = t.closest('.rp-multi').dataset.key, v = t.dataset.value;
        f[k] = t.checked ? [...new Set([...f[k], v])] : f[k].filter((x) => x !== v); state.page = 1; render();
      } else if (t.id === 'rpFrom' || t.id === 'rpTo') { f.from = $('rpFrom').value; f.to = $('rpTo').value; state.page = 1; render(); }
      else if (t.id === 'rpMin' || t.id === 'rpMax') { f.min = $('rpMin').value; f.max = $('rpMax').value; state.page = 1; render(); }
      else if (t.id === 'rpCFrom' || t.id === 'rpCTo') {
        const r = E.customRange($('rpCFrom').value, $('rpCTo').value);
        if (r) { state.range = r; state.page = 1; render(); } else notify('Choose a valid from and to date.', 'error');
      }
    });
    view.addEventListener('input', (e) => { if (e.target.matches('.xc-multi-search')) renderMulti(e.target.closest('.rp-multi').dataset.key, E.filterOptions(state.filters)); });
  }

  /* ------------------------------ start / data changes ------------------------------ */
  function init() {
    if (!$('reportHome') || !$('reportView')) return;
    bind(); renderHome(); route();
  }
  // the store changed (a payment was added, a quality completed ...): redraw what is open
  function onDataChanged() {
    if (state.key) render(); else renderHome();
  }
  function onSearchChanged() {
    state.page = 1;
    if (state.key) render(); else renderHome();
  }

  return { init, onDataChanged, onSearchChanged, scopeItems, currentExisting, paymentInRange, openDetail, state: () => state };
})();

if (typeof window !== 'undefined') window.ReportViews = ReportViews;
