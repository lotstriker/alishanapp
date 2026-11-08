/* Export Center — AlishanApp
 * Read-only export paths. ZIP restore validates the archive before calling the
 * store's existing importBackup flow (which takes a pre-restore safety backup).
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  let opened = false;

  function notify(message, type = 'info') {
    if (typeof window.showNotification === 'function') window.showNotification(message, type);
    else if (window.settingsManager && typeof window.settingsManager.showToast === 'function') window.settingsManager.showToast(message, type);
    else alert(message);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i=0;i<bytes.length;i++) {
      crc ^= bytes[i];
      for (let j=0;j<8;j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  function dosDateTime(date = new Date()) {
    return { time: (date.getHours()<<11) | (date.getMinutes()<<5) | Math.floor(date.getSeconds()/2),
      date: ((date.getFullYear()-1980)<<9) | ((date.getMonth()+1)<<5) | date.getDate() };
  }
  function makeStoredZip(files) {
    const locals=[], centrals=[]; let offset=0;
    for (const [name, value] of Object.entries(files)) {
      const filename=enc.encode(name), data=typeof value==='string'?enc.encode(value):value;
      const crc=crc32(data), dt=dosDateTime();
      const local=new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dt.time), ...u16(dt.date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(filename.length), ...u16(0),
        ...filename, ...data
      ]);
      const central=new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dt.time), ...u16(dt.date),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(filename.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...filename
      ]);
      locals.push(local); centrals.push(central); offset += local.length;
    }
    const centralSize=centrals.reduce((n,x)=>n+x.length,0), count=centrals.length;
    const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(count),...u16(count),...u32(centralSize),...u32(offset),...u16(0)]);
    return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }
  function parseStoredZip(buffer) {
    const bytes=new Uint8Array(buffer), view=new DataView(buffer), files={}; let p=0;
    while (p+4<=bytes.length && view.getUint32(p,true)===0x04034b50) {
      if (p+30>bytes.length) throw new Error('ZIP local header is incomplete.');
      const method=view.getUint16(p+8,true), expectedCrc=view.getUint32(p+14,true);
      const size=view.getUint32(p+18,true), nameLen=view.getUint16(p+26,true), extraLen=view.getUint16(p+28,true);
      if (method!==0) throw new Error('This ZIP uses compression not supported by this restore reader. Use an Alishan ZIP backup created by this Export Center.');
      const name= new TextDecoder().decode(bytes.slice(p+30,p+30+nameLen));
      const start=p+30+nameLen+extraLen, end=start+size;
      if (end>bytes.length) throw new Error('ZIP file entry is incomplete.');
      const data=bytes.slice(start,end);
      if (crc32(data)!==expectedCrc) throw new Error(`Checksum validation failed for ${name}.`);
      files[name]=data; p=end;
    }
    if (!files['manifest.json'] || !files['data.json']) throw new Error('Required manifest.json or data.json is missing.');
    return files;
  }

  /* ---------- complete ZIP backup and ZIP restore (unchanged from v73) ---------- */
  async function completeBackup() {
    await AlishanDB.init(); await AlishanStore.init();
    const backup=AlishanStore.backupFile('COMPLETE_BACKUP');
    const settingRows=await AlishanDB.getAll('settings');
    const extra={
      qualityHistory:await AlishanDB.getQualityHistory(),
      activityLog:await AlishanDB.getRecentActivity(1000),
      settings:Object.fromEntries((settingRows||[]).filter(row=>row.key!=='fullRestoreSafetyBackups').map(row=>[row.key,row.value]))
    };
    const data={backup,extra};
    const dataText=JSON.stringify(data);
    const dataBytes=enc.encode(dataText);
    const manifest={
      application:'ALISHAN_INVENTORY',
      formatVersion:1,
      createdAt:new Date().toISOString(),
      contents:['data.json'],
      files:{'data.json':{size:dataBytes.length,crc32:crc32(dataBytes).toString(16).padStart(8,'0')}},
      counts:{inventory:backup.inventory.length,payments:backup.payments.length,qualityHistory:extra.qualityHistory.length,activityLog:extra.activityLog.length,settings:Object.keys(extra.settings).length}
    };
    return makeStoredZip({'manifest.json':JSON.stringify(manifest,null,2),'data.json':dataText});
  }
  async function restoreZip() {
    const file=$('restoreAlishanZip')?.files?.[0];
    if (!file) { notify('Choose an Alishan ZIP backup first.','error'); return; }
    const btn=$('restoreAlishanZipButton'); btn.disabled=true;
    try {
      const files=parseStoredZip(await file.arrayBuffer());
      const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
      const dataBytes=files['data.json'];
      const fileMeta=manifest.files?.['data.json'];
      const expected=fileMeta?.crc32;
      if (!expected || (Number.isFinite(Number(fileMeta.size)) && Number(fileMeta.size)!==dataBytes.length) || crc32(dataBytes).toString(16).padStart(8,'0')!==String(expected).toLowerCase()) throw new Error('Manifest size or checksum does not match data.json.');
      const payload=JSON.parse(new TextDecoder().decode(dataBytes));
      if (manifest.application!=='ALISHAN_INVENTORY' || !payload.backup || !Array.isArray(payload.backup.inventory) || !Array.isArray(payload.backup.payments)) throw new Error('This is not a valid Alishan complete backup.');
      await AlishanDB.init(); await AlishanStore.init();
      const inspection=AlishanStore.inspectBackup(payload.backup);
      if (!inspection.ok) throw new Error(inspection.error||'Backup validation failed.');
      const summary=`This backup contains ${inspection.valid} valid quality records and ${payload.backup.payments.length} payment records. A safety backup of current data will be made before restore. Continue?`;
      if (!confirm(summary)) return;
      const currentSettings=await AlishanDB.getAll('settings');
      const currentExtra={
        qualityHistory:await AlishanDB.getQualityHistory(),
        activityLog:await AlishanDB.getRecentActivity(1000),
        settings:Object.fromEntries((currentSettings||[]).filter(row=>row.key!=='fullRestoreSafetyBackups').map(row=>[row.key,row.value]))
      };
      const safetyRecord={
        createdAt:new Date().toISOString(),
        backup:AlishanStore.backupFile('PRE_RESTORE_COMPLETE'),
        extra:currentExtra
      };
      const safetyHistory=(await AlishanDB.getSetting('fullRestoreSafetyBackups',[]))||[];
      await AlishanDB.setSetting('fullRestoreSafetyBackups',[...safetyHistory,safetyRecord].slice(-3));
      const result=await AlishanStore.importBackup(payload.backup,'replace');
      if (!result.ok) throw new Error(result.error||'Restore failed.');
      if (Array.isArray(payload.extra?.qualityHistory)) await AlishanDB.putAll('auditLog',payload.extra.qualityHistory);
      if (Array.isArray(payload.extra?.activityLog)) await AlishanDB.putAll('editHistory',payload.extra.activityLog);
      if (payload.extra?.settings && typeof payload.extra.settings==='object') {
        const restoredSettings=payload.extra.settings;
        const existingRows=await AlishanDB.getAll('settings');
        for (const row of existingRows||[]) {
          if (row.key!=='fullRestoreSafetyBackups' && !Object.prototype.hasOwnProperty.call(restoredSettings,row.key)) await AlishanDB.removeSetting(row.key);
        }
        for (const [key,value] of Object.entries(restoredSettings)) await AlishanDB.setSetting(key,value);
      }
      notify(`Restore complete. ${result.imported} quality records restored. Reloading the app…`,'success');
      setTimeout(()=>location.reload(),700);
    } catch(e) {
      console.error('ZIP restore failed:',e); notify(e.message||'Could not restore this ZIP backup.','error');
    } finally { btn.disabled=false; }
  }

  /* ====================================================================================================
   * Export Center (Home > Quick Actions > Export Data)
   * - READ-ONLY for quality and payment records. Only ZIP restore changes data (after a safety backup).
   * - Rules (what matches a filter, size rows, totals, old-history correction) live in calc.js / store.js.
   * - This file only: shows the screen, collects what the user chose, and makes the downloads.
   * ==================================================================================================== */

  const SETTING_PRESETS = 'exportPresets';
  const SETTING_HISTORY = 'exportHistory';
  const BULKY_SETTINGS = ['fullRestoreSafetyBackups', 'businessLogo', 'autoBackups', 'backups', 'corruptedItemsBackup', 'exportPresets', 'exportHistory'];

  const FILTER_FIELDS = [
    { key: 'types', label: 'Quality Type' },
    { key: 'qualities', label: 'Quality Name' },
    { key: 'ids', label: 'Quality ID' },
    { key: 'lots', label: 'Lot Number' },
    { key: 'colours', label: 'Colour' },
    { key: 'cups', label: 'Cup' },
    { key: 'maals', label: 'Maal Gaya' },
    { key: 'notes', label: 'Notes' }
  ];
  const DATE_PRESETS = [['all', 'All dates'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']];
  const STATUS_CHOICES = [['', 'All'], ['In Stock', 'In Stock'], ['Out of Stock', 'Out of Stock']];
  const PAYMENT_CHOICES = [['', 'All'], ['Pending', 'Pending'], ['Partially Received', 'Partially Received'], ['Received', 'Received']];
  const FORMATS = [
    { id: 'excel', icon: 'fa-file-excel', title: 'Excel workbook', note: 'One sheet for each data set, plus a summary' },
    { id: 'csv', icon: 'fa-file-csv', title: 'CSV', note: 'One file for each data set (several are packed in a ZIP)' },
    { id: 'pdf', icon: 'fa-file-pdf', title: 'PDF report', note: 'Print-ready tables, use “Save as PDF”' },
    { id: 'json', icon: 'fa-file-code', title: 'JSON', note: 'Structured data for other programs' },
    { id: 'zip', icon: 'fa-file-zipper', title: 'Complete backup (ZIP)', note: 'Everything, can be restored later' }
  ];

  const esc = (value) => String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const low = (value) => String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  const toSet = (list) => new Set((list || []).map(low));
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fmtDateTime = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN'); };
  const fmtDay = (value) => { const d = AlishanStore.exportParseDate(value); return d ? d.toLocaleDateString('en-IN') : '—'; };
  const fmtNumber = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

  const freshFilters = () => ({ types: [], qualities: [], ids: [], lots: [], colours: [], cups: [], maals: [], notes: [], status: '', payment: '', preset: 'all', from: '', to: '', completedFrom: '', completedTo: '', min: '', max: '', search: '' });

  const state = {
    tab: 'export',
    datasets: new Set(['inventory', 'received', 'pending']),
    filters: freshFilters(),
    format: 'excel',
    hidden: {},               // { sheet name: Set of hidden column names }
    previewSheet: '',
    presets: [],
    history: []
  };
  const cache = { history: [], activity: [], settings: [], backups: [] };   // read once when the dialog opens
  let sheetsNow = [];
  let refreshTimer = 0;

  /* ------------------------------ the data sets that can be exported ------------------------------ */
  const matchesSearch = (row, query) => !low(query) || JSON.stringify(row).toLowerCase().includes(low(query));

  const DATASETS = [
    { id: 'inventory', group: 'Stock', icon: 'fa-boxes', title: 'Quality Inventory', sheet: 'Quality Inventory',
      note: 'Every quality entry with quantity, value and status', applies: 'All filters and the date of the entry apply.', amountKey: 'Total Amount (₹)',
      rows: (c) => AlishanStore.exportRows('inventory', c.scopeDate).map((row, i) => ({ ...row, 'Maal Gaya': c.scopeDate[i].maalGaya || c.scopeDate[i].maalGayaTo || '' })) },
    { id: 'sizes', group: 'Stock', icon: 'fa-th-large', title: 'Size-wise Detail', sheet: 'Size-wise Detail',
      note: 'One row for every quality, colour and size', applies: 'All filters and the date of the entry apply.',
      rows: (c) => AlishanStore.exportSizeRows(c.scopeDate) },
    { id: 'valuation', group: 'Stock', icon: 'fa-chart-bar', title: 'Inventory Valuation', sheet: 'Inventory Valuation',
      note: 'Quantity and value of every quality', applies: 'All filters and the date of the entry apply.',
      rows: (c) => AlishanStore.exportRows('valuation', c.scopeDate) },
    { id: 'aging', group: 'Stock', icon: 'fa-hourglass-half', title: 'Stock Aging', sheet: 'Stock Aging',
      note: 'How long each quality has been in stock', applies: 'All filters and the date of the entry apply.', amountKey: 'Value (₹)',
      rows: (c) => AlishanStore.exportRows('aging', c.scopeDate) },
    { id: 'completed', group: 'Stock', icon: 'fa-calendar-check', title: 'Completed Work', sheet: 'Completed Work', amountKey: 'Total Amount (₹)',
      note: 'Qualities by the day the goods went (Weekly Report work)', applies: 'Quality filters, the completion date range and the amount range apply. Only qualities with a completion date are listed.',
      rows: (c) => c.scopeAll
        .map((item) => ({ item, info: AlishanCalc.completionInfo(item) })).filter((x) => x.info && x.info.hasDate)
        .sort((a, b) => b.info.date - a.info.date)
        .map(({ item, info }) => { const pay = AlishanStore.itemPayment(item); return {
          'Completion Date': AlishanCalc.fmtDate(info.date), 'Quality': item.quality || '', 'Quality ID': item.code || 'N/A', 'Product Type': item.productType || '', 'Lot Number': item.lotNumber || 'N/A',
          'Quantity (Dozens)': AlishanCalc.itemDozens(item), 'Total Amount (₹)': AlishanCalc.itemAmount(item), 'Received Amount (₹)': pay.received, 'Pending Amount (₹)': pay.pending, 'Status': 'Complete' }; }) },
    { id: 'received', group: 'Payments', icon: 'fa-money-bill-wave', title: 'Received Payments', sheet: 'Received Payments',
      note: 'Every amount received, with the quality it belongs to', applies: 'Quality filters apply. The date range is the date the amount was received.', amountKey: 'Amount Received (₹)',
      rows: (c) => AlishanStore.exportRows('history', c.scopeAll).filter((row) => AlishanStore.exportInRange(row['Date Received'], c.f.from, c.f.to)) },
    { id: 'pending', group: 'Payments', icon: 'fa-wallet', title: 'Pending Amount', sheet: 'Pending Amount',
      note: 'Expected, received and pending amount of each quality', applies: 'All filters and the date of the entry apply.', amountKey: 'Pending Amount (₹)',
      rows: (c) => AlishanStore.exportRows('pending', c.scopeDate) },
    { id: 'weekly', group: 'Payments', icon: 'fa-calendar-week', title: 'Weekly Payments', sheet: 'Weekly Payments', noTotals: true,
      note: 'Amounts received, week by week', applies: 'Quality filters apply. The date range does not apply to this data set.',
      rows: (c) => AlishanStore.exportRows('weekly', c.scopeAll) },
    { id: 'history', group: 'Records', icon: 'fa-clock-rotate-left', title: 'Quality History', sheet: 'Quality History', noTotals: true,
      note: 'Recorded changes of your qualities', applies: 'Quality Type, Quality Name, Quality ID, date and search apply.',
      rows: (c) => {
        const types = toSet(c.f.types), names = toSet(c.f.qualities), ids = toSet(c.f.ids);
        return cache.history.map(AlishanStore.normalizeQualityHistory)
          .filter((r) => (!types.size || types.has(low(r.productType))) && (!names.size || names.has(low(r.qualityName))) && (!ids.size || ids.has(low(r.qualityCode))) && AlishanStore.exportInRange(r.at, c.f.from, c.f.to))
          .map((r) => ({
            'Date': fmtDateTime(r.at), 'Quality': r.qualityName, 'Quality ID': r.qualityCode, 'Product Type': r.productType, 'Event': r.action,
            'Changes': r.action === 'New Quality Added' ? 'New quality added' : (r.changes || []).map((ch) => `${ch.field}: ${ch.oldValue} → ${ch.newValue}`).join(' | ')
          }))
          .filter((row) => matchesSearch(row, c.f.search));
      } },
    { id: 'activity', group: 'Records', icon: 'fa-list', title: 'Activity Log', sheet: 'Activity Log', noTotals: true,
      note: 'The latest actions done in the app', applies: 'Only the date range and the search apply.',
      rows: (c) => cache.activity.filter((r) => AlishanStore.exportInRange(r.at, c.f.from, c.f.to))
        .map((r) => ({ 'Date': fmtDateTime(r.at), 'Type': r.type || '', 'Details': r.text || '' })).filter((row) => matchesSearch(row, c.f.search)) },
    { id: 'qmaster', group: 'Reference & system', icon: 'fa-tags', title: 'Quality Master', sheet: 'Quality Master', noTotals: true,
      note: 'Quality names and prices from the master list', applies: 'Filters do not apply to this list.',
      rows: () => {
        const rows = [];
        Object.entries(AlishanStore.getQualityData() || {}).forEach(([type, groups]) => {
          Object.entries(groups || {}).forEach(([group, list]) => (Array.isArray(list) ? list : []).forEach((q) => rows.push({
            'Product Type': String(type).toUpperCase(), 'Group': group, 'Quality': q.name, 'Price/Dozen (₹)': q.price, 'Other names': (q.aliases || []).join(', ')
          })));
        });
        return rows;
      } },
    { id: 'cmaster', group: 'Reference & system', icon: 'fa-palette', title: 'Colour Master', sheet: 'Colour Master', noTotals: true,
      note: 'Colour names used by the app', applies: 'Filters do not apply to this list.',
      rows: () => (AlishanStore.getColors() || []).map((c) => ({ 'Name': c.name, 'Display name': c.displayName || c.name, 'Other names': (c.aliases || []).join(', '), 'Background': c.backgroundColor || '', 'Text': c.textColor || '', 'Border': c.borderColor || '' })) },
    { id: 'settings', group: 'Reference & system', icon: 'fa-cog', title: 'Settings', sheet: 'Settings', noTotals: true,
      note: 'Business, appearance and backup preferences', applies: 'Filters do not apply. The logo and backup copies are left out.',
      rows: () => cache.settings.map((r) => ({ 'Setting': r.key, 'Value': (typeof r.value === 'string' ? r.value : JSON.stringify(r.value)).slice(0, 2000) })) },
    { id: 'backups', group: 'Reference & system', icon: 'fa-hard-drive', title: 'Backup History', sheet: 'Backup History', noTotals: true,
      note: 'The automatic backups kept on this device', applies: 'Filters do not apply to this list.',
      rows: () => cache.backups.map((b) => {
        const row = {};
        Object.entries(b.metadata || {}).forEach(([k, v]) => { if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) row[k] = v; });
        row['Quality records'] = (b.inventory || []).length;
        row['Payments'] = (b.payments || []).length;
        return row;
      }) }
  ];

  /* ------------------------------ helpers on rows and columns ------------------------------ */
  const columnsOf = (rows) => { const seen = new Set(); rows.forEach((r) => Object.keys(r).forEach((k) => seen.add(k))); return [...seen]; };
  const visibleColumns = (sheet) => { const hidden = state.hidden[sheet.name]; return columnsOf(sheet.rows).filter((c) => !hidden || !hidden.has(c)); };
  const pickColumns = (sheet) => { const cols = visibleColumns(sheet); return sheet.rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] === undefined || r[c] === null ? '' : r[c]]))); };
  const totalsOf = (sheet) => (sheet.noTotals ? {} : AlishanStore.exportTotals(sheet.rows));

  function computeSheets() {
    const f = state.filters;
    // completion date range: only qualities completed (with a saved completion date) inside it
    const doneOk = (item) => {
      if (!f.completedFrom && !f.completedTo) return true;
      const info = AlishanCalc.completionInfo(item);
      return !!(info && info.hasDate && AlishanStore.exportInRange(info.date, f.completedFrom, f.completedTo));
    };
    const scopeDate = AlishanStore.exportFilterItems(f, true).filter(doneOk);
    const scopeAll = AlishanStore.exportFilterItems(f, false).filter(doneOk);
    const lo = f.min === '' ? null : Number(f.min), hi = f.max === '' ? null : Number(f.max);
    const amountActive = lo !== null || hi !== null;
    const ctx = { f, scopeDate, scopeAll };
    const sheets = DATASETS.filter((d) => state.datasets.has(d.id)).map((d) => {
      let rows = [], error = '';
      try {
        rows = d.rows(ctx);
        if (amountActive && d.amountKey) rows = rows.filter((r) => typeof r[d.amountKey] !== 'number' || ((lo === null || r[d.amountKey] >= lo) && (hi === null || r[d.amountKey] <= hi)));
      } catch (e) { console.error(`Export data set "${d.title}" failed:`, e); error = e.message || 'Could not read this data.'; }
      return { id: d.id, name: d.sheet, title: d.title, rows, noTotals: !!d.noTotals, applies: d.applies + (amountActive && !d.amountKey ? ' The amount range does not apply to this data set.' : ''), error };
    });
    return { sheets, matching: scopeDate.length, total: AlishanStore.getItems().length };
  }

  function filtersText() {
    const f = state.filters, parts = [];
    FILTER_FIELDS.forEach((field) => { if (f[field.key].length) parts.push(`${field.label}: ${f[field.key].join(', ')}`); });
    if (f.from || f.to) parts.push(`Date: ${f.from ? fmtDay(f.from) : 'start'} – ${f.to ? fmtDay(f.to) : 'today'}`);
    if (f.completedFrom || f.completedTo) parts.push(`Completion date: ${f.completedFrom ? fmtDay(f.completedFrom) : 'start'} – ${f.completedTo ? fmtDay(f.completedTo) : 'today'}`);
    if (f.min !== '' || f.max !== '') parts.push(`Amount: ${f.min !== '' ? f.min : '0'} – ${f.max !== '' ? f.max : 'no limit'}`);
    if (f.status) parts.push(`Stock status: ${f.status}`);
    if (f.payment) parts.push(`Payment status: ${f.payment}`);
    if (f.search.trim()) parts.push(`Search: ${f.search.trim()}`);
    return parts.length ? parts.join(' | ') : 'None (all records)';
  }

  /* ------------------------------ screen: data tiles ------------------------------ */
  function renderDatasets() {
    const counts = new Map(sheetsNow.map((s) => [s.id, s]));
    const groups = [...new Set(DATASETS.map((d) => d.group))];
    $('xcDatasets').innerHTML = groups.map((g) => `<div class="xc-group-title">${esc(g)}</div><div class="xc-tile-grid">${DATASETS.filter((d) => d.group === g).map((d) => {
      const on = state.datasets.has(d.id), sheet = counts.get(d.id);
      const count = on && sheet ? `<span class="xc-tile-count">${plural(sheet.rows.length, 'row', 'rows')}</span>` : '';
      return `<button aria-pressed="${on}" class="xc-tile${on ? ' selected' : ''}" data-ds="${d.id}" type="button"><span class="xc-tile-icon"><i class="fas ${d.icon}"></i></span><span><b>${esc(d.title)}</b><small>${esc(d.note)}</small>${count}</span><i class="fas fa-check-circle xc-tile-check"></i></button>`;
    }).join('')}</div>`).join('');
  }

  /* ------------------------------ screen: filters ------------------------------ */
  function optionLists() {
    const items = AlishanStore.getItems(), f = state.filters;
    const types = toSet(f.types), names = toSet(f.qualities);
    const byType = items.filter((i) => !types.size || types.has(low(i.productType)));
    const byName = byType.filter((i) => !names.size || names.has(low(i.quality)));
    const colourNames = (i) => (i.colors || []).map((c) => (typeof c === 'object' ? c.name : c)).filter(Boolean);
    return {
      types: items.map((i) => i.productType), qualities: byType.map((i) => i.quality), ids: byName.map((i) => i.code || i.id),
      lots: byName.map((i) => i.lotNumber), colours: byName.flatMap(colourNames),
      cups: byType.map((i) => i.cupSize).filter((v) => v && v !== 'N/A'),
      maals: items.map((i) => i.maalGaya || i.maalGayaTo), notes: byName.map((i) => i.notes)
    };
  }
  // value -> how many entries have it, sorted
  function countValues(values) {
    const map = new Map();
    values.forEach((v) => { const t = String(v === undefined || v === null ? '' : v).trim(); if (t) { const k = low(t); const e = map.get(k) || { value: t, n: 0 }; e.n += 1; map.set(k, e); } });
    return [...map.values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function buildFilterBoxes() {
    $('xcFilters').innerHTML = FILTER_FIELDS.map((f) => `<div class="xc-multi" data-key="${f.key}"><label class="xc-label">${esc(f.label)}</label><div aria-expanded="false" class="xc-multi-box" role="combobox" tabindex="0"><div class="xc-multi-tags"></div><i class="fas fa-chevron-down"></i></div><div class="xc-multi-panel" hidden><input aria-label="Search ${esc(f.label)}" class="xc-multi-search" placeholder="Search…" type="search"/><div class="xc-multi-list"></div><div class="xc-multi-actions"><button class="xc-link" data-act="all" type="button">Select shown</button><button class="xc-link" data-act="none" type="button">Clear</button></div></div></div>`).join('');
  }

  function renderMulti(key, lists) {
    const box = document.querySelector(`.xc-multi[data-key="${key}"]`); if (!box) return;
    const selected = state.filters[key], selSet = toSet(selected);
    const options = countValues(lists[key]);
    // a chosen value that no longer exists in the narrowed list is dropped
    const available = toSet(options.map((o) => o.value));
    const kept = selected.filter((v) => available.has(low(v)));
    if (kept.length !== selected.length) { state.filters[key] = kept; return renderMulti(key, lists); }
    box.querySelector('.xc-multi-tags').innerHTML = selected.length
      ? selected.map((v) => `<span class="xc-tag"><span title="${esc(v)}">${esc(v.length > 28 ? `${v.slice(0, 27)}…` : v)}</span><button aria-label="Remove ${esc(v)}" data-remove="${esc(v)}" type="button"><i class="fas fa-times"></i></button></span>`).join('')
      : '<span class="xc-multi-empty">All</span>';
    const term = low(box.querySelector('.xc-multi-search').value);
    const shown = options.filter((o) => !term || low(o.value).includes(term));
    box.querySelector('.xc-multi-list').innerHTML = shown.length
      ? shown.map((o) => `<label class="xc-option"><input ${selSet.has(low(o.value)) ? 'checked' : ''} data-value="${esc(o.value)}" type="checkbox"/><span title="${esc(o.value)}">${esc(o.value.length > 46 ? `${o.value.slice(0, 45)}…` : o.value)}</span><em>${o.n}</em></label>`).join('')
      : '<div class="xc-multi-none">Nothing to choose</div>';
  }

  function renderChoiceChips(id, choices, current, attr) {
    $(id).innerHTML = choices.map(([value, label]) => `<button class="xc-chip${current === value ? ' active' : ''}" ${attr}="${esc(value)}" type="button">${esc(label)}</button>`).join('');
  }

  function renderActiveFilters() {
    const f = state.filters, chips = [];
    FILTER_FIELDS.forEach((field) => { if (f[field.key].length) chips.push([`${field.label}: ${f[field.key].length > 2 ? `${f[field.key].slice(0, 2).join(', ')} +${f[field.key].length - 2}` : f[field.key].join(', ')}`, field.key]); });
    if (f.from || f.to) chips.push([`Date: ${f.from ? fmtDay(f.from) : 'start'} – ${f.to ? fmtDay(f.to) : 'today'}`, 'date']);
    if (f.completedFrom || f.completedTo) chips.push([`Completed: ${f.completedFrom ? fmtDay(f.completedFrom) : 'start'} – ${f.completedTo ? fmtDay(f.completedTo) : 'today'}`, 'done']);
    if (f.min !== '' || f.max !== '') chips.push([`Amount: ${f.min !== '' ? f.min : '0'} – ${f.max !== '' ? f.max : 'no limit'}`, 'amount']);
    if (f.status) chips.push([`Stock: ${f.status}`, 'status']);
    if (f.payment) chips.push([`Payment: ${f.payment}`, 'payment']);
    if (f.search.trim()) chips.push([`Search: ${f.search.trim()}`, 'search']);
    $('xcActiveFilters').innerHTML = chips.map(([label, key]) => `<span class="xc-tag"><span>${esc(label)}</span><button aria-label="Remove this filter" data-clear="${key}" type="button"><i class="fas fa-times"></i></button></span>`).join('');
  }

  function renderFilters() {
    const lists = optionLists();
    FILTER_FIELDS.forEach((field) => renderMulti(field.key, lists));
    renderChoiceChips('xcDatePresets', DATE_PRESETS, state.filters.preset, 'data-preset');
    renderChoiceChips('xcStatusChips', STATUS_CHOICES, state.filters.status, 'data-status');
    renderChoiceChips('xcPaymentChips', PAYMENT_CHOICES, state.filters.payment, 'data-payment');
    renderActiveFilters();
  }

  /* ------------------------------ screen: preview ------------------------------ */
  function renderPreview() {
    const tabs = $('xcPreviewTabs'), info = $('xcPreviewInfo');
    if (!sheetsNow.length) {
      tabs.innerHTML = ''; $('xcTotals').innerHTML = ''; $('xcColumnsBox').hidden = true; info.textContent = '';
      $('xcPreviewTable').innerHTML = '<div class="xc-empty">Select at least one data set in step 1 to see a preview.</div>';
      return;
    }
    if (!sheetsNow.some((s) => s.name === state.previewSheet)) state.previewSheet = sheetsNow[0].name;
    const sheet = sheetsNow.find((s) => s.name === state.previewSheet);
    tabs.innerHTML = sheetsNow.map((s) => `<button class="xc-sheet-tab${s.name === sheet.name ? ' active' : ''}" data-sheet="${esc(s.name)}" type="button">${esc(s.title)} <small>${s.rows.length.toLocaleString('en-IN')}</small></button>`).join('');
    info.textContent = sheet.applies;
    const totals = totalsOf(sheet);
    $('xcTotals').innerHTML = Object.keys(totals).length ? `<div class="xc-totals">${Object.entries(totals).map(([k, v]) => `<div class="xc-total"><small>${esc(k)}</small><b>${fmtNumber(v)}</b></div>`).join('')}</div>` : '';
    const cols = visibleColumns(sheet), all = columnsOf(sheet.rows);
    $('xcPreviewTable').innerHTML = sheet.error ? `<div class="xc-empty">${esc(sheet.error)}</div>` : !sheet.rows.length
      ? '<div class="xc-empty">No rows match your filters for this data set.</div>'
      : `<table class="xc-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${sheet.rows.slice(0, 8).map((r) => `<tr>${cols.map((c) => `<td class="${typeof r[c] === 'number' ? 'num' : ''}" title="${esc(r[c])}">${esc(typeof r[c] === 'number' ? fmtNumber(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('xcColumnsBox').hidden = !all.length;
    $('xcColumnsSummary').textContent = `Columns: ${cols.length} of ${all.length} will be exported`;
    $('xcColumns').innerHTML = all.map((c) => `<button class="xc-chip${cols.includes(c) ? ' active' : ' off'}" data-col="${esc(c)}" type="button">${esc(c)}</button>`).join('') + '<button class="xc-link" data-col-all="1" type="button">Show all</button>';
  }

  /* ------------------------------ screen: formats, footer ------------------------------ */
  function renderFormats() {
    $('xcFormats').innerHTML = FORMATS.map((f) => `<button aria-pressed="${state.format === f.id}" class="xc-format${state.format === f.id ? ' selected' : ''}" data-format="${f.id}" type="button"><i class="fas ${f.icon}"></i><span><b>${esc(f.title)}</b><small>${esc(f.note)}</small></span></button>`).join('');
    const note = {
      excel: 'Each data set becomes one sheet with filter buttons on the first row.',
      csv: sheetsNow.length > 1 ? 'You selected several data sets, so the CSV files are packed together in one ZIP.' : 'One CSV file that opens in Excel with Hindi / Unicode text intact.',
      pdf: 'A print window opens with every row. Choose “Save as PDF” in the print dialog. Pop-ups must be allowed.',
      json: 'The file holds the selected data sets, the filters used and the time of export.',
      zip: 'A complete backup always contains ALL your data. The data selection, filters and columns above are not used. Restore it from the “Restore Backup” tab.'
    };
    $('xcFormatNote').textContent = note[state.format] || '';
    $('xcSummaryOption').closest('label').style.opacity = ['excel', 'pdf', 'json'].includes(state.format) ? '1' : '.5';
  }

  function renderFooter(result) {
    const rows = sheetsNow.reduce((n, s) => n + s.rows.length, 0), run = $('runAdvancedExport');
    const zip = state.format === 'zip';
    $('exportCenterStatus').textContent = zip ? 'Complete backup: all records, payments, history, activity and settings.' : `${plural(sheetsNow.length, 'data set', 'data sets')} · ${plural(rows, 'row', 'rows')} · ${FORMATS.find((f) => f.id === state.format).title}`;
    run.disabled = !zip && (!sheetsNow.length || !rows);
    run.innerHTML = `<i class="fas fa-download"></i> ${zip ? 'Create backup' : 'Export'}`;
    $('exportFilterCount').textContent = result ? `${result.matching.toLocaleString('en-IN')} of ${result.total.toLocaleString('en-IN')} quality entries match these filters` : '';
  }

  function refreshNow() {
    clearTimeout(refreshTimer);
    let result;
    try { result = computeSheets(); } catch (e) { console.error('Export preview failed:', e); result = { sheets: [], matching: 0, total: 0 }; }
    sheetsNow = result.sheets;
    renderDatasets(); renderFilters(); renderPreview(); renderFormats(); renderFooter(result);
  }
  const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshNow, 140); };

  /* ------------------------------ date presets ------------------------------ */
  function applyDatePreset(preset) {
    const f = state.filters; f.preset = preset;
    if (preset === 'custom') return;
    if (preset === 'all') { f.from = ''; f.to = ''; return; }
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (preset === 'month') start.setDate(1); else if (preset === 'year') start.setMonth(0, 1); else if (preset !== 'today') start.setDate(start.getDate() - Number(preset) + 1);
    f.from = isoDay(start); f.to = isoDay(now);
  }
  function syncInputs() {
    $('exportDateFrom').value = state.filters.from; $('exportDateTo').value = state.filters.to; $('exportSearch').value = state.filters.search;
    $('exportDoneFrom').value = state.filters.completedFrom; $('exportDoneTo').value = state.filters.completedTo; $('exportMin').value = state.filters.min; $('exportMax').value = state.filters.max;
  }
  function clearAllFilters() { state.filters = freshFilters(); syncInputs(); document.querySelectorAll('.xc-multi-search').forEach((i) => { i.value = ''; }); }
  function clearOneFilter(key) {
    const f = state.filters;
    if (key === 'date') { f.from = ''; f.to = ''; f.preset = 'all'; } else if (key === 'done') { f.completedFrom = ''; f.completedTo = ''; } else if (key === 'amount') { f.min = ''; f.max = ''; } else if (key === 'status') f.status = ''; else if (key === 'payment') f.payment = ''; else if (key === 'search') f.search = ''; else f[key] = [];
    syncInputs();
  }

  /* ------------------------------ making the files ------------------------------ */
  const safeName = (text) => String(text).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
  const baseFileName = () => safeName($('xcFileName').value.trim()) || `ALISHAN_Export_${stamp()}`;
  const wantSummary = () => $('xcSummaryOption').checked;

  function summaryTable(sheets) {
    const keys = [...new Set(sheets.flatMap((s) => Object.keys(totalsOf(s))))];
    const head = ['Data set', 'Rows', ...keys];
    const body = sheets.map((s) => { const t = totalsOf(s); return [s.title, s.rows.length, ...keys.map((k) => (t[k] === undefined ? '' : t[k]))]; });
    return { head, body };
  }

  async function downloadExcel(sheets, base) {
    await AlishanLoader.xlsx();
    const wb = XLSX.utils.book_new();
    if (wantSummary()) {
      const table = summaryTable(sheets);
      const ws = XLSX.utils.aoa_to_sheet([['ALISHAN — Export summary'], ['Created', new Date().toLocaleString('en-IN')], ['Filters', filtersText()], [], table.head, ...table.body]);
      AlishanLoader.fitColumns(ws); XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    }
    sheets.forEach((s) => {
      const ws = XLSX.utils.json_to_sheet(pickColumns(s));
      AlishanLoader.fitColumns(ws);
      if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    AlishanLoader.saveWorkbook(wb, `${base}.xlsx`);
    return `${base}.xlsx`;
  }

  function csvText(rows) {
    const cols = columnsOf(rows);
    const cell = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return `\uFEFF${[cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')}`;
  }
  function downloadCsv(sheets, base) {
    if (sheets.length === 1) { downloadBlob(new Blob([csvText(pickColumns(sheets[0]))], { type: 'text/csv;charset=utf-8' }), `${base}.csv`); return `${base}.csv`; }
    const files = {};
    sheets.forEach((s) => { files[`${safeName(s.name)}.csv`] = csvText(pickColumns(s)); });
    downloadBlob(makeStoredZip(files), `${base}_CSV.zip`);
    return `${base}_CSV.zip`;
  }

  function downloadJson(sheets, base) {
    const payload = {
      application: 'ALISHAN_INVENTORY', createdAt: new Date().toISOString(), filters: filtersText(),
      ...(wantSummary() ? { summary: sheets.map((s) => ({ dataSet: s.title, rows: s.rows.length, totals: totalsOf(s) })) } : {}),
      sheets: Object.fromEntries(sheets.map((s) => [s.name, pickColumns(s)]))
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${base}.json`);
    return `${base}.json`;
  }

  function printReport(sheets, base) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked. Allow pop-ups for this app and try again.');
    const table = (s) => {
      const cols = visibleColumns(s), rows = pickColumns(s), totals = totalsOf(s);
      const totalRow = Object.keys(totals).length ? `<tr class="tot">${cols.map((c, i) => `<td class="num">${i === 0 ? 'Total' : (totals[c] !== undefined ? fmtNumber(totals[c]) : '')}</td>`).join('')}</tr>` : '';
      return `<section><h2>${esc(s.title)} <small>${plural(rows.length, 'row', 'rows')}</small></h2><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${esc(typeof r[c] === 'number' ? fmtNumber(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}${totalRow}</tbody></table></section>`;
    };
    const sum = summaryTable(sheets);
    const summary = wantSummary() ? `<section><h2>Summary</h2><table><thead><tr>${sum.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sum.body.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? 'num' : ''}">${esc(typeof v === 'number' ? fmtNumber(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` : '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(base)}</title><style>
      @page{size:A4 landscape;margin:10mm}body{font:11px Arial,Helvetica,sans-serif;color:#1d2330;margin:0}
      header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #4361ee;padding-bottom:6px;margin-bottom:10px}
      h1{font-size:18px;margin:0}header p{margin:2px 0 0;color:#555}h2{font-size:13px;margin:16px 0 6px}h2 small{color:#666;font-weight:400}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #b9bfcc;padding:3px 5px;text-align:left;vertical-align:top}
      th{background:#eef1fb;font-size:10px;text-transform:uppercase}thead{display:table-header-group}tr{page-break-inside:avoid}
      td.num{text-align:right;white-space:nowrap}.tot td{font-weight:700;background:#f3f5fb}
      .bar{margin:0 0 10px}.bar button{padding:8px 14px;font-size:13px;cursor:pointer}@media print{.bar{display:none}}
    </style></head><body><div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
    <header><div><h1>ALISHAN — Export report</h1><p>Filters: ${esc(filtersText())}</p></div><p>${esc(new Date().toLocaleString('en-IN'))}</p></header>${summary}${sheets.map(table).join('')}</body></html>`);
    w.document.close();
    return `${base} (print window)`;
  }

  /* ------------------------------ presets and history (kept in the app's own settings store) ------------------------------ */
  async function loadSaved() {
    try { state.presets = (await AlishanDB.getSetting(SETTING_PRESETS, [])) || []; } catch (e) { state.presets = []; }
    try { state.history = (await AlishanDB.getSetting(SETTING_HISTORY, [])) || []; } catch (e) { state.history = []; }
  }
  async function saveSetting(key, value) { try { await AlishanDB.setSetting(key, value); } catch (e) { console.error(`Could not save ${key}:`, e); } }

  const BUILTIN_PRESETS = [
    { name: 'Pending payments report', note: 'Pending amount of every quality, as an Excel file', datasets: ['pending'], format: 'excel', filters: {} },
    { name: 'Stock list (in stock only)', note: 'Quality inventory and size-wise detail of what is in stock', datasets: ['inventory', 'sizes'], format: 'excel', filters: { status: 'In Stock' } },
    { name: 'This month’s received payments', note: 'Amounts received since the 1st of this month', datasets: ['received'], format: 'excel', filters: { preset: 'month' } },
    { name: 'Complete backup', note: 'Everything in one ZIP you can restore later', datasets: [], format: 'zip', filters: {} }
  ];

  function presetSnapshot(name) {
    return {
      id: `preset-${Date.now()}`, name, createdAt: new Date().toISOString(), datasets: [...state.datasets], filters: JSON.parse(JSON.stringify(state.filters)),
      format: state.format, hidden: Object.fromEntries(Object.entries(state.hidden).map(([k, v]) => [k, [...v]])), summary: wantSummary(), fileName: $('xcFileName').value.trim()
    };
  }
  function applyPreset(p) {
    state.datasets = new Set(p.datasets || []);
    state.filters = { ...freshFilters(), ...(p.filters || {}) };
    if (['today', '7', '30', 'month', 'year'].includes(state.filters.preset)) applyDatePreset(state.filters.preset);   // "this month" means this month NOW
    state.format = p.format || 'excel';
    state.hidden = Object.fromEntries(Object.entries(p.hidden || {}).map(([k, v]) => [k, new Set(v)]));
    $('xcSummaryOption').checked = p.summary !== false;
    $('xcFileName').value = p.fileName || '';
    syncInputs(); setTab('export'); refreshNow();
    notify(`Preset “${p.name}” applied.`, 'success');
  }

  function renderSaved() {
    $('xcBuiltinPresets').innerHTML = BUILTIN_PRESETS.map((p, i) => `<div class="xc-row"><div class="xc-row-main"><b>${esc(p.name)}</b><small>${esc(p.note)}</small></div><div class="xc-row-buttons"><button class="xc-small-btn" data-builtin="${i}" type="button">Use</button></div></div>`).join('');
    $('xcMyPresets').innerHTML = state.presets.length ? state.presets.map((p) => `<div class="xc-row"><div class="xc-row-main"><b>${esc(p.name)}</b><small>${esc((p.datasets || []).map((id) => (DATASETS.find((d) => d.id === id) || {}).title || id).join(', ') || 'Complete backup')} · ${esc((FORMATS.find((f) => f.id === p.format) || {}).title || p.format)} · saved ${esc(fmtDateTime(p.createdAt))}</small></div><div class="xc-row-buttons"><button class="xc-small-btn" data-preset-use="${esc(p.id)}" type="button">Use</button><button class="xc-small-btn danger" data-preset-del="${esc(p.id)}" type="button">Delete</button></div></div>`).join('') : '<div class="xc-empty">No saved presets yet.</div>';
    $('xcHistory').innerHTML = state.history.length ? state.history.map((h) => `<div class="xc-row"><div class="xc-row-main"><b>${esc(h.file)}</b><small>${esc(fmtDateTime(h.at))} · ${esc((FORMATS.find((f) => f.id === h.format) || {}).title || h.format)} · ${esc((h.sheets || []).map((s) => `${s.name} (${s.rows})`).join(', ') || 'complete backup')}<br>Filters: ${esc(h.filters || 'None')}</small></div></div>`).join('') : '<div class="xc-empty">Nothing exported yet.</div>';
  }

  async function rememberExport(file, sheets) {
    state.history = [{ at: new Date().toISOString(), format: state.format, file, filters: state.format === 'zip' ? 'Not used (complete backup)' : filtersText(), sheets: sheets.map((s) => ({ name: s.title, rows: s.rows.length })) }, ...state.history].slice(0, 15);
    await saveSetting(SETTING_HISTORY, state.history);
    renderSaved();
  }

  /* ------------------------------ running an export ------------------------------ */
  async function runExport() {
    const button = $('runAdvancedExport'), status = $('exportCenterStatus');
    button.disabled = true; status.textContent = 'Preparing your file…';
    try {
      await AlishanDB.init(); await AlishanStore.init();
      if (state.format === 'zip') {
        const name = `${baseFileName().replace(/^ALISHAN_Export_/, 'ALISHAN_COMPLETE_BACKUP_')}.zip`;
        downloadBlob(await completeBackup(), name);
        await rememberExport(name, []);
        notify('Complete backup created.', 'success');
      } else {
        if (!state.datasets.size) throw new Error('Select at least one data set.');
        const { sheets } = computeSheets();
        const usable = sheets.filter((s) => s.rows.length);
        if (!usable.length) throw new Error('No rows match the selected data and filters. Change the filters and try again.');
        const base = baseFileName();
        const file = state.format === 'excel' ? await downloadExcel(usable, base) : state.format === 'csv' ? downloadCsv(usable, base) : state.format === 'json' ? downloadJson(usable, base) : printReport(usable, base);
        await rememberExport(file, usable);
        notify(`Export created: ${file}`, 'success');
      }
      status.textContent = 'Export created. Your saved quality and payment records were not changed.';
    } catch (e) {
      console.error('Export failed:', e);
      notify(e.message || 'Export failed.', 'error');
      status.textContent = e.message || 'Export failed.';
    } finally { button.disabled = false; setTimeout(refreshNow, 1500); }
  }

  /* ------------------------------ tabs, open / close, events ------------------------------ */
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-xc-tab]').forEach((b) => { const on = b.dataset.xcTab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('[data-xc-pane]').forEach((p) => { p.hidden = p.dataset.xcPane !== tab; });
    $('xcFooter').hidden = tab !== 'export';
    if (tab === 'presets') renderSaved();
  }

  const closePanels = (except) => document.querySelectorAll('.xc-multi.open').forEach((m) => { if (m !== except) { m.classList.remove('open'); m.querySelector('.xc-multi-panel').hidden = true; m.querySelector('.xc-multi-box').setAttribute('aria-expanded', 'false'); } });

  async function open() {
    const backdrop = $('exportCenterBackdrop'); if (!backdrop) return;
    backdrop.hidden = false; document.body.classList.add('xc-open'); opened = true;
    $('exportCenterTitle').focus();
    $('exportCenterStatus').textContent = 'Loading your saved records…';
    try {
      await AlishanDB.init(); await AlishanStore.init();
      cache.history = await AlishanStore.getQualityHistory();
      cache.activity = await AlishanStore.getRecentActivity(1000);
      cache.settings = ((await AlishanDB.getAll('settings')) || []).filter((r) => !BULKY_SETTINGS.includes(r.key));
      cache.backups = (await AlishanStore.listBackups()) || [];
      await loadSaved();
      buildFilterBoxes(); syncInputs(); setTab('export'); refreshNow(); renderSaved();
    } catch (e) {
      console.error('Could not load the Export Center:', e);
      notify('Could not load your saved records for the Export Center.', 'error');
    }
  }
  function close() {
    const backdrop = $('exportCenterBackdrop'); if (!backdrop) return;
    closePanels(); backdrop.hidden = true; document.body.classList.remove('xc-open'); opened = false;
  }

  function bindEvents() {
    $('openAdvancedExportCenter')?.addEventListener('click', open);
    $('closeExportCenter')?.addEventListener('click', close);
    $('cancelExportCenter')?.addEventListener('click', close);
    $('exportCenterBackdrop')?.addEventListener('click', (e) => { if (e.target === $('exportCenterBackdrop')) close(); });
    $('runAdvancedExport')?.addEventListener('click', runExport);
    $('restoreAlishanZipButton')?.addEventListener('click', restoreZip);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !opened) return;
      if (document.querySelector('.xc-multi.open')) closePanels(); else close();
    });
    document.addEventListener('click', (e) => { if (opened && !e.target.closest('.xc-multi')) closePanels(); });

    const dialog = document.querySelector('.xc-dialog'); if (!dialog) return;
    dialog.addEventListener('click', (e) => {
      const t = e.target;
      const tab = t.closest('[data-xc-tab]'); if (tab) { setTab(tab.dataset.xcTab); return; }
      const tile = t.closest('[data-ds]');
      if (tile) { const id = tile.dataset.ds; if (state.datasets.has(id)) state.datasets.delete(id); else state.datasets.add(id); refreshNow(); return; }
      const sel = t.closest('[data-xc-select]');
      if (sel) { state.datasets = sel.dataset.xcSelect === 'all' ? new Set(DATASETS.map((d) => d.id)) : new Set(); refreshNow(); return; }
      const preset = t.closest('[data-preset]'); if (preset) { applyDatePreset(preset.dataset.preset); syncInputs(); refreshNow(); return; }
      const status = t.closest('[data-status]'); if (status) { state.filters.status = status.dataset.status; refreshNow(); return; }
      const pay = t.closest('[data-payment]'); if (pay) { state.filters.payment = pay.dataset.payment; refreshNow(); return; }
      const clear = t.closest('[data-clear]'); if (clear) { clearOneFilter(clear.dataset.clear); refreshNow(); return; }
      if (t.closest('#clearExportFilters')) { clearAllFilters(); refreshNow(); return; }
      const sheet = t.closest('[data-sheet]'); if (sheet) { state.previewSheet = sheet.dataset.sheet; renderPreview(); return; }
      const col = t.closest('[data-col]');
      if (col) {
        const s = sheetsNow.find((x) => x.name === state.previewSheet), name = col.dataset.col;
        const hidden = state.hidden[s.name] || (state.hidden[s.name] = new Set());
        if (hidden.has(name)) hidden.delete(name); else if (visibleColumns(s).length > 1) hidden.add(name); else notify('At least one column must stay selected.', 'info');
        renderPreview(); return;
      }
      if (t.closest('[data-col-all]')) { delete state.hidden[state.previewSheet]; renderPreview(); return; }
      const format = t.closest('[data-format]'); if (format) { state.format = format.dataset.format; refreshNow(); return; }
      // multi-select filters
      const multi = t.closest('.xc-multi');
      if (multi) {
        const key = multi.dataset.key;
        const remove = t.closest('[data-remove]');
        if (remove) { state.filters[key] = state.filters[key].filter((v) => v !== remove.dataset.remove); refreshNow(); return; }
        const act = t.closest('[data-act]');
        if (act) {
          if (act.dataset.act === 'none') state.filters[key] = [];
          else { const shown = [...multi.querySelectorAll('.xc-option input')].map((i) => i.dataset.value); state.filters[key] = [...new Set([...state.filters[key], ...shown])]; }
          refreshNow(); return;
        }
        if (t.closest('.xc-multi-box')) {
          const wasOpen = multi.classList.contains('open'); closePanels(multi);
          multi.classList.toggle('open', !wasOpen); multi.querySelector('.xc-multi-panel').hidden = wasOpen; multi.querySelector('.xc-multi-box').setAttribute('aria-expanded', String(!wasOpen));
          if (!wasOpen) multi.querySelector('.xc-multi-search').focus();
        }
        return;
      }
      // presets and history
      const builtin = t.closest('[data-builtin]'); if (builtin) { applyPreset({ ...BUILTIN_PRESETS[Number(builtin.dataset.builtin)] }); return; }
      const use = t.closest('[data-preset-use]'); if (use) { const p = state.presets.find((x) => x.id === use.dataset.presetUse); if (p) applyPreset(p); return; }
      const del = t.closest('[data-preset-del]');
      if (del) { state.presets = state.presets.filter((x) => x.id !== del.dataset.presetDel); saveSetting(SETTING_PRESETS, state.presets); renderSaved(); return; }
      if (t.closest('#xcSavePreset')) {
        const name = $('xcPresetName').value.trim();
        if (!name) { notify('Type a name for the preset first.', 'error'); return; }
        state.presets = [presetSnapshot(name), ...state.presets.filter((p) => low(p.name) !== low(name))].slice(0, 20);
        saveSetting(SETTING_PRESETS, state.presets); $('xcPresetName').value = ''; renderSaved(); notify(`Preset “${name}” saved.`, 'success'); return;
      }
      if (t.closest('#xcClearHistory')) { state.history = []; saveSetting(SETTING_HISTORY, []); renderSaved(); }
    });
    dialog.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('.xc-option input')) {
        const key = t.closest('.xc-multi').dataset.key, value = t.dataset.value;
        state.filters[key] = t.checked ? [...new Set([...state.filters[key], value])] : state.filters[key].filter((v) => v !== value);
        refreshNow();
      } else if (t.id === 'exportDateFrom' || t.id === 'exportDateTo') {
        state.filters.from = $('exportDateFrom').value; state.filters.to = $('exportDateTo').value; state.filters.preset = 'custom'; refreshNow();
      } else if (t.id === 'exportDoneFrom' || t.id === 'exportDoneTo') {
        state.filters.completedFrom = $('exportDoneFrom').value; state.filters.completedTo = $('exportDoneTo').value; refreshNow();
      } else if (t.id === 'exportMin' || t.id === 'exportMax') {
        state.filters.min = $('exportMin').value; state.filters.max = $('exportMax').value; refreshNow();
      } else if (t.id === 'xcSummaryOption') renderFormats();
    });
    dialog.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'exportSearch') { state.filters.search = t.value; refreshSoon(); }
      else if (t.matches('.xc-multi-search')) { const key = t.closest('.xc-multi').dataset.key; renderMulti(key, optionLists()); }
    });
  }

  // A report on the Report Page can hand its data set and filters over (sessionStorage 'alishanExportPreset', set by
  // report-views.js). The Export Center then opens with them already applied; nothing is exported until Export is pressed.
  async function consumeReportHandoff() {
    let raw = null;
    try { raw = sessionStorage.getItem('alishanExportPreset'); if (raw) sessionStorage.removeItem('alishanExportPreset'); } catch (e) { return; }
    if (!raw) return;
    let preset;
    try { preset = JSON.parse(raw); } catch (e) { return; }
    await open();
    applyPreset(preset);
  }

  document.addEventListener('DOMContentLoaded', () => { bindEvents(); consumeReportHandoff(); });
})();
