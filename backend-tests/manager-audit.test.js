'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../backend/server');
const {MemoryRepository}=require('./helpers');

test('signed Manager audit bridge returns sanitized quality and activity history to invited managers only',async t=>{
 const secret='fixture-manager-bridge-secret-that-is-at-least-32-characters';
 const previous=process.env.MANAGER_BRIDGE_SECRET;process.env.MANAGER_BRIDGE_SECRET=secret;
 t.after(()=>{if(previous===undefined)delete process.env.MANAGER_BRIDGE_SECRET;else process.env.MANAGER_BRIDGE_SECRET=previous;});
 const actor='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
 const repository=new MemoryRepository();repository.workspace='legacy';
 repository.state.auditLog.push({id:'qh-1',at:'2026-11-23T10:00:00.000Z',action:'Quality Updated',
   qualityCode:'Q-0001',qualityName:'SUZEN-MOLD',productType:'BRA',actor:userId,
   changes:[{field:'Lot Number',oldValue:'—',newValue:'LOT-10'}]});
 repository.state.editHistory.push({id:10,at:'2026-11-23T10:01:00.000Z',type:'Inventory updated',text:'Quality Q-0001 updated'});
 const app=createApp({repository,username:'fixture',password:'fixture-only-long-password',
   auth:{start:(req,res)=>res.sendStatus(204),callback:(req,res)=>res.sendStatus(204),authenticate:async()=>null,logout:(req,res)=>res.sendStatus(204)},
   legacyOwnerId:userId,repositoryFor:()=>repository,manager:{invited:async id=>id===actor}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const body=JSON.stringify({actor,userId,time:Date.now()});
 const signature=crypto.createHmac('sha256',secret).update(body).digest('hex');
 const send=sig=>fetch(base+'/internal/manager/audit-history',{method:'POST',
   headers:{'Content-Type':'application/json','X-Manager-Signature':sig},body});
 assert.equal((await send('0'.repeat(64))).status,403);
 const response=await send(signature);assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.ok,true);
 assert.equal(result.qualityHistory[0].qualityCode,'Q-0001');
 assert.equal(result.qualityHistory[0].changes[0].newValue,'LOT-10');
 assert.equal(result.activity[0].text,'Quality Q-0001 updated');
 const deniedBody=JSON.stringify({actor:'33333333-3333-4333-8333-333333333333',userId,time:Date.now()});
 const deniedSig=crypto.createHmac('sha256',secret).update(deniedBody).digest('hex');
 assert.equal((await fetch(base+'/internal/manager/audit-history',{method:'POST',
   headers:{'Content-Type':'application/json','X-Manager-Signature':deniedSig},body:deniedBody})).status,403);
});
