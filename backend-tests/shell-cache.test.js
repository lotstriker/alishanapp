'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){const handlers={},stores=new Map(),clients=new Map([['first',{url:'https://app.test/index.html'}]]);let network=0;const storage={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name),key=r=>typeof r==='string'?r:r.url;return {async put(r,v){data.set(key(r),v.clone());},async match(r){return data.get(key(r))?.clone();},async keys(){return [...data.keys()].map(u=>new Request(u));},async delete(r){return data.delete(key(r));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const context={self:{location:{origin:'https://app.test'},clients:{get:async id=>clients.get(id),claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{}},caches:storage,Request,Response,URL,Map,Date,JSON,Promise,encodeURIComponent,fetch:async()=>{network++;return new Response('authenticate',{status:401});}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/view-shell-worker.js'),'utf8').replace('__RELEASE__','99.0.0'),context);
 return {handlers,storage,context,network:()=>network,async message(data){let pending;handlers.message({data,source:{id:'first'},waitUntil:p=>pending=p});await pending;},async navigate(clientId){let result;handlers.fetch({request:{url:'https://app.test/inventory.html',method:'GET',mode:'navigate'},clientId,resultingClientId:'second',respondWith:p=>result=p});return result;}};
}
test('a bound existing tab can navigate to a sanitized cached shell without network; new tabs still authenticate',async()=>{
 const env=setup(),cache=await env.storage.open('alishan-shell-99.0.0');const html='<script>/*ALISHAN_SESSION*/</script><p>saved shell</p>';await cache.put(new Request('https://app.test/inventory.html'),new Response(html));
 await env.message({type:'BIND_VIEW_SESSION',session:{scope:'a'.repeat(32),release:'99.0.0'}});
 let response=await env.navigate('first');assert.equal(response.status,200);assert.match(await response.text(),/window.ALISHAN_SESSION=/);assert.equal(env.network(),0);
 response=await env.navigate('');assert.equal(response.status,401);assert.equal(env.network(),1);
 await env.message({type:'CLEAR_VIEW_SESSION',scope:'a'.repeat(32)});response=await env.navigate('first');assert.equal(response.status,401);
});
test('shell cache excludes API and write requests and strips the per-session scope from stored HTML',()=>{
 const env=setup();for(const request of [{url:'https://app.test/api/cache-status',method:'GET',mode:'cors'},{url:'https://app.test/api/batch',method:'POST',mode:'cors'},{url:'https://app.test/inventory.html',method:'POST',mode:'navigate'}]){
  let intercepted=false;env.handlers.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false);
 }
 const html='<script>window.ALISHAN_SESSION={"scope":"private-fingerprint","release":"99.0.0"};</script>';
 const cleaned=env.context.cleanHTML(html);assert.match(cleaned,/ALISHAN_SESSION/);assert.ok(!cleaned.includes('private-fingerprint'));
});
