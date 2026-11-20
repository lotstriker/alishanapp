(function () {
 'use strict';
 const $ = id => document.getElementById(id);
 const names = {'index':'Dashboard','inventory':'Inventory','reports':'Reports','setting':'Settings','add-entry':'Add Entry','pending-amount':'Pending Amount','missing-lot':'Missing Lot','missing-completion':'Missing Completion','quality-history':'Quality History'};
 const measures = [
  ['switchMs','Tap to content'], ['readyMs','Page ready'], ['loadMs','Load event'],
  ['domMs','DOM ready'], ['documentWaitMs','Document wait'], ['documentDownloadMs','HTML download'],
  ['dataMs','API window'], ['apiWaitMs','Slowest API wait'], ['apiServerMs','API server'],
  ['apiDbMs','DB round trips'], ['apiNetworkMs','API outside server'], ['apiDecodeMs','API download / decode'],
  ['afterApiMs','Last API to UI'], ['apiCount','API batches'], ['apiErrors','Failed batches']
 ];
 let visits=[];
 const measure = (value,key) => Number.isFinite(value) ? value + (key==='apiCount'||key==='apiErrors'?'':' ms') : '—';
 function row(container, values, tag='td') {
  const tr=document.createElement('tr');
  for (const value of values) {
   const cell=document.createElement(tag); cell.textContent=value; tr.append(cell);
  }
  container.append(tr);
 }
 function render() {
  const selected=visits.filter(v=>['page','account','device'].every(key=>!$(key).value||$(key).value===v[key]));
  $('status').textContent=selected.length ? selected.length+' recent visits' : 'No visits found for these filters.';
  $('summary').replaceChildren();
  for (const [key,label] of measures.slice(0,13)) {
   const values=selected.map(v=>v.metrics[key]).filter(Number.isFinite).sort((a,b)=>a-b);
   if (!values.length) continue;
   const median=(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2;
   const card=document.createElement('article'), strong=document.createElement('strong'), note=document.createElement('small');
   strong.textContent=measure(median,key);note.textContent='Median · '+values.length+' samples';card.append(label,strong,note);$('summary').append(card);
  }
  $('rows').replaceChildren();
  for (const visit of selected) row($('rows'),[new Date(visit.received_at).toLocaleString(),names[visit.page]||visit.page,visit.release,visit.account,visit.device,...measures.map(([key])=>measure(visit.metrics[key],key))]);
 }
 async function load() {
  $('reload').disabled=true;
  try {
   const response=await fetch('/api/performance?view=all',{headers:{'X-Alishan-Scope':window.ALISHAN_SESSION?.scope||''}});
   if(!response.ok)throw Error('Performance history is unavailable.');
   const result=await response.json();visits=result.rows;
   $('account-status').textContent=result.google ? result.owner?'Owner view · filter visits by account and device.':'Your account’s visits.' : 'Shared password login · visits are separated by browser device.';
   for (const key of ['page','account','device']) {
    const select=$(key),previous=select.value;
    while(select.options.length>1)select.remove(1);
    const values=[...new Set(visits.map(v=>v[key]))].sort();
    for(const value of values)select.add(new Option(key==='page'?(names[value]||value):value,value));
    if(values.includes(previous))select.value=previous;
   }
   render();
  } catch(error) { $('status').textContent=error.message; }
  finally { $('reload').disabled=false; }
 }
 row($('head'),['Time','Page','Release','Account','Device',...measures.map(m=>m[1])],'th');
 for(const key of ['page','account','device'])$(key).addEventListener('change',render);
 $('reload').addEventListener('click',load);
 load();
})();
