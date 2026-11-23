// Ponte isolada para as primeiras operações de curadoria. Não ativa telas nem usa fallback local.
const GM='radar-top-performance', CB='radar-clickbank-top-offers';
function toBase64(bytes){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value)}
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')}

export function createCurationBridge({request,encode,decode}){
 if(typeof request!=='function'||typeof encode!=='function'||typeof decode!=='function')throw Error('Serviço de curadoria indisponível');
 const observedRecords=new Map();
 const identity=({source,store,key})=>JSON.stringify([source,store,key]);
 function remember(entry,record){observedRecords.set(identity(entry),record===null?null:JSON.stringify(record.value))}
 async function readBinary(ref){
  const result=await request('/indexed/binary',{path:ref.path});
  if(!Number.isSafeInteger(result?.size)||typeof result.base64!=='string'||typeof result.sha256!=='string')throw Error('Binário indisponível');
  const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
  if(bytes.length!==result.size||await hash(bytes)!==result.sha256||ref.size!==result.size||ref.sha256!==result.sha256)throw Error('Integridade binária divergente');
  return bytes;
 }
 async function readRecords(entries){
  if(!entries.length||entries.length>10000)throw Error('Quantidade de registros inválida');
  let revision,results=[];
  for(let start=0;start<entries.length;start+=100){
   const response=await request('/transaction/read',{...(revision===undefined?{}:{expectedRevision:revision}),operations:entries.slice(start,start+100).map(({source,store,key})=>({type:'indexed_get',input:{source,store,key}}))});
   if(!Number.isSafeInteger(response?.revision)||!Array.isArray(response.results)||response.results.length!==Math.min(100,entries.length-start))throw Error('Resposta central incompleta');
   if(response.results.some(item=>!item||item.revision!==response.revision||!Object.hasOwn(item,'record')||(item.record!==null&&(!item.record||!Object.hasOwn(item.record,'key')||!Object.hasOwn(item.record,'value')))))throw Error('Registro central incompleto');
   if(revision!==undefined&&response.revision!==revision)throw Error('Revisões inconsistentes');
   revision=response.revision;results.push(...response.results);
  }
  return {revision,results};
 }
 async function writeEntries(entries,{onlyNew=false,transform=null,expectedRevision}={}){
  const seen=new Set();for(const entry of entries){if(typeof entry.key!=='string'||!entry.key)throw Error('Chave inválida');const id=identity(entry);if(seen.has(id))throw Error('Chave duplicada na operação');seen.add(id)}
  const observed=await readRecords(entries),operations=[],values=[];
  if(expectedRevision!==undefined&&observed.revision!==expectedRevision){const error=Error('Dados alterados durante a importação');error.code='VERSION_CONFLICT';throw error}
  for(let i=0;i<entries.length;i++){
   const {source,store,key}=entries[i],record=observed.results[i]?.record;
   if(onlyNew&&record)throw Error('Registro já existe');
   if(entries[i].requireObserved){const id=identity(entries[i]);if(record&&!observedRecords.has(id))throw Error('Atualize o registro antes de salvá-lo');if(observedRecords.has(id)&&observedRecords.get(id)!==(record===null?null:JSON.stringify(record.value))){const error=Error('Registro alterado em outra sessão');error.code='VERSION_CONFLICT';throw error}}
   const previous=record?await decode(record.value,readBinary):null;
   if(previous!==null&&(typeof previous!=='object'||Array.isArray(previous)))throw Error('Registro anterior incompatível');
   const updater=entries[i].transform||transform;
   const value=updater?await updater(previous):entries[i].value;
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Registro inválido');
   const merged=previous?{...previous,...value}:value;
   values.push(merged);
   const binaries=[];
   const encoded=await encode(merged,async(bytes,meta)=>{
    if(!(bytes instanceof Uint8Array)||bytes.length>16*1024*1024)throw Error('Binário excede limite');
    const sha256=await hash(bytes),path=`arquivos/sha-${sha256}.bin`;
    binaries.push({path,size:bytes.length,sha256,base64:toBase64(bytes)});
    return {path,size:bytes.length,sha256,mime:meta.mime||'',...(meta.name?{name:meta.name}:{}),...(meta.lastModified===undefined?{}:{lastModified:meta.lastModified})};
   });
   const input={source,store,key,value:encoded,expectedState:record?'present':'absent',...(record?{expectedValue:record.value}:{}),binaries};
   operations.push({type:'indexed_put',input});
  }
  const result=await request('/transaction',{expectedRevision:observed.revision,operations});
  if(!Number.isSafeInteger(result?.revision)||!Array.isArray(result.results)||result.results.length!==operations.length)throw Error('Confirmação central incompleta');
  for(let i=0;i<entries.length;i++)remember(entries[i],{value:operations[i].input.value});
  return {...result,values};
 }
 async function listRecords(source,store){
  let revision,offset=0,values=[];
  do{
   const response=await request('/transaction/read',{...(revision===undefined?{}:{expectedRevision:revision}),operations:[{type:'indexed_scan',input:{source,store,limit:500,offset,...(revision===undefined?{}:{expectedRevision:revision})}}]});
   const page=response?.results?.[0];if(!Number.isSafeInteger(response?.revision)||!page||page.revision!==response.revision||!Array.isArray(page.records)||(page.nextOffset!==null&&(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)))throw Error('Página central inválida');
   revision=response.revision;for(const row of page.records)remember({source,store,key:row.key},row);values.push(...await Promise.all(page.records.map(row=>decode(row.value,readBinary))));offset=page.nextOffset;
  }while(offset!==null);
  return values;
 }
 async function deliverySnapshot(){
  const response=await request('/transaction/read',{operations:[{type:'delivery_list',input:{}}]});
  const result=response?.results?.[0];
  if(!Number.isSafeInteger(response?.revision)||!result||result.state!=='present'||!Array.isArray(result.value)||result.revision!==response.revision)throw Error('Entregas indisponíveis');
  return {revision:response.revision,deliveries:result.value};
 }
 return {
  async getGuruHiddenOffers(){
   const key='top-performance-itens-ocultos-v1',result=await request('/transaction/read',{operations:[{type:'local_get',input:{key}}]});
   const row=result?.results?.[0];if(!Number.isSafeInteger(result?.revision)||row?.revision!==result.revision||!['present','absent'].includes(row.state))throw Error('Visibilidade indisponível');
   let values;try{values=row.state==='present'?JSON.parse(row.value):[]}catch{throw Error('Visibilidade inválida')}
   if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))throw Error('Visibilidade inválida');return values;
  },
  async setGuruHiddenOffer(offerId,hidden){
   if(typeof offerId!=='string'||!offerId||typeof hidden!=='boolean')throw Error('Visibilidade inválida');
   const key='top-performance-itens-ocultos-v1',result=await request('/transaction/read',{operations:[{type:'local_get',input:{key}}]});
   const row=result?.results?.[0];if(!Number.isSafeInteger(result?.revision)||row?.revision!==result.revision||!['present','absent'].includes(row.state))throw Error('Visibilidade indisponível');
   let values;try{values=row.state==='present'?JSON.parse(row.value):[]}catch{throw Error('Visibilidade inválida')}
   if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))throw Error('Visibilidade inválida');
   const next=new Set(values);if(hidden)next.add(offerId);else next.delete(offerId);
   const saved=await request('/transaction',{expectedRevision:result.revision,operations:[{type:'local_put',input:{key,expectedState:row.state,...(row.state==='present'?{expectedValue:row.value}:{}),value:JSON.stringify([...next])}}]});
   if(!Number.isSafeInteger(saved?.revision)||saved.results?.length!==1)throw Error('Visibilidade não confirmada');return [...next];
  },
  async listGlimpseAnalyses(){return listRecords('radar-glimpse','analyses')},
  async saveGlimpseAnalysis(value){
   if(typeof value?.analysisId!=='string'||!value.analysisId)throw Error('Análise inválida');
   await writeEntries([{source:'radar-glimpse',store:'analyses',key:value.analysisId,value,requireObserved:true}]);return value;
  },
  async listDeliveries(){return deliverySnapshot()},
  async updateDeliveries(snapshot,operations){
   const allowed=new Set(['updateCountries','updatePositiveKeywords','updateNegativeKeywords','updateImageSearchTerm','updateCommission','updateProductName','updateAffiliateUrl']);
   if(!Number.isSafeInteger(snapshot?.revision)||!Array.isArray(operations)||!operations.length||operations.length>100||operations.some(item=>!item||!allowed.has(item.operation)||!Array.isArray(item.args)))throw Error('Atualização de entregas inválida');
   const saved=await request('/transaction',{expectedRevision:snapshot.revision,operations:operations.map(item=>({type:'delivery_operation',input:{operation:item.operation,args:item.args}}))});
   if(!Number.isSafeInteger(saved?.revision)||!Array.isArray(saved.results)||saved.results.length!==operations.length)throw Error('Confirmação de entregas incompleta');
   return saved;
  },
  async listDeliveriesForOffer(offerKey,platformCode){
   if(typeof offerKey!=='string'||!offerKey||!['GM','CB'].includes(platformCode))throw Error('Oferta inválida');
   const {deliveries:rows}=await deliverySnapshot();
   return rows.filter(row=>row&&String(row.offerKey)===offerKey&&(row.platformCode||'CB')===platformCode);
  },
  async createDelivery(input,expectedSnapshot){
   if(!input||!['GM','CB'].includes(input.platformCode))throw Error('Entrega inválida');
   const snapshot=expectedSnapshot??await deliverySnapshot();
   if(!Number.isSafeInteger(snapshot?.revision)||!Array.isArray(snapshot.deliveries))throw Error('Revisão de entrega inválida');
   const saved=await request('/transaction',{expectedRevision:snapshot.revision,operations:[{type:'delivery_operation',input:{operation:'create',args:[input]}}]});
   if(!saved?.results?.[0]?.result)throw Error('Resposta de entrega inválida');return saved.results[0].result;
  },
  async getGuruRecord(store,key){
   if(!['offers','collections','collection_offer_snapshots','decisions','trends','images'].includes(store))throw Error('Store Guru Media inválida');
   const entry={source:GM,store,key},result=await readRecords([entry]);remember(entry,result.results[0].record);return result.results[0].record===null?null:decode(result.results[0].record.value,readBinary);
  },
  async listGuruRecords(store){
   if(!['offers','collections','collection_offer_snapshots','decisions','trends','images'].includes(store))throw Error('Store Guru Media inválida');
   return listRecords(GM,store);
  },
  async putGuruRecord(store,value){
   const keys={offers:'offerId',collections:'collectionId',collection_offer_snapshots:'snapshotId',decisions:'offerId',trends:'offerId',images:'offerId'};
   if(!Object.hasOwn(keys,store))throw Error('Store Guru Media inválida');
   await writeEntries([{source:GM,store,key:value?.[keys[store]],value,requireObserved:true}]);return value;
  },
  async recoverGuruOffers(candidates){
   if(!Array.isArray(candidates)||!candidates.length||candidates.length>1000)throw Error('Candidatas de recuperação inválidas');
   const entries=candidates.map(value=>({source:GM,store:'offers',key:value?.offerId,value}));
   const observed=await readRecords(entries);
   const missing=entries.filter((_,index)=>observed.results[index].record===null);
   if(!missing.length)return [];
   const result=await writeEntries(missing,{onlyNew:true});return result.values;
  },
  async updateGuruRecord(store,key,transform){
   if(!['trends'].includes(store)||typeof transform!=='function')throw Error('Atualização inválida');
   let saved;
   await writeEntries([{source:GM,store,key}],{transform:async previous=>{saved=await transform(previous);return saved}});
   return saved;
  },
  async saveGuruCollection({offers,collection,snapshots}){
   if(!Array.isArray(offers)||!Array.isArray(snapshots)||!collection)throw Error('Coleta inválida');
   const entries=[...offers.map(value=>({source:GM,store:'offers',key:value?.offerId,value,requireObserved:true})),{source:GM,store:'collections',key:collection?.collectionId,value:collection,requireObserved:true},...snapshots.map(value=>({source:GM,store:'collection_offer_snapshots',key:value?.snapshotId,value,requireObserved:true}))];
   return writeEntries(entries);
  },
  async saveClickBankCapture(capture){
   return writeEntries([{source:CB,store:'captures',key:capture?.captureId,value:capture}],{onlyNew:true});
  },
  async mergeClickBankBackup(backup,mergeDecision){
   if(!backup||typeof mergeDecision!=='function')throw Error('Backup inválido');
   const stores=['captures','offerMetadata','trends','images','decisions'],entries=[];
   for(const store of stores){if(!Array.isArray(backup[store]))throw Error('Backup inválido');for(const value of backup[store])entries.push({source:CB,store,key:value?.[store==='captures'?'captureId':'offerKey'],value})}
   const result={added:0,merged:0,unchanged:0,conflicts:0};if(!entries.length)return result;
   if(entries.length>10000)throw Error('Backup excede o limite de 10000 registros da importação central experimental; nenhum dado foi alterado');
   const observed=await readRecords(entries),changes=[];
   for(let i=0;i<entries.length;i++){
    const entry=entries[i],row=observed.results[i].record;
    if(!row){result.added++;changes.push(entry);continue}
    const previous=await decode(row.value,readBinary);
    if(JSON.stringify(previous)===JSON.stringify(entry.value)){result.unchanged++;continue}
    if(entry.store!=='decisions'){result.conflicts++;continue}
    const merged=mergeDecision(previous,entry.value);
    if(JSON.stringify(previous)===JSON.stringify(merged))result.unchanged++;
    else{result.merged++;changes.push({...entry,value:merged})}
   }
   if(changes.length)await writeEntries(changes,{expectedRevision:observed.revision});
   return result;
  },
  async getClickBankRecord(store,key){
   if(!['captures','offerMetadata','trends','images','decisions'].includes(store))throw Error('Store ClickBank inválida');
   const entry={source:CB,store,key},result=await readRecords([entry]);remember(entry,result.results[0].record);return result.results[0].record===null?null:decode(result.results[0].record.value,readBinary);
  },
  async listClickBankRecords(store){
   if(!['captures','offerMetadata','trends','images','decisions'].includes(store))throw Error('Store ClickBank inválida');
   return listRecords(CB,store);
  },
  async updateClickBankRecords(entries){
   if(!Array.isArray(entries)||!entries.length||entries.some(entry=>!['offerMetadata','trends','images','decisions'].includes(entry.store)||typeof entry.transform!=='function'))throw Error('Atualização ClickBank inválida');
   const saved=await writeEntries(entries.map(entry=>({source:CB,...entry})));return saved.values;
  },
  async putClickBankRecord(store,value){
   if(!['offerMetadata','trends','images','decisions'].includes(store))throw Error('Store ClickBank inválida');
   await writeEntries([{source:CB,store,key:value?.offerKey,value,requireObserved:true}]);return value;
  },
 };
}

