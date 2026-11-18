import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';
const traverse=traverseModule.default||traverseModule, generate=generateModule.default||generateModule;
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..'),src=path.join(root,'frontend'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.cpSync(src,out,{recursive:true});
const remoteNames=new Set(['AlishanCalc','AlishanStore','ReportEngine','AlishanArchive','AlishanDB','AlishanGroupCore']);
const replaced=new Set(['calc.js','store.js','db.js','archive.js','report-engine.js','sw.js','pwa.js']);
const units=[];
const dashboard=parse(fs.readFileSync(path.join(src,'dashboard.js'),'utf8'),{sourceType:'script'});
const dashboardRules=dashboard.program.body.filter(n=>t.isFunctionDeclaration(n)&&['breakdownPeriodStart','getBreakdownData','getQualityRanking'].includes(n.id.name));
fs.writeFileSync(path.join(root,'backend/dashboard-rules.js'),`// Extracted unchanged from v96 UI source by the client build. Server only.\nmodule.exports=(AlishanCalc,AlishanStore)=>{let breakdownState={period:'all'};\n${dashboardRules.map(n=>generate(n).code).join('\n')}\nreturn {breakdown(period){breakdownState.period=period;return getBreakdownData();},ranking(period){breakdownState.period=period;return getQualityRanking();}};};\n`);
function rpc(target,method,args){return t.callExpression(t.memberExpression(t.identifier('AlishanRemote'),t.identifier('call')),[t.stringLiteral(target),t.stringLiteral(method),t.arrayExpression(args)]);}

