'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {domain}=require('../backend/domain');const {blank}=require('../backend/database');const {createApp}=require('../backend/server');const {MemoryRepository}=require('./helpers');const Calc=require('../frontend/calc');
async function data(){const state=blank(),d=await domain(state);for(let n=0;n<25;n++){const when=new Date(Date.now()-3600000-n*60000);const r=await d.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',cupSize:'B',entry:{date:Calc.localDate(when),time:Calc.localTime(when)},colors:['BLACK'],sizeOption:'same',sizes:{32:{dozens:1,pieces:0}},lotNumber:String(n+1)});assert.equal(r.ok,true,r.error);}await d.DB.logActivity('test','page bundle fixture');return {state,d};}
test('inventory returns only the chosen page, same order and totals as original filters, with authoritative card primes',async()=>{
 const {state,d}=await data(),before=JSON.stringify(state);const filters={stock:'all',search:''};const advanced={filters:{},sorts:[{field:'date',dir:'desc'}]};
 const expected=d.Store.paginate(d.Search.apply(d.Store.query(filters),advanced,''),2,10);const result=d.Views.inventoryPage(filters,2,10,advanced,'');
 assert.deepEqual(result.paged,expected);assert.equal(result.paged.items.length,10);assert.equal(result.paged.total,25);
 for(const prime of result.primes){assert.equal(prime.target,'Calc');assert.deepEqual(prime.result,d.Calc[prime.method](...prime.args));}
 const exact=d.Views.inventoryPage({...filters,search:'lot:25'},1,10,advanced,'lot:25');assert.ok(exact.paged.items.length<=10);assert.equal(JSON.stringify(state),before);
});
test('home/report bundles prime original summaries and retained history without writes',async()=>{
 const {state,d}=await data(),before=JSON.stringify(state);const home=await d.Views.pageBundle('home');
 assert.deepEqual(home.primes.find(p=>p.target==='Store'&&p.method==='summary').result,d.Store.summary());
 assert.equal(home.primes.find(p=>p.method==='getRecentActivity').result.length,5);const report=await d.Views.pageBundle('reports');assert.deepEqual(report.primes.find(p=>p.method==='overview').result,d.Reports.overview());assert.equal(JSON.stringify(state),before);
});
test('authenticated cache status exposes a revision without data; scoped HTML boots static metadata and API reports its snapshot revision',async t=>{
 const repository=new MemoryRepository(),server=createApp({repository,username:'test',password:'test-only-password-123456789'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Basic '+Buffer.from('test:test-only-password-123456789').toString('base64')};
 assert.equal((await fetch(base+'/api/cache-status')).status,401);let response=await fetch(base+'/api/cache-status',{headers});const status=await response.json();assert.match(status.scope,/^[a-f0-9]{32}$/);assert.equal(status.revision,'0');assert.equal(status.records,undefined);
 const html=await fetch(base+'/inventory.html',{headers}).then(r=>r.text());assert.match(html,/window.ALISHAN_SESSION=/);assert.match(html,/src="\/bootstrap.js\?v=/);assert.doesNotMatch(html,/src="\/api\/bootstrap.js/);
 response=await fetch(base+'/api/rpc',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({target:'Store',method:'summary',args:[]})});assert.equal(response.headers.get('X-Alishan-Revision'),'0');
 const asset=await fetch(base+'/server-client.js',{headers});assert.match(asset.headers.get('Cache-Control'),/private/);assert.ok(asset.headers.get('ETag'));
});
