const assert=require('node:assert/strict');
const {JSDOM,requestInterceptor,VirtualConsole}=require('jsdom');
const {createApp}=require('../backend/server');const {MemoryRepository}=require('./helpers');
(async()=>{
 const repository=new MemoryRepository();
 const C=require('../frontend/calc'),{domain}=require('../backend/domain');const d=await domain(repository.state);const when=new Date(Date.now()-600000);await d.Store.addItem({productType:'BRA',quality:'SUZEN-MOLD',cupSize:'B',entry:{date:C.localDate(when),time:C.localTime(when)},colors:['MOKA','BLACK'],sizeOption:'same',sizes:{32:{dozens:2,pieces:6}},notes:'Server smoke fixture'});
 const app=createApp({repository,username:'test',password:'test-only-password-123456789'});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,auth='Basic '+Buffer.from('test:test-only-password-123456789').toString('base64');

 for(const name of ['index.html','inventory.html','reports.html','setting.html','add-entry.html','pending-amount.html','entry-review.html','missing-lot.html','missing-completion.html','quality-history.html']){
  const html=await fetch(base+'/'+name,{headers:{Authorization:auth}}).then(r=>r.text()),errors=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...args)=>errors.push(args.map(String).join(' ').slice(0,180)));
  const dom=new JSDOM(html,{url:base+'/'+name+(name==='index.html'?'?timing=1':''),runScripts:'dangerously',resources:{interceptors:[requestInterceptor(request=>request.url.startsWith(base)?fetch(request.url,{headers:{Authorization:auth}}):new Response("",{status:200}))]},pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortSignal,queueMicrotask,BroadcastChannel:undefined});w.fetch=(url,opts={})=>fetch(new URL(url,base),{...opts,headers:{...opts.headers,Authorization:auth}});w.Chart=class{destroy(){}update(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};w.addEventListener('unhandledrejection',e=>errors.push('unhandled: '+e.reason));}});
  await new Promise(r=>setTimeout(r,1800));if(name==='index.html'){
    assert.equal(dom.window.document.getElementById('homeTotalItems').textContent,'1');
    const timings=JSON.parse(dom.window.document.getElementById('alishan-timing-output').value);
    assert.ok(timings.some(sample=>sample.name==='Dashboard · content ready'&&sample.ms>=0));
    assert.equal(dom.window.document.querySelectorAll('.inventory-card').length,1);
   }
   if(name==='inventory.html'){
    assert.equal(dom.window.document.querySelectorAll('.inventory-card').length,1);
    await dom.window.ItemModal.open(repository.state.inventory[0].id);
   }
   if(name==='reports.html'){
    for(const key of ['weekly','payments','pending','quality','valuation','aging','history','analysis']){dom.window.location.hash=key;await new Promise(r=>setTimeout(r,180));}
    await dom.window.ReportViews.openDetail(repository.state.inventory[0].id,null);
   }
   if(name==='add-entry.html'){
    const w=dom.window;
    await w.ItemForm.toggleColorSelection('MOKA', '');
    await w.SizeGroups.sync('');
    const field=w.document.querySelector('.sg-d-32');assert.ok(field,'Size editor must render');field.value='3';field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(w.document.querySelector('.sg-preview').textContent,/36 pcs/);
    const values=await w.SizeGroups.read('');assert.equal(values.colors[0],'MOKA');
    w.document.getElementById('productType').value=[...w.document.getElementById('productType').options].find(o=>o.value.toLowerCase()==='bra').value;await w.ItemForm.setQualitySilently('SUZEN-MOLD','');const before=repository.state.inventory.length;await w.addInventoryItem({preventDefault(){}});assert.equal(repository.state.inventory.length,before,'Review must not save inventory');assert.equal(w.location.hash,'');assert.equal(w.document.getElementById('entry-review-link'),null);
    w.document.querySelector('.site-nav-links a[href="index.html"]').click();
    const waitFor=async selector=>{for(let attempt=0;attempt<60;attempt++){const el=w.document.querySelector(selector);if(el)return el;await new Promise(r=>setTimeout(r,50));}assert.fail('Missing '+selector);};
    const reviewLink=await waitFor('.quick-actions #entry-review-link');assert.match(reviewLink.textContent,/1 pending/);assert.equal(reviewLink.tagName,'BUTTON');assert.ok(reviewLink.querySelector('i'));assert.match(reviewLink.getAttribute('onclick'),/entry-review\.html/);const draftKey='alishan:reviews:'+w.ALISHAN_SESSION.scope;assert.equal(JSON.parse(w.localStorage.getItem(draftKey)).length,1);reviewLink.click();await waitFor('#entry-review-page .inventory-card');assert.equal(w.location.pathname,'/entry-review.html');
    assert.match(w.document.querySelector('#entry-review-page .ic-name').textContent,/SUZEN-MOLD/);assert.ok(w.document.querySelector('#entry-review-page .btn-edit'));assert.ok(w.document.querySelector('#entry-review-page .btn-delete'));const [draft]=JSON.parse(w.localStorage.getItem(draftKey));w.history.replaceState(w.history.state,'','/add-entry.html?review='+draft.draftId);const updated=await w.AlishanRemote.submitEntry({...draft.input,notes:'Edited in Review'});assert.equal(updated.reviewEdited,true);assert.equal(repository.state.inventory.length,before);w.history.replaceState(w.history.state,'','/entry-review.html');w.document.dispatchEvent(new w.Event('alishan:route'));await waitFor('#entry-review-page .inventory-card');const submit=[...w.document.querySelectorAll('#entry-review-page button')].find(button=>button.textContent.trim()==='Submit');assert.ok(submit,'Review card must have a Submit button');await submit.onclick();assert.equal(repository.state.inventory.length,before+1,'Review Submit must save through backend');assert.equal(repository.state.inventory.at(-1).totalDozens,3);assert.equal(repository.state.inventory.at(-1).notes,'Edited in Review');assert.match(repository.state.inventory.at(-1).code,/^\d+$/);assert.equal(w.document.querySelectorAll('#entry-review-page .inventory-card').length,0);assert.equal(JSON.parse(w.localStorage.getItem(draftKey)).length,0);await new Promise(r=>setTimeout(r,300));
    const preview=await w.AlishanStore.checkImportDraft({id:'draft-smoke',index:0,date:C.localDate(when),type:'BRA',quality:'SUZEN-MOLD',...values});assert.ok(preview);
   }
   const text=dom.window.document.body.textContent;if(text.includes('[object Promise]'))errors.push('Promise leaked into page');console.log(name,JSON.stringify(errors), 'cards='+dom.window.document.querySelectorAll('.inventory-card,.missing-entry').length);assert.deepEqual(errors,[],name+' page errors');dom.window.close();
 }
 server.close();
})().catch(e=>{console.error(e);process.exit(1)});
