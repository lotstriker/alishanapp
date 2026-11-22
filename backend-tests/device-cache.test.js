'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),wire=require('../backend/wire');const {create}=require('../client/device-cache');
const reader=(target,method)=>target==='Calc'||target==='Views'||target==='Store'&&['getItems','summary','init'].includes(method);
const session={scope:'test-scope',release:'99.0.0'};
function opts(network,rest={}){return {wire,network,session,isReader:reader,...rest};}
function memoryDisk(){const records=new Map();const objectStore={get(key){const request={};queueMicrotask(()=>{request.result=structuredClone(records.get(key));request.onsuccess?.();});return request;},put(value,key){records.set(key,structuredClone(value));}};return {records,open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},transaction:()=>{const tx={objectStore:()=>objectStore};queueMicrotask(()=>tx.oncomplete?.());return tx;},close(){}};request.onsuccess?.();});return request;}};}
test('warm RAM reads are isolated copies with zero repeat network calls; writes never cache or retry',async()=>{
 let calls=0;const cache=create(opts(async(target,method)=>{calls++;return method==='summary'?{count:1}:{ok:true};}));
 let result=await cache.call('Store','summary',[]);result.count=900;assert.equal((await cache.call('Store','summary',[])).count,1);assert.equal(calls,1);
 await cache.call('Store','addPayment',[{amount:1}]);await cache.call('Store','addPayment',[{amount:1}]);assert.equal(calls,3);assert.equal(cache.inspect().entries,0);cache.close();
});
test('a device view survives page navigation and stays isolated from other users/releases',async()=>{
 const storage=memoryDisk();let calls=0;
 let cache=create(opts(async()=>{calls++;return {count:3};},{storage}));await cache.call('Store','summary',[]);
 assert.equal(storage.records.get(cache.inspect().namespace)?.entries.length,1);
 const first=cache;
 cache=create(opts(async()=>{calls++;throw new Error('network must not be needed');},{storage}));assert.equal((await cache.call('Store','summary',[])).count,3);assert.equal(calls,1);cache.close();first.close();
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

test('confirmed save primes the changed record while retaining pure cached results',async()=>{
 const calls=[];
 const cache=create(opts(async(target,method,args,delta)=>{
  calls.push(method);
  if(method==='updateItem'){
   delta.primes=[{target:'Store',method:'getItem',args:[1],result:{id:1,notes:'updated'}}];
   return {ok:true};
  }
  return method==='itemTotals'?{amount:100}:null;
 },{isReader:(target,method)=>reader(target,method)||method==='getItem'}));
 await cache.call('Calc','itemTotals',[]);
 await cache.call('Store','updateItem',[1,{}]);
 assert.equal((await cache.call('Store','getItem',[1])).notes,'updated');
 assert.equal((await cache.call('Calc','itemTotals',[])).amount,100);
 assert.deepEqual(calls,['itemTotals','updateItem']);
 cache.close();
});

test('a persisted bundle is reused across reopen until the background revision changes',async()=>{
 const storage=memoryDisk();let revision='1',calls=0,events=0,time=100000;
 const open=()=>create(opts(async()=>{
  calls++;
  return {primes:[{target:'Store',method:'summary',args:[],result:{count:Number(revision)}}]};
 },{storage,now:()=>time,fetchStatus:async()=>({...session,revision}),onChange:()=>events++}));
 let cache=open();await cache.ready;cache.acceptRevision(revision);
 await cache.call('Views','pageBundle',['home',null]);cache.close();
 time+=70000;
 cache=open();await cache.ready;
 await cache.call('Views','pageBundle',['home',null]);await cache.check(true);
 assert.equal(calls,1);
 revision='2';await cache.check(true);assert.equal(events,1);
 cache.close();cache=open();await cache.ready;
 assert.deepEqual(await cache.lookup('Store','summary',[],{allowStale:true}),{kind:'stale',value:{count:1}});
 await cache.call('Views','pageBundle',['home',null]);
 assert.equal((await cache.call('Store','summary',[])).count,2);
 assert.equal(calls,2);cache.close();
});

test('startup lookup distinguishes a cache miss, a running read and a saved projection',async()=>{
 let resolve,calls=0;
 const cache=create(opts(async()=>{calls++;return new Promise(done=>{resolve=done;});}));
 assert.deepEqual(await cache.lookup('Store','summary',[]),{kind:'miss'});
 const read=cache.call('Store','summary',[]);
 await new Promise(done=>setImmediate(done));
 assert.deepEqual(await cache.lookup('Store','summary',[]),{kind:'shared'});
 resolve({count:3});await read;
 const hit=await cache.lookup('Store','summary',[]);
 assert.deepEqual(hit,{kind:'hit',value:{count:3}});
 hit.value.count=4;
 assert.equal((await cache.lookup('Store','summary',[])).value.count,3);
 assert.equal(calls,1);
 cache.revoke();
 assert.deepEqual(await cache.lookup('Store','summary',[]),{kind:'miss'});
 cache.close();
});

test('manual sync keeps a saved view on unchanged revision and on network failure',async()=>{
 const storage=memoryDisk();let now=100000,requests=0,changes=0,offline=false,revision='1';
 const cache=create(opts(async()=>({count:7}),{
  storage,now:()=>now,checkIntervalMs:43200000,onChange:()=>changes++,
  fetchStatus:async()=>{requests++;if(offline)throw Error('offline');return {...session,revision};}
 }));
 await cache.ready;cache.acceptRevision(revision);
 await cache.call('Store','summary',[]);
 await cache.check(true);
 assert.equal(cache.inspect().entries,1);
 now+=61000;await cache.check();assert.equal(requests,1);
 offline=true;assert.equal((await cache.check(true)).ok,false);assert.equal(cache.inspect().entries,1);
 offline=false;revision='2';assert.equal((await cache.check(true)).changed,true);
 assert.equal(changes,1);
 assert.deepEqual(await cache.lookup('Store','summary',[]),{kind:'miss'});
 assert.deepEqual(await cache.lookup('Store','summary',[],{allowStale:true}),{kind:'stale',value:{count:7}});
 cache.close();
 assert.equal(storage.records.get(cache.inspect().namespace).checkedAt,now);
});

test('a second device retains its saved view until manual sync sees the first device revision',async()=>{
 let revision=1,changes=0,reads=0;
 const network=async(target,method)=>{
  if(method==='updateItem'){revision++;return {ok:true};}
  reads++;
  return {count:revision};
 };
 const config={fetchStatus:async()=>({...session,revision:String(revision)})};
 const first=create(opts(network,config));
 const second=create(opts(network,{...config,onChange:()=>changes++}));
 try{
  await second.check(true);
  assert.deepEqual(await second.call('Store','summary',[]),{count:1});
  await first.call('Store','updateItem',[1,{}]);
  assert.deepEqual(await second.call('Store','summary',[]),{count:1});
  assert.equal((await second.check(true)).changed,true);
  assert.deepEqual(await second.call('Store','summary',[]),{count:2});
  assert.equal(changes,1);
  assert.equal((await second.check(true)).changed,false);
  await second.call('Store','summary',[]);
  assert.equal(reads,2);
 }finally{first.close();second.close();}
});


test('shared inventory records survive reopen and pages fetch only unavailable data',async()=>{
 const storage=memoryDisk();
 const inventory={id:1,quality:'DEMO'};
 const requests=[];
 const network=async(target,method,args)=>{
  requests.push(method);
  if(method==='inventoryPage')return {paged:{items:[inventory]},primes:[]};
  if(method==='getItems')return [inventory];
  if(method==='getItem')return {id:args[0],quality:'OTHER'};
  throw Error('Unexpected request');
 };
 const open=()=>create(opts(network,{storage,isReader:()=>true}));
 let cache=open();
 await cache.call('Views','inventoryPage',[]);
 assert.deepEqual(await cache.call('Store','getItem',[1]),inventory);
 await cache.call('Store','getItems',[]);
 assert.deepEqual(await cache.call('Store','query',[{period:'all',search:''}]),[inventory]);
 cache.close();
 const saved=[...storage.records.values()][0].entries;
 assert.equal(saved.filter(([key])=>key.startsWith('@record:')).length,1);
 cache=open();
 assert.deepEqual(await cache.call('Store','getItem',['1']),inventory);
 await Promise.all([cache.call('Store','getItem',[2]),cache.call('Store','getItem',[2])]);
 assert.deepEqual(requests,['inventoryPage','getItems','getItem']);
 cache.close();
});


test('revision sync replaces only changed cached records and keeps tombstones out of fresh reads',async()=>{
 let revision='1', requests=0, deltaRequests=0;
 const cache=create(opts(async(target,method,args)=>{
  requests++;
  if(method==='inventoryPage')return {paged:{items:[{id:1,quality:'OLD'},{id:2,quality:'STAYS'},{id:3,quality:'REMOVED'}]},primes:[]};
  assert.equal(args[0],3);
  return null;
 },{isReader:()=>true,fetchStatus:async()=>({...session,revision}),fetchChanges:async since=>{
  deltaRequests++;assert.equal(since,'1');
  return {revision,changes:[{store:'inventory',key:'1',payload:{id:1,quality:'NEW'}},{store:'inventory',key:'3',payload:null}]};
 }}));
 cache.acceptRevision('1');
 await cache.call('Views','inventoryPage',[]);
 revision='2';
 assert.equal((await cache.check(true)).changed,true);
 assert.equal((await cache.call('Store','getItem',[1])).quality,'NEW');
 assert.equal((await cache.call('Store','getItem',[2])).quality,'STAYS');
 assert.equal((await cache.lookup('Views','inventoryPage',[],{allowStale:true})).value.paged.items[0].quality,'OLD');
 assert.equal(await cache.call('Store','getItem',[3]),null);
 await cache.check(true);
 assert.equal(deltaRequests,1);
 assert.equal(requests,2);
 cache.close();
});
