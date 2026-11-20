'use strict';
const performanceDb=require('./performance');
const { randomUUID } = require('node:crypto');
const stores = ['inventory','payments','qualities','colors','settings','searchAnalytics','users','editHistory','auditLog','archive'];
const blank = () => Object.fromEntries(stores.map(k => [k, []]));
const keyOf = (store, row) => store === 'settings' ? row.key : row.id;
const keyText = key => JSON.stringify(key); // Numeric and string IndexedDB keys remain distinct.
function createDatabase(state, actor) {
  function list(store) { if (!stores.includes(store)) throw new Error('Unknown store'); return state[store]; }
  function put(store, row) {
    const key = keyOf(store,row);
    if (key === undefined || key === null) throw new Error('Record key is required');
    const rows = list(store), i = rows.findIndex(r => keyText(keyOf(store,r)) === keyText(key));
    const copy = structuredClone(row); if (i < 0) rows.push(copy); else rows[i] = copy;
    return true;
  }
  const get = (s,k) => structuredClone(list(s).find(r => keyText(keyOf(s,r)) === keyText(k)));
  const remove = (s,k) => { state[s] = list(s).filter(r => keyText(keyOf(s,r)) !== keyText(k)); return true; };
  const putAll = (s,rows) => { list(s); state[s] = []; rows.forEach(r => put(s,r)); return true; };
  const db = {
    async init(){}, onChange(){}, getAll: async s => structuredClone(list(s)), getAllFrom: async s => structuredClone(list(s)),
    get: async(s,k) => get(s,k), put: async(s,r) => put(s,r), putAll: async(s,rs) => putAll(s,rs), remove: async(s,k) => remove(s,k),
    async getInventory(){return this.getAll('inventory');}, async saveInventory(rs){return putAll('inventory',rs);},
    async saveInventoryItem(r){return put('inventory',r);}, async deleteInventoryItem(k){return remove('inventory',k);},
    async getPayments(){return this.getAll('payments');}, async savePayments(rs){return putAll('payments',rs);}, async removePayment(k){return remove('payments',k);},
    async addInventoryAndPayments(inv,pay){inv.forEach(r=>put('inventory',r));pay.forEach(r=>put('payments',r));return true;},
    async replaceInventoryAndPayments(inv,pay){putAll('inventory',inv);putAll('payments',pay);return true;},
    async getSetting(k,f=null){const r=get('settings',k);return r?r.value:f;}, async setSetting(k,v){return put('settings',{key:k,value:v});}, async removeSetting(k){return remove('settings',k);},
    async getArchive(){return (await this.getAll('archive')).sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));},
    async archiveInventoryItem(record){remove('inventory',record.id);(record.payments||[]).forEach(p=>remove('payments',p.id));return put('archive',record);},
    async restoreArchived(id){const r=get('archive',id);if(!r)return {ok:false,error:'This entry is not in the Archives (any more).'};if(get('inventory',r.item.id))return {ok:false,error:'An entry with the same id is already in the inventory.'};put('inventory',r.item);(r.payments||[]).forEach(p=>put('payments',p));remove('archive',id);return {ok:true,item:r.item};},
    async removeMany(s,ids){ids.forEach(id=>remove(s,id));return true;},
    async appendPayment(entry){
      const item=list('inventory').find(i=>String(i.id)===String(entry.inventoryId));
      if(!item)throw new Error('Inventory entry not found');
      // Never trust an expected amount supplied by a browser.
      const C=require('../frontend/calc');
      const status=C.paymentStatus(item,list('payments'));
      const cents=Math.round(Number(entry.amount)*100);
      if(!Number.isSafeInteger(cents)||cents<=0)throw new Error('Invalid payment amount');
      if(cents>Math.round(status.pending*100))return {ok:false,received:status.received,pending:status.pending};
      put('payments',entry);return {ok:true};
    },
    async logActivity(type,text){put('editHistory',{id:Date.now()*1000+Math.floor(Math.random()*1000),type,text,at:new Date().toISOString()});state.editHistory.sort((a,b)=>a.id-b.id);state.editHistory=state.editHistory.slice(-1000);},
    async getRecentActivity(limit=5){return (await this.getAll('editHistory')).sort((a,b)=>b.id-a.id).slice(0,limit);},
    async logQualityHistory(e){const r={...e,...(actor?{actor}:{}),id:`qh-${randomUUID()}`,at:new Date().toISOString()};put('auditLog',r);return r;},
    async getQualityHistory(){return (await this.getAll('auditLog')).sort((a,b)=>new Date(b.at)-new Date(a.at));}
  };
  for(const [getName,saveName,key,fallback] of [['getSearchAnalytics','saveSearchAnalytics','searchAnalytics',{}],['getSearchHistory','saveSearchHistory','searchHistory',[]],['getTheme','setTheme','selectedTheme','light-default']]){
    db[getName]=async(f=fallback)=>db.getSetting(key,f); db[saveName]=async v=>db.setSetting(key,v);
  }
  return db;
}
class PostgresRepository {
  constructor(pool,workspace='alishan'){this.pool=pool;this.workspace=workspace;this.readCache=new Map();}
  async revision(){const r=await performanceDb.query(this.pool,'SELECT revision FROM alishan_private.workspaces WHERE id=$1',[this.workspace]);return String(r.rows[0]?.revision||0);}
  async ready(){await performanceDb.query(this.pool,'SELECT 1 FROM alishan_private.workspaces LIMIT 1');}
  // One MVCC statement: readers never take the workspace write lock. Revision and
  // projected records come from the same committed snapshot, even during a restore.
  async read(fn,selection={stores,settings:null}){
    const cacheKey=JSON.stringify(selection),cached=this.readCache.get(cacheKey);
    const result=await performanceDb.query(this.pool,`SELECT w.revision,
      CASE WHEN w.revision=$2::bigint THEN NULL ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('store',r.store,'payload',r.payload))
        FROM alishan_private.records r WHERE r.workspace_id=w.id
        AND r.store=ANY($3::text[]) AND (r.store<>'settings' OR $4::text[] IS NULL OR r.payload->>'key'=ANY($4::text[]))
      ),'[]'::jsonb) END AS records
      FROM alishan_private.workspaces w WHERE w.id=$1`,
      [this.workspace,cached?.revision??-1,selection.stores,selection.settings]);
    const row=result.rows[0];let state;
    if(!row)state=blank();
    else if(row.records===null&&cached)state=cached.state;
    else{state=blank();for(const r of row.records||[])state[r.store].push(r.payload);
      // Do not replace a newer cached snapshot if an older concurrent read finishes later.
      if(!cached||Number(row.revision)>=Number(cached.revision)){
        if(this.readCache.size>=32)this.readCache.clear();
        this.readCache.set(cacheKey,{revision:row.revision,state});
      }
    }
    return fn(structuredClone(state),Number(row?.revision||0));
  }
  async themePreference(value) {
    const key = keyText('selectedTheme');
    if (value === undefined) {
      const result = await performanceDb.query(this.pool,
        "SELECT payload->>'value' AS theme FROM alishan_private.records WHERE workspace_id=$1 AND store='settings' AND record_key=$2",
        [this.workspace, key]
      );
      return result.rows[0]?.theme;
    }
    const client = await performanceDb.connect(this.pool);
    try {
      await performanceDb.query(client,'BEGIN');
      await performanceDb.query(client,"SET LOCAL lock_timeout = '10s'");
      await performanceDb.query(client,'INSERT INTO alishan_private.workspaces(id) VALUES($1) ON CONFLICT DO NOTHING',[this.workspace]);
      await performanceDb.query(client,'SELECT id FROM alishan_private.workspaces WHERE id=$1 FOR UPDATE',[this.workspace]);
      await performanceDb.query(client,
        "INSERT INTO alishan_private.records(workspace_id,store,record_key,payload) VALUES($1,'settings',$2,$3::jsonb) ON CONFLICT(workspace_id,store,record_key) DO UPDATE SET payload=EXCLUDED.payload",
        [this.workspace,key,JSON.stringify({key:'selectedTheme',value})]
      );
      await performanceDb.query(client,'COMMIT');
      this.readCache.clear();
      return true;
    } catch (error) {
      await performanceDb.query(client,'ROLLBACK').catch(()=>{});
      throw error;
    } finally {
      client.release();
    }
  }
  async transaction(fn){
    const client=await performanceDb.connect(this.pool);
    try{
      await performanceDb.query(client,'BEGIN');
      await performanceDb.query(client,"SET LOCAL statement_timeout = '20s'");
      await performanceDb.query(client,"SET LOCAL lock_timeout = '10s'");
      await performanceDb.query(client,'INSERT INTO alishan_private.workspaces(id) VALUES($1) ON CONFLICT DO NOTHING',[this.workspace]);
      const locked=await performanceDb.query(client,'SELECT revision FROM alishan_private.workspaces WHERE id=$1 FOR UPDATE',[this.workspace]);
      const rows=await performanceDb.query(client,'SELECT store,payload FROM alishan_private.records WHERE workspace_id=$1',[this.workspace]);
      const state=blank();for(const r of rows.rows)state[r.store].push(r.payload);
      const before=structuredClone(state);
      const issueQualityCode=async()=>{
        const {rows}=await performanceDb.query(client,"SELECT nextval('alishan_private.quality_codes')::text AS code");
        return rows[0].code;
      };
      const result=await fn(state,Number(locked.rows[0].revision),issueQualityCode);
      if(result?.ok===false){await performanceDb.query(client,'ROLLBACK');return result;}
      let changed=false;
      for(const s of stores){
        const old=new Map(before[s].map(r=>[keyText(keyOf(s,r)),JSON.stringify(r)]));
        const updates=[];
        for(const row of state[s]){const key=keyText(keyOf(s,row)),json=JSON.stringify(row);if(old.get(key)!==json)updates.push({record_key:key,payload:row});old.delete(key);}
        // Bounded multi-row writes replace hundreds of network round trips.
        for(let offset=0;offset<updates.length;offset+=100){
          await performanceDb.query(client,`INSERT INTO alishan_private.records(workspace_id,store,record_key,payload)
            SELECT $1,$2,x.record_key,x.payload FROM jsonb_to_recordset($3::jsonb) AS x(record_key text,payload jsonb)
            ON CONFLICT(workspace_id,store,record_key) DO UPDATE SET payload=EXCLUDED.payload`,[this.workspace,s,JSON.stringify(updates.slice(offset,offset+100))]);changed=true;
        }
        if(old.size){await performanceDb.query(client,'DELETE FROM alishan_private.records WHERE workspace_id=$1 AND store=$2 AND record_key=ANY($3::text[])',[this.workspace,s,[...old.keys()]]);changed=true;}
      }
      if(changed)await performanceDb.query(client,'UPDATE alishan_private.workspaces SET revision=revision+1 WHERE id=$1',[this.workspace]);
      await performanceDb.query(client,'COMMIT');if(changed)this.readCache.clear();return result;
    }catch(e){await performanceDb.query(client,'ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  }
}
module.exports={stores,blank,keyOf,createDatabase,PostgresRepository};
