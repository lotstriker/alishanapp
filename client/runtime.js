/* Server transport only: no quantity, price, amount, pending or report formulas. */
(function(){
 'use strict';
 const encode=ALISHAN_WIRE.encode,decode=ALISHAN_WIRE.decode;
 const scopedHeaders=()=>({'X-Alishan-Scope':window.ALISHAN_SESSION?.scope||''});
 const listeners=new Set(),cache=new Map();
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('alishan-server:'+window.ALISHAN_SESSION?.scope):null;
 let pending=[],scheduled=false;
 function changed(){cache.clear();for(const cb of listeners)Promise.resolve().then(cb).catch(reportError);}
 let device, signingOut=false;
 if(channel)channel.onmessage=()=>{device?.invalidate();changed();};
 function reportError(e){console.error(e);if(typeof window.showNotification==='function')window.showNotification(e.message||'Server connection failed','error');}
 window.addEventListener('unhandledrejection',e=>{reportError(e.reason);});
 // Scope arrays recur across weekly/report requests. Send each large argument
 // once per HTTP batch; the server expands it before executing the original rules.
 function pack(batch){
  const shared=[],seen=new Map();
  const calls=batch.map(x=>({target:x.target,method:x.method,known:x.conditional?.etag,args:x.args.map(arg=>{
    const encoded=encode(arg);if(!encoded||typeof encoded!=='object')return encoded;
    const key=JSON.stringify(encoded);if(key.length<1024)return encoded;
    let index=seen.get(key);if(index===undefined){index=shared.length;seen.set(key,index);shared.push(encoded);}
    return {$alishan:'batchArg',value:index};
  })}));
  return JSON.stringify({calls,shared});
 }
 async function flush(){
  const queued=pending;pending=[];scheduled=false;
  // Preserve each batch's execution order and stay below the API call limit.
  for(let start=0;start<queued.length;start+=500)await sendBatch(queued.slice(start,start+500));
 }
 async function sendBatch(batch){
  const clock=window.performance||Date;
  const start=clock.now(),visit=window.AlishanPerformance?.current();
  const bundle=batch.find(x=>x.target==='Views'&&x.method==='pageBundle')?.args[0];
  const kind=['home','inventory','reports'].includes(bundle)?bundle+'-bundle':
    batch.some(x=>x.target==='Views'&&x.method==='inventoryPage')?'inventory-page':
    batch.some(x=>x.target==='Store'&&x.method==='summary')?'dashboard-summary':
    batch.every(x=>isReader(x.target,x.method))?'read':'mixed';
  let headersAt,timing,response,decodeStarted;
  function capture(ok){
   const resource=clock.getEntriesByName?.(new URL('/api/batch',location.href).href,'resource')
    ?.filter(entry=>entry.startTime>=start&&entry.startTime<=(headersAt??clock.now()))
    .sort((a,b)=>Math.abs(a.responseStart-(headersAt??0))-Math.abs(b.responseStart-(headersAt??0)))[0];
   window.AlishanPerformance?.batch(start,headersAt,timing,ok,visit,{
    kind,queueMs:Math.max(0,start-Math.min(...batch.map(row=>row.queuedAt))),resource,
    encoding:response?.headers?.get?.('Content-Encoding')||'identity',
    responseBytes:Number(response?.headers?.get?.('X-Alishan-Decoded-Bytes'))||resource?.decodedBodySize,
    bodyDecodeMs:decodeStarted===undefined?undefined:clock.now()-decodeStarted
   });
  }
  try{
   response=await fetch('/api/batch',{method:'POST',headers:{'Content-Type':'application/json',...scopedHeaders()},credentials:'same-origin',body:pack(batch),signal:AbortSignal.timeout(batch.some(x=>['restoreComplete','importBackup','restoreBackup','importEntries'].includes(x.method))?180000:45000)});
   headersAt=clock.now();timing=response.headers?.get?.('Server-Timing');
   if(response.status===401)device?.revoke?.();
   if(!response.ok)throw new Error(response.status===401?'Please sign in again.':'Server connection failed. Please try again.');
   device?.acceptRevision(response.headers?.get?.('X-Alishan-Revision'));
   const body=await response.text();decodeStarted=clock.now();
   const output=decode(JSON.parse(body));if(!Array.isArray(output)||output.length!==batch.length)throw new Error('Invalid server response. Please retry.');
   capture(!output.some(row=>row.error));
   output.forEach((r,i)=>{if(r.unchanged&&batch[i].conditional){batch[i].conditional.unchanged=true;batch[i].resolve(batch[i].conditional.value);return;}if(r.error)batch[i].reject(new Error(r.error));else{
     if(batch[i].target==='Groups')batch[i].args.forEach((arg,n)=>{if(arg&&typeof arg==='object'&&!Array.isArray(arg)&&r.args[n]){for(const k of Object.keys(arg))delete arg[k];Object.assign(arg,r.args[n]);}});
     if(batch[i].conditional?.write)batch[i].conditional.primes=r.primes;
     batch[i].resolve(r.result);
   }});
  }catch(e){capture(false);batch.forEach(x=>x.reject(e));}
 }
 const mutations=new Set(['addItem','updateItem','deleteItem','toggleStock','setCompletionDate','addPayment','deletePayment','importEntries','undoImport','importBackup','restoreComplete','restoreBackup','restore','deleteForever','cleanLeftovers','saveInventory','replaceInventoryAndPayments']);
 const referenceMethods=new Set(['getColorStyle','getColorStyleSafe','colorDisplayName','getPrice','getProductTypes','getColors','getQualityData']);
 function networkCall(target,method,args,conditional){
  const pure=!device?.enabled&&(target==='Calc'||target==='Reports'||target==='Store'&&referenceMethods.has(method));
  const key=pure?JSON.stringify([target,method,Math.floor(Date.now()/60000),encode(args)]):null;
  if(key&&cache.has(key))return cache.get(key);
  const promise=new Promise((resolve,reject)=>{pending.push({target,method,args,conditional,resolve,reject,queuedAt:(window.performance||Date).now()});if(!scheduled){scheduled=true;setTimeout(flush,0);}}).then(r=>{
   if(!device?.enabled&&mutations.has(method)&&r?.ok!==false){changed();if(channel)channel.postMessage('changed');}
   return r;
  });
  if(key){cache.set(key,promise);promise.catch(()=>cache.delete(key));if(cache.size>2000)cache.delete(cache.keys().next().value);}
  return promise;
 }
 const isReader=(target,method)=>ALISHAN_META[target]?.[method]?.read??(['Calc','Reports','Views','Search','Groups'].includes(target)||target==='DB'&&['init','get','getAll','getAllFrom','getSetting','getTheme','getSearchAnalytics','getSearchHistory','getInventory','getPayments','getArchive','getQualityHistory','getRecentActivity'].includes(method));
 function shellMessage(type){navigator.serviceWorker?.controller?.postMessage({type,session:window.ALISHAN_SESSION,scope:window.ALISHAN_SESSION?.scope});}
 function cacheStatus(kind,checkedAt=device?.inspect().checkedAt){
  if(['signin','reload'].includes(kind)){
   window.AlishanRouter?.block();
   if(typeof navigator!=='undefined')shellMessage('CLEAR_VIEW_SESSION');
   if(kind==='signin'&&window.ALISHAN_SESSION?.google&&!signingOut){
    location.replace('/login');
    return;
   }
   if(kind==='reload'&&window.ALISHAN_SESSION?.google){
    location.reload();
    return;
   }
  }
  if(kind==='current'&&typeof navigator!=='undefined')shellMessage('BIND_VIEW_SESSION');
  if(typeof document==='undefined')return;
  const paint=()=>{let el=document.getElementById('deviceCacheStatus');if(!el){el=document.createElement('button');el.id='deviceCacheStatus';el.type='button';el.setAttribute('role','status');el.style.cssText='position:fixed;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));max-width:calc(100vw - 24px);z-index:2200;padding:6px 10px;border:1px solid var(--border-color,#aaa);border-radius:16px;background:var(--bg-secondary,#fff);color:var(--text-primary,#222);font:12px sans-serif;box-shadow:0 2px 8px #0002';el.onclick=()=>{if(el.dataset.state==='reload'){shellMessage('CLEAR_VIEW_SESSION');location.reload();}else{void syncNow();}};document.body.appendChild(el);}
   const labels={saved:'Saved view',updating:'Saved view · updating…',loading:'Loading…',current:'Sync Now',offline:'Offline · saved view',reload:'App updated · Reload',signin:'Please sign in again'};
   el.dataset.state=kind;el.textContent=(labels[kind]||kind)+(checkedAt&&['current','saved','offline'].includes(kind)?' · Last checked '+new Date(checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'');el.title='Check the server for changes';};
  if(document.body)paint();else document.addEventListener('DOMContentLoaded',paint,{once:true});
 }
 const autoCheckInterval=12*3600000;
 async function syncNow(){await device?.ready;return device?.check(true);}
 device=window.AlishanCreateDeviceCache?.({checkIntervalMs:autoCheckInterval,wire:ALISHAN_WIRE,network:networkCall,session:window.ALISHAN_SESSION,isReader,onChange:changed,onStatus:cacheStatus,broadcast:()=>channel?.postMessage('changed'),fetchStatus:async()=>{
  const response=await fetch('/api/cache-status',{headers:scopedHeaders(),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(new Error('Status unavailable'),{status:response.status});return response.json();
 }});
 function pageName(){const path=location.pathname;return /inventory\.html$/.test(path)?'inventory':/reports\.html$/.test(path)?'reports':/\/$|index\.html$/.test(path)?'home':null;}
 function advancedOptions(){if(window.AlishanAdvancedSearch?.getOptions)return window.AlishanAdvancedSearch.getOptions();try{return JSON.parse(localStorage.getItem('alishan.advancedSearch.v1')||'null');}catch{return null;}}
 async function readStartupCache(target,method,args){
  const visit=window.AlishanPerformance?.current(),started=performance.now();
  const hit=await device?.lookup(target,method,args);
  if(visit&&hit?.kind!=='shared'){
   const phases={hit:'startupCacheHitMs',miss:'startupCacheMissMs'};
   window.AlishanPerformance?.phase(phases[hit?.kind||'miss'],started,visit);
  }
  return hit?.kind==='hit'?hit.value:undefined;
 }
 async function preparePage(name){
  if(!device?.enabled||!name)return;
  const args=[name,name==='inventory'?advancedOptions():null];
  const visit=name===pageName()?window.AlishanPerformance?.current():undefined;
  if(visit){
   const started=performance.now(),cached=await device.lookup('Views','pageBundle',args);
   const result=await device.call('Views','pageBundle',args);
   if(cached.kind==='shared')window.AlishanPerformance?.phase('startupSharedWaitMs',started,visit);
   return result;
  }
  return device.call('Views','pageBundle',args);
 }
 async function themePreference(theme){
  const options={headers:scopedHeaders(),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)};
  if(theme!==undefined)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json',...scopedHeaders()},body:JSON.stringify({theme})});
  const response=await fetch('/api/theme',options);
  if(!response.ok)throw new Error('Theme sync failed');
  const result=await response.json();
  return theme===undefined?result.theme:result.ok;
 }
 function call(target,method,args){
  if(target==='Store'&&method==='reviewEntry')return networkCall(target,method,args);
  if(device?.enabled&&target==='DB'&&method==='setTheme')return themePreference(args[0]);
  if(device?.enabled&&target==='DB'&&method==='getTheme')return themePreference();
  if(device?.enabled&&target==='Store'&&method==='init'){
   const page=pageName(), visit=page&&window.AlishanPerformance?.current(), started=performance.now();
   return preparePage(page).catch(()=>{}).then(()=>{
    if(visit)window.AlishanPerformance?.phase('startupRefreshMs',started,visit);
    return device.call(target,method,args);
   });
  }
  return device?device.call(target,method,args):networkCall(target,method,args);
 }
 const activeSaves=new Map();
 function saveOnce(method,input,token){
  const key='alishan:pending:'+window.ALISHAN_SESSION?.scope+':'+method+':'+(input.inventoryId??'entry');
  const existing=activeSaves.get(key);if(existing)return existing;
  const task=(async()=>{
   let pending, recovering;
   try{
    pending=JSON.parse(localStorage.getItem(key)||'null');
    recovering=Boolean(pending);

    if(!pending){pending={id:crypto.randomUUID(),input,token};localStorage.setItem(key,JSON.stringify(pending));}
   }catch{return {ok:false,error:'Browser storage is unavailable. Allow storage to safely submit.'};}
   const measured=window.AlishanTimings?.action(method==='addPayment'?'Payment save confirmation':'Entry save confirmation');
   let result;
   try{
    const status=recovering?await networkCall('Store','submissionStatus',[pending.id]):{};
    if(status.confirmed){device?.invalidate();changed();}
    const same=JSON.stringify(pending.input)===JSON.stringify(input);
    if(status.confirmed)result=status.result;
    else if(same||window.confirm('Retry the previous unconfirmed save for this record?'))result=await call('Store',method,[pending.input,pending.id,pending.token]);
    else return {ok:false,error:'Previous save is still unconfirmed.'};
    if(!same&&result.ok){
     localStorage.removeItem(key);
     return {ok:false,error:'Previous save confirmed. Your new inputs have been kept.'};
    }
   }
   catch{return {ok:false,error:'Save confirm nahi hua. Tap Save again to check the same attempt.'};}
   try{localStorage.removeItem(key);}catch{}
   if(result.ok)measured?.();
   return result;
  })();
  activeSaves.set(key,task);
  task.finally(()=>activeSaves.delete(key));
  return task;
 }
 const draftQuotes=new Map();
 async function submitEntry(input){
  const key='alishan:pending:'+window.ALISHAN_SESSION?.scope+':addItem:entry';
  let pending;
  try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  if(pending){
   if(!window.confirm('A previous submission is unconfirmed. Check or retry that same entry?'))
    return {ok:false,error:'Previous submission is still unconfirmed.'};
   const result=await saveOnce('addItem',pending.input,pending.token);
   if(result.ok&&JSON.stringify(pending.input)!==JSON.stringify(input))
    return {ok:false,error:'Previous entry confirmed. Your current form has been kept.'};
   return result;
  }
  const quoteKey=String(input.quality).trim().toUpperCase();
  let review;
  try{
   review=await call('Store','reviewEntry',[input,draftQuotes.get(quoteKey)]);
   if(!review.ok)return review;
   draftQuotes.set(quoteKey,review.quote);
   if(review.preview.price!==review.currentPrice&&window.confirm('The price changed. Use the current master price of ₹'+review.currentPrice+'? Cancel keeps the draft price of ₹'+review.preview.price+'.')){
    review=await call('Store','reviewEntry',[input]);
    if(!review.ok)return review;
   }
  }catch{return {ok:false,error:'Review could not load. Your entry is still in the form.'};}
  const p=review.preview;
  if(!window.confirm('Review and submit this entry?\n'+p.productType+' · '+p.quality+' · '+p.cupSize+'\n'+p.colors.map(c=>c.name||c).join(', ')+'\nPieces: '+p.pieces+' | Dozens: '+p.dozens+'\nPrice: ₹'+p.price+' | Amount: ₹'+p.amount+'\nSizes: '+JSON.stringify(input.sizeOption==='different'?input.colorSizes||input.sizes:input.sizes)+'\nEntry date: '+(input.entry?.mode==='old'?input.entry.date+' '+input.entry.time:'Today')+'\nMaterial: '+(input.material||'—')+' | Weight: '+(input.weight||'—')+'\nNotes: '+(input.notes||'—')))
   return {ok:false,error:'Entry kept in the form. Nothing was submitted.'};
  const result=await saveOnce('addItem',input,review.token);
  if(result.ok)draftQuotes.delete(quoteKey);
  return result;
 }
 const make=target=>{
  const out={};
  for(const [name,definition] of Object.entries(ALISHAN_META[target])){
   out[name]=definition?.fn?(...args)=>target==='Store'&&name==='addPayment'?saveOnce(name,args[0]):call(target,name,args):definition?.value!==undefined?()=>decode(structuredClone(definition.value)):decode(definition);
  }
  return out;
 };
 window.AlishanCalc=make('Calc');window.AlishanStore=make('Store');window.ReportEngine=make('Reports');window.AlishanArchive=make('Archive');window.AlishanDB=make('DB');window.AlishanGroupCore=make('Groups');
 // Presentation-only formatting; all business values arrive from the server.
 const parseDate=value=>{if(value instanceof Date)return value;if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d);}return new Date(value);};
 const fmtNumber=(value,maxDecimals=2)=>{const n=Number(value);return (Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:maxDecimals});};
 const fmtDateLong=value=>{const d=parseDate(value);return isNaN(d)?'N/A':d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});};
 Object.assign(AlishanCalc,{parseDate,fmtNumber,fmtMoney:n=>'₹'+fmtNumber(n),fmtDozens:n=>fmtNumber(n),fmtDate:value=>{const d=parseDate(value);return isNaN(d)?'N/A':d.toLocaleDateString('en-IN');},fmtDateLong,
 fmtDateTime:value=>{const d=parseDate(value);return isNaN(d)?'N/A':fmtDateLong(d)+', '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});},
 localDate:value=>{const d=parseDate(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;},
 localTime:value=>{const d=parseDate(value);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;},
 colorName:value=>(value&&typeof value==='object')?(value.name||''):String(value||'')});
 AlishanStore.subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};AlishanDB.onChange=()=>{};
 window.AlishanHas=needed=>Object.keys(needed).every(k=>window[k]!==undefined);
 window.AlishanRequire=async needed=>AlishanHas(needed);
 window.AlishanRemote={call,submitEntry,preparePage,readStartupCache,cacheInfo:()=>device?.inspect(),clearDeviceCache(){device?.invalidate(true);changed();void device?.check(true);}};
 if(device?.enabled){
  const addCacheControl=()=>{const host=document.getElementById('backup');if(!host||document.getElementById('refreshDeviceView'))return;const card=document.createElement('div');card.className='card';card.style.marginTop='18px';card.innerHTML='<div class="card-header"><h2 class="card-title">Saved Device View</h2></div><div class="card-body"><p class="settings-help">Loaded views are kept on this device for faster opening. Server records remain the source of truth.</p><button id="refreshDeviceView" type="button" class="btn btn-secondary">Sync Now</button></div>';host.appendChild(card);card.querySelector('button').onclick=async event=>{
   const button=event.currentTarget;button.disabled=true;
   try{
    const result=await syncNow();
    if(typeof showNotification==='function')showNotification(result?.ok?(result.changed?'Server changes found. Updating saved views.':'Server checked. No new revision.'):'Server check unavailable. Saved views kept if still authorized.',result?.ok?'success':'warning');
   }finally{button.disabled=false;}
  };};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addCacheControl,{once:true});else addCacheControl();
  const warmLink=e=>{
   const link=e.target.closest?.('a');
   if(!link||link.origin!==location.origin||link.pathname===location.pathname)return;
   const names={'/':'home','/index.html':'home','/inventory.html':'inventory','/reports.html':'reports'};
   const name=names[link.pathname];
   if(name)void preparePage(name).catch(()=>{});
   if(name||link.pathname==='/setting.html')navigator.serviceWorker?.controller?.postMessage({type:'WARM_VIEW',path:link.pathname==='/'?'/index.html':link.pathname});
  };
  for(const event of ['pointerover','pointerdown','focusin'])document.addEventListener(event,warmLink,{passive:true});
  if(window.ALISHAN_SESSION?.google){
   const addSignOut=()=>{
    const form=document.createElement('form');form.id='alishan-sign-out';form.method='post';form.action='/auth/logout';
    const button=document.createElement('button');button.type='submit';button.className='btn btn-secondary';button.textContent='Sign out';
    form.appendChild(button);(document.querySelector('main')||document.body).appendChild(form);
    form.addEventListener('submit',()=>{signingOut=true;device.revoke();shellMessage('CLEAR_VIEW_SESSION');});
   };
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addSignOut,{once:true});else addSignOut();
  }
  void device.ready.then(()=>device.check(true));
  const poll=setInterval(()=>{if(document.visibilityState!=='hidden')void device.check();},autoCheckInterval);poll?.unref?.();
  let lastForeground=0;
  const checkForeground=()=>{if(Date.now()-lastForeground>=60000){lastForeground=Date.now();void device.check(true);}};
  window.addEventListener('focus',checkForeground);window.addEventListener('online',()=>void device.check(true));window.addEventListener('offline',()=>cacheStatus('offline'));
  window.addEventListener('pagehide',()=>device.persist());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForeground();});
 }
 // Async equivalents preserve array callback semantics after calls move to the server.
 window.AlishanAsync={
  async map(a,fn,thisArg){return Promise.all(Array.from(a,(v,i)=>fn.call(thisArg,v,i,a)));},
  async forEach(a,fn,thisArg){for(let i=0;i<a.length;i++)await fn.call(thisArg,a[i],i,a);},
  async filter(a,fn,thisArg){const keep=await Promise.all(Array.from(a,(v,i)=>fn.call(thisArg,v,i,a)));return Array.from(a).filter((v,i)=>keep[i]);},
  async find(a,fn,thisArg){for(let i=0;i<a.length;i++)if(await fn.call(thisArg,a[i],i,a))return a[i];},
  async some(a,fn,thisArg){for(let i=0;i<a.length;i++)if(await fn.call(thisArg,a[i],i,a))return true;return false;},
  async every(a,fn,thisArg){for(let i=0;i<a.length;i++)if(!await fn.call(thisArg,a[i],i,a))return false;return true;},
  async flatMap(a,fn,thisArg){return (await this.map(a,fn,thisArg)).flat();},
  async reduce(a,fn,...initial){let i=initial.length?0:1,v=initial.length?initial[0]:a[0];if(!a.length&&!initial.length)throw new TypeError('Empty reduce');for(;i<a.length;i++)v=await fn(v,a[i],i,a);return v;},
  async sort(a,fn){ // stable merge sort, because native sort cannot await a comparator
   async function merge(rows){if(rows.length<2)return rows;const mid=Math.floor(rows.length/2),left=await merge(rows.slice(0,mid)),right=await merge(rows.slice(mid));const out=[];let i=0,j=0;while(i<left.length&&j<right.length){if(await fn(left[i],right[j])<=0)out.push(left[i++]);else out.push(right[j++]);}return out.concat(left.slice(i),right.slice(j));}
   const sorted=await merge(Array.from(a));a.splice(0,a.length,...sorted);return a;
  }
 };
})();
