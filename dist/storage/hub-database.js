/* Shared IndexedDB infrastructure only. Domain transactions stay with their owners. */
(function (root) {
  'use strict';
  const DB_NAME = 'painel-campanhas', DB_VERSION = 5;
  const BILLING_STORES = ['billing_sales','billing_movements','billing_audit','billing_meta'];
  const PERSONAL_FINANCE_STORES = ['personal_finance_groups','personal_finance_categories','personal_finance_months','personal_finance_entries','personal_finance_debts','personal_finance_funds'];
  const schemas = {
    bases: {}, catalogos: {}, events: {keyPath:'event_id'},
    billing_sales: {keyPath:'sale_id',indexes:{sale_date:'sale_date',product:'product',platform:'platform',account:'account',payment_status:'payment_status',external_id:'external_id'}},
    billing_movements: {keyPath:'movement_id',indexes:{sale_id:'sale_id',effective_date:'effective_date',type:'type'}},
    billing_audit: {keyPath:'audit_id',indexes:{sale_id:'entity_id',created_at:'created_at',entity:'entity'}},
    billing_meta: {keyPath:'key'},
    personal_finance_groups: {keyPath:'group_id',indexes:{sort_order:'sort_order'}},
    personal_finance_categories: {keyPath:'category_id',indexes:{group_id:'group_id',sort_order:'sort_order'}},
    personal_finance_months: {keyPath:'month_key',indexes:{created_at:'created_at'}},
    personal_finance_entries: {keyPath:'entry_id',indexes:{month_key:'month_key',category_id:'category_id',month_category:['month_key','category_id']}},
    personal_finance_debts: {keyPath:'snapshot_id',indexes:{month_key:'month_key',item_id:'item_id',month_item:['month_key','item_id']}},
    personal_finance_funds: {keyPath:'snapshot_id',indexes:{month_key:'month_key',item_id:'item_id',month_item:['month_key','item_id'],type:'type'}}
  };
  function ensureStores(db, transaction, names=Object.keys(schemas)) {
    for (const name of names) {
      const schema=schemas[name];
      if (!schema) throw new Error('Store desconhecida: '+name);
      const store=db.objectStoreNames.contains(name) ? transaction.objectStore(name)
        : schema.keyPath ? db.createObjectStore(name,{keyPath:schema.keyPath}) : db.createObjectStore(name);
      for (const [index,keyPath] of Object.entries(schema.indexes||{})) {
        if (!store.indexNames.contains(index)) store.createIndex(index,keyPath,{unique:false});
      }
    }
  }
  function openDatabase({indexedDB=root.indexedDB}={}) {
    return new Promise((resolve,reject)=>{
      let blocked=false;
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>ensureStores(request.result,request.transaction);
      request.onsuccess=()=>{
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();
        resolve(db);
      };
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>{
        blocked=true;
        reject(new Error('Feche outras abas antigas do Hub para atualizar o banco local.'));
      };
    });
  }
  root.HubDatabase=Object.freeze({DB_NAME,DB_VERSION,openDatabase,ensureStores,
    BILLING_STORES:Object.freeze(BILLING_STORES),PERSONAL_FINANCE_STORES:Object.freeze(PERSONAL_FINANCE_STORES)});
})(globalThis);
