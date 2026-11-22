/* Device copies of server-computed views. No business calculation or queued write. */
(function(root){
 'use strict';
 function create(options){
  const {wire,network,session,isReader,onChange=()=>{},onStatus=()=>{},broadcast=()=>{},fetchStatus}=options;
  const isPageBundle=(target,method)=>target==='Views'&&method==='pageBundle';
  const enabled=!!session?.scope,namespace=enabled?`${session.scope}:${session.release}`:'disabled';
  const ram=new Map(),flights=new Map();const MAX_BYTES=8*1024*1024,MAX_ENTRIES=600,MAX_RECORDS=4000,MAX_AGE=24*3600000;
  let previousRecord=0;
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
  function trim(){
   const keys=[...ram.keys()];
   const views=keys.filter(key=>!key.startsWith('@record:'));
   const records=keys.filter(key=>key.startsWith('@record:'));
   function drop(key){const entry=ram.get(key);if(!entry)return;bytes-=entry.bytes;ram.delete(key);}
   for(const key of views.slice(0,Math.max(0,views.length-MAX_ENTRIES)))drop(key);
   for(const key of records.slice(0,Math.max(0,records.length-MAX_RECORDS)))drop(key);
   for(const key of keys){if(bytes<=MAX_BYTES)break;drop(key);}
  }
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
  function saveValue(key,value,etag=null,refs=null){
   const size=(JSON.stringify(value).length+key.length+(refs?JSON.stringify(refs).length:0))*2;
   if(size>2*1024*1024)return;
   const old=ram.get(key);if(old)bytes-=old.bytes;
   ram.delete(key);ram.set(key,{value,at:now(),bytes:size,etag,refs});bytes+=size;
  }
  function entityKey(kind,id){return '@record:'+kind+':'+JSON.stringify(String(id));}
  function put(key,result,etag=null,target,method){
   if(!key||disabled||result?.ok===false)return;
   const encoded=wire.encode(result);
   const projection=target==='Views'&&['inventoryPage','homeLatest'].includes(method);
   const list=projection?(encoded.paged?.items||encoded.items):encoded;
   const kind=target==='Store'&&method==='getPayments'?'payment':'inventory';
   const normalizeList=projection||target==='Store'&&['getItems','getPayments','query'].includes(method);
   const normalizeItem=target==='Store'&&method==='getItem'&&encoded?.id!=null;
   if(normalizeItem||normalizeList&&Array.isArray(list)&&list.every(row=>row&&row.id!=null)){
    const rows=normalizeItem?[encoded]:list;
    const keys=rows.map(row=>{
     const recordKey=entityKey(kind,row.id);
     const existing=ram.get(recordKey);
     const value=JSON.stringify(row);
     // A stale projection keeps its original row version after a refresh.
     if(existing&&JSON.stringify(existing.value)!==value&&existing.bytes<=2*1024*1024){
      let previousKey;
      do{previousKey=recordKey+':previous:'+(++previousRecord);}while(ram.has(previousKey));
      for(const entry of ram.values()){
       if(!entry.refs?.keys.includes(recordKey))continue;
       if(!ram.has(previousKey)){
        ram.set(previousKey,{...existing,stale:true});bytes+=existing.bytes;
       }
       entry.refs.keys=entry.refs.keys.map(ref=>ref===recordKey?previousKey:ref);
      }
     }
     saveValue(recordKey,row);
     return recordKey;
    });
    const shape=normalizeItem?'item':!projection?'list':encoded.paged?'paged':'latest';
    if(shape==='paged')encoded.paged.items=[];
    if(shape==='latest')encoded.items=[];
    saveValue(key,projection?encoded:null,etag,{shape,keys});
   }else saveValue(key,encoded,etag);
   trim();saveSoon();
  }
  function readValue(entry){
   if(!entry.refs)return {value:clone(entry.value)};
   const rows=entry.refs.keys.map(key=>ram.get(key));
   if(rows.some(row=>!row||now()-row.at>=MAX_AGE))return null;
   const values=rows.map(row=>clone(row.value));
   switch(entry.refs.shape){
    case 'item':return {value:values[0]};
    case 'list':return {value:values};
    case 'paged':{const value=clone(entry.value);value.paged.items=values;return {value};}
    case 'latest':{const value=clone(entry.value);value.items=values;return {value};}
   }
   return null;
  }
  function findEntry(target,method,args,key,allowStale=false){
   const entry=ram.get(key);
   if(entry&&now()-entry.at<MAX_AGE&&(!entry.stale||allowStale)&&(!entry.refs||entry.refs.keys.every(ref=>{const row=ram.get(ref);return row&&now()-row.at<MAX_AGE;})))return entry;
   if(target==='Store'&&method==='query'&&args.length===1&&args[0]&&Object.entries(args[0]).every(([field,value])=>
     ['period','productType','quality','stock'].includes(field)?!value||value==='all':
     ['search','code','lotNumber','dateFrom','dateTo'].includes(field)&&!value)){
    const complete=ram.get('["Store","getItems",[]]');
    if(complete&&!complete.stale&&now()-complete.at<MAX_AGE&&readValue(complete))return complete;
   }
   if(target==='Store'&&method==='getItem'&&args.length===1){
    const record=ram.get(entityKey('inventory',args[0]));
    if(record&&!record.stale&&now()-record.at<MAX_AGE)return record;
   }
   return null;
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
    put(key,projection?{...p.result,primes:[]}:p.result,etag,p.target,p.method);
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
      if(key.startsWith('@record:')){entry.stale=true;continue;}
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
    const previous=key&&ram.get(key),saved=previous&&readValue(previous);
    const conditional=previous?.etag&&saved?{etag:previous.etag,value:saved.value,unchanged:false}:null;
    const isBundle=isPageBundle(target,method);
    const visit=isBundle?root.AlishanPerformance?.current():undefined;
    const started=visit?root.performance.now():undefined;
    let result;
    try { result=await network(target,method,args,conditional); }
    finally { if(visit)root.AlishanPerformance?.phase('startupFetchMs',started,visit); }
    if(conditional?.unchanged){if(generation===epoch&&ram.get(key)===previous)put(key,result,previous.etag,target,method);return result;}
    const etag=await digest(result);
    if(generation===epoch){if(target==='Views'&&['inventoryPage','homeLatest','pageBundle'].includes(method))await seed(result?.primes,generation);
      if(generation===epoch)put(key,isBundle?{primes:[],ready:true}:target==='Views'&&['inventoryPage','homeLatest'].includes(method)?{...result,primes:[]}:result,etag,target,method);}
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
   const key=await keyFor(target,method,args),entry=findEntry(target,method,args,key,allowStale);
   if(entry)return {kind:entry.stale?'stale':'hit',value:readValue(entry).value};
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
   const key=await keyFor(target,method,args),entry=findEntry(target,method,args,key);
   if(entry){
    const value=readValue(entry).value;
    if(ram.get(key)===entry){ram.delete(key);ram.set(key,entry);}
    // The account revision check refreshes prepared bundles as a unit.
    if(ram.get(key)===entry&&now()-entry.at>60000&&(!fetchStatus||!isPageBundle(target,method))){
     status('updating');const before=JSON.stringify(wire.encode(value));
     load(target,method,args,key,true).then(result=>{if(JSON.stringify(wire.encode(result))!==before)onChange();status('current');}).catch(()=>status('offline'));
    }
    if(!lastCheck||now()-lastCheck>=CHECK_INTERVAL)void check();
    if(target==='Views'&&['inventoryPage','homeLatest','pageBundle'].includes(method))await seed(value?.primes,epoch);
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
