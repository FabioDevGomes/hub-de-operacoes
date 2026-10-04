import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {DB_NAME,DB_VERSION,openDatabase,ensureStores,BILLING_STORES,PERSONAL_FINANCE_STORES} from '../src/storage/hub-database.mjs';
import {openBillingDatabase} from '../src/billing/billing-storage.mjs';
import {openPersonalFinanceDatabase} from '../src/personal-finance/personal-finance-storage.mjs';

class Names extends Set {contains(value){return this.has(value)}}
class FakeDb {
  constructor(){this.objectStoreNames=new Names();this.stores=new Map();this.closed=0;}
  createObjectStore(name,options={}){
    assert.ok(!this.stores.has(name),'never recreate existing stores');
    const store={keyPath:options.keyPath??null,indexNames:new Names(),indexes:{},rows:new Map(),
      createIndex(name,keyPath,options){this.indexNames.add(name);this.indexes[name]={keyPath,options}}};
    this.objectStoreNames.add(name);this.stores.set(name,store);return store;
  }
  close(){this.closed++}
  transaction(){throw Error('Opening a connection must not read/write domain data')}
}
const tx=db=>({objectStore:name=>db.stores.get(name)});
function factory(db,{upgrade=false,error=null,blocked=false,late=false}={}){
  return {calls:[],open(name,version){
    this.calls.push([name,version]);const request={};
    queueMicrotask(()=>{
      request.result=db;request.transaction=tx(db);
      if(error){request.error=error;request.onerror();return}
      if(blocked){request.onblocked();if(late)request.onsuccess();return}
      if(upgrade)request.onupgradeneeded();
      request.onsuccess();
    });return request;
  }};
}
test('canonical v5 schema is additive, repeatable and preserves every original key/index',()=>{
  const db=new FakeDb();ensureStores(db,tx(db));
  assert.equal(db.stores.size,13);
  assert.equal(DB_NAME,'painel-campanhas');assert.equal(DB_VERSION,5);
  const expected={
    bases:[null,{}],catalogos:[null,{}],events:['event_id',{}],
    billing_sales:['sale_id',{sale_date:'sale_date',product:'product',platform:'platform',account:'account',payment_status:'payment_status',external_id:'external_id'}],
    billing_movements:['movement_id',{sale_id:'sale_id',effective_date:'effective_date',type:'type'}],
    billing_audit:['audit_id',{sale_id:'entity_id',created_at:'created_at',entity:'entity'}],billing_meta:['key',{}],
    personal_finance_groups:['group_id',{sort_order:'sort_order'}],
    personal_finance_categories:['category_id',{group_id:'group_id',sort_order:'sort_order'}],
    personal_finance_months:['month_key',{created_at:'created_at'}],
    personal_finance_entries:['entry_id',{month_key:'month_key',category_id:'category_id',month_category:['month_key','category_id']}],
    personal_finance_debts:['snapshot_id',{month_key:'month_key',item_id:'item_id',month_item:['month_key','item_id']}],
    personal_finance_funds:['snapshot_id',{month_key:'month_key',item_id:'item_id',month_item:['month_key','item_id'],type:'type'}]
  };
  for(const[name,[keyPath,indexes]] of Object.entries(expected)){
    const store=db.stores.get(name);assert.equal(store.keyPath,keyPath);
    assert.deepEqual(Object.fromEntries(Object.entries(store.indexes).map(([k,v])=>[k,v.keyPath])),indexes);
    for(const index of Object.values(store.indexes))assert.deepEqual(index.options,{unique:false});
    store.rows.set('synthetic-existing',{id:name,zero:0,missing:null});
  }
  const before=[...db.stores].map(([name,store])=>[name,store,[...store.rows]]);
  ensureStores(db,tx(db));
  for(const[name,store,rows]of before){assert.equal(db.stores.get(name),store);assert.deepEqual([...store.rows],rows)}
});
test('v1-v4 additive upgrades preserve historical stores, events, zero and missing records',()=>{
  for(const names of [['bases'],['bases','catalogos'],['bases','catalogos','events'],['bases','catalogos','events',...BILLING_STORES]]){
    const db=new FakeDb();ensureStores(db,tx(db),names);
    for(const name of names)db.stores.get(name).rows.set('old',{value:0,absent:null,history:['unchanged']});
    ensureStores(db,tx(db));assert.equal(db.stores.size,13);
    for(const name of names)assert.deepEqual(db.stores.get(name).rows.get('old'),{value:0,absent:null,history:['unchanged']});
  }
});
test('opening existing v5 never invokes schema repair or data transactions',async()=>{
  const db=new FakeDb(),idb=factory(db);const result=await openDatabase({indexedDB:idb});
  assert.equal(result,db);assert.deepEqual(idb.calls,[[DB_NAME,5]]);
  assert.equal(db.stores.size,0,'onupgradeneeded was not triggered');
  result.onversionchange();assert.equal(db.closed,1);
});
test('fresh v5 opens with the complete schema and no domain writes',async()=>{
  const db=new FakeDb(),idb=factory(db,{upgrade:true});await openDatabase({indexedDB:idb});
  assert.equal(db.stores.size,13);for(const store of db.stores.values())assert.equal(store.rows.size,0);
});
test('errors propagate and late blocked connections are closed, not leaked',async()=>{
  const error=new Error('synthetic error');
  await assert.rejects(openDatabase({indexedDB:factory(new FakeDb(),{error})}),e=>e===error);
  const db=new FakeDb();
  await assert.rejects(openDatabase({indexedDB:factory(db,{blocked:true,late:true})}),/Feche outras abas/);
  assert.equal(db.closed,1);
});
test('billing and personal-finance entry points open the same fresh schema',async()=>{
  const previous=globalThis.indexedDB;
  try{
    for(const open of [openBillingDatabase,openPersonalFinanceDatabase]){
      const db=new FakeDb();globalThis.indexedDB=factory(db,{upgrade:true});await open();
      assert.equal(db.stores.size,13);assert.deepEqual(globalThis.indexedDB.calls,[[DB_NAME,5]]);
    }
  }finally{globalThis.indexedDB=previous}
});
test('classic pages delegate to the same infrastructure; business writes and backup remain at original boundaries',async()=>{
  const main=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const preparer=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
  for(const [source,signature]of [[main,'function openLocalDb(){return HubDatabase.openDatabase()}'],[preparer,'function openPanelDatabase() { return HubDatabase.openDatabase(); }']]){
    assert.ok(source.includes(signature));assert.ok(!source.includes('indexedDB.open('));assert.ok(!source.includes('onupgradeneeded'));
    const context={HubDatabase:{openDatabase:()=>42}};
    vm.runInNewContext(signature,context);assert.equal(vm.runInNewContext(signature.includes('openLocalDb')?'openLocalDb()':'openPanelDatabase()',context),42);
  }
  assert.ok(preparer.includes("db.transaction([PANEL_BASE_STORE, PANEL_EVENT_STORE, ...billingNames], 'readwrite')"));
  assert.ok(preparer.includes('eventStore.add(event)')&&!preparer.includes('eventStore.put(event)'));
  assert.ok(main.includes("db.transaction(names,'readwrite')")&&main.includes('billing.writeBillingBundleToTransaction(tx,billingBundle)')&&main.includes('personalFinance.writeBundleToTransaction(tx,personalFinanceBundle)'));
  assert.ok(main.includes('payload.billing=await billing.exportBillingBundle()')&&main.includes('payload.personal_finance=await personalFinance.exportBundle()'));
  assert.ok(main.includes("tx.objectStore('catalogos').put(catalog,'atual')")&&main.includes('payload.catalogo_produtos=ProductCatalog.normalize(state.productCatalog)'));
  assert.ok(!main.includes('downloadProductCatalog')&&!main.includes("$('#downloadCatalog')"));
  assert.equal(PERSONAL_FINANCE_STORES.length,6);
});
