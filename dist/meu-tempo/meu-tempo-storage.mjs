import{BOOLEAN_ITEM_IDS,DEFAULT_CATEGORIES,DEFAULT_ITEMS,makeId,normalizedName,planDurationRemoval}from'./meu-tempo-domain.mjs';

export const DB_NAME='painel-meu-tempo';
export const DB_VERSION=1;

const requestResult=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Operação cancelada.'))});

export function openTimeDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('categories'))db.createObjectStore('categories',{keyPath:'id'});
      if(!db.objectStoreNames.contains('items')){const store=db.createObjectStore('items',{keyPath:'id'});store.createIndex('categoryId','categoryId')}
      if(!db.objectStoreNames.contains('entries')){const store=db.createObjectStore('entries',{keyPath:'id'});store.createIndex('date','date');store.createIndex('itemId','itemId');store.createIndex('date_item',['date','itemId'])}
      if(!db.objectStoreNames.contains('days'))db.createObjectStore('days',{keyPath:'date'});
      if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function withDb(storeNames,mode,work){const db=await openTimeDb();try{const tx=db.transaction(storeNames,mode),result=await work(tx);await txDone(tx);return result}finally{db.close()}}

export async function initialize(){
  await withDb(['categories','items','settings'],'readwrite',async tx=>{
    const categories=tx.objectStore('categories'),items=tx.objectStore('items'),settings=tx.objectStore('settings');
    if(await requestResult(categories.count())===0)for(const row of DEFAULT_CATEGORIES)categories.put({...row});
    if(await requestResult(items.count())===0)for(const row of DEFAULT_ITEMS)items.put({...row});
    for(const id of BOOLEAN_ITEM_IDS){const item=await requestResult(items.get(id));if(item&&item.type!=='boolean')items.put({...item,type:'boolean',durationMode:null,updatedAt:new Date().toISOString()})}
    if(!await requestResult(settings.get('waterUnitMl')))settings.put({key:'waterUnitMl',value:350});
  });
}

export async function snapshot(){
  await initialize();
  return withDb(['categories','items','entries','days','settings'],'readonly',async tx=>{
    const all=name=>requestResult(tx.objectStore(name).getAll());
    const[categories,items,entries,days,settings]=await Promise.all(['categories','items','entries','days','settings'].map(all));
    return{categories:categories.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')),items:items.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')),entries:entries.sort((a,b)=>a.date.localeCompare(b.date)||String(a.start||'99:99').localeCompare(String(b.start||'99:99'))||a.createdAt.localeCompare(b.createdAt)),days,settings:Object.fromEntries(settings.map(row=>[row.key,row.value]))};
  });
}

function readStoreRecords(store){
  return new Promise((resolve,reject)=>{
    const records=[],request=store.openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(!cursor)return resolve(records);records.push({key:cursor.key,value:cursor.value});cursor.continue()};
    request.onerror=()=>reject(request.error);
  });
}

export async function exportDatabaseBackup(){
  const db=await openTimeDb();
  try{
    const storeNames=[...db.objectStoreNames],tx=db.transaction(storeNames,'readonly'),done=txDone(tx),stores={},definitions={};
    const reads=storeNames.map(name=>{
      const store=tx.objectStore(name);
      definitions[name]={keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:[...store.indexNames].map(indexName=>{const index=store.index(indexName);return{name:index.name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry}})};
      return readStoreRecords(store).then(records=>{stores[name]=records});
    });
    await Promise.all(reads);await done;
    const recordCounts=Object.fromEntries(storeNames.map(name=>[name,stores[name].length]));
    return{format:'meu-tempo-database-backup',formatVersion:1,database:DB_NAME,databaseVersion:db.version,exportedAt:new Date().toISOString(),storeDefinitions:definitions,recordCounts,stores};
  }finally{db.close()}
}

export async function mergeDurationItems({sourceId,targetId,name}){
  const finalName=String(name||'').trim();
  if(!sourceId||!targetId||sourceId===targetId)throw new Error('Selecione duas atividades diferentes.');
  if(!finalName)throw new Error('Informe o nome final da atividade.');
  return withDb(['items','entries'],'readwrite',async tx=>{
    const items=tx.objectStore('items'),entries=tx.objectStore('entries'),allItems=await requestResult(items.getAll()),source=allItems.find(item=>item.id===sourceId),target=allItems.find(item=>item.id===targetId);
    if(!source||!target)throw new Error('Uma das atividades não existe mais. Atualize a tela e tente novamente.');
    if(source.type!=='duration'||target.type!=='duration')throw new Error('Só é possível unir atividades de duração.');
    if(source.categoryId!==target.categoryId)throw new Error('As atividades precisam pertencer à mesma categoria.');
    if(Boolean(source.productive)!==Boolean(target.productive))throw new Error('As atividades têm configurações de produtividade diferentes; a união foi cancelada para preservar a classificação.');
    const normalizedFinalName=normalizedName(finalName),collision=allItems.find(item=>item.id!==sourceId&&item.id!==targetId&&normalizedName(item.name)===normalizedFinalName);
    if(collision)throw new Error(`Já existe outra atividade chamada “${collision.name}”.`);
    const sourceEntries=await requestResult(entries.index('itemId').getAll(sourceId)),targetEntries=await requestResult(entries.index('itemId').getAll(targetId));
    if([...sourceEntries,...targetEntries].some(entry=>entry.type!=='duration'||!Number.isFinite(Number(entry.minutes))))throw new Error('Foi encontrado um lançamento incompatível; nenhum dado foi alterado.');
    const now=new Date().toISOString();
    for(const entry of sourceEntries)entries.put({...entry,itemId:targetId,itemNameSnapshot:finalName,updatedAt:now});
    items.put({...target,name:finalName,active:true,updatedAt:now});
    items.put({...source,active:false,updatedAt:now});
    const movedMinutes=sourceEntries.reduce((sum,entry)=>sum+Number(entry.minutes),0),combinedMinutes=movedMinutes+targetEntries.reduce((sum,entry)=>sum+Number(entry.minutes),0);
    return{sourceId,targetId,sourceName:source.name,targetName:finalName,movedEntries:sourceEntries.length,movedMinutes,combinedMinutes};
  });
}

