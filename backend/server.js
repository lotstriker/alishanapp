'use strict';
const { runScheduledBackup } = require('./backup-schedule');
process.env.TZ=process.env.TZ||'Asia/Kolkata';
const express=require('express');
const {timingSafeEqual,createHash}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const release=require('../package.json').version;
const {encode,decode}=require('./wire');
const {dispatch,domain,invoke}=require('./domain');
const {PostgresRepository,blank}=require('./database');
const {isReader,selection}=require('./operations');
const metrics=require('./performance');
const hash=s=>createHash('sha256').update(s).digest();
function createApp({repository,username,password,auth,googleSetup,repositoryFor,legacyOwnerId,telemetry}){
 if((!auth&&!username)||!password||password.length<20)throw new Error('APP_USERNAME and APP_PASSWORD (20+ characters) are required');
 let pureDomain;
 const compressedReads=new Map();
 const bootedAt=new Date().toISOString();
 const basicScope=hash(JSON.stringify([repository.workspace||'alishan',username,password,process.env.DATABASE_URL||'local'])).toString('hex').slice(0,32);
 const {entryReview}=require('./entry-review');
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cache-Control':'no-store'});next();});
 function monitorAuthorized(req){
   const token=process.env.MONITOR_BACKUP_TOKEN;
   return token&&token.length>=32&&timingSafeEqual(hash(req.get('authorization')||''),hash('Bearer '+token));
 }
 const apiWindow=new Map();
 app.use((req,res,next)=>{
   if(req.path==='/api/batch'||req.path==='/api/rpc'){
     const route=req.path,start=performance.now();
     res.once('finish',()=>{
       const values=apiWindow.get(route)||[];
       values.push({at:Date.now(),ms:Math.round(performance.now()-start),status:res.statusCode,db:res.locals.monitorDb});
       if(values.length>500)values.shift();
       apiWindow.set(route,values);
     });
   }
   next();
 });
 app.get('/internal/monitor/operations',async(req,res)=>{
   if(!monitorAuthorized(req))return res.sendStatus(404);
   const percentile=(values,p)=>values.length?values.sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
   const routes=[...apiWindow].map(([route,buffer])=>{
     const samples=buffer.filter(x=>x.at>Date.now()-3600000);
     return {route,requests:samples.length,errors:samples.filter(x=>x.status>=500).length,
       p95:percentile(samples.map(x=>x.ms),.95),dbMs:percentile(samples.map(x=>x.db).filter(Number.isFinite),.95)};
   }).filter(row=>row.requests>0);
   try{res.json({release,commit:process.env.RENDER_GIT_COMMIT||null,bootedAt,at:new Date().toISOString(),routes,
     pages:telemetry?.monitorSummary?await telemetry.monitorSummary():[]});}
   catch{res.status(503).json({status:'unavailable'});}
 });
 app.get('/internal/monitor/backup',async(req,res)=>{
   if(!monitorAuthorized(req))return res.sendStatus(404);
   try{res.json(await repository.backupHealth());}
   catch{res.status(503).json({status:'unavailable'});}
 });
 app.get('/healthz',async(req,res)=>{try{const probe=await repository.ready();if(probe)res.set('Server-Timing',`dbpool;dur=${probe.pool.toFixed(1)}, dbping;dur=${probe.query.toFixed(1)}`);res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
 // Chrome may fetch installation metadata without the browser tab's credentials.
 const installAssets=new Set(['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png']);
 app.get([...installAssets],(req,res,next)=>{
   res.sendFile(req.path.slice(1),{root:path.resolve(__dirname,'../dist')},error=>{if(error)next(error);});
 });
 const login=auth||googleSetup;
 if(login){
   app.get('/login',async(req,res)=>{
     if(auth&&await auth.authenticate(req,res))return res.redirect(303,'/');
     res.sendFile(path.resolve(__dirname,'../dist/login.html'));
   });
   app.get('/login.css',(req,res)=>res.sendFile(path.resolve(__dirname,'../dist/login.css')));
   app.get('/auth/google',login.start);
   app.get('/auth/callback',login.callback);
   if(auth)app.post('/auth/logout',auth.logout);
 }
 app.use(async(req,res,next)=>{
   if(auth){
     const started=performance.now();
     const documentNavigation=req.method==='GET'&&(req.path==='/'||req.path.endsWith('.html'));
     const subject=await auth.authenticate(req,res,{documentNavigation});
     if(req.path==='/'||req.path==='/api/view-session'||req.path.endsWith('.html'))
       res.append('Server-Timing','documentauth;dur='+(performance.now()-started).toFixed(1));
     if(!subject)return req.path.startsWith('/api/')?res.status(401).json({error:'Sign in to Alishan'}):res.redirect(303,'/login');
     const workspace=subject===legacyOwnerId?repository.workspace:'user:'+subject;
     const scoped=workspace===repository.workspace?repository:repositoryFor(workspace);
     res.locals.account={repository:scoped,actor:subject,session:{scope:hash(JSON.stringify([basicScope,workspace,subject])).toString('hex').slice(0,32),release,google:true}};
     return next();
   }
   let supplied='';try{if(req.headers.authorization?.startsWith('Basic '))supplied=Buffer.from(req.headers.authorization.slice(6),'base64').toString('utf8');}catch{}
   if(!timingSafeEqual(hash(supplied),hash(`${username}:${password}`))){res.set('WWW-Authenticate','Basic realm="Alishan", charset="UTF-8"');return res.status(401).send('Sign in to Alishan');}
   res.locals.account={repository,actor:username,session:{scope:basicScope,release}};
   next();
 });
 app.get('/api/view-session',(req,res)=>{
   if(req.get('X-Alishan-Route-Shell')!==assetTag)return res.sendStatus(409);
   res.json(res.locals.account.session);
 });
 app.use('/api',(req,res,next)=>{
   if(auth&&req.get('X-Alishan-Scope')!==res.locals.account.session.scope)
     return res.status(409).json({error:'Reload to use the signed-in account'});
   const origin=req.get('origin');if(req.get('sec-fetch-site')==='cross-site'||(origin&&origin!==`${req.protocol}://${req.get('host')}`&&origin!==`https://${req.get('host')}`))return res.status(403).json({error:'Cross-site request rejected'});next();});
 if(telemetry){
   app.post('/api/performance',express.json({limit:'4kb',strict:true}),async(req,res)=>{
     const visit=metrics.normalize(req.body);
     if(!visit)return res.status(400).json({error:'Invalid performance visit'});
     await telemetry.put(res.locals.account.session.scope,release,visit);
     res.sendStatus(204);
   });
   app.get('/api/performance',async(req,res)=>{
     const {actor,session}=res.locals.account;
     const owner=!auth||actor===legacyOwnerId;
     const all=owner&&req.query.view==='all';
     res.json({google:!!auth,owner,rows:await telemetry.list(session.scope,all)});

   });
 }
 app.use(express.json({limit:'15mb',strict:true}));
 async function timedRun(calls,res){
   const started=performance.now(),timings={db:0};
   const result=await metrics.context.run(timings,()=>run(calls,res.locals.account));
   res.locals.monitorDb=Math.round(timings.db);
   res.set('Server-Timing',[
     ['app',performance.now()-started],['db',timings.db],['dbpool',timings.pool||0],
     ['dbsnapshot',timings.snapshot||0],['dbsql',timings.sql||0]
   ].map(([name,value])=>name+';dur='+value.toFixed(1)).join(', '));
   return result;
 }
 const {gzip}=require('node:zlib');
 function sendReadResponse(req,res,value){
   const serializeStart=performance.now();
   const compact=req.get('X-Alishan-Card-View')==='1'&&Array.isArray(value);
   const body=JSON.stringify(encode(compact?value.map(row=>{
     const result=row.result;
     if(!Array.isArray(result?.primes))return row;
     const {compactCardView,compactReportPrimes}=require('./page-bundles');
     if(result.primes.some(prime=>prime.target==='Reports'&&prime.method==='overview'))
       return {...row,result:{...result,primes:compactReportPrimes(result.primes)}};
     return {...row,result:result.paged||result.items?compactCardView(result):{
       ...result,primes:compactReportPrimes(result.primes).map(prime=>prime.target==='Views'&&['inventoryPage','homeLatest'].includes(prime.method)
         ?{...prime,result:compactCardView(prime.result)}:prime)
     }};
   }):value));
   res.append('Server-Timing','serialize;dur='+(performance.now()-serializeStart).toFixed(1));
   res.set('X-Alishan-Decoded-Bytes',String(Buffer.byteLength(body)));
   res.vary('Accept-Encoding');
   if(body.length<4096||req.acceptsEncodings('gzip','identity')!=='gzip')return res.type('json').send(body);
   const key=hash(body).toString('hex');
   let pending=compressedReads.get(key);
   if(!pending){
     if(compressedReads.size>=16)compressedReads.delete(compressedReads.keys().next().value);
     pending=new Promise(resolve=>gzip(body,{level:1},(error,compressed)=>resolve(error?null:compressed)));
     if(body.length<=1024*1024)compressedReads.set(key,pending);
   }
   const compressionStart=performance.now();
   pending.then(compressed=>{
     res.append('Server-Timing','compress;dur='+(performance.now()-compressionStart).toFixed(1));
     if(!compressed){if(compressedReads.get(key)===pending)compressedReads.delete(key);return res.type('json').send(body);}
     res.set('Content-Encoding','gzip').type('json').send(compressed);
   });
 }
 async function run(calls,{repository,actor,session}){
   const submit=entryReview(createHash('sha256').update(password).update(session.scope).digest());
   const readOnly=calls.every(isReader);
   const routineWrites=new Set(['addItem','updateItem','addPayment','deletePayment','toggleStock','setCompletionDate','recordSearch','clearSearchHistory']);
   const omitBackupSnapshots=!readOnly&&calls.every(c=>c.target==='Store'&&routineWrites.has(c.method));
   const method=calls[0]?.method;
   if(readOnly && ['backupOverview','exportSettings'].includes(method) &&
     calls.every(c=>c.target==='Views'&&c.method===method)){
     const result=repository[method]?await repository[method]():await repository.read(async state=>{
       const views=(await domain(state,{readOnly:true,actor})).Views;
       return views[method]();
     });
     return {results:calls.map(()=>({result})),revision:null};
   }
   const execute=async (state,revision,issueQualityCode)=>{
     const pure=calls.every(c=>['Calc','Groups'].includes(c.target));
     const d=pure?await (pureDomain ||= domain(blank(),{readOnly:true})):await domain(state,{readOnly,actor,runAutoBackup:!readOnly&&!omitBackupSnapshots});const results=[];
     for(const c of calls){const args=decode(c.args);const guarded=c.target==='Store'&&['reviewEntry','submissionStatus','addItem','addPayment'].includes(c.method);
       const requiresManager=(c.target==='Store'&&c.method==='deleteItem')
         ||(c.target==='Archive'&&['restore','deleteForever'].includes(c.method));
       const result=requiresManager?{ok:false,error:'This action requires Manager approval.'}:guarded?await submit(d,c.method,args,issueQualityCode):await invoke(d,c.target,c.method,args);
       let primes;
       if(c.target==='Store'&&result?.ok&&['addItem','updateItem','addPayment'].includes(c.method)){
         const id=result.item?.id??result.payment?.inventoryId;
         const item=d.Store.getItem(id);
         if(item)primes=[
           {target:'Store',method:'getItem',args:[item.id],result:item},
           {target:'Store',method:'itemPayment',args:[item],result:d.Store.itemPayment(item)}
         ];
       }
       const unchanged=readOnly&&c.target!=='Groups'&&typeof c.known==='string'&&/^[a-f0-9]{64}$/.test(c.known)&&hash(JSON.stringify(encode(result))).toString('hex')===c.known;
       results.push(unchanged?{unchanged:true}:{result,...(primes?{primes}:{}),...(c.target==='Groups'?{args}:{})});
       if(result?.ok===false){const failed=results.length-1;return {ok:false,results:calls.map((_,i)=>i===failed?results[i]:{error:'Request cancelled because another operation was rejected. Please retry.'})};}
     }
     return {results,revision:readOnly&&revision!==undefined?String(revision):null};
   };
   if(readOnly){const projection=selection(calls);if(!projection.stores.length)return execute(blank());
     if(repository.read)return repository.read(execute,projection);
   }
   return repository.transaction(execute,{omitBackupSnapshots});
 }
 const valid=c=>c&&['Calc','Store','Reports','Archive','Groups','DB','Search','Views'].includes(c.target)&&typeof c.method==='string'&&c.method.length<=100&&Array.isArray(c.args)&&c.args.length<=10;
 app.post('/api/rpc',async(req,res,next)=>{try{
   if(!valid(req.body))return res.status(400).json({error:'Invalid operation'});
   const output=await timedRun([req.body],res);if(output.revision!==null&&output.revision!==undefined)res.set('X-Alishan-Revision',output.revision);if(isReader(req.body))sendReadResponse(req,res,output.results[0]);else res.json(encode(output.results[0]));
 }catch(e){next(e);}});
 app.post('/api/batch',async(req,res,next)=>{try{
   // Batch argument references are request-local, bounded by the JSON body limit.
   // Expand before opening any transaction; no cache tokens or retrying writes.
   if(req.body&&!Array.isArray(req.body)&&Array.isArray(req.body.calls)&&Array.isArray(req.body.shared)){
     const {calls,shared}=req.body;
     if(shared.length>1000||calls.length>1000)return res.status(400).json({error:'Invalid batch'});
     for(const c of calls)if(Array.isArray(c?.args))c.args=c.args.map(arg=>{
       if(arg?.$alishan!=='batchArg')return arg;
       if(!Number.isInteger(arg.value)||arg.value<0||arg.value>=shared.length)throw Object.assign(new Error('Invalid batch argument'),{status:400});
       return shared[arg.value];
     });
     req.body=calls;
   }
   if(!Array.isArray(req.body)||req.body.length<1||req.body.length>1000||!req.body.every(valid))return res.status(400).json({error:'Invalid batch'});
   const output=await timedRun(req.body,res);if(output.revision!==null&&output.revision!==undefined)res.set('X-Alishan-Revision',output.revision);if(req.body.every(isReader))sendReadResponse(req,res,output.results||[]);else res.json(encode(output.results||[]));
 }catch(e){next(e);}});
 app.get('/api/theme',async(req,res,next)=>{try{
   const {repository}=res.locals.account;
   const theme=repository.themePreference?await repository.themePreference():await repository.transaction(async state=>(await domain(state,{readOnly:true})).DB.getTheme());
   res.json({theme:theme||'light-default'});
 }catch(error){next(error);}});
 app.post('/api/theme',async(req,res,next)=>{try{
   const theme=req.body?.theme;
   if(typeof theme!=='string'||!/^[a-z0-9-]{1,40}$/.test(theme))return res.status(400).json({error:'Invalid theme'});
   const {repository}=res.locals.account;
   if(repository.themePreference)await repository.themePreference(theme);
   else await repository.transaction(async state=>(await domain(state,{readOnly:true})).DB.setTheme(theme));
   res.json({ok:true});
 }catch(error){next(error);}});
 app.get('/api/cache-status',async(req,res,next)=>{try{const {repository,session}=res.locals.account;res.json({...session,revision:repository.revision?await repository.revision():'0'});}catch(e){next(e);}});
 app.get('/api/cache-changes',async(req,res,next)=>{try{
   const since=req.query.since;
   if(typeof since!=='string'||!/^\d{1,19}$/.test(since)||BigInt(since)>9223372036854775807n)
     return res.status(400).json({error:'Invalid cache revision'});
   const {repository}=res.locals.account;
   res.set('Cache-Control','no-store');
   res.json(repository.changesSince?await repository.changesSince(since):{reset:true});
 }catch(error){next(error);}});
 app.get('/api/bootstrap.js',async(req,res,next)=>{try{
   const d=await domain(blank(),{readOnly:true});
   const meta={Calc:{},Store:{},Reports:{},Archive:{},Groups:{},DB:{}};
   for(const target of Object.keys(meta))for(const [key,v] of Object.entries(d[target]))meta[target][key]=typeof v==='function'?{fn:true}:encode(v);
   meta.Reports.freshFilters={value:encode(d.Reports.freshFilters())};
   for(const key of ['getColors','getQualityData','getProductTypes'])meta.Store[key]={value:encode(d.Store[key]())};
   res.type('application/javascript').send(`window.ALISHAN_META=${JSON.stringify(meta).replace(/</g,'\\u003c')};`);
  }catch(e){next(e);}});
 app.use((req,res,next)=>{
   if(req.method!=='GET'||!(req.path==='/'||/^\/[a-z0-9-]+\.html$/i.test(req.path)))return next();
   const file=path.join(__dirname,'../dist',req.path==='/'?'index.html':req.path.slice(1));
   try{const html=fs.readFileSync(file,'utf8');res.type('html').send(html.replace('/*ALISHAN_SESSION*/',`window.ALISHAN_SESSION=${JSON.stringify(res.locals.account.session)};`));}catch(e){if(e.code==='ENOENT')return next();next(e);}
 });
 // Only the generated client directory is public. Original formulas and server files never are.
 const clientDir=path.resolve(__dirname,'../dist');
 const assetTag=fs.readFileSync(path.join(clientDir,'index.html'),'utf8').match(/bootstrap\.js\?v=([^"]+)/)?.[1];
 app.use(express.static(clientDir,{index:'index.html',dotfiles:'deny',etag:true,maxAge:0,setHeaders(res,file){
   if(file.endsWith('.html'))return;
   const versioned=/^(?:bootstrap|server-client|spa|route-[a-z-]+)\.js$/.test(path.basename(file));
   const immutable=versioned&&assetTag&&res.req.query.v===assetTag;
   res.set('Cache-Control',immutable?'private, max-age=31536000, immutable':'private, max-age=0, must-revalidate');
 }}));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const status=err.status||500;if(status>=500)console.error('Request failed:',err.code||err.name);res.status(status).json({error:status<500?err.message:'Server request failed. Please try again.'});});
 return app;
}
async function start(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const {Pool}=require('pg');const url=new URL(process.env.DATABASE_URL);
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const pool=new Pool({connectionString:url.toString(),max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA?{ca:process.env.DATABASE_CA.replace(/\\n/g,'\n')}:{})}});
 pool.on('error',e=>console.error('Database pool error:',e.code||e.name));
 const repository=new PostgresRepository(pool,process.env.APP_WORKSPACE||'alishan');await repository.ready();
 const {googleLogin,sessionStore}=require('./google-login');
 const authMode=process.env.APP_AUTH_MODE;
 const login=['google','google-setup'].includes(authMode)?googleLogin({
   supabaseUrl:process.env.SUPABASE_URL,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY,
   origin:process.env.APP_ORIGIN,sessions:sessionStore(pool),verifyOnly:authMode==='google-setup'
 }):null;
 const auth=authMode==='google'?login:null;
 const googleSetup=authMode==='google-setup'?login:null;
 if(auth){
   await pool.query('SELECT 1 FROM alishan_private.login_sessions LIMIT 1');
   const legacyOwner=process.env.LEGACY_OWNER_USER_ID||null;
   const {rows:[ownership]}=await pool.query(
     `SELECT EXISTS(SELECT 1 FROM alishan_private.records WHERE workspace_id=$1 AND store IN ('inventory','payments','archive','auditLog')) AS has_legacy,
       alishan_private.verified_google_owner($2) AS verified_owner`,
     [repository.workspace,legacyOwner]
   );
   if((ownership.has_legacy||legacyOwner)&&!ownership.verified_owner)
     throw new Error('Identify the verified Google owner of the existing workspace before enabling Google-only sign-in');
 }
 const userRepositories=new Map();
 const repositoryFor=workspace=>{
   if(!userRepositories.has(workspace)){
     if(userRepositories.size>=100)userRepositories.delete(userRepositories.keys().next().value);
     userRepositories.set(workspace,new PostgresRepository(pool,workspace));
   }
   return userRepositories.get(workspace);
 };
 const app=createApp({repository,username:process.env.APP_USERNAME,password:process.env.APP_PASSWORD,
   auth,googleSetup,repositoryFor,legacyOwnerId:process.env.LEGACY_OWNER_USER_ID,telemetry:metrics.telemetryStore(pool)});
 const server=app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Alishan server ready'));
 let backupRunning=false;
 const backupTimer=setInterval(async()=>{
   if(backupRunning)return;
   backupRunning=true;
   try{await runScheduledBackup(repository,async state=>{await domain(state);return {ok:true};});}
   catch(e){console.error('Automatic backup check failed:',e.code||e.name);}
   finally{backupRunning=false;}
 },60000);backupTimer.unref();
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(backupTimer);server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module)start().catch(e=>{console.error('Startup failed:',e.code||e.message);process.exit(1);});
module.exports={createApp};
