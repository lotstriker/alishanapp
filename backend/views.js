'use strict';
// Additional business calculations previously embedded in view files.
module.exports=(C,S)=>({
  rowsTotals(rows){return rows.reduce((sum,item)=>{const t=C.itemTotals(item);return {dozens:sum.dozens+(Number(t.dozens)||0),amount:sum.amount+(Number(t.amount)||0)};},{dozens:0,amount:0});},
  percent(dozens,total){return total>0?Math.round(dozens/total*100):0;},
  totalDozens(rows){return rows.reduce((sum,b)=>sum+b.dozens,0);},
  pendingDays(item,now=new Date()){const added=new Date(item.addedDateTime||item.dateTime);return Math.max(0,Math.floor((now-added)/86400000));},
  paymentTotal(days){return C.round2(days.reduce((t,d)=>t+d.entries.reduce((x,{payment})=>x+payment.amount,0),0));},
  sizeLines(item){
   const sets=!item?[]:item.sizeOption==='different'?(item.colors||[]).map(c=>({name:c&&(c.name||c.color||c.colour)||'Colour',sizes:c&&c.sizes||{}})):[{name:'All colours',sizes:item}];
   return sets.map(set=>{const values=[];Object.keys(set.sizes||{}).filter(k=>/^size\d+$/.test(k)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4))).forEach(k=>{const d=Number(set.sizes[k])||0,pcs=Number(set.sizes[`${k}_pieces`])||0;if(d||pcs)values.push(`${k.slice(4)}: ${C.fmtDozens(d+pcs/12)}`);});return values.length?`${set.name}: ${values.join(' · ')}`:'';}).filter(Boolean).join(' | ');
  }
});
