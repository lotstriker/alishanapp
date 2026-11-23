'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { PostgresRepository } = require('../backend/database');
const { domain } = require('../backend/domain');
const { managerApprovals } = require('../backend/manager-approvals');

test('only invited managers can decide requests; archive and restore apply once', async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE alishan_backend;');
  for (const file of ['schema.sql','shared-record-sync.sql','manager-approvals.sql','manager-approval-reason-migration.sql'])
    await pg.exec(fs.readFileSync(path.join(__dirname,'../deployment',file),'utf8'));
  const client = { query: pg.query.bind(pg), release() {} };
  const pool = { query: client.query, connect: async () => client };
  const user = '11111111-1111-4111-8111-111111111111';
  const manager = '22222222-2222-4222-8222-222222222222';
  const workspace = 'user:' + user;
  const repositoryFor = id => new PostgresRepository(pool,id);
  const repository = repositoryFor(workspace);
  const service = managerApprovals(pool,repositoryFor);
  const account = { actor:user, repository };
  const item = await repository.transaction(async state => {
    const app = await domain(state,{runAutoBackup:false});
    const result = await app.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',colors:['MOKA'],sizes:{32:{dozens:1}}});
    assert.equal(result.ok,true);
    return result.item;
  });
  await pg.query('INSERT INTO alishan_private.manager_invites(user_id) VALUES ($1)',[manager]);
  assert.equal((await service.request(account,'archive',String(item.id))).ok,true);
  assert.equal((await service.request(account,'archive',String(item.id))).alreadyPending,true);
  assert.equal((await service.list(user)).status,403);
  const {requests:[archive]} = await service.list(manager);
  assert.equal((await service.decide(user,archive.id,'approved')).status,403);
  assert.equal(archive.requested_by,user);
  assert.equal((await service.decide(manager,archive.id,'approved')).ok,true);
  assert.equal((await service.decide(manager,archive.id,'approved')).status,409);
  const archiveId = await repository.read(state => {
    assert.equal(state.inventory.length,0);
    return state.archive[0].id;
  });
  assert.equal((await service.request(account,'restore',String(archiveId))).ok,true);
  const {requests:[restore]} = await service.list(manager);
  assert.equal(restore.action,'restore');
  assert.equal((await service.decide(manager,restore.id,'approved')).ok,true);
  await repository.read(state => {
    assert.equal(state.inventory.length,1);
    assert.equal(state.archive.length,0);
  });
  assert.equal((await service.request(account,'archive',String(item.id))).ok,true);
  const {requests:[rejection]} = await service.list(manager);
  assert.equal((await service.decide(manager,rejection.id,'rejected')).status,400);
  assert.equal((await service.decide(manager,rejection.id,'rejected','Duplicate request')).ok,true);
  const {requests:history} = await service.list(manager);
  const rejected = history.find(row => row.id === rejection.id);
  assert.equal(rejected.decision_reason,'Duplicate request');
});


test('Manager page inline scripts parse and redesigned sections exist', () => {
  const html = fs.readFileSync(path.join(__dirname,'../manager-app/index.html'),'utf8');
  const scripts = [...html.matchAll(new RegExp('<script[^>]*>([\\s\\S]*?)</script>','g'))].map(match => match[1]).filter(Boolean);
  assert.ok(scripts.length >= 2, 'inline theme boot and Manager application scripts should be present');
  scripts.forEach((source,index) => new vm.Script(source,{filename:'manager-inline-'+index+'.js'}));
  for (const section of ['overview','users','inventory','reports','search','approvals','activity','backup','health','settings'])
    assert.match(html,new RegExp('id="view-'+section+'"'));
  assert.match(html,/id="reject-reason"/);
  assert.match(html,/data-go="approvals"/);
  assert.match(html,/bottom-nav/);
  assert.ok(html.includes("requests.filter(r=>r.status!=='pending').sort((a,b)=>new Date(b.decided_at||0)-new Date(a.decided_at||0)).slice(0,5)"));
  assert.match(html,/id="approval-filter-status"/);
  assert.match(html,/id="approval-status" role="status"/);
  assert.equal([...html.matchAll(/id="approval-status"/g)].length,1,'status paragraph ID must not collide with the filter');
  assert.match(html,/dialog.addEventListener\('keydown'/);
  assert.match(html,/target\.focus\(\)/);
  assert.match(html,/\$\('approval-status'\)\.focus\(\)/);
});
