import {BACKUP_FORMAT,validateBackup,productFromForm,productValues} from './manual-domain.mjs?v=1';
import {RESULT_OPTIONS} from '../trends-ui.mjs';
import {IMAGE_RESULT_OPTIONS} from '../image-search-ui.mjs';
import {normalizeDecision} from '../decision-ui.mjs';
export const DB_NAME='radar-curadoria-manual';
export const DB_VERSION=1;
export const STORES=Object.freeze(['products','trends','images','decisions','analyses']);
export function openManualDB(factory=globalThis.indexedDB) {
  return new Promise((resolve,reject)=>{
    if(!factory)return reject(new Error('O armazenamento local não está disponível.'));
    const request=factory.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{for(const name of STORES)if(!request.result.objectStoreNames.contains(name)){const store=request.result.createObjectStore(name,{keyPath:name==='analyses'?'analysisId':'productId'});if(name==='analyses')store.createIndex('productId','productId');}};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Feche outra aba da Curadoria manual e tente novamente.'));
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  });
}
const requestValue=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const completion=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('A gravação foi interrompida.'));});
export function createManualStorage({factory=globalThis.indexedDB,now=()=>new Date().toISOString(),id=()=>crypto.randomUUID()}={}) {
  async function readState() {
    const db=await openManualDB(factory);
    try{const tx=db.transaction(STORES,'readonly'),done=completion(tx),values=await Promise.all(STORES.map(kind=>requestValue(tx.objectStore(kind).getAll())));await done;return Object.fromEntries(STORES.map((kind,index)=>[kind,values[index]]));}finally{db.close();}
  }
  async function mutate(productId,kind,transform,expectedRevision=null) {
    const db=await openManualDB(factory);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(kind==='products'?['products']:['products',kind],'readwrite'),products=tx.objectStore('products');let result,failure;
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||new Error('Não foi possível salvar.'));};
      const get=products.get(productId);
      get.onsuccess=()=>{
        const product=get.result;
        if(!product||expectedRevision!=null&&product.revision!==expectedRevision){failure=new Error(product?'Este cadastro mudou em outra aba. Reabra antes de salvar.':'Cadastro não encontrado.');tx.abort();return;}
        const apply=previous=>{try{const stamp=now();result=transform(previous,product,stamp);tx.objectStore(kind).put(result);if(kind!=='products')products.put({...product,updatedAt:stamp});}catch(error){failure=error;tx.abort();}};
        if(kind==='products')apply(product);else{const record=tx.objectStore(kind).get(productId);record.onsuccess=()=>apply(record.result);}
      };
    });
  }
  async function saveProduct(input,previous=null) {
    if(previous)return mutate(previous.productId,'products',current=>productFromForm(input,current,{now:now()}),previous.revision);
    const value=productFromForm(input,null,{id:id(),now:now()}),db=await openManualDB(factory);
    try{const tx=db.transaction('products','readwrite'),done=completion(tx);tx.objectStore('products').add(value);await done;return value;}finally{db.close();}
  }
  const candidates=values=>[...new Set((values||[]).map(value=>String(value).trim()).filter(Boolean))];
  function saveTrend(productId,input){
    if(!input.status)return mutate(productId,'trends',(record,product)=>{const countries=[...new Set(input.countries||[])];if(countries.length>5||countries.some(code=>!product.countries.includes(code)))throw new Error('Selecione até cinco países cadastrados.');return {...record,productId,keywordCandidates:record?.keywordCandidates||[],assessments:record?.assessments||[],pageDraft:{term:input.term||input.searchTerm,countries,productAge:input.productAge||'',status:''}};});
    if(!RESULT_OPTIONS.some(option=>option.value===input.status))throw new Error('Selecione um resultado de Trends.');
    return mutate(productId,'trends',(record,product,stamp)=>{const countries=[...new Set(input.countries||[])];if(countries.length>5||countries.some(code=>!product.countries.includes(code)))throw new Error('Selecione até cinco países cadastrados.');return {...record,productId,pageDraft:null,keywordCandidates:record?.keywordCandidates||[],assessments:[...(record?.assessments||[]),{...input,assessmentId:id(),date:stamp.slice(0,10),capturedAt:stamp,countries,productName:product.name}]};});
  }
  function updateTrendCandidates(productId,operation){return mutate(productId,'trends',(record,_p,stamp)=>{const previous=record?.keywordCandidates||[],next=candidates(operation(previous));return {...record,productId,assessments:record?.assessments||[],keywordCandidates:next,candidateHistory:[...(record?.candidateHistory||[]),{entryId:id(),capturedAt:stamp,values:next}]};});}
  function saveImage(productId,input){
    if(!IMAGE_RESULT_OPTIONS.includes(input.status))throw new Error('Selecione um resultado visual antes de registrar candidatas.');
    return mutate(productId,'images',(record,product,stamp)=>{if(!product.countries.includes(input.country))throw new Error('Adicione este país ao cadastro primeiro.');return {...record,productId,searchTerm:input.searchTerm,assessments:[...(record?.assessments||[]),{...input,assessmentId:id(),date:stamp.slice(0,10),capturedAt:stamp,negativeKeywordCandidates:candidates(input.negativeKeywordCandidates),productName:product.name}]};});
  }
  function saveDecision(productId,status){if(normalizeDecision(status)!==status)throw new Error('Decisão inválida.');return mutate(productId,'decisions',(record,product,stamp)=>({...record,productId,currentStatus:status,history:[...(record?.history||[]),{entryId:id(),status,capturedAt:stamp,productName:product.name}]}));}
  function setHidden(productId,hidden){return mutate(productId,'products',(p,_product,stamp)=>({...p,hidden:Boolean(hidden),updatedAt:stamp,revision:p.revision+1,history:[...(p.history||[]),{revision:p.revision,changedAt:stamp,values:productValues(p)}]}));}
  async function historyByProduct(productId){const db=await openManualDB(factory);try{const tx=db.transaction('analyses'),done=completion(tx),rows=await requestValue(tx.objectStore('analyses').index('productId').getAll(productId));await done;return rows.sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)));}finally{db.close();}}
  async function saveAnalysis(value,productId){
    if(!productId||value.productId!==productId||value.productKey!==productId)throw new Error('Glimpse sem identidade manual válida.');
    const db=await openManualDB(factory);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['products','analyses'],'readwrite');let failure;
      tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=tx.onerror=()=>{db.close();reject(failure||tx.error||new Error('Não foi possível salvar Glimpse.'));};
      const p=tx.objectStore('products').get(productId);p.onsuccess=()=>{if(!p.result){failure=new Error('Cadastro manual não encontrado.');tx.abort();return;}const get=tx.objectStore('analyses').get(value.analysisId);get.onsuccess=()=>{if(get.result){if(get.result.productId!==productId){failure=new Error('Identidade de análise já utilizada.');tx.abort();}return;}tx.objectStore('analyses').add(value);tx.objectStore('products').put({...p.result,updatedAt:now()});};};
    });
  }
  async function exportBackup(){return {format:BACKUP_FORMAT,exportedAt:now(),...await readState()};}
  async function mergeBackup(payload){
    validateBackup(payload);const db=await openManualDB(factory);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORES,'readwrite'),result={added:0,unchanged:0,conflicts:0};
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||new Error('Restauração interrompida.'));};
      for(const kind of STORES)for(const value of payload[kind]){const store=tx.objectStore(kind),get=store.get(kind==='analyses'?value.analysisId:value.productId);get.onsuccess=()=>{if(!get.result){store.add(value);result.added++;}else if(JSON.stringify(get.result)===JSON.stringify(value))result.unchanged++;else result.conflicts++;};}
    });
  }
  return {readState,saveProduct,setHidden,saveTrend,updateTrendCandidates,saveImage,saveDecision,historyByProduct,saveAnalysis,exportBackup,mergeBackup};
}
export const manualStorage=createManualStorage();
