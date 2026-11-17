const {blank}=require('../backend/database');
class MemoryRepository{
 constructor(){this.state=blank();this.tail=Promise.resolve();}
 async ready(){}
 transaction(fn){const task=this.tail.then(async()=>{const copy=structuredClone(this.state),r=await fn(copy,0);if(r?.ok!==false)this.state=copy;return r;});this.tail=task.catch(()=>{});return task;}
}
module.exports={MemoryRepository};
