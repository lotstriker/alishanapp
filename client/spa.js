(function () {
 'use strict';
 const tag='__ASSET_TAG__';
 const routes=new Set(['index','inventory','reports','setting','add-entry',
  'pending-amount','entry-review','missing-lot','missing-completion','quality-history','performance']);
 const factories=new Map(), pages=new Map(), loads=new Map();
 const realWindow=window, realDocument=document;
 const routeOf=url=>url.pathname==='/'?'index':url.pathname.slice(1).replace(/\.html$/,'');
 const thisRoute=()=>routeOf(new URL(location.href));
 const assetUrl=route=>'/route-'+route+'.js?v='+tag;
 let active, generation=0, blocked=false;

 function scopeFor(page) {
  const body=page.body, exported=new Map(), originals=new Map(), ready=[];
  const subscriptions=new Set();
  let dirty=false, initialized=false;
  const isActive=()=>active===page;
  function expose(values) {
   for (const [key,value] of Object.entries(values)) {
    exported.set(key,value);
    if (isActive()) publish(key,value);
   }
  }
  function publish(key,value) {
   if (!originals.has(key)) originals.set(key,Object.getOwnPropertyDescriptor(realWindow,key));
   try { Object.defineProperty(realWindow,key,{value,configurable:true,writable:true}); } catch {}
  }
  function listen(target,type,handler,options) {
   if (target===realDocument && type==='DOMContentLoaded') { ready.push(handler); return; }
   const wrapped=event=>{if(isActive())return typeof handler==='function'?handler.call(target,event):handler.handleEvent(event);};
   page.listeners.push({target,type,handler,wrapped,options});
   target.addEventListener(type,wrapped,options);
  }
  function unlisten(target,type,handler,options) {
   const i=page.listeners.findIndex(row=>row.target===target&&row.type===type&&row.handler===handler);
   if(i<0)return;
   const [row]=page.listeners.splice(i,1);
   target.removeEventListener(type,row.wrapped,options);
  }
  const bind=(target,key)=>{
   const value=Reflect.get(target,key,target);
   return typeof value==='function' && !Object.hasOwn(value,'prototype') ? value.bind(target) : value;
  };
  const scopedDocument=new Proxy({}, {get(_,key){
   if(key==='body')return body;
   if(key==='dispatchEvent')return event=>isActive()&&realDocument.dispatchEvent(event);
   if(key==='addEventListener')return (...args)=>listen(realDocument,...args);
   if(key==='removeEventListener')return (...args)=>unlisten(realDocument,...args);
   if(key==='getElementById')return id=>isActive()?realDocument.getElementById(id):[...body.querySelectorAll('[id]')].find(node=>node.id===id)||null;
   if(key==='querySelector'||key==='querySelectorAll'||key==='getElementsByClassName'||key==='getElementsByTagName'){
    return (...args)=>(isActive()?realDocument:body)[key](...args);
   }
   return bind(realDocument,key);
  },set(_,key,value){if(isActive())realDocument[key]=value;return true;}});
  const scopedWindow=new Proxy({}, {get(_,key){
   if(key==='window'||key==='self')return scopedWindow;
   if(key==='document')return scopedDocument;
   if(key==='addEventListener')return (...args)=>listen(realWindow,...args);
   if(key==='removeEventListener')return (...args)=>unlisten(realWindow,...args);
   if(key==='AlishanPerformance')return {
    current:()=>isActive()?realWindow.AlishanPerformance?.current():undefined,
    phase:(...args)=>{if(isActive())realWindow.AlishanPerformance?.phase(...args);},
    ready:()=>{if(isActive())realWindow.AlishanPerformance?.ready();},
    dataReady:()=>{if(isActive())realWindow.AlishanPerformance?.dataReady();},
    criticalPaint:()=>{if(isActive())realWindow.AlishanPerformance?.criticalPaint();}
   };
   if(exported.has(key))return exported.get(key);
   return bind(realWindow,key);
  },set(_,key,value){expose({[key]:value});return true;}});
  const store=Object.create(realWindow.AlishanStore);
  store.subscribe=callback=>{
   subscriptions.add(callback);
   const unsubscribe=realWindow.AlishanStore.subscribe(()=>{
    if(isActive())return callback();
    dirty=true;
   });
   return ()=>{subscriptions.delete(callback);unsubscribe();};
  };
  function runReady() {
   if(initialized)return;
   initialized=true;
   for(const callback of ready){
    try { Promise.resolve(callback.call(scopedDocument,new Event('DOMContentLoaded'))).catch(console.error); }
    catch(error){console.error(error);}
   }
  }
  return {window:scopedWindow,document:scopedDocument,AlishanStore:store,expose,runReady,
   setTimeout:realWindow.setTimeout.bind(realWindow),
   clearTimeout:realWindow.clearTimeout.bind(realWindow),
   setInterval:(fn,ms,...args)=>realWindow.setInterval(()=>{if(isActive())fn(...args);},ms),
   clearInterval:realWindow.clearInterval.bind(realWindow),
   addEventListener:(...args)=>listen(realWindow,...args),
   removeEventListener:(...args)=>unlisten(realWindow,...args),
   enable(){for(const [key,value] of exported)publish(key,value);if(dirty){dirty=false;for(const callback of subscriptions)Promise.resolve().then(callback).catch(console.error);}},
   disable(){for(const [key,descriptor] of originals){try{if(descriptor)Object.defineProperty(realWindow,key,descriptor);else delete realWindow[key];}catch{}}originals.clear();}
  };
 }
 function register(name,factory){factories.set(name,factory);}
 function loadFactory(route){
  if(factories.has(route))return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=assetUrl(route);
   const timer=setTimeout(()=>{script.remove();reject(Error('Route bundle timed out'));},12000);
   script.onload=()=>{clearTimeout(timer);factories.has(route)?resolve():reject(Error('Route bundle missing'));};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Route bundle unavailable'));};
   document.head.appendChild(script);
  });
 }
 function routeStyles(head){return [...head.querySelectorAll('[data-alishan-page-style]')];}
 function loadPage(route){
  if(pages.has(route))return Promise.resolve(pages.get(route));
  if(loads.has(route))return loads.get(route);
  const task=(async()=>{
   const started=performance.now(),timing={};
   const htmlLoad=fetch('/'+route+'.html',{credentials:'same-origin',cache:'no-store',
    headers:{'X-Alishan-Route-Shell':tag},signal:AbortSignal.timeout(12000)}).then(async response=>{
    if(!response.ok||response.redirected)throw Error('Unable to load page');
    const html=await response.text();
    timing.routeHtmlMs=performance.now()-started;
    timing.routeHtmlCached=Number(response.headers.get('X-Alishan-Shell-Cache')==='hit');
    return html;
   });
   const [html]=await Promise.all([htmlLoad,loadFactory(route).then(()=>{timing.routeFactoryMs=performance.now()-started;})]);
   if(!html.includes(assetUrl(route)))throw Error('App version changed');
   const parseStarted=performance.now();
   const source=new DOMParser().parseFromString(html,'text/html');
   for(const node of source.querySelectorAll('script'))node.remove();
   const page={route,body:document.adoptNode(source.body),styles:routeStyles(source.head),title:source.title,listeners:[]};
   timing.routeDomMs=performance.now()-parseStarted;
   page.timing=timing;
   const cssStarted=performance.now();
   await prepareStyles(page);
   timing.routeCssMs=performance.now()-cssStarted;
   pages.set(route,page);
   return page;
  })();
  loads.set(route,task);
  task.finally(()=>loads.delete(route)).catch(()=>{});
  return task;
 }
 const media=new WeakMap();
 function prepareStyles(page){
  return Promise.all(page.styles.map(node=>{
   media.set(node,node.getAttribute('media'));
   node.setAttribute('media','not all');
   if(!node.matches('link[rel="stylesheet"]')){
    document.head.appendChild(node);
    return;
   }
   return new Promise((resolve,reject)=>{
    function finish(error){
     clearTimeout(timer);
     node.removeEventListener('load',loaded);
     node.removeEventListener('error',failed);
     if(error){node.remove();reject(error);}else resolve();
    }
    const loaded=()=>finish();
    const failed=()=>finish(Error('Route stylesheet unavailable'));
    const timer=setTimeout(failed,8000);
    node.addEventListener('load',loaded);
    node.addEventListener('error',failed);
    document.head.appendChild(node);
   });
  })).catch(error=>{
   for(const node of page.styles)node.remove();
   throw error;
  });
 }
 function setStyles(page,enabled){
  for(const node of page.styles){
   if(!media.has(node))media.set(node,node.getAttribute('media'));
   if(node.parentNode!==document.head)document.head.appendChild(node);
   const original=media.get(node);
   if(!enabled)node.setAttribute('media','not all');
   else if(original===null)node.removeAttribute('media');
   else node.setAttribute('media',original);
  }
 }
 function activate(page,url,mode,started,prepareMs){
  const old=active;
  if(old!==page){
   for(const id of ['deviceCacheStatus','alishan-timing-panel','alishan-sign-out']){const shared=document.getElementById(id);if(shared)page.body.append(shared);}
   old.scroll=window.scrollY;
   old.scope.disable();
   setStyles(old,false);
   const theme=[...old.body.classList].find(name=>name.startsWith('theme-'));
   if(theme){for(const name of [...page.body.classList])if(name.startsWith('theme-'))page.body.classList.remove(name);page.body.classList.add(theme);}
   old.body.replaceWith(page.body);
   setStyles(page,true);
   active=page;
   document.title=page.title;
  }
  if(mode==='push')history.pushState({alishanSpa:true},'',url.href);
  if(old!==page){
   window.AlishanPerformance?.navigate(page.route,started,Boolean(page.scope),prepareMs,page.scope?undefined:page.timing);
   if(!page.scope){page.scope=scopeFor(page);factories.get(page.route)(page.scope);page.scope.runReady();}
   else {page.scope.enable();window.AlishanPerformance?.ready();}
   document.dispatchEvent(new Event('alishan:route'));
  }
  window.scrollTo(0,mode==='pop'?(page.scroll||0):0);
 }
 async function go(url,mode='push'){
  const ticket=++generation,started=performance.now();
  try {
   const page=await loadPage(routeOf(url));
   if(ticket!==generation)return;
   activate(page,url,mode,started,performance.now()-started);
  } catch {
   if(ticket===generation){if(mode==='pop')location.reload();else location.assign(url.href);}
  }
 }
 function linkFrom(event){
  if(blocked)return null;
  const link=event.target.closest?.('a[href]');
  if(!link||link.target||link.hasAttribute('download')||link.getAttribute('aria-disabled')==='true')return null;
  const url=new URL(link.href);
  if(url.origin!==location.origin||url.search||url.hash||!(url.pathname==='/'||url.pathname.endsWith('.html'))||!routes.has(routeOf(url))||routeOf(url)===active?.route)return null;
  return url;
 }
 function start(){
  const route=thisRoute();
  if(!factories.has(route))return;
  const page={route,body:document.body,styles:routeStyles(document.head),title:document.title,listeners:[]};
  active=page;pages.set(route,page);
  page.scope=scopeFor(page);factories.get(route)(page.scope);page.scope.runReady();
  // Warm one shell per idle turn after the initial document has settled.
  {
   const warmShells=()=>setTimeout(()=>{
    const connection=navigator.connection;
    if(blocked||document.hidden||navigator.onLine===false||connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType))return;
    const idle=callback=>window.requestIdleCallback?window.requestIdleCallback(callback):setTimeout(callback,0);
    const next=async(queue)=>{
     if(blocked||document.hidden||navigator.onLine===false||!queue.length)return;
     const target=queue.shift();
     if(active?.route!==target){
      const shell=loadPage(target);
      if(target==='reports')void window.AlishanRemote?.preparePage('reports').catch(()=>{});
      try { await shell; } catch {}
     }
     if(queue.length)idle(()=>void next(queue));
    };
    idle(()=>{
     if(blocked||document.hidden||navigator.onLine===false)return;
     if(active?.route!=='inventory')void loadPage('inventory').catch(()=>{});
     if(active?.route!=='reports')void loadPage('reports').catch(()=>{});
     void next(['setting','add-entry','reports']);
    });
   },3000);
   if(document.readyState==='complete')warmShells();
   else window.addEventListener('load',warmShells,{once:true});
  }
  history.replaceState({alishanSpa:true},'',location.href);
  history.scrollRestoration='manual';
  document.addEventListener('click',event=>{
   const button=event.target.closest?.('button[onclick]');
   const path=/^location\.href=['"]([a-z-]+\.html)['"]$/.exec(button?.getAttribute('onclick')||'')?.[1];
   if(!blocked&&path&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){
    const url=new URL(path,location.href);
    if(routes.has(routeOf(url))&&routeOf(url)!==active.route){
     event.preventDefault();event.stopImmediatePropagation();void go(url);
    }
   }
  },true);
  document.addEventListener('click',event=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
   const url=linkFrom(event);
   if(url){event.preventDefault();void go(url);}
  });
  for(const kind of ['pointerdown','focusin'])document.addEventListener(kind,event=>{
   const url=linkFrom(event);if(url)void loadPage(routeOf(url)).catch(()=>{});
  },{passive:true});
  window.addEventListener('popstate',event=>{
   const url=new URL(location.href);
   if(!blocked&&routes.has(routeOf(url))&&event.state?.alishanSpa){void go(url,'pop');}
   else if(routeOf(url)!==active.route)location.reload();
  });
 }
 window.AlishanRouter={register,block(){blocked=true;generation++;}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
