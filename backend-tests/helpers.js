const {blank}=require('../backend/database');
class MemoryRepository{
 constructor(){this.state=blank();this.tail=Promise.resolve();this.rev=0;}
 async ready(){}
 async revision(){return String(this.rev);}
 async read(fn){return fn(structuredClone(this.state),this.rev);}
 transaction(fn){const task=this.tail.then(async()=>{const copy=structuredClone(this.state),r=await fn(copy,this.rev);if(r?.ok!==false){if(JSON.stringify(this.state)!==JSON.stringify(copy))this.rev++;this.state=copy;}return r;});this.tail=task.catch(()=>{});return task;}
}
module.exports={MemoryRepository};