function unit(code,file){return {file,ast:parse(code,{sourceType:'script',allowReturnOutsideFunction:true}),code};}
for(const name of fs.readdirSync(src)){
 if(name.endsWith('.js')&&!replaced.has(name)){
  let code=fs.readFileSync(path.join(src,name),'utf8');
  if(name==='size-groups.js'){
    code=code.slice(code.indexOf('function buildUI(core)'));
    code=code.replace('makeCore(AlishanCalc.SIZES, AlishanCalc.splitPieces)','AlishanGroupCore');
    code=code.replace(/if \(typeof module[^\n]+/g,'');
  }
  if(name==='advanced-search.js'){
    const start=code.indexOf('  function matches('),end=code.indexOf('  function setCount(',start);
    code=code.slice(0,start)+"  async function apply(items){return AlishanRemote.call('Search','apply',[items,state,window.AlishanSearch?.getTerm?.()||'']);}\n"+code.slice(end);
  }
  if(name==='export-center.js'){
    const start=code.indexOf('      const currentSettings=');const stop=code.indexOf('      notify(`Restore complete.',start);
    if(start<0||stop<0)throw new Error('Restore integration source changed');
    code=code.slice(0,start)+"      const result=await AlishanRemote.call('Store','restoreComplete',[payload]);\n      if(!result.ok)throw new Error(result.error||'Restore failed.');\n"+code.slice(stop);
  }
  if(name==='report-views.js'){
    const start=code.indexOf('    const sizeSets ='),stop=code.indexOf('    const entries =',start);
    code=code.slice(0,start)+"    const sizeLines = AlishanRemote.call('Views','sizeLines',[item]);\n"+code.slice(stop);
  }
  if(name==='audit-pages.js')code=code.replaceAll('Math.max(0,Math.floor((today-added)/86400000))',"AlishanRemote.call('Views','pendingDays',[i,today])");
  if(name==='dashboard.js'){
   const ast=parse(code,{sourceType:'script'});
   traverse(ast,{
    FunctionDeclaration(p){if(['getBreakdownData','getQualityRanking'].includes(p.node.id.name))p.node.body=t.blockStatement([t.returnStatement(rpc('Views',p.node.id.name==='getBreakdownData'?'breakdown':'ranking',[t.memberExpression(t.identifier('breakdownState'),t.identifier('period'))]))]);},
    VariableDeclarator(p){if(p.node.id.name==='percent'&&p.getFunctionParent()?.node.id?.name==='breakdownCardHTML')p.node.init=rpc('Views','percent',[t.memberExpression(t.identifier('bucket'),t.identifier('dozens')),t.identifier('totalDozens')]);
     if(p.node.id.name==='totals'&&p.getFunctionParent()?.node.id?.name==='showQualityEntries')p.node.init=rpc('Views','rowsTotals',[t.identifier('rows')]);
     if(p.node.id.name==='totalDozens'&&p.getFunctionParent()?.node.id?.name==='showAllProductTypes')p.node.init=rpc('Views','totalDozens',[t.identifier('data')]);}
   });code=generate(ast,{retainLines:true}).code;
  }
  if(['inventory.js','dashboard.js'].includes(name)){
   // Calculate independent card models together, then append in original order.
   // Only this exact read-only card loop is parallelized; business actions remain sequential.
   const ast=parse(code,{sourceType:'script'});
   traverse(ast,{CallExpression(p){const n=p.node,b=n.arguments[0]?.body;
    if(!t.isMemberExpression(n.callee)||n.callee.property.name!=='forEach'||n.arguments.length!==1||!t.isArrowFunctionExpression(n.arguments[0])||!t.isCallExpression(b)||!t.isMemberExpression(b.callee)||!t.isIdentifier(b.callee.object,{name:'fragment'})||b.callee.property.name!=='appendChild')return;
    const card=b.arguments[0];if(!t.isCallExpression(card)||!t.isMemberExpression(card.callee)||!t.isIdentifier(card.callee.object,{name:'ItemCard'})||card.callee.property.name!=='create')return;
    const fn=p.getFunctionParent();if(!fn||!p.parentPath.isExpressionStatement())return;fn.node.async=true;
    const cards=t.awaitExpression(t.callExpression(t.memberExpression(t.identifier('Promise'),t.identifier('all')),[t.callExpression(t.memberExpression(n.callee.object,t.identifier('map')),[t.arrowFunctionExpression(n.arguments[0].params,card)])]));
    p.parentPath.replaceWith(t.forOfStatement(t.variableDeclaration('const',[t.variableDeclarator(t.identifier('card'))]),cards,t.expressionStatement(t.callExpression(t.memberExpression(t.identifier('fragment'),t.identifier('appendChild')),[t.identifier('card')]))));
   }});code=generate(ast,{retainLines:true}).code;
  }
  units.push(unit(code,name));
 }
 if(name.endsWith('.html')){
  let html=fs.readFileSync(path.join(src,name),'utf8'),n=0;
  if(name==='reports.html')html=html.replace('AlishanCalc.round2(days.reduce((t, d) => t + d.entries.reduce((x, { payment }) => x + payment.amount, 0), 0))',"AlishanRemote.call('Views','paymentTotal',[days])");
  html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(match,attrs,code)=>{
   if(/\bsrc\s*=/.test(attrs)||/type=["']application\//.test(attrs)||!code.trim())return match;
   const marker=`__INLINE_${name}_${n++}__`;units.push({...unit(code,marker),html:name});return `<script${attrs}>${marker}</script>`;
  });
  fs.writeFileSync(path.join(out,name),html.replace(/<head>/i,'<head><script src="/api/bootstrap.js"></script><script src="/server-client.js"></script>'));
 }
}
function functionName(p){
 if(p.node.id?.name)return p.node.id.name;
 if((p.isObjectMethod()||p.isClassMethod())&&!p.node.computed)return p.node.key.name||p.node.key.value;
 if(p.parentPath.isVariableDeclarator()&&t.isIdentifier(p.parentPath.node.id))return p.parentPath.node.id.name;
 if(p.parentPath.isObjectProperty())return p.parentPath.node.key.name||p.parentPath.node.key.value;
 if(p.parentPath.isAssignmentExpression()){const l=p.parentPath.node.left;return l.name||l.property?.name;}
}
function rootName(p,node=p.node){
 if(t.isIdentifier(node)){
  if(remoteNames.has(node.name))return node.name;
  if(node.name==='core')return 'AlishanGroupCore';
  const b=p.scope.getBinding(node.name);
  if(b?.path.isVariableDeclarator()&&b.path.node.init&&b.path.node.init!==node){const init=b.path.node.init;if(t.isIdentifier(init)&&init.name!==node.name)return rootName(b.path,init);if(t.isMemberExpression(init))return rootName(b.path,init.object);}
 }
 if(t.isMemberExpression(node)||t.isOptionalMemberExpression(node))return rootName(p,node.object);
 return null;
}
const asyncNames=new Set(),callbackArrays=new Set(['map','flatMap','filter','find','some','every','forEach','reduce','sort']);
function isAsyncCallee(p,node=p.node.callee){
 if(t.isFunction(node))return node.async;
 if(t.isIdentifier(node)){
  const b=p.scope.getBinding(node.name);
  if(b?.path.isVariableDeclarator()&&t.isMemberExpression(b.path.node.init)&&rootName(b.path,b.path.node.init.object))return true;
  if(b){if(b.path.isFunctionDeclaration())return b.path.node.async;
   if(b.path.isVariableDeclarator()&&t.isFunction(b.path.node.init))return b.path.node.init.async;
   return false;}
  return asyncNames.has(node.name);
 }
 if(t.isMemberExpression(node)||t.isOptionalMemberExpression(node)){
  if(rootName(p,node.object)){
   if((rootName(p,node.object)==='AlishanCalc'&&['fmtNumber','fmtMoney','fmtDozens','fmtDate','fmtDateLong','fmtDateTime','parseDate','localDate','localTime','colorName'].includes(node.property.name)))return false;
   if(node.property.name==='subscribe'||node.property.name==='onChange'||(['getColors','getQualityData','getProductTypes'].includes(node.property.name)&&rootName(p,node.object)==='AlishanStore')||(rootName(p,node.object)==='ReportEngine'&&node.property.name==='freshFilters'))return false;
   return true;
  }
  if(t.isIdentifier(node.object,{name:'AlishanRemote'}))return true;
  if(node.computed&&!t.isStringLiteral(node.property)){
   // Dynamic report renderer E[state.key](...) resolves via the remote E binding above.
   return false;
  }
  return asyncNames.has(node.property.name||node.property.value)&&!['map','filter','find','some','every','forEach','reduce','sort','get','set','has','add','delete'].includes(node.property.name);
 }
 return false;
}
function mark(p){
 const f=p.getFunctionParent();
 if(!f){p.node._topAsync=true;return;}
 if(f.isClassMethod({kind:'constructor'}))return;
 if(!f.node.async){f.node.async=true;changed=true;}
 const name=functionName(f);if(name&&!asyncNames.has(name)){asyncNames.add(name);changed=true;}
}
let changed=true,passes=0;
while(changed&&passes++<80){changed=false;
 for(const u of units)traverse(u.ast,{
  Function(p){if(p.node.async){const n=functionName(p);if(n&&!asyncNames.has(n)){asyncNames.add(n);changed=true;}}},
  CallExpression:{exit(p){
   const c=p.node.callee;
   let remote=isAsyncCallee(p);
   if(t.isMemberExpression(c)&&callbackArrays.has(c.property.name)&&p.node.arguments[0]){
    const cb=p.node.arguments[0];const cbAsync=(t.isFunction(cb)&&cb.async)||(t.isIdentifier(cb)&&asyncNames.has(cb.name))||(t.isMemberExpression(cb)&&rootName(p,cb.object));
    if(cbAsync){p.node._asyncArray=true;remote=true;}
   }
   if(remote){if(p.parentPath.isMemberExpression()&&['then','catch','finally'].includes(p.parentPath.node.property.name))return;p.node._await=true;mark(p);}
  }},
  OptionalCallExpression:{exit(p){if(isAsyncCallee(p)){p.node._await=true;mark(p);}}}
 });
}
let topFailures=[];
for(const u of units){
 traverse(u.ast,{
  CallExpression:{exit(p){if(!p.node._await)return;
   if(p.node._asyncArray){const c=p.node.callee;p.node.callee=t.memberExpression(t.identifier('AlishanAsync'),t.identifier(c.property.name));p.node.arguments.unshift(c.object);}
   const f=p.getFunctionParent();
   if(!f){if(t.isFunction(p.node.callee)&&p.node.callee.async)return;topFailures.push(u.file+': '+generate(p.node).code.slice(0,90));return;}
   if(f.isClassMethod({kind:'constructor'}))return;
   if(!p.parentPath.isAwaitExpression()){const n=p.node;delete n._await;p.replaceWith(t.awaitExpression(n));p.skip();}
  }},
  OptionalCallExpression:{exit(p){if(p.node._await&&p.getFunctionParent()&&!p.parentPath.isAwaitExpression()){const n=p.node;delete n._await;p.replaceWith(t.awaitExpression(n));p.skip();}}}
 });
 let code=generate(u.ast,{retainLines:true,comments:true}).code;
 // A module IIFE must expose its API synchronously. Any direct async initialization is a build error.
 let check;try{check=parse(code,{sourceType:'script'});}catch(e){fs.writeFileSync('/tmp/alishan-failed.js',code);throw new Error(u.file+': '+e.message);}
 traverse(check,{VariableDeclarator(p){if(t.isCallExpression(p.node.init)&&t.isFunction(p.node.init.callee)&&p.node.init.callee.async)topFailures.push(u.file+': async module initialization '+p.node.id.name);}});
 if(u.html){const dest=path.join(out,u.html);fs.writeFileSync(dest,fs.readFileSync(dest,'utf8').replace(u.file,code));}else fs.writeFileSync(path.join(out,u.file),code);
}
if(topFailures.length)throw new Error('Manual async integration required:\n'+[...new Set(topFailures)].join('\n'));
const wire=fs.readFileSync(path.join(root,'backend/wire.js'),'utf8').replace("'use strict';",'').replace('module.exports = { encode, decode };','window.ALISHAN_WIRE={encode,decode};');
fs.writeFileSync(path.join(out,'server-client.js'),wire+'\n'+fs.readFileSync(path.join(root,'client/runtime.js'),'utf8'));
for(const name of replaced)fs.writeFileSync(path.join(out,name),'/* This module runs on the server. Client API is installed by server-client.js. */\n');
// Retire old workers and caches: they must never serve old formulas or cache authenticated inventory.
fs.writeFileSync(path.join(out,'sw.js'),"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('alishan-'))await caches.delete(k);await self.registration.unregister();})()));");
fs.writeFileSync(path.join(out,'pwa.js'),"if('serviceWorker' in navigator)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));window.addEventListener('online',()=>location.reload());");
fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify({version:97,sourceCommit:'29952b341579a62337668937982fa60039ef8cbf',asyncFunctions:[...asyncNames].sort(),units:units.length},null,2));
console.log(`Built ${units.length} UI scripts; ${asyncNames.size} async functions; formulas remain server-only.`);
