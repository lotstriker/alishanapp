/* Server transport only: no quantity, price, amount, pending or report formulas. */
(function(){
 'use strict';
 const encode=ALISHAN_WIRE.encode,decode=ALISHAN_WIRE.decode;
 const listeners=new Set(),cache=new Map();
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('alishan-server'):null;
 let pending=[],scheduled=false;
 function changed(){cache.clear();for(const cb of listeners)Promise.resolve().then(cb).catch(reportError);}
 if(channel)channel.onmessage=changed;
 function reportError(e){console.error(e);if(typeof window.showNotification==='function')window.showNotification(e.message||'Server connection failed','error');}
 window.addEventListener('unhandledrejection',e=>{reportError(e.reason);});
 async function flush(){
  const batch=pending;pending=[];scheduled=false;
  try{
   const response=await fetch('/api/batch',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(batch.map(x=>({target:x.target,method:x.method,args:encode(x.args)}))),signal:AbortSignal.timeout(batch.some(x=>['restoreComplete','importBackup','restoreComplete','restoreBackup','importEntries'].includes(x.method))?180000:45000)});
   if(!response.ok)throw new Error(response.status===401?'Please sign in again.':'Server connection failed. Please try again.');
   const output=decode(await response.json());if(!Array.isArray(output)||output.length!==batch.length)throw new Error('Invalid server response. Please retry.');
   output.forEach((r,i)=>{if(r.error)batch[i].reject(new Error(r.error));else{
     if(batch[i].target==='Groups')batch[i].args.forEach((arg,n)=>{if(arg&&typeof arg==='object'&&!Array.isArray(arg)&&r.args[n]){for(const k of Object.keys(arg))delete arg[k];Object.assign(arg,r.args[n]);}});
     batch[i].resolve(r.result);
   }});
  }catch(e){batch.forEach(x=>x.reject(e));}
 }
 const mutations=new Set(['addItem','updateItem','deleteItem','toggleStock','setCompletionDate','addPayment','deletePayment','importEntries','undoImport','importBackup','restoreComplete','restoreBackup','restore','deleteForever','cleanLeftovers','saveInventory','replaceInventoryAndPayments']);
 function call(target,method,args){
  const pure=target==='Calc'||target==='Reports';
  const key=pure?JSON.stringify([target,method,Math.floor(Date.now()/60000),encode(args)]):null;
  if(key&&cache.has(key))return cache.get(key);
  const promise=new Promise((resolve,reject)=>{pending.push({target,method,args,resolve,reject});if(!scheduled){scheduled=true;setTimeout(flush,0);}}).then(r=>{
   if(mutations.has(method)&&r?.ok!==false){changed();if(channel)channel.postMessage('changed');}
   return r;
  });
  if(key){cache.set(key,promise);promise.catch(()=>cache.delete(key));if(cache.size>2000)cache.delete(cache.keys().next().value);}
  return promise;
 }
 const make=target=>{
  const out={};
  for(const [name,definition] of Object.entries(ALISHAN_META[target])){
   out[name]=definition?.fn?(...args)=>call(target,name,args):definition?.value!==undefined?()=>decode(structuredClone(definition.value)):decode(definition);
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
 window.AlishanRemote={call};
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
