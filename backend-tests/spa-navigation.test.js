'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, requestInterceptor, VirtualConsole } = require('jsdom');
const { createApp } = require('../backend/server');
const { MemoryRepository } = require('./helpers');

test('main routes share one document, preserve controls and support browser history', async t => {
  const server = createApp({repository:new MemoryRepository(),username:'test',password:'test-only-password-123456789'}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const auth='Basic '+Buffer.from('test:test-only-password-123456789').toString('base64');
  const request=(url,options={})=>fetch(new URL(url,base),{...options,headers:{...options.headers,Authorization:auth}});
  const errors=[];
  const console=new VirtualConsole();
  console.on('jsdomError',error=>errors.push(error.message));
  console.on('error',error=>errors.push(String(error)));
  const html=await request('/index.html').then(response=>response.text());
  const dom=new JSDOM(html,{
    url:base+'/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,
    resources:{interceptors:[requestInterceptor(req=>req.url.startsWith(base)?request(req.url):new Response(''))]},
    beforeParse(w){
      Object.assign(w,{fetch:request,structuredClone,TextEncoder,TextDecoder,AbortSignal,BroadcastChannel:undefined});
      w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
      w.scrollTo=()=>{};
      w.HTMLElement.prototype.scrollIntoView=()=>{};
      w.HTMLCanvasElement.prototype.getContext=()=>({});
      w.Chart=class{destroy(){} update(){}};
    }
  });
  t.after(()=>dom.window.close());
  const w=dom.window, document=w.document, transport=()=>w.AlishanRemote;
  async function waitFor(condition) {
    for(let attempt=0;attempt<120;attempt++){
      if(condition())return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.fail('Route did not become ready. '+w.location.pathname+' '+errors.join('\n'));
  }
  const click=path=>document.querySelector('.tabbar a[href="'+path+'.html"]').click();
  await waitFor(()=>w.history.state?.alishanSpa&&document.getElementById('homeTotalItems')?.textContent==='0');
  const sharedTransport=transport(), firstBody=document.body;
  click('inventory');
  await waitFor(()=>w.location.pathname==='/inventory.html'&&document.querySelector('#inventoryCards .empty-state'));
  const inventoryBody=document.body;
  click('reports');
  await waitFor(()=>w.location.pathname==='/reports.html'&&w.ReportViews);
  click('setting');
  await waitFor(()=>w.location.pathname==='/setting.html'&&w.settingsManager);
  document.querySelector('[data-open-section="appearance"]').click();
  assert.equal(document.querySelector('.settings-section.active').id,'appearance');
  w.history.back();
  await waitFor(()=>w.location.pathname==='/reports.html'&&w.ReportViews);
  assert.equal(w.settingsManager,undefined);
  w.history.back();
  await waitFor(()=>w.location.pathname==='/inventory.html'&&document.body===inventoryBody);
  click('index');
  await waitFor(()=>w.location.pathname==='/index.html'&&document.body===firstBody);
  click('add-entry');
  await waitFor(()=>w.location.pathname==='/add-entry.html'&&document.querySelector('#productForm')&&w.ItemForm);
  const notes=document.getElementById('notes');
  notes.value='Draft retained within this tab';
  click('index');
  await waitFor(()=>w.location.pathname==='/index.html'&&document.body===firstBody);
  click('add-entry');
  await waitFor(()=>w.location.pathname==='/add-entry.html');
  assert.equal(document.getElementById('notes').value,'Draft retained within this tab');
  assert.equal(transport(),sharedTransport);
  assert.equal(w.document,document);
  assert.deepEqual(errors,[]);
});
