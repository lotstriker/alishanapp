(async function(){
 const root=document.getElementById('pageContent');
 await AlishanStore.init();
 const esc=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=d=>{const x=new Date(d);return isNaN(x)?'—':x.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
 const isHistory=location.pathname.endsWith('quality-history.html');
 const isPendingAmount=location.pathname.endsWith('pending-amount.html');
 const isMissingCompletion=location.pathname.endsWith('missing-completion.html');
 if(isHistory){
   // old records are corrected on screen by the store (AlishanStore.normalizeQualityHistory); the saved record is never changed
   const fixOld=r=>AlishanStore.normalizeQualityHistory(r);
   const drawHistory=async()=>{
    const rows=(await AlishanStore.getQualityHistory()).map(fixOld).sort((x,y)=>new Date(y.at)-new Date(x.at));   // newest first
    root.innerHTML=rows.length?`<div class="audit-toolbar"><span class="audit-count">${rows.length} history ${rows.length===1?'record':'records'}</span><span>Newest first</span></div><div class="audit-list">${rows.map(r=>{
     // a newly added quality is only a short card: no list of details
     const changes=r.action==='New Quality Added'?'':`<div class="audit-change-list">${(r.changes||[]).map(c=>`<div class="audit-change"><div class="audit-field">${esc(c.field)}</div><div class="audit-value"><small>Previous value</small><span>${esc(c.oldValue)}</span></div><div class="audit-value new"><small>New value</small><span>${esc(c.newValue)}</span></div></div>`).join('')}</div>`;
     return `<article class="audit-entry"><div class="audit-entry-top"><span class="audit-event"><i class="fas fa-pen-to-square"></i>${esc(r.action)}</span><div class="audit-entry-tools"><time class="audit-time"><i class="far fa-clock"></i> ${esc(fmt(r.at))}</time><button type="button" class="audit-delete" data-del-history="${esc(r.id)}" aria-label="Delete this history record"><i class="fas fa-trash"></i><span>Delete</span></button></div></div><div class="audit-quality-head"><div><h3>${esc(r.qualityName)}</h3><span class="audit-quality-id">Quality ID: ${esc(r.qualityCode)}</span></div><span class="audit-product">${esc(r.productType)}</span></div>${changes}</article>`;
    }).join('')}</div>`:'<div class="audit-empty"><div class="audit-empty-icon"><i class="fas fa-clock-rotate-left"></i></div><strong>No history yet</strong><span>Important quality changes will appear here.</span></div>';
   };
   await drawHistory();
   root.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-del-history]');
    if(!btn||btn.disabled)return;
    if(!confirm('Delete this history record?\n\nOnly this history entry is removed. The quality itself is not changed.'))return;
    btn.disabled=true;
    const result=await AlishanStore.deleteQualityHistory(btn.dataset.delHistory);
    if(!result.ok){btn.disabled=false;alert(result.error);return;}
    await drawHistory();
   });
 }else if(isPendingAmount){
  const drawPending=()=>{
   const payments=AlishanStore.getPayments();
   const payIndex=AlishanCalc.paymentIndex(payments);
   const colorsOf=it=>{const names=[...new Set((Array.isArray(it.colors)?it.colors:[]).map(AlishanCalc.colorName).map(n=>String(n).trim()).filter(Boolean))];const n=names.length;const size=n<=1?'one':n===2?'two':n<=4?'few':'many';return `<div class="missing-detail pending-colors pc-${size}">${n?names.map(x=>`<strong>${esc(x)}</strong>`).join(''):'<em class="pending-no-color">No colors specified</em>'}</div>`;};
   const rows=AlishanStore.getItems().map(i=>({item:i,pay:AlishanCalc.paymentStatus(i,payIndex)})).filter(x=>x.pay.pending>0.005).sort((a,b)=>new Date(b.item.dateTime)-new Date(a.item.dateTime));
   const today=new Date();
   root.innerHTML=rows.length?`<div class="audit-toolbar"><span class="audit-count">${rows.length} ${rows.length===1?'quality':'qualities'} with pending amount</span><span>Completed &amp; Incomplete · Partial payments included</span></div><div class="missing-grid">${rows.map(({item:i,pay})=>{const added=new Date(i.addedDateTime||i.dateTime);const days=Math.max(0,Math.floor((today-added)/86400000));const total=AlishanCalc.itemTotals(i);const completed=i.inStock===false;/* Complete = out of stock */return `<article class="missing-entry"><div class="missing-card-head"><div><h3>${esc(i.quality)}</h3><span class="missing-code">${esc(i.code||i.id)}</span>${(()=>{const done=AlishanCalc.completionInfo(i);return done?`<span class="maal-gaya-line"><i class="fas fa-check-circle"></i> Maal gaya: ${done.hasDate?`${esc(done.label)} · ${done.days} ${done.days===1?'day':'days'} ago`:'date not set'}</span>`:'';})()}</div><span class="missing-status ${completed?'completed':'incomplete'}"><i class="fas ${completed?'fa-check-circle':'fa-hourglass-half'}"></i>${completed?'Completed':'Incomplete'}</span></div><div class="missing-details"><div class="missing-detail pending-lot-dozen"><div class="pending-lot-value"><span>Lot Number</span><strong>${esc(String(i.lotNumber||'').trim()||'Not added')}</strong></div><div class="pending-dozen-value"><span>Total Dozen</span><strong>${esc(total.dozens)}</strong></div></div>${colorsOf(i)}<div class="missing-detail"><span>Added Date</span><strong>${esc(AlishanCalc.fmtDate(i.addedDateTime||i.dateTime))}</strong></div><div class="missing-detail"><span>Total Amount</span><strong>${esc(AlishanCalc.fmtMoney(pay.expected))}</strong></div><div class="missing-detail"><span>Received</span><strong>${esc(AlishanCalc.fmtMoney(pay.received))}</strong></div><div class="missing-detail pending"><span>Pending Amount</span><strong>${esc(AlishanCalc.fmtMoney(pay.pending))}</strong></div><div class="missing-detail"><span>Pending Days</span><strong>${days} ${days===1?'day':'days'}</strong></div><button type="button" class="missing-detail receive-card" data-receive="${esc(i.id)}" aria-label="Mark ${esc(pay.pending)} as received for ${esc(i.quality)}"><span>Received Amount</span><strong><i class="fas fa-check-circle"></i> Mark Received</strong></button></div><div class="missing-actions"><a class="audit-btn" href="inventory.html#edit=${encodeURIComponent(i.id)}"><i class="fas fa-pen"></i> Edit Quality</a></div></article>`;}).join('')}</div>`:'<div class="audit-empty"><div class="audit-empty-icon"><i class="fas fa-circle-check"></i></div><strong>All payments received!</strong><span>There are no qualities with an outstanding amount.</span></div>';
   };
  drawPending();
  AlishanStore.subscribe(()=>drawPending());   // a payment (here or in another tab) redraws the list
  root.addEventListener('click',async e=>{
   const btn=e.target.closest('[data-receive]');
   if(!btn||btn.disabled)return;
   btn.disabled=true;
   const item=AlishanStore.getItem(btn.dataset.receive);
   if(!item){btn.disabled=false;return;}
   // the SAME payment rules as the Reports page: calc.js works out the pending value, store.js saves it
   const pay=AlishanStore.itemPayment(item);
   const result=await AlishanStore.addPayment({inventoryId:item.id,amount:pay.pending,date:AlishanCalc.localDate(new Date()),notes:''});
   if(!result.ok){btn.disabled=false;alert(result.error);}   // success: the store redraws and the quality leaves the list
  });
 }else if(isMissingCompletion){
   // Complete qualities with no completion date. The owner types the real day; nothing is guessed (ALISHAN-CHG-2026-11-06-004)
   const entryDay=i=>AlishanCalc.localDate(AlishanCalc.parseDate(i.dateTime));
   const drawMissing=()=>{
    const typed={};root.querySelectorAll('[data-day]').forEach(x=>{if(x.value)typed[x.dataset.day]=x.value;});   // keep what is typed in other cards
    const rows=AlishanStore.missingCompletionItems(), today=AlishanCalc.localDate(new Date());
    root.innerHTML=rows.length?`<div class="audit-toolbar"><span class="audit-count">${rows.length} Complete ${rows.length===1?'quality':'qualities'} without a completion date</span><span>Newest entry first</span></div><div class="missing-grid">${rows.map(i=>{const total=AlishanCalc.itemTotals(i);return `<article class="missing-entry"><div class="missing-card-head"><div><h3>${esc(i.quality)}</h3><span class="missing-code">${esc(i.code||i.id)}</span></div><span class="missing-status completed"><i class="fas fa-check-circle"></i>Completed</span></div><div class="missing-details"><div class="missing-detail"><span>Product Type</span><strong>${esc(i.productType)}</strong></div><div class="missing-detail"><span>Entry Date</span><strong>${esc(AlishanCalc.fmtDate(i.dateTime))}</strong></div><div class="missing-detail"><span>Total Dozen</span><strong>${esc(total.dozens)}</strong></div><div class="missing-detail"><span>Lot Number</span><strong>${esc(i.lotNumber||'N/A')}</strong></div></div><div class="missing-actions completion-form"><label>Day the goods went<input type="date" data-day="${esc(i.id)}" min="${esc(entryDay(i))}" max="${esc(today)}" value="${esc(typed[i.id]||'')}"></label><button class="audit-btn" data-save="${esc(i.id)}" type="button"><i class="fas fa-calendar-check"></i> Save date</button></div></article>`;}).join('')}</div>`:'<div class="audit-empty"><div class="audit-empty-icon"><i class="fas fa-circle-check"></i></div><strong>All caught up!</strong><span>Every Complete quality has a completion date.</span></div>';
   };
   drawMissing();
   AlishanStore.subscribe(drawMissing);
   root.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-save]');if(!btn||btn.disabled)return;
    const input=[...root.querySelectorAll('[data-day]')].find(x=>x.dataset.day===btn.dataset.save);
    if(!input||!input.value){alert('Choose the day the goods went first.');return;}
    btn.disabled=true;
    const result=await AlishanStore.setCompletionDate(btn.dataset.save,input.value);
    if(!result.ok){btn.disabled=false;alert(result.error);}   // success: the store redraws and the quality leaves this list
   });
 }else{
   const rows=AlishanStore.missingLotItems(); const today=new Date();
   root.innerHTML=rows.length?`<div class="audit-toolbar"><span class="audit-count">${rows.length} ${rows.length===1?'quality':'qualities'} waiting for Lot Number</span><span>Completed &amp; Incomplete</span></div><div class="missing-grid">${rows.map(i=>{const added=new Date(i.addedDateTime||i.dateTime);const days=Math.max(0,Math.floor((today-added)/86400000));const total=AlishanCalc.itemTotals(i);const completed=i.inStock===false;/* Complete = out of stock */return `<article class="missing-entry"><div class="missing-card-head"><div><h3>${esc(i.quality)}</h3><span class="missing-code">${esc(i.code||i.id)}</span></div><span class="missing-status ${completed?'completed':'incomplete'}"><i class="fas ${completed?'fa-check-circle':'fa-hourglass-half'}"></i>${completed?'Completed':'Incomplete'}</span></div><div class="missing-details"><div class="missing-detail"><span>Product Type</span><strong>${esc(i.productType)}</strong></div><div class="missing-detail"><span>Added Date</span><strong>${esc(AlishanCalc.fmtDate(i.addedDateTime||i.dateTime))}</strong></div><div class="missing-detail"><span>Total Dozen</span><strong>${esc(total.dozens)}</strong></div><div class="missing-detail pending"><span>Pending Days</span><strong>${days} ${days===1?'day':'days'}</strong></div></div><div class="missing-actions"><a class="audit-btn" href="inventory.html#edit=${encodeURIComponent(i.id)}"><i class="fas fa-pen"></i> Edit Quality / Add Lot Number</a></div></article>`;}).join('')}</div>`:'<div class="audit-empty"><div class="audit-empty-icon"><i class="fas fa-circle-check"></i></div><strong>All caught up!</strong><span>There are no qualities waiting for a Lot Number.</span></div>';
 }
})();
