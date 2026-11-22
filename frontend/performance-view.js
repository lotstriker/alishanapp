(function () {
 'use strict';
 const $ = id => document.getElementById(id);
 const names = {'index':'Dashboard','inventory':'Inventory','reports':'Reports','setting':'Settings','add-entry':'Add Entry','pending-amount':'Pending Amount','missing-lot':'Missing Lot','missing-completion':'Missing Completion','quality-history':'Quality History'};
 const assetMeasures=[
  ['routeCssMs','Route CSS ready'],
  ['routeHtmlMs','Route HTML fetch (may be preloaded)'],['routeHtmlCached','Route HTML served from shell cache'],
  ['routeFactoryMs','Route JS factory ready (may be preloaded)'],['routeDomMs','Route HTML parse and adoption'],
  ['routeJsDecodedBytes','Route JS decoded size'], ['routeJsEncodedBytes','Route JS encoded body'],
  ['routeJsTransferBytes','Route JS transfer including headers'], ['routeJsFetchMs','Route JS resource duration'],
  ['routeJsCached','Route JS served locally']
 ];
 const traceFields=[
  ['startMs','Start'],['headersMs','Headers received'],['endMs','Response processed'],
  ['queueMs','Client batch queue'],['browserBeforeRequestMs','Browser before request'],['dnsMs','DNS'],['connectMs','Connection'],['tlsMs','TLS'],
  ['requestToResponseMs','Request to response headers'],['serverMs','Application work'],
  ['poolMs','DB client acquisition'],['snapshotMs','DB snapshot query elapsed'],['sqlMs','Other SQL elapsed'],
  ['serializeMs','Response serialization'],['compressMs','Compression elapsed'],['responseDownloadMs','Response download'],['bodyDecodeMs','JSON parse / wire decode'],
  ['responseBytes','Decoded bytes'],['wireBytes','Encoded bytes']
 ];
 const startupMeasures = [
  ['fcpMs','First contentful paint'], ['lcpObservedMs','Latest observed LCP candidate'],
  ['startupCacheHitMs','Startup view cache hit (lookup)'], ['startupCacheMissMs','Startup view cache miss (lookup)'], ['startupSharedWaitMs','Wait for a request already in progress'],
  ['storeWaitMs','Reports shared store wait'], ['reportSetupMs','Reports filters and event setup'], ['reportScopeMs','Reports calculation and scope'],
  ['reportRenderMs','Reports render and setup'], ['deviceCacheReadMs','Wait for device cache'],
  ['startupRefreshMs','Startup bundle (saved or fetched)'], ['startupFetchMs','Startup bundle network request']
 ];
 const measures = [
  ['switchMs','Tap to content'], ['readyMs','Page ready'], ['startupDataReadyMs','Startup data ready'], ['criticalPaintMs','Key content visible'], ['dataToCriticalMs','Data to key content'], ['routePrepareMs','Route preparation'], ['loadMs','Load event'],
  ['documentShellCached','Document served from shell cache'], ['documentSessionMs','Cached document session check'], ['documentAuthMs','Document server authentication'],
  ['domMs','DOM ready'], ['documentWaitMs','Document wait'], ['documentDownloadMs','HTML download'],
  ['dataMs','API window'], ['apiWaitMs','Slowest API wait'], ['apiServerMs','API server'],
  ['apiDbMs','DB round trips'], ['apiNetworkMs','API outside server'], ['apiDecodeMs','API download / decode'],
  ['afterApiMs','Last API to UI'], ['apiCount','API batches'], ['apiErrors','Failed batches']
 ];
 const allMeasures=[...measures,...startupMeasures,...assetMeasures];
 const metricGroups={
  'Page and rendering':['switchMs','readyMs','startupDataReadyMs','criticalPaintMs','dataToCriticalMs','routePrepareMs','afterApiMs'],
  'Reports':['storeWaitMs','reportSetupMs','reportScopeMs','reportRenderMs'],
  'Device cache and startup':['deviceCacheReadMs','startupRefreshMs','startupFetchMs','startupCacheHitMs','startupCacheMissMs','startupSharedWaitMs'],
  'Document':['documentShellCached','documentSessionMs','documentAuthMs','fcpMs','lcpObservedMs','loadMs','domMs','documentWaitMs','documentDownloadMs'],
  'Route assets':assetMeasures.map(([key])=>key),
  'API and database':['dataMs','apiWaitMs','apiServerMs','apiDbMs','apiNetworkMs','apiDecodeMs','apiCount','apiErrors']
 };
 const pickedVisits=new Set();
 let visits=[], visibleVisits=[];
 const filters=['release','visitType','page','account','device'];
 const types={document:'Document load','first-route':'First visit in tab','return-route':'Return visit',unknown:'Unclassified older visit'};
 const phases=[['documentWaitMs','Document wait'],['routePrepareMs','Route preparation'],['apiNetworkMs','Outside API server'],['apiServerMs','API server'],['afterApiMs','Last API to UI']];
 function visitType(visit){
  const type=visit.metrics.visitType;
  if(Object.hasOwn(types,type))return type;
  return ['domMs','loadMs','documentWaitMs','documentDownloadMs'].some(key=>Number.isFinite(visit.metrics[key]))?'document':'unknown';
 }
 const measure = (value,key) => {
  if(!Number.isFinite(value))return '—';
  if(['routeJsCached','routeHtmlCached','documentShellCached'].includes(key))return value?'Yes':'No';
  if(key.endsWith('Bytes'))return value+' bytes';
  return value+(key==='apiCount'||key==='apiErrors'?'':' ms');
 };
 function traceLines(visit){
  return (visit.metrics.waterfall||[]).map(batch=>{
   const values=traceFields.filter(([key])=>Number.isFinite(batch[key])).map(([key,label])=>label+' '+measure(batch[key],key));
   return batch.kind+(batch.encoding?' ('+batch.encoding+')':'')+' — '+values.join(' · ');
  });
 }

 function row(container, values, tag='td') {
  const tr=document.createElement('tr');
  for (const value of values) {
   const cell=document.createElement(tag); if(value instanceof Node)cell.append(value);else cell.textContent=value; tr.append(cell);
  }
  container.append(tr);
 }
 const measured=(visit,entries=allMeasures)=>entries.filter(([key])=>Number.isFinite(visit.metrics[key]));
 const visitName=visit=>names[visit.page]||visit.page;
 const visitTime=visit=>new Date(visit.received_at).toLocaleString();
 function exportVisit(visit,entries,includeTrace=false) {
  return [
   '## '+visitName(visit)+' · '+visitTime(visit),
   'Release '+visit.release+' · '+types[visit.visitType],
   ...entries.map(([key,label])=>'- '+label+': '+measure(visit.metrics[key],key)),
   ...(includeTrace?traceLines(visit).map(line=>'- API batch '+line):[])
  ].join('\n');
 }
 async function copy(blocks) {
  if(!blocks.length)return;
  const text='Alishan · Page performance\n\n'+blocks.join('\n\n');
  const fallback=$('copy-fallback');
  fallback.hidden=true;
  try {
   await navigator.clipboard.writeText(text);
   $('copy-status').textContent='Copied. Paste into your message.';
  } catch {
   fallback.hidden=false;
   const input=$('copy-text');input.value=text;input.focus();input.select();
   $('copy-status').textContent='Select and copy the text below.';
  }
 }
 function selectionState() {
  $('copy-visits').disabled=!visibleVisits.some(visit=>pickedVisits.has(visit));
  $('select-visits').disabled=!visibleVisits.length;
  $('select-visits').checked=visibleVisits.length>0&&visibleVisits.every(visit=>pickedVisits.has(visit));
  $('select-visits').indeterminate=!$('select-visits').checked&&!$('copy-visits').disabled;
 }
 function inspect(visit) {
  const panel=$('visit-detail');
  panel.hidden=false;
  $('visit-title').textContent=visitName(visit)+' · '+types[visit.visitType];
  $('visit-note').textContent=visit.release+' · '+visitTime(visit)+' · '+measure(visit.metrics.readyMs,'readyMs')+' ready. Measurements may overlap.';
  const host=$('visit-bars');host.replaceChildren();
  const entries=measured(visit);
  const checked=new Set();
  const copyMetrics=$('copy-metrics');
  copyMetrics.disabled=true;
  copyMetrics.onclick=()=>copy([exportVisit(visit,entries.filter(([key])=>checked.has(key)))]);
  $('copy-visit').onclick=()=>copy([exportVisit(visit,entries,true)]);
  for(const [group,keys] of Object.entries(metricGroups)){
   const groupEntries=entries.filter(([key])=>keys.includes(key));
   if(!groupEntries.length)continue;
   const section=document.createElement('details'), title=document.createElement('summary');
   const copyGroup=document.createElement('button');
   section.open=true;title.textContent=group;
   copyGroup.type='button';copyGroup.className='inspect';copyGroup.textContent='Copy group';
   copyGroup.setAttribute('aria-label','Copy '+group);
   copyGroup.onclick=()=>copy([exportVisit(visit,groupEntries)]);
   section.append(title,copyGroup);
   for(const [key,label] of groupEntries){
    const line=document.createElement('label'), check=document.createElement('input'), value=document.createElement('strong');
    check.type='checkbox';
    check.onchange=()=>{
     if(check.checked)checked.add(key);
     else checked.delete(key);
     copyMetrics.disabled=!checked.size;
    };
    line.className='detail-row';value.textContent=measure(visit.metrics[key],key);
    line.append(check,label,value);section.append(line);
   }
   host.append(section);
  }
  const trace=traceLines(visit);
  if(trace.length){
   const section=document.createElement('details'),title=document.createElement('summary');
   title.textContent='API waterfall · offsets from this visit';
   const note=document.createElement('p');
   note.textContent='DB query elapsed includes driver and database transit. DNS and TLS can overlap connection time. Missing browser timing is omitted.';
   section.append(title,note);
   for(const line of trace){const entry=document.createElement('p');entry.textContent=line;section.append(entry);}
   host.append(section);
  }
  if(!entries.length&&!trace.length)host.textContent='Timing details were unavailable for this visit.';
  panel.scrollIntoView?.({block:'nearest'});
 }
 function details(visit,label) {
  const button=document.createElement('button');
  button.className='inspect';button.type='button';button.textContent=label;
  button.addEventListener('click',()=>inspect(visit));
  return button;
 }
 function render() {
  const minimum=Number($('slow').value);
  const selected=visits.filter(v=>(!minimum||v.metrics.readyMs>=minimum)&&filters.every(key=>!$(key).value||$(key).value===v[key]));
  visibleVisits=selected;
  $('visit-detail').hidden=true;
  $('status').textContent=selected.length ? selected.length+' recent visits' : 'No visits found for these filters.';
  $('summary').replaceChildren();
  for (const [key,label] of measures.filter(([key])=>!['apiCount','apiErrors'].includes(key))) {
   const values=selected.map(v=>v.metrics[key]).filter(Number.isFinite).sort((a,b)=>a-b);
   if (!values.length) continue;
   const median=(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2;
   const card=document.createElement('article'), strong=document.createElement('strong'), note=document.createElement('small');
   strong.textContent=measure(median,key);note.textContent='Median · '+values.length+' samples';card.append(label,strong,note);$('summary').append(card);
  }
  $('page-summary').replaceChildren();
  const groups=new Map();
  for(const visit of selected){
   const key=JSON.stringify([visit.release,visit.page,visit.visitType]);
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(visit);
  }
  for(const group of groups.values()){
   const ordered=group.filter(v=>Number.isFinite(v.metrics.readyMs)).sort((a,b)=>a.metrics.readyMs-b.metrics.readyMs);
   const values=ordered.map(v=>v.metrics.readyMs), n=values.length, last=ordered.at(-1);
   const median=n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:null;
   const visible=group.map(v=>v.metrics.criticalPaintMs).filter(Number.isFinite).sort((a,b)=>a-b);
   const m=visible.length;
   const medianVisible=m?(visible[Math.floor((m-1)/2)]+visible[Math.floor(m/2)])/2:null;
   const largest=last&&phases.filter(([key])=>Number.isFinite(last.metrics[key])).sort(([a],[b])=>last.metrics[b]-last.metrics[a])[0];
   const slow=last ? measure(last.metrics.readyMs,'readyMs')+(largest?' · '+largest[1]+' '+measure(last.metrics[largest[0]],largest[0]):'') : '—';
   row($('page-summary'),[names[group[0].page]||group[0].page,group[0].release,types[group[0].visitType],m+' / '+group.length,measure(medianVisible,'criticalPaintMs'),n+' / '+group.length,measure(median,'readyMs'),measure(n?values[Math.ceil(n*.9)-1]:null,'readyMs'),last?details(last,slow):slow]);
  }
  $('rows').replaceChildren();
  for(const visit of selected){
   const input=document.createElement('input');
   input.type='checkbox';input.checked=pickedVisits.has(visit);
   input.setAttribute('aria-label','Select '+visitName(visit)+' visit at '+visitTime(visit));
   input.onchange=()=>{
    if(input.checked)pickedVisits.add(visit);
    else pickedVisits.delete(visit);
    selectionState();
   };
   row($('rows'),[input,visitTime(visit),visitName(visit),measure(visit.metrics.readyMs,'readyMs'),details(visit,'Details'),visit.release,types[visit.visitType],visit.account,visit.device]);
  }
  selectionState();
 }
 async function load() {
  $('reload').disabled=true;
  try {
   const response=await fetch('/api/performance?view=all',{headers:{'X-Alishan-Scope':window.ALISHAN_SESSION?.scope||''}});
   if(!response.ok)throw Error('Performance history is unavailable.');
   const result=await response.json();pickedVisits.clear();visits=result.rows.map(visit=>({...visit,visitType:visitType(visit)}));
   $('account-status').textContent=result.google ? result.owner?'Owner view · filter visits by account and device.':'Your account’s visits.' : 'Shared password login · visits are separated by browser device.';
   for (const key of filters) {
    const select=$(key),previous=select.value;
    while(select.options.length>1)select.remove(1);
    const values=[...new Set(visits.map(v=>v[key]))].sort();
    for(const value of values)select.add(new Option(key==='page'?(names[value]||value):key==='visitType'?types[value]:value,value));
    if(values.includes(previous))select.value=previous;
   }
   render();
  } catch(error) { $('status').textContent=error.message; }
  finally { $('reload').disabled=false; }
 }
 $('close-copy').onclick=()=>{$('copy-fallback').hidden=true;};
 $('select-visits').onchange=()=>{
  const checked=$('select-visits').checked;
  for(const visit of visibleVisits){
   if(checked)pickedVisits.add(visit);
   else pickedVisits.delete(visit);
  }
  for(const input of $('rows').querySelectorAll('input'))input.checked=checked;
  selectionState();
 };
 $('copy-visits').onclick=()=>copy(visibleVisits.filter(visit=>pickedVisits.has(visit)).map(visit=>exportVisit(visit,measured(visit),true)));
 for(const key of filters)$(key).addEventListener('change',render);
 $('slow').addEventListener('change',render);
 $('reload').addEventListener('click',load);
 load();
})();
