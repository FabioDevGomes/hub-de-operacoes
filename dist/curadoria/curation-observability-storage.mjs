import * as Domain from './curation-observability-domain.mjs';

const {DB_NAME,DB_VERSION,STORE_NAMES}=Domain;
let databasePromise;

export function openDB(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      const events=db.objectStoreNames.contains(STORE_NAMES.events)?request.transaction.objectStore(STORE_NAMES.events):db.createObjectStore(STORE_NAMES.events,{keyPath:'eventId'});
      const snapshots=db.objectStoreNames.contains(STORE_NAMES.snapshots)?request.transaction.objectStore(STORE_NAMES.snapshots):db.createObjectStore(STORE_NAMES.snapshots,{keyPath:'snapshotId'});
      const correlations=db.objectStoreNames.contains(STORE_NAMES.correlations)?request.transaction.objectStore(STORE_NAMES.correlations):db.createObjectStore(STORE_NAMES.correlations,{keyPath:'correlationId'});
      const details=db.objectStoreNames.contains(STORE_NAMES.details)?request.transaction.objectStore(STORE_NAMES.details):db.createObjectStore(STORE_NAMES.details,{keyPath:'detailId'});
      addIndex(events,'byOccurredAt','occurredAt');addIndex(events,'byOccurredAtEventId',['occurredAt','eventId']);addIndex(events,'byProductDate',['productKey','occurredAt','eventId']);addIndex(events,'byProductNameDate',['productNameKey','occurredAt','eventId']);addIndex(events,'byOriginDate',['origin','occurredAt','eventId']);addIndex(events,'byTypeDate',['eventType','occurredAt','eventId']);addIndex(events,'byDecisionDate',['decisionStatus','occurredAt','eventId']);
      addIndex(snapshots,'byOccurredAt','capturedAt');addIndex(snapshots,'byProductDate',['productKey','capturedAt','snapshotId']);addIndex(snapshots,'byOriginDate',['origin','capturedAt','snapshotId']);addIndex(snapshots,'byTypeDate','snapshot_type');
      addIndex(correlations,'byStatusDate',['status','updatedAt','correlationId']);addIndex(correlations,'byProductDate',['productKey','updatedAt','correlationId']);addIndex(correlations,'byOriginDate',['origin','updatedAt','correlationId']);
      addIndex(details,'byKind','kind');
    };
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)};
    request.onerror=()=>{databasePromise=null;reject(request.error)};
    request.onblocked=()=>{databasePromise=null;reject(new Error('A base de Observabilidade da Curadoria está ocupada por outra aba.'))};
  });
  return databasePromise;
}

function addIndex(store,name,keyPath){if(!store.indexNames.contains(name))store.createIndex(name,keyPath,{unique:false})}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Falha na transação de Curadoria.'))})}

export async function recordAction(record){
  const started=performance.now();
  const event=record?.event,detail=record?.detail;
  if(!event?.eventId)throw new Error('Evento de Curadoria sem identidade estável.');
  const db=await openDB(),tx=db.transaction([STORE_NAMES.events,STORE_NAMES.details],'readwrite'),events=tx.objectStore(STORE_NAMES.events),details=tx.objectStore(STORE_NAMES.details);
  const existing=events.get(event.eventId);
  existing.onsuccess=()=>{if(existing.result)return;events.add(event);if(detail?.detailId)details.add(detail)};
  await transactionDone(tx);
  return {inserted:!existing.result,eventId:event.eventId,durationMs:Number((performance.now()-started).toFixed(2))};
}

export async function recordDecisionBundle(bundle){
  const started=performance.now();
  if(!bundle?.event?.eventId)throw new Error('Decisão sem evento de Curadoria.');
  const stores=[STORE_NAMES.events,STORE_NAMES.details];
  if(bundle.snapshot)stores.push(STORE_NAMES.snapshots);
  if(bundle.correlation)stores.push(STORE_NAMES.correlations);
  const db=await openDB(),tx=db.transaction(stores,'readwrite'),events=tx.objectStore(STORE_NAMES.events),existing=events.get(bundle.event.eventId);
  existing.onsuccess=()=>{
    if(existing.result)return;
    events.add(bundle.event);
    if(bundle.detail?.detailId)tx.objectStore(STORE_NAMES.details).add(bundle.detail);
    if(bundle.snapshot)tx.objectStore(STORE_NAMES.snapshots).add(bundle.snapshot);
    if(bundle.snapshotEvent)events.add(bundle.snapshotEvent);
    if(bundle.correlation)tx.objectStore(STORE_NAMES.correlations).add(bundle.correlation);
  };
  await transactionDone(tx);
  return {inserted:!existing.result,snapshotId:bundle.snapshot?.snapshotId||null,correlationId:bundle.correlation?.correlationId||null,durationMs:Number((performance.now()-started).toFixed(2))};
}

