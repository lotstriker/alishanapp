'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

async function measureDatabase(kind, fn) {
  const timings = context.getStore();
  if (!timings) return fn();
  const start = performance.now();
  try { return await fn(); }
  finally {
    const elapsed = performance.now() - start;
    timings.db += elapsed;
    timings[kind] = (timings[kind] || 0) + elapsed;
  }
}

function query(db, ...args) { return measureDatabase(typeof args[0]==='string'&&args[0].startsWith('SELECT w.revision,')?'snapshot':'sql', () => db.query(...args)); }
function connect(pool) { return measureDatabase('pool', () => pool.connect()); }

const pages = new Set(['index','inventory','reports','setting','add-entry','missing-completion','missing-lot','pending-amount','quality-history']);
const fields = ['routeCssMs','documentShellCached','documentSessionMs','documentAuthMs','routeHtmlMs','routeHtmlCached','routeFactoryMs','routeDomMs','fcpMs','lcpObservedMs','startupCacheHitMs','startupCacheMissMs','startupSharedWaitMs','storeWaitMs','reportScopeMs','reportRenderMs','deviceCacheReadMs','startupRefreshMs','startupFetchMs','reportSetupMs','switchMs','startupDataReadyMs','criticalPaintMs','dataToCriticalMs','routePrepareMs','domMs','loadMs','readyMs','documentWaitMs','documentDownloadMs','dataMs','apiWaitMs','apiServerMs','apiDbMs','apiNetworkMs','apiDecodeMs','afterApiMs','apiCount','apiErrors'];
const waterfallFields=['startMs','headersMs','endMs','queueMs','serializeMs','compressMs','serverMs','poolMs','snapshotMs','sqlMs','responseBytes','wireBytes','connectMs','tlsMs','dnsMs','browserBeforeRequestMs','requestToResponseMs','responseDownloadMs','bodyDecodeMs'];
const waterfallKinds=new Set(['home-bundle','inventory-bundle','reports-bundle','dashboard-summary','inventory-page','read','mixed']);
const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function normalize(body) {
  if (!body || !pages.has(body.page) || !id.test(body.device || '') || !id.test(body.visit || '')) return null;
  const metrics = {};
  for (const key of fields) {
    const n = body.metrics?.[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 600000) metrics[key] = Math.round(n);
  }
  if(Array.isArray(body.metrics?.waterfall)){
    metrics.waterfall=body.metrics.waterfall.slice(0,6).filter(row=>row&&waterfallKinds.has(row.kind)).map(row=>{
      const entry={kind:row.kind};
      for(const field of waterfallFields){
        const value=row[field],limit=field.endsWith('Bytes')?15000000:600000;
        if(Number.isFinite(value)&&value>=0&&value<=limit)entry[field]=Math.round(value);
      }
      if(['gzip','br','identity'].includes(row.encoding))entry.encoding=row.encoding;
      return entry;
    });
  }
  for(const field of ['routeJsDecodedBytes','routeJsEncodedBytes','routeJsTransferBytes','routeJsFetchMs','routeJsCached']){
    const value=body.metrics?.[field];
    if(Number.isFinite(value)&&value>=0&&value<=15000000)metrics[field]=Math.round(value);
  }
  if (!Object.keys(metrics).length) return null;
  const mode = body.metrics?.visitType;
  if (['document','first-route','return-route'].includes(mode)) metrics.visitType=mode;
  return {page:body.page,device:body.device,visit:body.visit,metrics};
}

function telemetryStore(pool) {
  return {
    put(scope, release, visit) {
      return pool.query(`INSERT INTO alishan_private.performance_visits (account_scope, visit_id, device_id, page, release, metrics)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (account_scope, visit_id) DO UPDATE SET metrics=EXCLUDED.metrics`,
        [scope,visit.visit,visit.device,visit.page,release,JSON.stringify(visit.metrics)]);
    },
    async monitorSummary() {
      const {rows} = await pool.query(`SELECT page, release, metrics->>'visitType' AS scenario,
        count(*)::int AS samples,
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY (metrics->>'readyMs')::numeric)::numeric)::int AS p50,
        round(percentile_cont(.95) WITHIN GROUP (ORDER BY (metrics->>'readyMs')::numeric)::numeric)::int AS p95,
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY (metrics->>'fcpMs')::numeric)::numeric)::int AS "fcpP50",
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY (metrics->>'lcpObservedMs')::numeric)::numeric)::int AS "lcpP50"
        FROM alishan_private.performance_visits
        WHERE received_at > now()-interval '7 days' AND jsonb_typeof(metrics->'readyMs')='number'
        GROUP BY page,release,metrics->>'visitType'
        HAVING count(*)>=3 ORDER BY max(received_at) DESC LIMIT 30`);
      return rows;
    },
    async list(scope, all) {
      const {rows} = await pool.query(`SELECT page, release, left(device_id::text,8) AS device, left(md5(account_scope),10) AS account, received_at, metrics
        FROM alishan_private.performance_visits WHERE ($2::boolean OR account_scope=$1) AND received_at > now()-interval '30 days'
        ORDER BY received_at DESC LIMIT 500`,[scope,all]);
      return rows;
    }
  };
}
module.exports = { context, query, connect, normalize, telemetryStore };
