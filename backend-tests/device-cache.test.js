'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),wire=require('../backend/wire');const {create}=require('../client/device-cache');
const reader=(target,method)=>target==='Calc'||target==='Views'||target==='Store'&&['getItems','summary','init'].includes(method);
const session={scope:'test-scope',release:'99.0.0'};
function opts(network,rest={}){return {wire,network,session,isReader:reader,...rest};}
function memoryDisk(){const records=new Map();const objectStore={get(key){const request={};queueMicrotask(()=>{request.result=structuredClone(records.get(key));request.onsuccess?.();});return request;},put(value,key){records.set(key,structuredClone(value));}};return {records,open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},transaction:()=>({objectStore:()=>objectStore}),close(){}};request.onsuccess?.();});return request;}};}
test('warm RAM reads are isolated copies with zero repeat network calls; writes never cache or retry',async()=>{
 let calls=0;const cache=create(opts(async(target,method)=>{calls++;return method==='summary'?{count:1}:{ok:true};}));
 let result=await cache.call('Store','summary',[]);result.count=900;assert.equal((await cache.call('Store','summary',[])).count,1);assert.equal(calls,1);
 await cache.call('Store','addPayment',[{amount:1}]);await cache.call('Store','addPayment',[{amount:1}]);assert.equal(calls,3);assert.equal(cache.inspect().entries,0);cache.close();
});
test('a device view survives page navigation and stays isolated from other users/releases',async()=>{
 const storage=memoryDisk();let calls=0;
 let cache=create(opts(async()=>{calls++;return {count:3};},{storage}));await cache.call('Store','summary',[]);cache.persist();cache.close();
 cache=create(opts(async()=>{calls++;throw new Error('network must not be needed');},{storage}));assert.equal((await cache.call('Store','summary',[])).count,3);assert.equal(calls,1);cache.close();
 for(const altered of [{scope:'other-user',release:session.release},{scope:session.scope,release:'100.0.0'}]){
  cache=create(opts(async()=>{calls++;return {count:9};},{storage,session:altered}));assert.equal((await cache.call('Store','summary',[])).count,9);cache.close();
 }
 assert.equal(calls,3);
});
test('a changed server revision invalidates a saved view; an old in-flight response cannot repopulate it',async()=>{
 let resolve,events=0;
 const cache=create(opts(async()=>new Promise(r=>{resolve=r;}),{onChange:()=>events++,fetchStatus:async()=>({...session,revision:'2'})}));
 cache.acceptRevision('1');const pending=cache.call('Store','summary',[]);await new Promise(r=>setImmediate(r));await cache.check(true);resolve({count:1});await pending;
 assert.equal(cache.inspect().entries,0);assert.equal(cache.inspect().revision,'2');assert.equal(events,1);cache.close();
});
test('uncertain payment result clears RAM and persisted views without retrying the write',async()=>{
 const storage=memoryDisk();let writes=0;
 const cache=create(opts(async(t,m)=>{if(m==='addPayment'){writes++;throw new Error('connection interrupted');}return {count:1};},{storage}));
 await cache.call('Store','summary',[]);cache.persist();await assert.rejects(cache.call('Store','addPayment',[]),/interrupted/);assert.equal(writes,1);cache.persist();assert.equal(cache.inspect().entries,0);assert.equal(storage.records.get(cache.inspect().namespace).entries.length,0);cache.close();
});
test('stale cached data displays immediately offline and revalidates in background',async()=>{
 let time=100000,calls=0;const statuses=[];
 const cache=create(opts(async()=>{if(calls++)throw new Error('offline');return {count:5};},{now:()=>time,onStatus:s=>statuses.push(s),fetchStatus:async()=>{throw new Error('offline');}}));
 await cache.call('Store','summary',[]);time+=61000;assert.equal((await cache.call('Store','summary',[])).count,5);await new Promise(r=>setImmediate(r));assert.ok(statuses.includes('updating'));assert.ok(statuses.includes('offline'));cache.close();
});
test('concurrent identical readers share one request; denied authentication purges cached views',async()=>{
 let calls=0;const cache=create(opts(async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {count:2};},{fetchStatus:async()=>{throw Object.assign(new Error('denied'),{status:401});}}));
 const values=await Promise.all(Array.from({length:20},()=>cache.call('Store','summary',[])));assert.equal(calls,1);assert.equal(values[0].count,2);await cache.check(true);assert.equal(cache.inspect().entries,0);cache.close();
});

test('older responses cannot roll back the known revision; bundle markers avoid duplicate large snapshots',async()=>{
 let calls=0;const primes=[{target:'Store',method:'summary',args:[],result:{count:7}}];
 const cache=create(opts(async()=>{calls++;return {primes};}));cache.acceptRevision('2');cache.acceptRevision('1');assert.equal(cache.inspect().revision,'2');
 await cache.call('Views','pageBundle',['home',null]);assert.equal((await cache.call('Store','summary',[])).count,7);await cache.call('Views','pageBundle',['home',null]);assert.equal(calls,1);cache.close();
});

test('backup/export and raw database reads always reach the server instead of an old device view',async()=>{
 let calls=0;const cache=create(opts(async()=>({version:++calls}),{isReader:()=>true}));
 for(const [target,method] of [['Store','backupFile'],['Store','exportRows'],['DB','getAll'],['Store','checkImportDraft']]){
  const a=await cache.call(target,method,[]),b=await cache.call(target,method,[]);assert.equal(b.version,a.version+1);
 }
 assert.equal(calls,8);assert.equal(cache.inspect().entries,0);cache.close();
});
test('an authoritative status check can invalidate a cache after the database revision resets',async()=>{
 const cache=create(opts(async()=>({count:2}),{fetchStatus:async()=>({...session,revision:'0'})}));cache.acceptRevision('20');await cache.call('Store','summary',[]);await cache.check(true);assert.equal(cache.inspect().revision,'0');assert.equal(cache.inspect().entries,0);cache.close();
});

test('background revalidation preserves cached values and digest when the server reports unchanged',async()=>{
 let time=100000,revalidations=0;const digests=[];
 const cache=create(opts(async(t,m,args,conditional)=>{if(conditional){revalidations++;digests.push(conditional.etag);conditional.unchanged=true;return conditional.value;}return {count:5};},{now:()=>time}));
 await cache.call('Store','summary',[]);for(let n=0;n<2;n++){time+=61000;assert.equal((await cache.call('Store','summary',[])).count,5);await new Promise(r=>setTimeout(r,15));}
 assert.equal(revalidations,2);assert.equal(digests[0],digests[1]);assert.match(digests[0],/^[a-f0-9]{64}$/);cache.close();
});