export async function getEvent(eventId){return getByKey(STORE_NAMES.events,eventId)}
export async function getEventDetail(eventId){return getByKey(STORE_NAMES.details,eventId)}
export async function getSnapshot(snapshotId){return getByKey(STORE_NAMES.snapshots,snapshotId)}
export async function getCorrelation(correlationId){return getByKey(STORE_NAMES.correlations,correlationId)}
async function getByKey(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}

export async function countEvents(){const db=await openDB();return new Promise((resolve,reject)=>{const request=db.transaction(STORE_NAMES.events).objectStore(STORE_NAMES.events).count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}

export async function listEventsPage({filters={},cursor=null,limit=30,scanLimit=600}={}){
  const db=await openDB(),normalized={...filters,productName:String(filters.productName||'').trim(),productNameKey:Domain.normalizeName(filters.productName||'')};
  if(normalized.correlationStatus)return listCorrelationEventsPage(db,normalized,cursor,limit,scanLimit);
  const definition=chooseEventIndex(normalized),store=db.transaction(STORE_NAMES.events).objectStore(STORE_NAMES.events),index=store.index(definition.index),range=makeRange(definition,normalized,cursor),direction='prev';
  return new Promise((resolve,reject)=>{
    const request=index.openCursor(range,direction),items=[];let scanned=0,last=null,hasMore=false;
    request.onsuccess=()=>{
      const current=request.result;
      if(!current){resolve({items,nextCursor:null,hasMore:false,scanned});return}
      scanned++;last=cursorFrom(current,definition);
      if(matchesFilters(current.value,normalized))items.push(current.value);
      if(items.length>=limit+1){items.pop();hasMore=true;resolve({items,nextCursor:items.length?cursorFromItem(items.at(-1)):last,hasMore,scanned});return}
      if(scanned>=scanLimit){hasMore=true;resolve({items,nextCursor:last,hasMore,scanned});return}
      current.continue();
    };
    request.onerror=()=>reject(request.error);
  });
}

function chooseEventIndex(filters){
  if(filters.productName)return{index:'byProductNameDate',field:'productNameKey',value:filters.productNameKey};
  if(filters.origin)return{index:'byOriginDate',field:'origin',value:filters.origin};
  if(filters.eventType)return{index:'byTypeDate',field:'eventType',value:filters.eventType};
  if(filters.decisionStatus)return{index:'byDecisionDate',field:'decisionStatus',value:filters.decisionStatus};
  return{index:'byOccurredAtEventId',field:'occurredAt',value:null};
}
function makeRange(definition,filters,cursor){
  const rangeFactory=globalThis.IDBKeyRange||globalThis.webkitIDBKeyRange;
  if(!rangeFactory)return undefined;
  if(definition.value!==null){const prefix=definition.value,upper=[prefix,'\uffff','\uffff'];if(cursor)return rangeFactory.bound([prefix,'',''],[prefix,cursor.occurredAt,cursor.eventId],false,true);return rangeFactory.bound([prefix,'',''],upper)}
  if(cursor)return rangeFactory.upperBound([cursor.occurredAt,cursor.eventId],true);
  return undefined;
}
function cursorFrom(current,definition){return definition.value!==null?{occurredAt:current.value.occurredAt,eventId:current.value.eventId}:{occurredAt:current.value.occurredAt,eventId:current.value.eventId}}
function cursorFromItem(item){return{occurredAt:item.occurredAt,eventId:item.eventId}}
function matchesFilters(event,filters){return(!filters.productName||event.productNameKey===filters.productNameKey)&&(!filters.origin||event.origin===filters.origin)&&(!filters.eventType||event.eventType===filters.eventType)&&(!filters.decisionStatus||event.decisionStatus===filters.decisionStatus)}

async function listCorrelationEventsPage(db,filters,cursor,limit,scanLimit){
  const tx=db.transaction([STORE_NAMES.correlations,STORE_NAMES.events]),store=tx.objectStore(STORE_NAMES.correlations),index=store.index('byStatusDate'),range=makeCorrelationRange(filters.correlationStatus,cursor);
  return new Promise((resolve,reject)=>{
    const request=index.openCursor(range,'prev'),items=[];let scanned=0,last=null;
    request.onsuccess=()=>{
      const current=request.result;
      if(!current){resolve({items:items.map(item=>item.event),nextCursor:null,hasMore:false,scanned});return}
      scanned++;last={updatedAt:current.value.updatedAt,correlationId:current.value.correlationId};
      const relationCursor={updatedAt:current.value.updatedAt,correlationId:current.value.correlationId};
      const eventRequest=tx.objectStore(STORE_NAMES.events).get(current.value.snapshotEventId);
      eventRequest.onsuccess=()=>{
        if(eventRequest.result&&matchesFilters(eventRequest.result,filters))items.push({event:eventRequest.result,cursor:relationCursor});
        if(items.length>=limit+1){items.pop();resolve({items:items.map(item=>item.event),nextCursor:items.at(-1)?.cursor||last,hasMore:true,scanned});return}
        if(scanned>=scanLimit){resolve({items:items.map(item=>item.event),nextCursor:last,hasMore:true,scanned});return}
        current.continue();
      };
      eventRequest.onerror=()=>reject(eventRequest.error);
    };
    request.onerror=()=>reject(request.error);
  });
}
function makeCorrelationRange(status,cursor){const rangeFactory=globalThis.IDBKeyRange||globalThis.webkitIDBKeyRange;if(!rangeFactory)return undefined;if(cursor)return rangeFactory.bound([status,'',''],[status,cursor.updatedAt,cursor.correlationId],false,true);return rangeFactory.bound([status,'',''],[status,'\uffff','\uffff'])}

export async function listCorrelationsPage({status='pending',cursor=null,limit=30}={}){
  const db=await openDB(),store=db.transaction(STORE_NAMES.correlations).objectStore(STORE_NAMES.correlations),index=store.index('byStatusDate'),range=makeCorrelationRange(status,cursor);
  return new Promise((resolve,reject)=>{const request=index.openCursor(range,'prev'),items=[];request.onsuccess=()=>{const current=request.result;if(!current){resolve({items,nextCursor:null,hasMore:false});return}if(items.length>=limit){resolve({items,nextCursor:{updatedAt:items.at(-1).updatedAt,correlationId:items.at(-1).correlationId},hasMore:true});return}items.push(current.value);current.continue()};request.onerror=()=>reject(request.error)})
}

export async function updateCorrelation(correlationId,{action,candidate=null,reason=''}={}){
  const db=await openDB(),tx=db.transaction(STORE_NAMES.correlations,'readwrite'),store=tx.objectStore(STORE_NAMES.correlations),request=store.get(correlationId);let updated=null;
  request.onsuccess=()=>{
    const current=request.result;if(!current)return;
    const before=Domain.cloneSnapshotValue(current.links||[]),occurredAt=new Date().toISOString();
    if(action==='confirm'||action==='correct'){
      if(!candidate?.product_id)return;
      const links=(candidate.tests||[]).flatMap(test=>(test.campaigns||[]).map(campaign=>({product_id:candidate.product_id,test_id:test.test_id,account_id:test.account_id,campaign_id:campaign.campaign_id,iteration_id:campaign.iteration_id||campaign.campaign_id,campaign_name:campaign.campaign_name})));
      current.links=links;current.status='confirmed';current.product_id=candidate.product_id;current.history=[...(current.history||[]),{action:action==='correct'?'link_corrected':'link_confirmed',occurredAt,reason,before,after:Domain.cloneSnapshotValue(links)}];
    }else if(action==='unlink'){
      current.links=[];current.status='pending';delete current.product_id;current.history=[...(current.history||[]),{action:'link_invalidated',occurredAt,reason,before,after:[]}];
    }else throw new Error('Ação de correlação inválida.');
    current.updatedAt=occurredAt;updated=current;store.put(current);
  };
  await transactionDone(tx);return updated;
}

export async function exportBackup(){
  const db=await openDB(),stores=[STORE_NAMES.events,STORE_NAMES.details,STORE_NAMES.snapshots,STORE_NAMES.correlations];
  const entries=await Promise.all(stores.map(name=>new Promise((resolve,reject)=>{const request=db.transaction(name).objectStore(name).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})));
  return {format:'radar-curadoria-observability-v1',schemaVersion:DB_VERSION,exportedAt:new Date().toISOString(),events:entries[0],event_details:entries[1],pretest_snapshots:entries[2],correlations:entries[3]};
}

export async function mergeBackup(payload){
  if(payload?.format!=='radar-curadoria-observability-v1'||payload?.schemaVersion!==DB_VERSION)throw new Error('Arquivo de backup da Observabilidade da Curadoria incompatível.');
  const db=await openDB(),tx=db.transaction([STORE_NAMES.events,STORE_NAMES.details,STORE_NAMES.snapshots,STORE_NAMES.correlations],'readwrite'),done=transactionDone(tx),groups=[[STORE_NAMES.events,payload.events,'eventId'],[STORE_NAMES.details,payload.event_details,'detailId'],[STORE_NAMES.snapshots,payload.pretest_snapshots,'snapshotId'],[STORE_NAMES.correlations,payload.correlations,'correlationId']];let added=0,skipped=0;
  for(const [storeName,records,key]of groups)for(const record of Array.isArray(records)?records:[]){if(!record?.[key]){skipped++;continue}const store=tx.objectStore(storeName),request=store.get(record[key]);request.onsuccess=()=>{if(request.result){skipped++;return}store.add(record);added++}}
  await done;return{added,skipped};
}
