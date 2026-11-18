'use strict';
// Read models only. Every filter, amount and card value uses the original rules.
module.exports=d=>{
 const {Store:S,Calc:C,Reports:R,Search}=d;
 const cardPrimes=items=>items.flatMap(item=>['describeItem','agingLevel','daysInStock','completionInfo'].map(method=>({target:'Calc',method,args:[item],result:C[method](item)})));
 function inventoryPage(filters={},page=1,size=50,advanced=null,term=''){
  const options=advanced||{filters:{},sorts:[{field:'date',dir:'desc'}]};
  let rows=S.query(filters);rows=Search.apply(rows,options,term);
  const paged=S.paginate(rows,page,[10,20,50,100].includes(Number(size))?Number(size):50);
  return {paged,primes:cardPrimes(paged.items)};
 }
 function homeLatest(term=''){
  const items=S.query({search:term}).slice().sort((a,b)=>new Date(b.dateTime||b.createdAt||0)-new Date(a.dateTime||a.createdAt||0)).slice(0,5);
  return {items,primes:cardPrimes(items)};
 }
 async function pageBundle(name,advanced=null){
  if(!['inventory','home','reports'].includes(name))throw Object.assign(new Error('Unsupported page'),{status:400});
  const primes=[];const add=async(target,method,args=[])=>{const result=await d[target][method](...args);primes.push({target,method,args,result});return result;};
  await add('Store','init');const summary=await add('Store','summary');await add('Store','qualityOptions');
  await add('Calc','agingBreakdownHTML',[summary]);
  for(const level of C.AGING_ORDER||[])await add('Calc','agingTitle',[level]);
  if(name==='inventory'){
   const args=[{productType:'all',quality:'all',stock:'all',period:'all',search:''},1,50,advanced,''];
   const result=inventoryPage(...args);primes.push({target:'Views',method:'inventoryPage',args,result});
  }else if(name==='home'){
   const result=homeLatest('');primes.push({target:'Views',method:'homeLatest',args:[''],result});
   await add('Store','typeStats');await add('Store','getRecentActivity',[5]);
   const buckets=await add('Views','breakdown',['all']);await add('Views','ranking',['all']);
   for(const b of buckets)await add('Views','percent',[b.dozens,buckets.reduce((sum,x)=>sum+x.dozens,0)]);
  }else{
   const rows=await add('Store','query',[{period:'all',productType:'all',quality:'all',search:''}]);
   const payments=await add('Store','getPayments');await add('Store','summary',[rows]);
   await add('Calc','weeklyAverage',[rows,payments]);await add('Store','lowStockItems');await add('Reports','overview');
   await add('Store','getItems');
  }
  return {primes};
 }
 return {inventoryPage,homeLatest,pageBundle};
};