export async function saveCategory(category){const row={id:category.id||makeId('cat'),name:String(category.name||'').trim(),order:Number(category.order)||0,active:category.active!==false};if(!row.name)throw new Error('Informe o nome da categoria.');await withDb(['categories'],'readwrite',tx=>{tx.objectStore('categories').put(row)});return row}
export async function saveItem(item){const row={...item,id:item.id||makeId('item'),name:String(item.name||'').trim(),categoryId:item.categoryId,type:item.type||'duration',order:Number(item.order)||0,active:item.active!==false,productive:Boolean(item.productive),showInCharts:item.showInCharts!==false,chartType:item.chartType||'bar',aggregation:item.aggregation||((item.type||'duration')==='duration'?'sum':'average'),durationMode:(item.type||'duration')==='duration'?(item.durationMode||'both'):null,updatedAt:new Date().toISOString()};if(!row.name)throw new Error('Informe o nome do item.');await withDb(['items'],'readwrite',tx=>{tx.objectStore('items').put(row)});return row}
export async function reorderItems(orderedIds){
  if(!Array.isArray(orderedIds)||new Set(orderedIds).size!==orderedIds.length)throw new Error('A nova ordem das atividades é inválida.');
  return withDb(['items'],'readwrite',async tx=>{
    const store=tx.objectStore('items'),items=await requestResult(store.getAll()),byId=new Map(items.map(item=>[item.id,item]));
    if(orderedIds.length!==items.length||items.some(item=>!orderedIds.includes(item.id)))throw new Error('A lista de atividades mudou. Atualize a tela e tente novamente.');
    orderedIds.forEach((id,index)=>store.put({...byId.get(id),order:(index+1)*10}));
    return true;
  });
}
export async function setItemProductivity(item,productive){if(!item?.id||item.type!=='duration')throw new Error('Somente atividades de duração podem ser classificadas como produtivas.');const value=Boolean(productive),now=new Date().toISOString(),updatedItem={...item,productive:value,updatedAt:now};return withDb(['items','entries'],'readwrite',async tx=>{tx.objectStore('items').put(updatedItem);const store=tx.objectStore('entries'),entries=await requestResult(store.index('itemId').getAll(item.id));let updatedEntries=0;for(const entry of entries)if(entry.type==='duration'){store.put({...entry,productiveSnapshot:value,updatedAt:now});updatedEntries++}return{item:updatedItem,updatedEntries}})}
export async function deleteItem(id){return withDb(['items','entries'],'readwrite',async tx=>{const used=await requestResult(tx.objectStore('entries').index('itemId').count(id));if(used)throw new Error('Este item possui histórico e só pode ser desativado.');tx.objectStore('items').delete(id);return true})}

function entryRow(entry){const now=new Date().toISOString(),row={...entry,id:entry.id||makeId('entry'),createdAt:entry.createdAt||now,updatedAt:now};if(!row.date||!row.itemId||!row.type)throw new Error('Registro incompleto.');return row}
export async function saveEntry(entry){const row=entryRow(entry);await withDb(['entries'],'readwrite',tx=>{tx.objectStore('entries').put(row)});return row}
export async function saveEntryAndSetting(entry,key,value){const row=entryRow(entry);if(!key)throw new Error('A configuração da pausa está inválida.');await withDb(['entries','settings'],'readwrite',tx=>{tx.objectStore('entries').put(row);tx.objectStore('settings').put({key,value})});return row}
export async function deleteEntry(id){await withDb(['entries'],'readwrite',tx=>{tx.objectStore('entries').delete(id)})}
export async function removeDuration(date,itemId,minutes){return withDb(['entries'],'readwrite',async tx=>{const store=tx.objectStore('entries'),entries=await requestResult(store.index('date_item').getAll([date,itemId])),plan=planDurationRemoval(entries,minutes),byId=new Map(entries.map(entry=>[entry.id,entry])),now=new Date().toISOString();for(const id of plan.deleteIds)store.delete(id);for(const update of plan.updates){const entry=byId.get(update.id);store.put({...entry,minutes:update.minutes,start:null,end:null,source:'manual_adjustment',updatedAt:now})}return plan})}
export async function undoLast(date){return withDb(['entries'],'readwrite',async tx=>{const entries=await requestResult(tx.objectStore('entries').index('date').getAll(date));const last=entries.filter(x=>x.source!=='excel_import').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];if(!last)return null;tx.objectStore('entries').delete(last.id);return last})}
export async function saveDay(day){const row={date:day.date,lastRecordedTime:day.lastRecordedTime||null,output:String(day.output||''),observations:String(day.observations||''),updatedAt:new Date().toISOString()};await withDb(['days'],'readwrite',tx=>{tx.objectStore('days').put(row)});return row}
export async function saveSetting(key,value){await withDb(['settings'],'readwrite',tx=>{tx.objectStore('settings').put({key,value})})}
