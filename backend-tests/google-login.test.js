'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../backend/server');
const { googleLogin } = require('../backend/google-login');
const { domain } = require('../backend/domain');
const { MemoryRepository } = require('./helpers');

test('Google PKCE scopes reads, writes, exports and logout to the verified user', async t => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const origin = 'https://alishan.example';
  const records = new Map(), sessions = new Map();
  const legacy = new MemoryRepository();
  legacy.workspace = 'alishan';
  const repositoryFor = workspace => {
    if (!records.has(workspace)) records.set(workspace, new MemoryRepository());
    return records.get(workspace);
  };
  const auth = googleLogin({
    supabaseUrl:'https://auth.example',
    publishableKey:'fixture-only',
    origin,
    sessions:{
      save(token,subject){sessions.set(token,subject);},
      get(token){return sessions.get(token);},
      remove(token){sessions.delete(token);}
    },
    async request(url, options) {
      assert.equal(url.pathname,'/auth/v1/token');
      const {auth_code,code_verifier}=JSON.parse(options.body);
      assert.match(code_verifier,/^[\w-]{43}$/);
      return Response.json({user:{id:auth_code,app_metadata:{providers:['google']}}});
    }
  });
  const app=createApp({repository:legacy,password:'fixture-only-long-password',auth,repositoryFor,legacyOwnerId:owner});
  const server=app.listen(0,'127.0.0.1');
  t.after(()=>server.close());
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const cookieFrom=(r,prefix)=>r.headers.getSetCookie().find(c=>c.startsWith(prefix+'=')).split(';')[0];
  async function signIn(subject) {
    const start=await fetch(base+'/auth/google',{redirect:'manual'});
    const oauth=new URL(start.headers.get('location'));
    assert.equal(oauth.searchParams.get('provider'),'google');
    assert.equal(oauth.searchParams.get('redirect_to'),origin+'/auth/callback');
    assert.equal(oauth.searchParams.get('code_challenge_method'),'s256');
    const verifier=cookieFrom(start,'__Host-alishan-pkce');
    const reply=await fetch(base+'/auth/callback?code='+subject,{headers:{Cookie:verifier},redirect:'manual'});
    assert.equal(reply.headers.get('location'),'/');
    const cookie=cookieFrom(reply,'__Host-alishan-session');
    const html=await fetch(base+'/',{headers:{Cookie:cookie}}).then(r=>r.text());
    return {cookie,scope:JSON.parse(html.match(/ALISHAN_SESSION=(\{.*?\});/)[1]).scope};
  }
  const seed=await domain(legacy.state);
  const item=(await seed.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',colors:['MOKA'],sizes:{32:{dozens:1}}})).item;
  const noAuth=await fetch(base+'/api/cache-status',{headers:{Authorization:'Basic '+Buffer.from('a:b').toString('base64')}});
  assert.equal(noAuth.status,401);
  assert.equal((await fetch(base+'/',{redirect:'manual'})).headers.get('location'),'/login');
  const accountA=await signIn(owner),accountB=await signIn(other);
  assert.notEqual(accountA.scope,accountB.scope);
  const rpc=(account,method,args,scope=account.scope)=>fetch(base+'/api/rpc',{method:'POST',headers:{Cookie:account.cookie,'X-Alishan-Scope':scope,'Content-Type':'application/json'},body:JSON.stringify({target:'Store',method,args})});
  assert.equal((await (await rpc(accountA,'getItem',[item.id])).json()).result.id,item.id);
  assert.equal((await (await rpc(accountB,'getItem',[item.id])).json()).result,null);
  assert.equal((await (await rpc(accountB,'getItems',[])).json()).result.length,0);
  assert.equal((await (await rpc(accountB,'backupFile',['fixture'])).json()).result.inventory.length,0);
  assert.equal((await (await rpc(accountB,'updateItem',[item.id,{}])).json()).result.ok,false);
  assert.equal((await rpc(accountB,'getItems',[],accountA.scope)).status,401);
  const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:accountB.cookie},redirect:'manual'});
  assert.equal(logout.headers.get('location'),'/login');
  assert.equal((await rpc(accountB,'getItems',[])).status,401);
  assert.equal((await rpc(accountA,'getItems',[])).status,200);
});
