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
  for(const route of ['index','inventory']){
    const shell=await request('/'+route+'.html').then(response=>response.text());
    assert.match(shell,/class="inventory-card ic-card ic-skeleton" aria-hidden="true"/);
  }
  const html=await request('/performance.html').then(response=>response.text());
  const dom=new JSDOM(html,{
    url:base+'/performance.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,
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
  await waitFor(()=>w.history.state?.alishanSpa&&document.getElementById('reload'));
  document.querySelector('header a[href="/"]').click();
  await waitFor(()=>w.location.pathname==='/'&&document.getElementById('homeTotalItems')?.textContent==='0');
  assert.ok(document.querySelector('.tabbar i svg.ic'), 'Dashboard must show icons after entering through Page Performance');
  const sharedTransport=transport(), firstBody=document.body;
  const stylesheet = name => [...document.head.querySelectorAll('link[rel="stylesheet"]')]
    .find(link => new URL(link.href).pathname === '/' + name);
  const homeStyle = [...document.head.querySelectorAll('link[rel="stylesheet"]')][0];
  click('inventory');
  await waitFor(()=>w.location.pathname==='/inventory.html'&&document.querySelector('#inventoryCards .empty-state'));
  assert.equal(document.querySelector('#inventoryCards').hasAttribute('aria-busy'),false);
  const inventoryBody=document.body;
  assert.ok(document.querySelector('.tabbar i svg.ic'), 'Inventory navigation icons render after switching');
  const inventoryStyle=stylesheet('inventory.css');
  assert.ok(inventoryStyle, 'Inventory CSS must be attached to the active document');
  assert.notEqual(inventoryStyle.media,'not all');
  assert.ok(inventoryStyle.sheet, "Inventory CSS is loaded before the route is shown");
  click('reports');
  await waitFor(()=>w.location.pathname==='/reports.html'&&w.ReportViews);
  click('setting');
  await waitFor(()=>w.location.pathname==='/setting.html'&&w.settingsManager);
  document.querySelector('[data-open-section="appearance"]').click();
  assert.equal(document.querySelector('.settings-section.active').id,'appearance');
  w.history.back();
  await waitFor(()=>w.location.pathname==='/reports.html'&&w.ReportViews);
  assert.equal(w.settingsManager,undefined);
  assert.ok(document.querySelector('.tabbar i svg.ic'), 'Icons survive history navigation');
  assert.equal(inventoryStyle.media,'not all');
  w.history.back();
  await waitFor(()=>w.location.pathname==='/inventory.html'&&document.body===inventoryBody);
  assert.equal(stylesheet('inventory.css'),inventoryStyle);
  assert.notEqual(inventoryStyle.media,'not all');
  click('index');
  await waitFor(()=>w.location.pathname==='/index.html'&&document.body===firstBody);
  assert.notEqual(homeStyle.media,'not all');
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
