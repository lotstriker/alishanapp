'use strict';
process.env.TZ='Asia/Kolkata';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createApp}=require('../backend/server');
const {domain}=require('../backend/domain');
const {MemoryRepository}=require('./helpers');
const Calc=require('../frontend/calc');

test('signed Manager financial bridge returns canonical completion and payment metrics only to an invited Manager',async t=>{
 const secret='fixture-manager-bridge-secret-that-is-at-least-32-characters';
 const previous=process.env.MANAGER_BRIDGE_SECRET;
 process.env.MANAGER_BRIDGE_SECRET=secret;
 t.after(()=>{if(previous===undefined)delete process.env.MANAGER_BRIDGE_SECRET;else process.env.MANAGER_BRIDGE_SECRET=previous;});
 const managerId='11111111-1111-4111-8111-111111111111';
 const ownerId='22222222-2222-4222-8222-222222222222';
 const repository=new MemoryRepository();repository.workspace='legacy';
 const d=await domain(repository.state);
 const item=(await d.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',cupSize:'B',
   entry:{date:'2026-11-17',time:'10:00'},sizeOption:'same',colors:['MOKA'],
   sizes:{32:{dozens:2,pieces:6}},price:1000})).item;
 assert.ok(item,'fixture quality should be created');
 repository.state.inventory[0].inStock=false;
 repository.state.inventory[0].completedAt='2026-11-19T12:00:00+05:30';
 const saved=await (await domain(repository.state)).Store.addPayment({inventoryId:item.id,amount:100,date:'2026-11-20'});
 assert.equal(saved.ok,true,saved.error);
 const app=createApp({repository,username:'fixture',password:'fixture-only-long-password',
   auth:{},legacyOwnerId:ownerId,repositoryFor:()=>repository,
   manager:{invited:async actor=>actor===managerId}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const payload=JSON.stringify({actor:managerId,userId:ownerId,from:'2026-11-16',to:'2026-11-22',time:Date.now()});
 const signature=crypto.createHmac('sha256',secret).update(payload).digest('hex');
 const post=(sig)=>fetch(base+'/internal/manager/financial-report',{method:'POST',
   headers:{'Content-Type':'application/json','X-Manager-Signature':sig},body:payload});
 assert.equal((await post('0'.repeat(64))).status,403);
 const response=await post(signature);assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.ok,true);assert.equal(result.userId,ownerId);
 assert.equal(result.report.summary.qualities,1);
 assert.equal(result.report.summary.workAmount,item.totalAmount);
 assert.equal(result.report.summary.received,100);
 assert.equal(result.report.summary.pending,Calc.round2(item.totalAmount-100));
 assert.equal(result.report.summary.cashReceived,100);
 assert.equal(result.report.rows[0].quality,'SUZEN-MOLD');
 assert.equal(result.report.rows[0].dozens,item.totalDozens);
 const deniedPayload=JSON.stringify({...JSON.parse(payload),actor:'33333333-3333-4333-8333-333333333333',time:Date.now()});
 const deniedSig=crypto.createHmac('sha256',secret).update(deniedPayload).digest('hex');
 const denied=await fetch(base+'/internal/manager/financial-report',{method:'POST',
   headers:{'Content-Type':'application/json','X-Manager-Signature':deniedSig},body:deniedPayload});
 assert.equal(denied.status,403);
});
