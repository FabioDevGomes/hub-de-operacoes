// Prova isolada: banco em memória por padrão ou conexão de teste fornecida pelo chamador.
import { DatabaseSync } from 'node:sqlite';
import { createCampaignDelivery, listCampaignDeliveries, getCampaignDelivery, getCampaignDeliveriesForOffer, updateCampaignDeliveryCountriesForOffer, updateCampaignDeliveryPositiveKeywordsForOffer, updateCampaignDeliveryNegativeKeywordsForOffer, updateCampaignDeliveryImageSearchTermForOffer, updateCampaignDeliveryCommissionForOffer, updateCampaignDeliveryProductNameForOffer, updateCampaignDeliveryAffiliateUrlForOffer, updateCampaignDeliveryAssetStudioWork, updateCampaignDeliveryAssetStudioRoute, markCampaignDeliveryOpened, CAMPAIGN_DELIVERY_STORAGE_KEY } from '../../src/campaign-delivery/delivery-store.mjs';

export class VersionConflict extends Error {
  constructor() { super('A lista de entregas foi alterada; atualize antes de salvar.'); this.code = 'VERSION_CONFLICT'; }
}

export function createExperimentalRepository({ database = new DatabaseSync(':memory:'), initialize = true } = {}) {
  const db = database;
  if (initialize) db.exec("CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, value TEXT NOT NULL); INSERT INTO state VALUES(1,1,'[]'); CREATE TABLE route_history (delivery_id TEXT NOT NULL, version INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(delivery_id,version)); CREATE TABLE progress_sources (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)");
  function snapshot() {
    const row = db.prepare('SELECT version,value FROM state WHERE id=1').get();
    return { version: row.version, records: JSON.parse(row.value) };
  }
  function transact(expectedVersion, operation, afterChange, withinTransaction=false) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error('Versão inválida');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT version,value FROM state WHERE id=1').get();
      if (row.version !== expectedVersion) throw new VersionConflict();
      let value = row.value;
      const storage = {
        getItem(key) { return key === CAMPAIGN_DELIVERY_STORAGE_KEY ? value : null; },
        setItem(key, next) { if (key !== CAMPAIGN_DELIVERY_STORAGE_KEY) throw new Error('Chave inesperada'); value = next; }
      };
      const result = operation(storage);
      const version = value === row.value ? row.version : row.version + 1;
      if (value !== row.value) {
        const localTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_storage'").get();
        if(localTable){
          const local=db.prepare('SELECT value FROM local_storage WHERE key=?').get(CAMPAIGN_DELIVERY_STORAGE_KEY);
          if(!local || local.value!==row.value) throw new Error('Representações de entrega divergentes');
          db.prepare('INSERT INTO local_storage_history(key,revision,previous_present,previous_value,next_value) VALUES(?,?,1,?,?)').run(CAMPAIGN_DELIVERY_STORAGE_KEY,version,row.value,value);
          db.prepare('UPDATE local_storage SET value=? WHERE key=?').run(value,CAMPAIGN_DELIVERY_STORAGE_KEY);
        }
        db.prepare('UPDATE state SET version=?,value=? WHERE id=1').run(version, value);
        if (afterChange) afterChange({previous:JSON.parse(row.value),current:JSON.parse(value),version});
      }
      if(!withinTransaction)db.exec('COMMIT');
      return { version, result };
    } catch (error) { if(!withinTransaction)db.exec('ROLLBACK'); throw error; }
  }
  function routeChange(id){return ({previous,current,version:nextVersion})=>{
    const before=previous.find(item=>item.id===id),after=current.find(item=>item.id===id);
    if(!before||!after)throw Error('Entrega ausente');
    const previousPresent=Object.hasOwn(before,'assetStudioRoute'),nextPresent=Object.hasOwn(after,'assetStudioRoute');
    const event={version:nextVersion,changedAtUtc:after.updatedAt,previousPresent,previousRoute:previousPresent?before.assetStudioRoute:null,nextPresent,nextRoute:nextPresent?after.assetStudioRoute:null};
    db.prepare('INSERT INTO route_history(delivery_id,version,event) VALUES(?,?,?)').run(id,nextVersion,JSON.stringify(event));
  }}
  return {
    async list() { const state = snapshot(); return { version:state.version, records:listCampaignDeliveries({getItem: () => JSON.stringify(state.records)}) }; },
    async get(id) { const state = snapshot(); return {version:state.version, result:getCampaignDelivery(id, {getItem:()=>JSON.stringify(state.records)})}; },
    async forOffer(offerKey, platform) { const state = snapshot(); return {version:state.version, result:getCampaignDeliveriesForOffer(offerKey, {getItem:()=>JSON.stringify(state.records)}, platform)}; },
    async create(version, input) { return transact(version, storage => createCampaignDelivery(input, storage)); },
    async updateCountries(version, offerKey, countries, platform, mode) { return transact(version, storage => updateCampaignDeliveryCountriesForOffer(offerKey, countries, storage, platform, mode)); },
    async updatePositiveKeywords(version, offerKey, values, platform) { return transact(version, storage => updateCampaignDeliveryPositiveKeywordsForOffer(offerKey, values, storage, platform)); },
    async updateNegativeKeywords(version, offerKey, values, countries, platform) { return transact(version, storage => updateCampaignDeliveryNegativeKeywordsForOffer(offerKey, values, countries, storage, platform)); },
    async updateImageSearchTerm(version, offerKey, value, platform) { return transact(version, storage => updateCampaignDeliveryImageSearchTermForOffer(offerKey, value, storage, platform)); },
    async updateCommission(version, offerKey, value, platform) { return transact(version, storage => updateCampaignDeliveryCommissionForOffer(offerKey, value, storage, platform)); },
    async updateProductName(version, offerKey, value, platform) { return transact(version, storage => updateCampaignDeliveryProductNameForOffer(offerKey, value, storage, platform)); },
    async updateAffiliateUrl(version, offerKey, value, platform) { return transact(version, storage => updateCampaignDeliveryAffiliateUrlForOffer(offerKey, value, storage, platform)); },
    async updateAssetWork(version, id, work) { return transact(version, storage => updateCampaignDeliveryAssetStudioWork(id, work, storage)); },
    async updateAssetRoute(version, id, value) {
      if (typeof value !== 'boolean') throw new Error('Rota inválida');
      return transact(version, storage => updateCampaignDeliveryAssetStudioRoute(id, value, storage),routeChange(id));
    },
    deliveryInTransaction(version,operation,args){
      if(!Array.isArray(args))throw Error('Argumentos inválidos');
      const actions={
        create:storage=>createCampaignDelivery(args[0],storage),
        updateCountries:storage=>updateCampaignDeliveryCountriesForOffer(args[0],args[1],storage,args[2],args[3]),
        updatePositiveKeywords:storage=>updateCampaignDeliveryPositiveKeywordsForOffer(args[0],args[1],storage,args[2]),
        updateNegativeKeywords:storage=>updateCampaignDeliveryNegativeKeywordsForOffer(args[0],args[1],args[2],storage,args[3]),
        updateImageSearchTerm:storage=>updateCampaignDeliveryImageSearchTermForOffer(args[0],args[1],storage,args[2]),
        updateCommission:storage=>updateCampaignDeliveryCommissionForOffer(args[0],args[1],storage,args[2]),
        updateProductName:storage=>updateCampaignDeliveryProductNameForOffer(args[0],args[1],storage,args[2]),
        updateAffiliateUrl:storage=>updateCampaignDeliveryAffiliateUrlForOffer(args[0],args[1],storage,args[2]),
        updateAssetWork:storage=>updateCampaignDeliveryAssetStudioWork(args[0],args[1],storage),
        updateAssetRoute:storage=>updateCampaignDeliveryAssetStudioRoute(args[0],args[1],storage),
        markOpened:storage=>markCampaignDeliveryOpened(args[0],args[1],storage)
      };
      if(!Object.hasOwn(actions,operation)||(operation==='updateAssetRoute'&&typeof args[1]!=='boolean'))throw Error('Operação inválida');
      return transact(version,actions[operation],operation==='updateAssetRoute'?routeChange(args[0]):undefined,true);
    },
    async getRouteHistory(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new Error('ID inválido');
      return db.prepare('SELECT event FROM route_history WHERE delivery_id=? ORDER BY version').all(id).map(row=>JSON.parse(row.event));
    },
    // Exclusivo para alimentar a prova com fontes fictícias; não é importador.
    async seedProgressForTest(expectedVersion, data) {
      if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.batches) || !Array.isArray(data.drafts)
        || !data.expansions || typeof data.expansions !== 'object' || Array.isArray(data.expansions)) throw new Error('Fontes inválidas');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row=db.prepare('SELECT version FROM state WHERE id=1').get();
        if (!Number.isInteger(expectedVersion) || row.version!==expectedVersion) throw new VersionConflict();
        if (db.prepare('SELECT id FROM progress_sources WHERE id=1').get()) throw new Error('Fontes já inicializadas');
        db.prepare('INSERT INTO progress_sources VALUES(1,?)').run(JSON.stringify(data));
        db.prepare('UPDATE state SET version=? WHERE id=1').run(row.version+1);
        db.exec('COMMIT'); return row.version+1;
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    // Operações sintéticas, sem equivalência declarada com os fluxos reais.
    async updateProgressForTest(expectedVersion, operation) {
      if (!operation || !['jobs','drafts','batches','expansions'].includes(operation.source) || typeof operation.id!=='string' || !operation.id.trim()) throw new Error('Operação de teste inválida');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row=db.prepare('SELECT version FROM state WHERE id=1').get();
        if (!Number.isInteger(expectedVersion) || row.version!==expectedVersion) throw new VersionConflict();
        const saved=db.prepare('SELECT value FROM progress_sources WHERE id=1').get();
        if (!saved) throw new Error('Fontes de progresso indisponíveis');
        const data=JSON.parse(saved.value), list=data[operation.source];
        if (operation.source==='expansions') {
          if (operation.kind!=='insert' || !list || typeof list!=='object' || Array.isArray(list) || Object.hasOwn(list,operation.id) || !Object.hasOwn(operation,'record') || (operation.record!==null && (!operation.record || !Array.isArray(operation.record.entries)))) throw new Error('Expansão inválida ou existente');
          Object.defineProperty(list,operation.id,{value:operation.record,enumerable:true,writable:true,configurable:true});
        } else {
        if (!Array.isArray(list)) throw new Error('Fonte inválida');
        const matches=list.filter(item=>item?.id===operation.id);
        if (operation.kind==='insert') {
          if (matches.length || !operation.record || operation.record.id!==operation.id) throw new Error('Registro inválido ou existente');
          list.push(operation.record);
        } else if (operation.kind==='setField') {
          if (matches.length!==1 || typeof operation.field!=='string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(operation.field) || operation.field==='id' || !Object.hasOwn(operation,'expectedValue') || !Object.hasOwn(operation,'value') || operation.value===undefined || operation.expectedValue===undefined) throw new Error('Campo inválido ou registro ambíguo');
          const record=matches[0];
          if (!Object.hasOwn(record,operation.field) || JSON.stringify(record[operation.field])!==JSON.stringify(operation.expectedValue)) throw new Error('Conflito de campo');
          record[operation.field]=operation.value;
        } else throw new Error('Operação de teste inválida');
        }
        db.prepare('UPDATE progress_sources SET value=? WHERE id=1').run(JSON.stringify(data));
        db.prepare('UPDATE state SET version=? WHERE id=1').run(row.version+1);
        db.exec('COMMIT'); return row.version+1;
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    async loadProgressSnapshot(id) {
      db.exec('BEGIN');
      try {
        const row=db.prepare('SELECT version,value FROM state WHERE id=1').get();
        const sources=db.prepare('SELECT value FROM progress_sources WHERE id=1').get();
        if (!sources) throw new Error('Fontes de progresso indisponíveis');
        const records=JSON.parse(row.value), data=JSON.parse(sources.value);
        const delivery=records.find(record=>record.id===id);
        if (!delivery) throw new Error('Entrega indisponível');
        db.exec('COMMIT'); return {revision:row.version,delivery,...data};
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    async markOpened(version, id, stage) { return transact(version, storage => markCampaignDeliveryOpened(id, stage, storage)); },
    close() { db.close(); }
  };
}
