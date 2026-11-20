'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PostgresRepository,blank}=require('../backend/database');const {isReader,selection}=require('../backend/operations');const {createApp}=require('../backend/server');
async function setup(t){const {PGlite}=require('@electric-sql/pglite');const pg=new PGlite();await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await pg.exec(fs.readFileSync(path.join(__dirname,'../deployment/schema.sql'),'utf8'));let queries=[];const client={async query(q,p){queries.push(q);return pg.query(q,p);},release(){}};const repo=new PostgresRepository({query:client.query,connect:async()=>client},'test');t.after(()=>pg.close());return {repo,pg,queries};}
test('390-row restore uses four bulk inserts; deletion is batched; failed batches roll back',async t=>{
 const {repo,pg,queries}=await setup(t);
 await repo.transaction(async s=>{s.inventory=Array.from({length:390},(_,id)=>({id,price:10}));s.settings=[{key:'autoBackups',value:['x'.repeat(100000)]}];});
 assert.equal(queries.filter(q=>q.includes('jsonb_to_recordset')).length,5);
 assert.equal((await pg.query("SELECT count(*)::int AS n FROM alishan_private.records WHERE store='inventory'")).rows[0].n,390);
 const query=repo.pool.connect;repo.pool.connect=async()=>{const c=await query();return {...c,query:async(q,p)=>{if(q.includes('jsonb_to_recordset')&&p[1]==='payments')throw new Error('forced failure');return c.query(q,p);}};};
 await assert.rejects(repo.transaction(async s=>{s.inventory[0].price=99;s.payments=[{id:'p',amount:1}];}),/forced failure/);repo.pool.connect=query;
 await repo.read(s=>assert.equal(s.inventory[0].price,10),{stores:['inventory'],settings:[]});
 const start=queries.length;await repo.transaction(async s=>{s.inventory=[];});assert.equal(queries.slice(start).filter(q=>q.startsWith('DELETE')).length,1);
});
test('projected reads avoid locks, skip backup payloads, isolate mutations and refresh across repository instances',async t=>{
 const {repo,queries}=await setup(t);
 await repo.transaction(async s=>{s.inventory=[{id:1,price:10}];s.settings=[{key:'autoBackups',value:['large']},{key:'selectedTheme',value:'gold'}];});
 const projection={stores:['inventory','settings'],settings:['selectedTheme']};let start=queries.length;
 await repo.read(s=>{assert.equal(s.inventory.length,1);assert.deepEqual(s.settings.map(r=>r.key),['selectedTheme']);s.inventory[0].price=999;},projection);
 await repo.read(s=>assert.equal(s.inventory[0].price,10),projection);
 assert.equal(queries.length-start,2);assert.ok(queries.slice(start).every(q=>!q.includes('FOR UPDATE')&&!q.includes('BEGIN')));
 const other=new PostgresRepository(repo.pool,'test');await other.transaction(async s=>{s.inventory[0].price=20;});
 await repo.read(s=>assert.equal(s.inventory[0].price,20),projection);
});
test('reader routing defaults mutations to transactions and projects explicit backup requests',()=>{
 for(const c of [{target:'Store',method:'addPayment'},{target:'Store',method:'restoreComplete'},{target:'DB',method:'setSetting'},{target:'Archive',method:'restore'},{target:'Store',method:'recordSearch'},{target:'Store',method:'futureAction'}])assert.equal(isReader(c),false);
 assert.equal(isReader({target:'Store',method:'summary'}),true);
 let p=selection([{target:'Store',method:'summary',args:[]}]);assert.ok(!p.settings.includes('autoBackups'));assert.ok(!p.stores.includes('editHistory'));
 p=selection([{target:'DB',method:'getSetting',args:['autoBackups']}]);assert.deepEqual(p.stores,['settings']);assert.ok(p.settings.includes('autoBackups'));
 assert.equal(selection([{target:'DB',method:'getAll',args:['settings']}]).settings,null);
});
test('API reads bypass a blocked writer; pure calculations do not touch the database; large arguments are not echoed',async t=>{
 let reads=0,writes=0;const repo={ready:async()=>{},read:async(fn)=>{reads++;return fn(blank());},transaction:async()=>{writes++;throw new Error('write lock blocked');}};
 const server=createApp({repository:repo,username:'test',password:'test-only-password-123456789'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/api/rpc',headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from('test:test-only-password-123456789').toString('base64')};
 const call=async(target,method,args=[])=>fetch(url,{method:'POST',headers,body:JSON.stringify({target,method,args})}).then(r=>r.json());
 assert.equal((await call('Store','summary')).result.totalItems,0);assert.equal(reads,1);assert.equal(writes,0);
 const result=await call('Calc','itemTotals',[{colors:['BLACK'],sizeOption:'same',size32:2,price:10,notes:'x'.repeat(100000)}]);assert.equal(result.result.amount,20);assert.equal(result.args,undefined);assert.equal(reads,1);assert.equal(writes,0);
});

test('client deduplicates repeated report scopes and bounds large call queues',async()=>{
 const vm=require('node:vm'),wire=require('../backend/wire');const sent=[];
 const context={ALISHAN_WIRE:wire,ALISHAN_META:Object.fromEntries(['Calc','Store','Reports','Archive','Groups','DB'].map(k=>[k,{}])),console,structuredClone,Date,Map,Set,Promise,AbortSignal,setTimeout,addEventListener(){},fetch:async(url,options)=>{
   const body=JSON.parse(options.body);sent.push({bytes:Buffer.byteLength(options.body),count:body.calls.length,shared:body.shared.length});
   return {ok:true,text:async()=>JSON.stringify(body.calls.map(c=>({result:c.args[1]})))};
 }};context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/runtime.js'),'utf8'),context);
 const scope=Array.from({length:390},(_,id)=>({id,notes:'x'.repeat(1000)}));
 const results=await Promise.all(Array.from({length:1201},(_,i)=>context.AlishanRemote.call('Store','weeklyReport',[scope,i])));
 assert.deepEqual(sent.map(x=>x.count),[500,500,201]);assert.ok(sent.every(x=>x.shared===1&&x.bytes<600000));assert.equal(results[1200],1200);
});

test('API expands shared arguments before execution and refuses invalid references without writes',async t=>{
 const repo={ready:async()=>{},transaction:async()=>{throw new Error('unexpected write');}};
 const server=createApp({repository:repo,username:'test',password:'test-only-password-123456789'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port+'/api/batch',headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from('test:test-only-password-123456789').toString('base64')};
 const body={shared:[{colors:['BLACK'],sizeOption:'same',size32:2,price:10}],calls:[{target:'Calc',method:'itemTotals',args:[{$alishan:'batchArg',value:0}]}]};
 let response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,200);assert.equal((await response.json())[0].result.amount,20);
 body.calls[0].args[0].value=3;response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,400);
});

test('backup checks skip full reads until due and routine writes preserve stored backups',async t=>{
 const {repo,queries}=await setup(t);
 const {runScheduledBackup}=require('../backend/backup-schedule');
 const snapshot={metadata:{created:'2026-11-20',type:'AUTO_BACKUP'},inventory:[{id:1,notes:'x'.repeat(100000)}],payments:[]};
 await repo.transaction(async s=>{s.inventory=[{id:1}];s.settings=[
  {key:'autoBackups',value:[snapshot]},{key:'lastBackupDate',value:new Date().toISOString()},
  {key:'fullRestoreSafetyBackups',value:[snapshot]},{key:'__submission:private',value:'private'}
 ];});
 let start=queries.length,ticks=0;
 await runScheduledBackup(repo,async()=>{ticks++;});
 assert.equal(ticks,0);assert.equal(queries.length-start,1);assert.doesNotMatch(queries.at(-1),/FOR UPDATE|SELECT store,payload/);
 const overview=await repo.backupOverview();
 assert.equal(overview.inventoryCount,1);assert.equal(overview.history[0].metadata.totalItems,1);
 assert.ok(overview.history[0].restorable);assert.ok(JSON.stringify(overview).length<1000);
 assert.deepEqual((await repo.exportSettings()).map(x=>x.key),['lastBackupDate']);
 await repo.transaction(async s=>{assert.ok(!s.settings.some(x=>x.key==='autoBackups'));s.inventory[0].notes='updated';},{omitBackupSnapshots:true});
 assert.deepEqual(await repo.read(s=>s.settings.find(x=>x.key==='autoBackups').value),[snapshot]);
 await repo.transaction(async s=>{s.settings.find(x=>x.key==='lastBackupDate').value='2020-01-01';});
 await runScheduledBackup(repo,async s=>{ticks++;s.settings.find(x=>x.key==='lastBackupDate').value=new Date().toISOString();});
 await runScheduledBackup(repo,async()=>{ticks++;});
 assert.equal(ticks,1);
});

test('backup monitor exposes only schedule metadata behind its dedicated token',async t=>{
 const {repo}=await setup(t);
 const now=new Date().toISOString();
 await repo.transaction(async state=>{
  state.settings=[{key:'lastBackupDate',value:now},{key:'autoBackups',value:[
    {metadata:{created:now,type:'AUTO_BACKUP'},inventory:[{id:1,notes:'private'}],payments:[]}
  ]}];
 });
 const previous=process.env.MONITOR_BACKUP_TOKEN;
 const token=require('node:crypto').randomBytes(32).toString('hex');
 process.env.MONITOR_BACKUP_TOKEN=token;
 t.after(()=>{if(previous===undefined)delete process.env.MONITOR_BACKUP_TOKEN;else process.env.MONITOR_BACKUP_TOKEN=previous;});
 const server=createApp({repository:repo,username:'test',password:'test-only-password-123456789'}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port+'/internal/monitor/backup';
 assert.equal((await fetch(url)).status,404);
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.lastBackupAt,now);assert.equal(body.frequencyHours,24);
 assert.deepEqual(Object.keys(body).sort(),['checkedAt','enabled','frequencyHours','lastBackupAt','nextDueAt']);
});

test('monitor groups anonymous timings and bounds API statistics behind its token',async t=>{
 const {repo,pg}=await setup(t);
 await pg.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../deployment/performance.sql'),'utf8').split('select cron.schedule')[0]);
 const telemetry=require('../backend/performance').telemetryStore(pg);
 const {randomUUID,randomBytes}=require('node:crypto');
 for(const readyMs of [70,80,150])await telemetry.put('private-scope','120.0.0',{
  visit:randomUUID(),device:randomUUID(),page:'index',metrics:{visitType:'document',readyMs,fcpMs:50,lcpObservedMs:75}
 });
 const values=await telemetry.monitorSummary();
 assert.equal(values.length,1);assert.equal(values[0].p50,80);assert.equal(values[0].fcpP50,50);
 assert.doesNotMatch(JSON.stringify(values),/private-scope|device/);
 const token=randomBytes(32).toString('hex'),previous=process.env.MONITOR_BACKUP_TOKEN;
 process.env.MONITOR_BACKUP_TOKEN=token;
 t.after(()=>{if(previous===undefined)delete process.env.MONITOR_BACKUP_TOKEN;else process.env.MONITOR_BACKUP_TOKEN=previous;});
 const server=createApp({repository:repo,username:'test',password:'test-only-password-123456789',telemetry}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/internal/monitor/operations')).status,404);
 const result=await fetch(base+'/internal/monitor/operations',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
 assert.equal(result.pages[0].samples,3);assert.equal(result.release,require('../package.json').version);
});

test('startup traces retain bounded timing and size fields without operation payloads',()=>{
 const {normalize}=require('../backend/performance');
 const {randomUUID}=require('node:crypto');
 const metrics={routeJsDecodedBytes:203418,waterfall:[
  {kind:'inventory-bundle',startMs:12,endMs:100,poolMs:3,snapshotMs:35,wireBytes:700000,encoding:'gzip',payload:'private'},
  {kind:'private operation',startMs:5}
 ]};
 const result=normalize({page:'inventory',device:randomUUID(),visit:randomUUID(),metrics});
 assert.equal(result.metrics.routeJsDecodedBytes,203418);
 assert.deepEqual(result.metrics.waterfall,[{kind:'inventory-bundle',startMs:12,endMs:100,poolMs:3,snapshotMs:35,wireBytes:700000,encoding:'gzip'}]);
});
