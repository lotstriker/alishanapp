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
 const filters=['release','page','account','device'];
 const measure = (value,key) => Number.isFinite(value) ? value + (key==='apiCount'||key==='apiErrors'?'':' ms') : '—';
 function row(container, values, tag='td') {
  const tr=document.createElement('tr');
  for (const value of values) {
   const cell=document.createElement(tag); cell.textContent=value; tr.append(cell);
  }
  container.append(tr);
 }
 function render() {
  const selected=visits.filter(v=>filters.every(key=>!$(key).value||$(key).value===v[key]));
  $('status').textContent=selected.length ? selected.length+' recent visits' : 'No visits found for these filters.';
  $('summary').replaceChildren();
  for (const [key,label] of measures.slice(0,13)) {
   const values=selected.map(v=>v.metrics[key]).filter(Number.isFinite).sort((a,b)=>a-b);
   if (!values.length) continue;
   const median=(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2;
   const card=document.createElement('article'), strong=document.createElement('strong'), note=document.createElement('small');
   strong.textContent=measure(median,key);note.textContent='Median · '+values.length+' samples';card.append(label,strong,note);$('summary').append(card);
  }
  $('page-summary').replaceChildren();
  const groups=new Map();
  for(const visit of selected){
   const key=visit.release+' '+visit.page;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(visit);
  }
  const phases=[['documentWaitMs','Document wait'],['apiNetworkMs','Outside API server'],['apiServerMs','API server'],['afterApiMs','Last API to UI']];
  for(const group of groups.values()){
   const ordered=group.filter(v=>Number.isFinite(v.metrics.readyMs)).sort((a,b)=>a.metrics.readyMs-b.metrics.readyMs);
   const values=ordered.map(v=>v.metrics.readyMs), n=values.length, last=ordered.at(-1);
   const median=n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:null;
   const largest=last&&phases.filter(([key])=>Number.isFinite(last.metrics[key])).sort(([a],[b])=>last.metrics[b]-last.metrics[a])[0];
   const slow=last ? measure(last.metrics.readyMs,'readyMs')+(largest?' · '+largest[1]+' '+measure(last.metrics[largest[0]],largest[0]):'') : '—';
   row($('page-summary'),[names[group[0].page]||group[0].page,group[0].release,group.length,measure(median,'readyMs'),measure(n?values[Math.ceil(n*.9)-1]:null,'readyMs'),slow]);
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
   for (const key of filters) {
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
 for(const key of filters)$(key).addEventListener('change',render);
 $('reload').addEventListener('click',load);
 load();
})();
