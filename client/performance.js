(function () {
 'use strict';
 const routes = new Set(['index','inventory','reports','setting','add-entry','missing-completion','missing-lot','pending-amount','quality-history']);
 let page = location.pathname === '/' ? 'index' : location.pathname.slice(1).replace(/\.html$/, '');
 const scope = window.ALISHAN_SESSION?.scope;
 if (!scope || !crypto.randomUUID) return;
 const deviceKey = 'alishan:performance-device';
 const queueKey = 'alishan:performance-queue:' + scope;
 let visit = crypto.randomUUID(), spaStart, deadline, visitType='document', routePrepareMs;
 let device = crypto.randomUUID(), pendingNavigation;
 try {
  device = localStorage.getItem(deviceKey) || device;
  localStorage.setItem(deviceKey,device);
  pendingNavigation = sessionStorage.getItem('alishan:performance-next');
  sessionStorage.removeItem('alishan:performance-next');
 } catch {}
 let ready, dataReady, criticalPaint, first, last, count = 0, failures = 0, longest, sending = false, recorded = false;
 const phaseNames = new Set(['startupCacheHitMs','startupCacheMissMs','startupSharedWaitMs','storeWaitMs','reportScopeMs','reportRenderMs','deviceCacheReadMs','startupRefreshMs','startupFetchMs','reportSetupMs']);
 const phases = {};
 const headers = {'Content-Type':'application/json','X-Alishan-Scope':scope};
 const getQueue = () => {
  try { return JSON.parse(sessionStorage.getItem(queueKey) || '[]'); } catch { return []; }
 };
 const saveQueue = queue => { try { sessionStorage.setItem(queueKey,JSON.stringify(queue.slice(-12))); } catch {} };
 async function flush() {
  if (sending) return;
  sending = true;
  try {
   while (true) {
    const item = getQueue()[0];
    if (!item) break;
    const response = await fetch('/api/performance',{method:'POST',headers,body:JSON.stringify(item),keepalive:true});
    if (!response.ok && response.status !== 400) break;
    saveQueue(getQueue().filter(row=>row.visit!==item.visit));
   }
  } catch {}
  finally { sending=false; }
 }
 function record() {
  if (recorded || !routes.has(page)) return;
  const nav = spaStart===undefined ? performance.getEntriesByType?.('navigation')?.[0] : null;
  const metrics = {...phases,visitType,routePrepareMs,apiCount:count,apiErrors:failures,readyMs:ready===undefined?undefined:ready-(spaStart??0)};
  if (spaStart!==undefined&&ready!==undefined) metrics.switchMs=ready-spaStart;
  if (dataReady!==undefined) metrics.startupDataReadyMs=dataReady-(spaStart??0);
  if (criticalPaint!==undefined) metrics.criticalPaintMs=criticalPaint-(spaStart??0);
  if (dataReady!==undefined&&criticalPaint!==undefined) metrics.dataToCriticalMs=Math.max(0,criticalPaint-dataReady);
  if (nav) {
   if (nav.domContentLoadedEventEnd > 0) metrics.domMs = nav.domContentLoadedEventEnd;
   if (nav.loadEventEnd > 0) metrics.loadMs = nav.loadEventEnd;
   if (nav.responseStart > 0) metrics.documentWaitMs = nav.responseStart - nav.requestStart;
   if (nav.responseEnd > 0) metrics.documentDownloadMs = nav.responseEnd - nav.responseStart;
  }
  try {
   const next = JSON.parse(pendingNavigation);
   if (spaStart===undefined && next?.page === page && ready !== undefined) {
    const ms = performance.timeOrigin + ready - next.at;
    if (ms >= 0 && ms < 600000) metrics.switchMs = ms;
   }
  } catch {}
  if (first !== undefined) {
   metrics.dataMs = last - first;
   if (ready !== undefined) metrics.afterApiMs = Math.max(0,ready-last);
  }
  if (longest) Object.assign(metrics,longest);
  recorded = true;
  const payload={visit,device,page,metrics};
  try {
   saveQueue([...getQueue(),payload]);
   if (getQueue().some(row=>row.visit===visit)) return flush();
  } catch {}
  fetch('/api/performance',{method:'POST',headers,body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
 }
 function whenComplete() {
  if (ready !== undefined && document.readyState === 'complete') setTimeout(record,0);
 }
 window.AlishanPerformance = {
  navigate(next,started,reused,prepareMs) {
   record();
   clearTimeout(deadline);
   page=next;visit=crypto.randomUUID();spaStart=started;
   visitType=reused?'return-route':'first-route';routePrepareMs=prepareMs;
   ready=dataReady=criticalPaint=first=last=longest=pendingNavigation=undefined;
   for (const name of phaseNames) delete phases[name];
   count=failures=0;recorded=false;
   try { sessionStorage.removeItem('alishan:performance-next'); } catch {}
   deadline=setTimeout(record,15000);
  },
  dataReady() {
   if (!recorded&&dataReady===undefined) dataReady=performance.now();
  },
  criticalPaint() {
   if (!recorded&&criticalPaint===undefined) criticalPaint=performance.now();
  },
  current:()=>visit,
  phase(name, start, key) {
   if (!recorded && key===visit && phaseNames.has(name) && phases[name]===undefined) phases[name]=performance.now()-start;
  },
  ready() {
   if (!routes.has(page) || ready !== undefined) return;
   const key=visit;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if (key!==visit) return;
    if (ready === undefined) ready=performance.now();
    whenComplete();
   }));
  },
  batch(start, headersAt, timing, ok, key) {
   if (!routes.has(page) || (key && key!==visit) || ready !== undefined || recorded) return;
   const end = performance.now();
   first = Math.min(first??start,start); last=end; count++;
   if (!ok) failures++;
   const wait = (headersAt??end)-start;
   const value = (name) => {
    const part = timing?.split(',').find(item=>item.trim().startsWith(name+';dur='));
    return part ? Number(part.split('=')[1]) : undefined;
   };
   const app=value('app'), db=value('db');
   if (!longest || wait > longest.apiWaitMs) longest={
    apiWaitMs:wait, apiServerMs:app, apiDbMs:db,
    apiNetworkMs:app===undefined?undefined:Math.max(0,wait-app),
    apiDecodeMs:headersAt===undefined?undefined:end-headersAt
   };
  }
 };
 document.addEventListener('click', event=>{
  const link=event.target.closest?.('a[href]');
  if (!link || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
      link.origin!==location.origin || link.target || link.hasAttribute('download') || link.pathname===location.pathname) return;
  const destination=link.pathname==='/'?'index':link.pathname.slice(1).replace(/\.html$/,'');
  if (routes.has(destination)) try {
   sessionStorage.setItem('alishan:performance-next',JSON.stringify({page:destination,at:performance.timeOrigin+performance.now()}));
  } catch {}
 },true);
 window.addEventListener('load',whenComplete,{once:true});
 window.addEventListener('pagehide',record,{once:true});
 window.addEventListener('online',flush);
 deadline=setTimeout(record,15000);
 window.addEventListener('load',()=>setTimeout(flush,1500),{once:true});
})();
