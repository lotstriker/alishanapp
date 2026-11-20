'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

async function measureDatabase(fn) {
  const timings = context.getStore();
  if (!timings) return fn();
  const start = performance.now();
  try { return await fn(); }
  finally { timings.db += performance.now() - start; }
}

function query(db, ...args) { return measureDatabase(() => db.query(...args)); }
function connect(pool) { return measureDatabase(() => pool.connect()); }

const pages = new Set(['index','inventory','reports','setting','add-entry','missing-completion','missing-lot','pending-amount','quality-history']);
const fields = ['startupCacheHitMs','startupCacheMissMs','startupSharedWaitMs','storeWaitMs','reportScopeMs','reportRenderMs','deviceCacheReadMs','startupRefreshMs','startupFetchMs','reportSetupMs','switchMs','startupDataReadyMs','criticalPaintMs','dataToCriticalMs','routePrepareMs','domMs','loadMs','readyMs','documentWaitMs','documentDownloadMs','dataMs','apiWaitMs','apiServerMs','apiDbMs','apiNetworkMs','apiDecodeMs','afterApiMs','apiCount','apiErrors'];
const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function normalize(body) {
  if (!body || !pages.has(body.page) || !id.test(body.device || '') || !id.test(body.visit || '')) return null;
  const metrics = {};
  for (const key of fields) {
    const n = body.metrics?.[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 600000) metrics[key] = Math.round(n);
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
    async list(scope, all) {
      const {rows} = await pool.query(`SELECT page, release, left(device_id::text,8) AS device, left(md5(account_scope),10) AS account, received_at, metrics
        FROM alishan_private.performance_visits WHERE ($2::boolean OR account_scope=$1) AND received_at > now()-interval '30 days'
        ORDER BY received_at DESC LIMIT 500`,[scope,all]);
      return rows;
    }
  };
}
module.exports = { context, query, connect, normalize, telemetryStore };
