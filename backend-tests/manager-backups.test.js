'use strict';
process.env.TZ='Asia/Kolkata';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createApp}=require('../backend/server');
const {domain}=require('../backend/domain');
const {MemoryRepository}=require('./helpers');

test('invited Manager can create a manual backup and inspect only safe backup metadata',async t=>{
 const secret='fixture-manager-bridge-secret-that-is-at-least-32-characters';
 const previous=process.env.MANAGER_BRIDGE_SECRET;process.env.MANAGER_BRIDGE_SECRET=secret;
 t.after(()=>{if(previous===undefined)delete process.env.MANAGER_BRIDGE_SECRET;else process.env.MANAGER_BRIDGE_SECRET=previous;});
 const actor='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
 const repository=new MemoryRepository();repository.workspace='legacy';
 const d=await domain(repository.state);
 const added=await d.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',colors:['MOKA'],sizes:{32:{dozens:1}}});
 assert.equal(added.ok,true,added.error);
 const app=createApp({repository,username:'fixture',password:'fixture-only-long-password',
   auth:{start:(req,res)=>res.sendStatus(204),callback:(req,res)=>res.sendStatus(204),authenticate:async()=>null,logout:(req,res)=>res.sendStatus(204)},
   legacyOwnerId:userId,repositoryFor:()=>repository,manager:{invited:async id=>id===actor}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const send=async(path,payload,valid=true)=>{
   const body=JSON.stringify({...payload,actor,userId,time:Date.now()});
   const signature=crypto.createHmac('sha256',secret).update(body).digest('hex');
   return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Signature':valid?signature:'0'.repeat(64)},body});
 };
 assert.equal((await send('/internal/manager/backup-create',{},false)).status,403);
 const created=await send('/internal/manager/backup-create',{});
 assert.equal(created.status,200,await created.text());
 const status=await send('/internal/manager/backup-status',{});
 assert.equal(status.status,200);
 const result=await status.json();
 assert.equal(result.ok,true);assert.equal(result.userId,userId);
 assert.equal(result.status.history[0].type,'MANUAL_BACKUP');
 assert.equal(result.status.history[0].restorable,true);
 assert.equal(result.status.history[0].totalItems,1);
 assert.equal(result.status.inventoryCount,1);
 assert.ok(result.status.lastBackupAt);
 assert.equal(result.status.due,false);
});
