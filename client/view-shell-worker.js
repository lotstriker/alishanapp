/* Cache app files, never API replies, credentials or business calculations. */
const RELEASE='__RELEASE__',BUILD='__ASSET_TAG__',SHELL='alishan-shell-'+BUILD,BINDINGS='alishan-shell-sessions-'+BUILD;
const INITIAL_PAGES=['/index.html','/inventory.html','/reports.html','/setting.html'];
const PAGES=[...INITIAL_PAGES,'/add-entry.html','/pending-amount.html','/missing-lot.html','/missing-completion.html','/quality-history.html'];
const memory=new Map();
const sessionKey=id=>new Request(self.location.origin+'/__view_session__/'+encodeURIComponent(id));
function cleanHTML(text){return text.replace(/window\.ALISHAN_SESSION=\{[^<]*?\};/,'/*ALISHAN_SESSION*/');}
async function storePage(path){
 const response=await fetch(new Request(new URL(path,self.location.origin),{credentials:'same-origin',cache:'no-store'}));if(!response.ok)return;
 const html=cleanHTML(await response.text());if(!html.includes('/*ALISHAN_SESSION*/'))return;
 const cache=await caches.open(SHELL);await cache.put(new Request(new URL(path,self.location.origin)),new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 const files=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m=>new URL(m[1],new URL(path,self.location.origin)));
 await Promise.allSettled(files.filter(url=>url.origin===self.location.origin&&!url.pathname.startsWith('/api/')).map(async url=>{const key=new Request(url,{credentials:'same-origin'});if(await cache.match(key))return;const asset=await fetch(key);if(asset.ok)await cache.put(new Request(url),asset);}));
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{await Promise.allSettled(INITIAL_PAGES.map(storePage));await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('alishan-')&&name!==SHELL&&name!==BINDINGS)await caches.delete(name);await self.clients.claim();})());});
async function bind(id,session){
 if(!id||!session||session.release!==RELEASE||!/^[a-f0-9]{32}$/.test(session.scope))return;
 const value={session,at:Date.now()};memory.set(id,value);const cache=await caches.open(BINDINGS);await cache.put(sessionKey(id),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
}
async function binding(id){
 if(!id)return null;let value=memory.get(id);
 if(!value){const response=await(await caches.open(BINDINGS)).match(sessionKey(id));if(response)value=await response.json();}
 if(!value||Date.now()-value.at>24*3600000)return null;
 // Only an existing same-origin page can carry its authenticated shell scope forward.
 const client=await self.clients.get(id);if(!client||new URL(client.url).origin!==self.location.origin)return null;
 memory.set(id,value);return value.session;
}
async function clear(scope){
 memory.clear();const cache=await caches.open(BINDINGS);
 for(const request of await cache.keys()){const response=await cache.match(request);let value;try{value=await response.json();}catch{}if(!scope||value?.session?.scope===scope)await cache.delete(request);}
}
self.addEventListener('message',event=>{
 if(event.data?.type==='BIND_VIEW_SESSION')event.waitUntil(bind(event.source?.id,event.data.session));
 if(event.data?.type==='CLEAR_VIEW_SESSION')event.waitUntil(clear(event.data.scope));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const path=url.pathname==='/'?'/index.html':url.pathname;
   if(PAGES.includes(path)){
    const session=await binding(event.clientId);
    if(session){const response=await(await caches.open(SHELL)).match(new Request(new URL(path,self.location.origin)));if(response){const text=await response.text();if(event.resultingClientId)await bind(event.resultingClientId,session);return new Response(text.replace('/*ALISHAN_SESSION*/',`window.ALISHAN_SESSION=${JSON.stringify(session)};`),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});}}
   }
   // New/unbound tabs always pass through normal server authentication.
   const response=await fetch(request);
   if(response.ok&&PAGES.includes(path)){const html=cleanHTML(await response.clone().text());if(html.includes('/*ALISHAN_SESSION*/'))await(await caches.open(SHELL)).put(new Request(new URL(path,self.location.origin)),new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));}
   return response;
  })());return;
 }
 if(/\.(?:js|css|woff2?|png|svg|ico)$/.test(url.pathname)&&!url.pathname.endsWith('/view-shell-worker.js')){
  event.respondWith((async()=>{const cache=await caches.open(SHELL),hit=await cache.match(new Request(request.url));if(hit)return hit;const response=await fetch(request);if(response.ok)await cache.put(new Request(request.url),response.clone());return response;})());
 }
});
