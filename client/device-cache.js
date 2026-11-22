/* Device copies of server-computed views. No business calculation or queued write. */
(function(root){
 'use strict';
 function create(options){
  const {wire,network,session,isReader,onChange=()=>{},onStatus=()=>{},broadcast=()=>{},fetchStatus}=options;
  const isPageBundle=(target,method)=>target==='Views'&&method==='pageBundle';
  const enabled=!!session?.scope,namespace=enabled?`${session.scope}:${session.release}`:'disabled';
  const ram=new Map(),flights=new Map();const MAX_BYTES=8*1024*1024,MAX_ENTRIES=600,MAX_AGE=24*3600000;
  let epoch=0,revision=null,bytes=0,db=null,timer=null,checking=null,closed=false,disabled=false,lastCheck=0;
  const CHECK_INTERVAL=options.checkIntervalMs??15000;
  const now=options.now||Date.now,storage=options.storage||root.indexedDB;
  const clone=value=>wire.decode(structuredClone(value));
  function status(kind){onStatus(kind,lastCheck);}
  const ready=(async()=>{
   if(!enabled||!storage)return;
   const initialEpoch=epoch;
   try{
    db=await new Promise((resolve,reject)=>{const req=storage.open('alishan-view-cache',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('views'))req.result.createObjectStore('views');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Cache unavailable'));});
    const saved=await new Promise((resolve,reject)=>{const req=db.transaction('views').objectStore('views').get(namespace);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    if(epoch===initialEpoch&&saved&&saved.at>now()-MAX_AGE&&Array.isArray(saved.entries)){
     revision=saved.revision??null;
     lastCheck=Number.isFinite(saved.checkedAt)&&saved.checkedAt<=now()?saved.checkedAt:0;
     for(const [key,entry] of saved.entries){if(typeof key==='string'&&entry&&entry.at>now()-MAX_AGE){ram.set(key,entry);bytes+=entry.bytes||0;}}
     trim();if(ram.size)status('saved');
    }
   }catch{db=null;}
  })();
  function trim(){while(bytes>MAX_BYTES||ram.size>MAX_ENTRIES){const key=ram.keys().next().value,entry=ram.get(key);bytes-=entry?.bytes||0;ram.delete(key);}}
  function persist(){
   if(!db||closed)return;
   try{const tx=db.transaction('views','readwrite');tx.objectStore('views').put({revision,checkedAt:lastCheck,at:now(),entries:[...ram]},namespace);tx.onerror=()=>{};tx.onabort=()=>{};}catch{}
  }
  function saveSoon(){if(!db)return;clearTimeout(timer);timer=setTimeout(persist,200);timer?.unref?.();}
  async function keyFor(target,method,args){
   const referenceVersion=target==='Store'&&['getColors','getColorStyle','getColorStyleSafe','colorDisplayName'].includes(method)?root.ALISHAN_COLOR_PALETTE_VERSION:undefined;
   const text=JSON.stringify(referenceVersion?[target,method,wire.encode(args),referenceVersion]:[target,method,wire.encode(args)]);
   if(text.length<16000)return text;
   if(!root.crypto?.subtle)return null;
   const data=new TextEncoder().encode(text);const hash=await root.crypto.subtle.digest('SHA-256',data);
   return 'sha256:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function put(key,result,etag=null){
   if(!key||disabled)return;
   const encoded=wire.encode(result),size=JSON.stringify(encoded).length*2+key.length*2;
   if(size>2*1024*1024||result?.ok===false)return;
   const old=ram.get(key);if(old)bytes-=old.bytes;
   ram.delete(key);ram.set(key,{value:encoded,at:now(),bytes:size,etag});bytes+=size;trim();saveSoon();
  }
  async function seed(primes,generation=epoch){
   if(!enabled||!Array.isArray(primes))return;
   const rows=await Promise.all(primes.map(async p=>({p,key:await keyFor(p.target,p.method,p.args),etag:await digest(p.result)})));
   if(generation!==epoch)return;
   for(const {p,key,etag} of rows){
    if(generation!==epoch)return;
    if(!isReader(p.target,p.method)||p.target==='Groups')continue;
    const projection=p.target==='Views'&&['inventoryPage','homeLatest'].includes(p.method);
    if(projection)await seed(p.result?.primes,generation);
    if(generation!==epoch)return;
    put(key,projection?{...p.result,primes:[]}:p.result,etag);
   }
  }
  function invalidate(announce=false){
   epoch++;ram.clear();bytes=0;flights.clear();revision=null;lastCheck=0;persist();
   if(announce)broadcast();
  }
  function acceptRevision(value,authoritative=false){
   if(value===null||value===undefined||value==='')return;
   value=String(value);
   if(revision!==null&&/^\d+$/.test(value)&&/^\d+$/.test(revision)&&BigInt(value)<BigInt(revision)&&!authoritative)return;
   if(revision!==null&&revision!==value){
    if(/^\d+$/.test(value)&&/^\d+$/.test(revision)&&BigInt(value)>BigInt(revision)){
     epoch++;flights.clear();
     for(const [key,entry] of ram){
      if(key.startsWith('["Calc",'))continue;
      if(key==='["Store","summary",[]]'||key.startsWith('["Views","inventoryPage",')){
       entry.stale=true;
      }else{
       bytes-=entry.bytes;
       ram.delete(key);
      }
     }
     revision=value;persist();
    }else{invalidate();revision=value;}
    onChange();
   }
   else revision=value;
   saveSoon();
  }
  async function check(force=false){
   if(!enabled||closed||!fetchStatus||disabled)return;
   if(checking)return checking;if(!force&&lastCheck&&now()-lastCheck<CHECK_INTERVAL)return;
   checking=(async()=>{try{
    status(ram.size?'updating':'loading');const current=await fetchStatus();
    if(current.scope!==session.scope||current.release!==session.release){invalidate();disabled=true;status('reload');return;}
    const previous=revision;acceptRevision(current.revision,true);lastCheck=now();saveSoon();status('current');
    return {ok:true,changed:previous!==null&&previous!==revision,checkedAt:lastCheck};
   }catch(e){if(e.status===401){invalidate();disabled=true;status('signin');}else status('offline');return {ok:false};}
   finally{checking=null;}})();return checking;
  }
  async function digest(value){if(!root.crypto?.subtle)return null;const buffer=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(wire.encode(value))));return Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');}
  async function load(target,method,args,key,background=false){
   const existing=key&&flights.get(key);if(existing)return existing;
   const generation=epoch;
   const task=(async()=>{
    const previous=key&&ram.get(key),conditional=previous?.etag?{etag:previous.etag,value:clone(previous.value),unchanged:false}:null;
    const isBundle=isPageBundle(target,method);
    const visit=isBundle?root.AlishanPerformance?.current():undefined;
    const started=visit?root.performance.now():undefined;
    let result;
    try { result=await network(target,method,args,conditional); }
    finally { if(visit)root.AlishanPerformance?.phase('startupFetchMs',started,visit); }
    if(conditional?.unchanged){if(generation===epoch&&ram.get(key)===previous){previous.at=now();previous.stale=false;saveSoon();}return result;}
    const etag=await digest(result);
    if(generation===epoch){if(target==='Views'&&['inventoryPage','homeLatest','pageBundle'].includes(method))await seed(result?.primes,generation);
      if(generation===epoch)put(key,isBundle?{primes:[],ready:true}:target==='Views'&&['inventoryPage','homeLatest'].includes(method)?{...result,primes:[]}:result,etag);}
    return result;
   })();
   if(key)flights.set(key,task);
   try{return await task;}finally{if(key&&flights.get(key)===task)flights.delete(key);}
  }
  function clearBusiness(announce=false){
   epoch++;flights.clear();revision=null;
   for(const [key,entry] of ram){
    if(key.startsWith('["Calc",'))continue;
    bytes-=entry.bytes;ram.delete(key);
   }
   persist();
   if(announce)broadcast();
  }
  async function lookup(target,method,args,{allowStale=false}={}){
   await ready;
   if(!enabled||disabled)return {kind:'miss'};
   const key=await keyFor(target,method,args),entry=key&&ram.get(key);
   if(entry&&now()-entry.at<MAX_AGE&&(!entry.stale||allowStale))return {kind:entry.stale?'stale':'hit',value:clone(entry.value)};
   return {kind:key&&flights.has(key)?'shared':'miss'};
  }
  async function call(target,method,args){
   if(!enabled)return network(target,method,args);
   const cacheStarted=root.performance?.now(), cacheVisit=root.AlishanPerformance?.current();
   await ready;
   if(cacheStarted!==undefined&&cacheVisit)root.AlishanPerformance?.phase('deviceCacheReadMs',cacheStarted,cacheVisit);
   const reader=isReader(target,method);
   if(!reader){
    // Even an uncertain write clears old views. Never retry or optimistically acknowledge a write.
    if(target==='Store'&&['addItem','updateItem','addPayment'].includes(method)){
     const delta={primes:null,write:true};
     try{return await network(target,method,args,delta);}
     finally{
      clearBusiness(true);
      if(delta.primes)await seed(delta.primes);
      onChange();check(true);
     }
    }
    invalidate(true);
    try{return await network(target,method,args);}finally{invalidate(true);onChange();check(true);}
   }
   // Backups, exports and validation previews must read fresh server state.
   const freshOnly=target==='DB'&&!['init','getTheme'].includes(method)||/backup|export|inspect|^new|^build|^validate|^merge|^purge|^leftover|checkImportDraft|parseBulk|batchDuplicateIds/i.test(method);
   if(target==='Groups'||disabled||freshOnly)return network(target,method,args);
   const key=await keyFor(target,method,args),entry=key&&ram.get(key);
   if(entry&&!entry.stale&&now()-entry.at<MAX_AGE){
    ram.delete(key);ram.set(key,entry);
    // The account revision check refreshes prepared bundles as a unit.
    if(now()-entry.at>60000&&(!fetchStatus||!isPageBundle(target,method))){
     status('updating');const before=JSON.stringify(entry.value);
     load(target,method,args,key,true).then(result=>{if(JSON.stringify(wire.encode(result))!==before)onChange();status('current');}).catch(()=>status('offline'));
    }
    if(!lastCheck||now()-lastCheck>=CHECK_INTERVAL)void check();
    const value=clone(entry.value);if(target==='Views'&&['inventoryPage','homeLatest','pageBundle'].includes(method))await seed(value?.primes,epoch);
    return value;
   }
   return load(target,method,args,key);
  }
  function close(){clearTimeout(timer);persist();closed=true;db?.close();}
  function revoke(){invalidate();disabled=true;status('signin');}
  return {enabled,ready,call,lookup,seed,check,revoke,acceptRevision,invalidate,persist,close,inspect:()=>({entries:ram.size,bytes,revision,epoch,namespace,checkedAt:lastCheck})};
 }
 root.AlishanCreateDeviceCache=create;
 if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
