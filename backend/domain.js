'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createDatabase}=require('./database');
const root=path.resolve(__dirname,'../frontend');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const sources=Object.fromEntries(['calc.js','store.js','report-engine.js','archive.js','size-groups.js','advanced-search.js'].map(n=>[n,source(n)]));
const reference=Object.fromEntries(['qualities.json','colors.json'].map(n=>[n,JSON.parse(source(n))]));
const scripts=Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,new vm.Script(s,{filename:n})]));
async function domain(state,{readOnly=false}={}){
 const db=createDatabase(state);const idleJobs=[];
 const context=vm.createContext({console,Date,Map,Set,Math,JSON,Number,String,Boolean,Array,Object,RegExp,Promise,structuredClone,AlishanDB:db,
   window:{requestIdleCallback(fn){idleJobs.push(fn);}}, setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){},
   fetch:async file=>({ok:!!reference[file],json:async()=>structuredClone(reference[file])})});
 for(const name of ['calc.js','store.js','report-engine.js','archive.js','size-groups.js'])scripts[name].runInContext(context,{timeout:2000});
 await context.window.AlishanStore.init();
 if(!readOnly)for(const job of idleJobs)await job();
 const S=context.window.AlishanStore;
 S.restoreComplete=async payload=>{
   if(!payload||!payload.backup)return {ok:false,error:'Invalid complete backup'};
   const inspection=S.inspectBackup(payload.backup);if(!inspection.ok)return inspection;
   const extras=payload.extra||{};
   for(const key of ['qualityHistory','activityLog'])if(extras[key]!==undefined&&!Array.isArray(extras[key]))return {ok:false,error:'Invalid backup history'};
   const settings=await db.getAll('settings');
   const record={createdAt:new Date().toISOString(),backup:S.backupFile('PRE_RESTORE_COMPLETE'),extra:{qualityHistory:await db.getQualityHistory(),activityLog:await db.getRecentActivity(1000),settings:Object.fromEntries(settings.filter(r=>r.key!=='fullRestoreSafetyBackups').map(r=>[r.key,r.value]))}};
   const safety=await db.getSetting('fullRestoreSafetyBackups',[]);
   const result=await S.importBackup(payload.backup,'replace');if(!result.ok)return result;
   if(extras.qualityHistory)await db.putAll('auditLog',extras.qualityHistory);
   if(extras.activityLog)await db.putAll('editHistory',extras.activityLog);
   if(extras.settings&&typeof extras.settings==='object'&&!Array.isArray(extras.settings))await db.putAll('settings',Object.entries(extras.settings).filter(([key])=>key!=='fullRestoreSafetyBackups').map(([key,value])=>({key,value})));
   await db.setSetting('fullRestoreSafetyBackups',[...safety,record].slice(-3));return result;
 };
 const search={apply(items,options,term){context.localStorage={getItem:()=>JSON.stringify(options)};context.window.AlishanSearch={getTerm:()=>term};scripts['advanced-search.js'].runInContext(context,{timeout:2000});return context.window.AlishanAdvancedSearch.apply(items);}};
 const d={Views:{...require('./views')(context.window.AlishanCalc,context.window.AlishanStore),...require('./dashboard-rules')(context.window.AlishanCalc,context.window.AlishanStore)},Search:search,Calc:context.window.AlishanCalc,Store:context.window.AlishanStore,Reports:context.window.ReportEngine,Archive:context.window.AlishanArchive,Groups:vm.runInContext('makeCore(AlishanCalc.SIZES, AlishanCalc.splitPieces)',context),DB:db};
 Object.assign(d.Views,require('./page-bundles')(d));return d;
}
const blocked=new Set(['constructor','__proto__','prototype','subscribe','onChange']);
async function invoke(d,target,method,args){
 const obj=d[target];
 if(!obj||blocked.has(method)||!Object.hasOwn(obj,method)||typeof obj[method]!=='function')throw Object.assign(new Error('Unsupported operation'),{status:400});
 // Database writes only occur through the authoritative Store/Archive actions.
 const dbAllowed=new Set(['saveInventory','replaceInventoryAndPayments','init','get','getAll','getAllFrom','getSetting','setSetting','removeSetting','getTheme','setTheme','getSearchAnalytics','saveSearchAnalytics','getSearchHistory','saveSearchHistory','getInventory','getPayments','getArchive','getQualityHistory','getRecentActivity']);
 if(target==='DB'&&!dbAllowed.has(method))throw Object.assign(new Error('Use an application action to change records'),{status:403});
 if(target==='DB'&&method==='setSetting'&&(typeof args[0]!=='string'||args[0].length>150))throw Object.assign(new Error('Invalid setting key'),{status:400});
 if(target==='DB'&&['saveInventory','replaceInventoryAndPayments'].includes(method)){
   const inventory=args[0],payments=method==='saveInventory'?await d.DB.getPayments():args[1];
   const result=await d.Store.importBackup({metadata:{system:'ALISHAN_INVENTORY',version:'2.0',totalItems:inventory?.length},inventory,payments},'replace');
   if(!result.ok)throw Object.assign(new Error(result.error),{status:400});return true;
 }
 const result=await obj[method](...args);
 return result;
}
async function dispatch(state,target,method,args){const d=await domain(state);return {result:await invoke(d,target,method,args),args};}
module.exports={domain,dispatch,invoke};
