/* Cache app files, never API replies, credentials or business calculations. */
const RELEASE='__RELEASE__',BUILD='__ASSET_TAG__',SHELL='alishan-shell-'+BUILD,BINDINGS='alishan-shell-sessions-'+BUILD;
const INITIAL_PAGES=['/index.html','/inventory.html','/reports.html','/setting.html','/add-entry.html'];
const PAGES=[...INITIAL_PAGES,'/pending-amount.html','/missing-lot.html','/missing-completion.html','/quality-history.html'];
const memory=new Map();
const sessionKey=id=>new Request(self.location.origin+'/__view_session__/'+encodeURIComponent(id));
function cleanHTML(text){return text.replace(/window\.ALISHAN_SESSION=\{[^<]*?\};/,'/*ALISHAN_SESSION*/');}
async function storePage(path){
 const response=await fetch(new Request(new URL(path,self.location.origin),{credentials:'same-origin',cache:'no-store'}));if(!response.ok)return;
 const html=cleanHTML(await response.text());if(!html.includes('/*ALISHAN_SESSION*/'))return;
 const cache=await caches.open(SHELL);await cache.put(new Request(new URL(path,self.location.origin)),new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 const files=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m=>new URL(m[1],new URL(path,self.location.origin)));
 await Promise.allSettled(files.filter(url=>url.origin===self.location.origin&&!url.pathname.startsWith('/api/')).map(async url=>{const key=new Request(url,{credentials:'same-origin'});if(await cache.match(key))return;const asset=await fetch(key);if(asset.ok&&!asset.redirected)await cache.put(new Request(url),asset);}));
}
self.addEventListener('install',event=>{event.waitUntil((async()=>{await Promise.allSettled(INITIAL_PAGES.map(storePage));await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{try{for(const name of await caches.keys())if(name.startsWith('alishan-')&&name!==SHELL&&name!==BINDINGS)await caches.delete(name);}catch{}await self.clients.claim();})());});
async function bind(id,session){
 if(!id||!session||session.release!==RELEASE||!/^[a-f0-9]{32}$/.test(session.scope))return;
 const value={session,at:Date.now()};memory.set(id,value);try{const cache=await caches.open(BINDINGS);await cache.put(sessionKey(id),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}catch{}
}
async function binding(id){
 if(!id)return null;let value=memory.get(id);
 if(!value){try{const response=await(await caches.open(BINDINGS)).match(sessionKey(id));if(response)value=await response.json();}catch{return null;}}
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
 if(event.data?.type==='WARM_VIEW'&&PAGES.includes(event.data.path))event.waitUntil((async()=>{
  const url=new URL(event.data.path,self.location.origin);
  if(!await(await caches.open(SHELL)).match(new Request(url)))await storePage(url.pathname);
 })());
 if(event.data?.type==='BIND_VIEW_SESSION')event.waitUntil(bind(event.source?.id,event.data.session));
 if(event.data?.type==='CLEAR_VIEW_SESSION')event.waitUntil(clear(event.data.scope));
});
async function navigationSession(event){
 const direct=await binding(event.replacesClientId||event.clientId);if(direct)return direct;
 // Some engines omit the prior client ID for a navigation. An exact same-origin
 // initiating referrer can identify an already-bound app window without a new login.
 const referrer=event.request.referrer;if(!referrer)return null;
 let source;try{source=new URL(referrer);if(source.origin!==self.location.origin)return null;source.hash='';}catch{return null;}
 if(!self.clients.matchAll)return null;
 const sessions=[];for(const client of await self.clients.matchAll({type:'window'})){
  const url=new URL(client.url);url.hash='';if(url.href!==source.href)continue;
  const session=await binding(client.id);if(session)sessions.push(session);
 }
 if(!sessions.length||sessions.some(s=>s.scope!==sessions[0].scope||s.release!==RELEASE))return null;
 return sessions[0];
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname==='/login'))return;
 if(request.mode!=='navigate'&&PAGES.includes(url.pathname)&&!url.search&&request.headers?.get('X-Alishan-Route-Shell')===BUILD){
  event.respondWith((async()=>{
   try{
    const session=await binding(event.clientId);
    if(session?.release===RELEASE){
     const cached=await(await caches.open(SHELL)).match(new Request(url));
     if(cached){
      const html=await cached.text();
      if(html.includes('/*ALISHAN_SESSION*/')&&html.includes('?v='+BUILD)){
       return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Alishan-Shell-Cache':'hit','X-Content-Type-Options':'nosniff'}});
      }
     }
    }
   }catch{}
   return fetch(request);
  })());return;
 }
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const path=url.pathname==='/'?'/index.html':url.pathname;
   if(PAGES.includes(path)){
    try{
     const response=await(await caches.open(SHELL)).match(new Request(new URL(path,self.location.origin)));
     if(response){
      const html=await response.text();
      const bound=await navigationSession(event);
      let session=bound&&!bound.google?bound:null;
      let sessionMs=0,authTiming='';
      if(!session&&html.includes('?v='+BUILD)){
       const started=Date.now();
       const verified=await fetch(new Request(self.location.origin+'/api/view-session',{
        credentials:'same-origin',cache:'no-store',headers:{'X-Alishan-Route-Shell':BUILD}
       }));
       sessionMs=Date.now()-started;
       if(verified.status===401&&!verified.headers.has('WWW-Authenticate'))return Response.redirect(self.location.origin+'/login',303);
       if(verified.ok){
        authTiming=verified.headers.get('Server-Timing')?.match(/\bdocumentauth;dur=\d+(?:\.\d+)?/)?.[0]||'';
        session=await verified.json();
       }
      }
      if(session?.release===RELEASE&&/^[a-f0-9]{32}$/.test(session.scope)&&html.includes('/*ALISHAN_SESSION*/')){
       if(event.resultingClientId)await bind(event.resultingClientId,session);
       return new Response(html.replace('/*ALISHAN_SESSION*/',`window.ALISHAN_SESSION=${JSON.stringify(session)};`),{headers:{
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Alishan-Shell-Cache':'hit',
        'Server-Timing':'shellcache;dur=1, viewsession;dur='+sessionMs+(authTiming?', '+authTiming:'')
       }});
      }
     }
    }catch{}
   }
   // Without a bound initiating app window, use normal server authentication.
   const response=await fetch(request);
   if(response.ok&&PAGES.includes(path)){try{const html=cleanHTML(await response.clone().text());if(html.includes('/*ALISHAN_SESSION*/'))await(await caches.open(SHELL)).put(new Request(new URL(path,self.location.origin)),new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));}catch{}}
   return response;
  })());return;
 }
 if(/\.(?:js|css|woff2?|png|svg|ico)$/.test(url.pathname)&&!url.pathname.endsWith('/view-shell-worker.js')){
  event.respondWith((async()=>{let cache;try{cache=await caches.open(SHELL);const hit=await cache.match(new Request(request.url));if(hit)return hit;}catch{}const response=await fetch(request);if(response.ok&&!response.redirected&&cache)try{await cache.put(new Request(request.url),response.clone());}catch{}return response;})());
 }
});
