'use strict';
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
const hash=s=>createHash('sha256').update(s).digest();
function createApp({repository,username,password}){
 if(!username||!password||password.length<20)throw new Error('APP_USERNAME and APP_PASSWORD (20+ characters) are required');
 let pureDomain;
 const scope=hash(JSON.stringify([repository.workspace||'alishan',username,password,process.env.DATABASE_URL||'local'])).toString('hex').slice(0,32);
 const session={scope,release};
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cache-Control':'no-store'});next();});
 app.get('/healthz',async(req,res)=>{try{await repository.ready();res.json({status:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
 // Chrome may fetch installation metadata without the browser tab's credentials.
 const installAssets=new Set(['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png']);
 app.get([...installAssets],(req,res,next)=>{
   res.sendFile(req.path.slice(1),{root:path.resolve(__dirname,'../dist')},error=>{if(error)next(error);});
 });
 app.use((req,res,next)=>{
   let supplied='';try{if(req.headers.authorization?.startsWith('Basic '))supplied=Buffer.from(req.headers.authorization.slice(6),'base64').toString('utf8');}catch{}
   if(!timingSafeEqual(hash(supplied),hash(`${username}:${password}`))){res.set('WWW-Authenticate','Basic realm="Alishan", charset="UTF-8"');return res.status(401).send('Sign in to Alishan');}
   next();
 });
 app.use('/api',(req,res,next)=>{const origin=req.get('origin');if(req.get('sec-fetch-site')==='cross-site'||(origin&&origin!==`${req.protocol}://${req.get('host')}`&&origin!==`https://${req.get('host')}`))return res.status(403).json({error:'Cross-site request rejected'});next();});
 app.use(express.json({limit:'15mb',strict:true}));
 const {gzip}=require('node:zlib');
 function sendReadResponse(req,res,value){
   const body=JSON.stringify(encode(value));
   res.vary('Accept-Encoding');
   if(body.length<4096||req.acceptsEncodings('gzip','identity')!=='gzip')return res.type('json').send(body);
   gzip(body,{level:3},(error,compressed)=>{
     if(error)return res.type('json').send(body);
     res.set('Content-Encoding','gzip').type('json').send(compressed);
   });
 }
 async function run(calls){
   const readOnly=calls.every(isReader);
   const execute=async (state,revision)=>{
     const pure=calls.every(c=>['Calc','Groups'].includes(c.target));
     const d=pure?await (pureDomain ||= domain(blank(),{readOnly:true})):await domain(state,{readOnly});const results=[];
     for(const c of calls){const args=decode(c.args);const result=await invoke(d,c.target,c.method,args);
       const unchanged=readOnly&&c.target!=='Groups'&&typeof c.known==='string'&&/^[a-f0-9]{64}$/.test(c.known)&&hash(JSON.stringify(encode(result))).toString('hex')===c.known;
       results.push(unchanged?{unchanged:true}:{result,...(c.target==='Groups'?{args}:{})});
       if(result?.ok===false){const failed=results.length-1;return {ok:false,results:calls.map((_,i)=>i===failed?results[i]:{error:'Request cancelled because another operation was rejected. Please retry.'})};}
     }
     return {results,revision:readOnly&&revision!==undefined?String(revision):null};
   };
   if(readOnly){const projection=selection(calls);if(!projection.stores.length)return execute(blank());
     if(repository.read)return repository.read(execute,projection);
   }
   return repository.transaction(execute);
 }
 const valid=c=>c&&['Calc','Store','Reports','Archive','Groups','DB','Search','Views'].includes(c.target)&&typeof c.method==='string'&&c.method.length<=100&&Array.isArray(c.args)&&c.args.length<=10;
 app.post('/api/rpc',async(req,res,next)=>{try{
   if(!valid(req.body))return res.status(400).json({error:'Invalid operation'});
   const started=performance.now();const output=await run([req.body]);res.set('Server-Timing',`app;dur=${(performance.now()-started).toFixed(1)}`);if(output.revision!==null&&output.revision!==undefined)res.set('X-Alishan-Revision',output.revision);if(isReader(req.body))sendReadResponse(req,res,output.results[0]);else res.json(encode(output.results[0]));
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
   const started=performance.now();const output=await run(req.body);res.set('Server-Timing',`app;dur=${(performance.now()-started).toFixed(1)}`);if(output.revision!==null&&output.revision!==undefined)res.set('X-Alishan-Revision',output.revision);if(req.body.every(isReader))sendReadResponse(req,res,output.results||[]);else res.json(encode(output.results||[]));
 }catch(e){next(e);}});
 app.get('/api/theme',async(req,res,next)=>{try{
   const theme=repository.themePreference?await repository.themePreference():await repository.transaction(async state=>(await domain(state,{readOnly:true})).DB.getTheme());
   res.json({theme:theme||'light-default'});
 }catch(error){next(error);}});
 app.post('/api/theme',async(req,res,next)=>{try{
   const theme=req.body?.theme;
   if(typeof theme!=='string'||!/^[a-z0-9-]{1,40}$/.test(theme))return res.status(400).json({error:'Invalid theme'});
   if(repository.themePreference)await repository.themePreference(theme);
   else await repository.transaction(async state=>(await domain(state,{readOnly:true})).DB.setTheme(theme));
   res.json({ok:true});
 }catch(error){next(error);}});
 app.get('/api/cache-status',async(req,res,next)=>{try{res.json({...session,revision:repository.revision?await repository.revision():'0'});}catch(e){next(e);}});
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
   try{const html=fs.readFileSync(file,'utf8');res.type('html').send(html.replace('/*ALISHAN_SESSION*/',`window.ALISHAN_SESSION=${JSON.stringify(session)};`));}catch(e){if(e.code==='ENOENT')return next();next(e);}
 });
 // Only the generated client directory is public. Original formulas and server files never are.
 app.use(express.static(path.resolve(__dirname,'../dist'),{index:'index.html',dotfiles:'deny',etag:true,maxAge:0,setHeaders(res,file){if(!file.endsWith('.html'))res.set('Cache-Control','private, max-age=0, must-revalidate');}}));
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
 const app=createApp({repository,username:process.env.APP_USERNAME,password:process.env.APP_PASSWORD});
 const server=app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Alishan server ready'));
 const backupTimer=setInterval(()=>repository.transaction(async state=>{await domain(state);return {ok:true};}).catch(e=>console.error('Automatic backup check failed:',e.code||e.name)),60000);backupTimer.unref();
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;clearInterval(backupTimer);server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module)start().catch(e=>{console.error('Startup failed:',e.code||e.message);process.exit(1);});
module.exports={createApp};
