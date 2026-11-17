'use strict';
process.env.TZ='Asia/Kolkata';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {domain,dispatch}=require('../backend/domain');const {blank,PostgresRepository}=require('../backend/database');const {encode,decode}=require('../backend/wire');const {MemoryRepository}=require('./helpers');const {createApp}=require('../backend/server');
const Calc=require('../frontend/calc');
function input(overrides={}){const date=new Date(Date.now()-5*60000);return {productType:'bra',quality:'SUZEN-MOLD',cupSize:'B',entry:{date:Calc.localDate(date),time:Calc.localTime(date)},sizeOption:'same',colors:['MOKA','BLACK'],sizes:{32:{dozens:'2',pieces:'6'}},...overrides};}
async function seed(state){const d=await domain(state),result=await d.Store.addItem(input());assert.equal(result.ok,true,result.error);return result.item;}
test('server produces exactly the original v96 amounts for shared and different colour sizes',async()=>{
 const state=blank(),d=await domain(state);
 for(const form of [input(),input({sizeOption:'different',colorSizes:[{name:'MOKA',sizes:{32:{dozens:2,pieces:6}}},{name:'BLACK',sizes:{34:{dozens:1,pieces:3}}}]})]){
  const expected=Calc.buildNewItem(form,{items:d.Store.getItems(),priceOf:d.Store.getPrice,colorLabel:d.Store.colorDisplayName});const actual=await d.Store.addItem(form);assert.equal(actual.ok,true,actual.error);for(const key of ['price','totalPieces','totalDozens','totalAmount'])assert.equal(actual.item[key],expected.item[key]);
 }
});
test('submitted price snapshots survive master-price reloads; original edit rules remain',async()=>{
 const state=blank(),item=await seed(state);const originalPrice=item.price;const d=await domain(state);assert.equal(d.Store.getItem(item.id).price,originalPrice);const changed=await d.Store.updateItem(item.id,input({price:'25'}));assert.equal(changed.item.price,25);assert.equal(changed.item.totalAmount,125);assert.ok(state.auditLog.some(r=>r.action==='Quality Updated'));
});
test('invalid input writes nothing; client-supplied totals are ignored',async()=>{
 const state=blank(),d=await domain(state);const failed=await d.Store.addItem(input({quality:''}));assert.equal(failed.ok,false);assert.equal(state.inventory.length,0);const made=await d.Store.addItem(input({totalDozens:9999,totalAmount:1}));assert.equal(made.item.totalDozens,5);assert.notEqual(made.item.totalAmount,1);
});
test('parallel payment requests cannot over-receive and server uses canonical expected amount',async()=>{
 const repo=new MemoryRepository();let id;await repo.transaction(async s=>{id=(await seed(s)).id;});const expected=repo.state.inventory[0].totalAmount;
 const pay=()=>repo.transaction(async s=>{const d=await domain(s);return d.Store.addPayment({inventoryId:id,amount:expected,date:Calc.localDate(new Date()),notes:''});});const results=await Promise.all([pay(),pay()]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(repo.state.payments.length,1);
});
test('archive/restore retains entry, payments and price; permanent deletion clears traces',async()=>{
 const state=blank(),item=await seed(state);let d=await domain(state);await d.Store.addPayment({inventoryId:item.id,amount:1,date:Calc.localDate(new Date()),notes:''});assert.equal((await d.Store.deleteItem(item.id)).ok,true);assert.equal(state.inventory.length,0);assert.equal(state.archive.length,1);d=await domain(state);assert.equal((await d.Archive.restore(item.id)).ok,true);assert.equal(state.inventory[0].price,item.price);assert.equal(state.payments.length,1);d=await domain(state);await d.Store.deleteItem(item.id);assert.equal((await d.Archive.deleteForever(item.id)).ok,true);assert.equal(state.archive.length,0);assert.equal(state.payments.length,0);
});
test('complete restore is atomic and preserves a full pre-restore snapshot',async()=>{
 const state=blank();await seed(state);let d=await domain(state);const backup=d.Store.backupFile('COMPLETE_BACKUP');await d.DB.setSetting('selectedTheme','rose-wine');const result=await d.Store.restoreComplete({backup,extra:{qualityHistory:[],activityLog:[],settings:{selectedTheme:'gold'}}});assert.equal(result.ok,true,result.error);assert.equal(await d.DB.getTheme(),'gold');const safety=await d.DB.getSetting('fullRestoreSafetyBackups',[]);assert.equal(safety.length,1);assert.equal(safety[0].extra.settings.selectedTheme,'rose-wine');assert.equal(safety[0].backup.inventory.length,1);
});
test('reports and dashboard projections agree with authoritative totals',async()=>{
 const state=blank(),item=await seed(state),d=await domain(state);const overview=d.Reports.overview();assert.equal(overview.valuation.value,item.totalAmount);const breakdown=d.Views.breakdown('all');assert.equal(breakdown.find(b=>b.type==='BRA').dozens,5);assert.equal(d.Views.ranking('all')[0].count,1);assert.equal(d.Views.rowsTotals([item]).amount,item.totalAmount);
});
test('size-group normalization stays on the server and returns mutations',async()=>{
 const state=blank(),d=await domain(state),st=d.Groups.resetState(d.Groups.newState());d.Groups.syncColours(st,['MOKA','BLACK']);st.groups[0].sizes[32]={d:'2',p:'12'};const result=d.Groups.toInput(st,['MOKA','BLACK']);assert.equal(result.sizeOption,'same');assert.equal(result.colors.length,2);const inputResult=await d.Store.addItem(input(result));assert.equal(inputResult.item.totalDozens,6);
});
test('wire format retains typed keys, dates, maps and undefined',()=>{
 const value={d:new Date('2026-11-17T18:30:00Z'),m:new Map([['a',2]]),s:new Set([1,'1']),n:NaN,u:undefined};const result=decode(JSON.parse(JSON.stringify(encode(value))));assert.deepEqual(result,value);
});
test('database raw business writes and prototype methods cannot bypass application rules',async()=>{
 const state=blank();await assert.rejects(dispatch(state,'DB','put',['inventory',{id:1}]),/application action/);await assert.rejects(dispatch(state,'Calc','constructor',[]),/Unsupported/);
});
test('authenticated API rejects unauthenticated and cross-site requests; formulas are not public',async t=>{
 const app=createApp({repository:new MemoryRepository(),username:'test',password:'test-only-password-123456789'}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,auth='Basic '+Buffer.from('test:test-only-password-123456789').toString('base64');
 assert.equal((await fetch(base+'/')).status,401);assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/backend/domain.js',{headers:{Authorization:auth}})).status,404);assert.equal((await fetch(base+'/frontend/calc.js',{headers:{Authorization:auth}})).status,404);
 const headers={Authorization:auth,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/rpc',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify({target:'Store',method:'getItems',args:[]})})).status,403);
 const r=await fetch(base+'/api/batch',{method:'POST',headers,body:JSON.stringify([{target:'Calc',method:'itemDozens',args:encode([{sizeOption:'same',colors:['BLACK'],size32:2,size32_pieces:6}])}])});assert.equal(r.status,200);assert.equal(decode(await r.json())[0].result,2.5);
 const formula=await fetch(base+'/calc.js',{headers:{Authorization:auth}}).then(r=>r.text());assert.doesNotMatch(formula,/function itemAmount|function buildNewItem/);
});
test('PostgreSQL schema and repository round-trip records and rollback using the real PGlite engine',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const pg=new PGlite();await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await pg.exec(fs.readFileSync(path.join(__dirname,'../deployment/schema.sql'),'utf8'));
 const client={query:(q,params)=>pg.query(q,params),release(){}};const repo=new PostgresRepository({connect:async()=>client,query:client.query},'test');await repo.ready();await repo.transaction(async state=>{await seed(state);});await repo.transaction(async state=>{assert.equal(state.inventory.length,1);state.inventory=[];return {ok:false};});await repo.transaction(async state=>assert.equal(state.inventory.length,1));
 const settings=await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='alishan_private.records'::regclass");assert.equal(settings.rows[0].relrowsecurity,true);await pg.close();
});
