// Adaptador de rascunho síncrono da ficha com persistência central assíncrona.
// Apenas para cópia isolada; não ativa a interface por conta própria.
import {draftStorageKey,listDrafts,STORAGE_KEY} from './copy-ficha-draft.mjs';
import {loadGoogleAdsAccountsCache} from '../google-ads/google-ads-accounts-cache.mjs';
import {normalizeAccountDomain,normalizeCustomerId} from '../accounts/account-domains-domain.mjs';
import {ASSET_PAGE_PREFIX,ASSET_PAGE_CURRENT_PREFIX} from '../asset-studio/passagem-asset-central-lab.mjs';
import {validateGoogleAdsPresellCampaignHandoff} from '../google-ads/google-ads-presell-campaign-handoff.mjs';
const JOBS='hub:presell-deploy-jobs:v1',ACK='hub:google-ads:presell-campaign-handoff-ack:v1',SELECTION='hub:presell-campaign-handoff-selected-job:v1',ASSET_HANDOFF='hub:asset-studio:pending-page-directory:v1',HANDOFF_PREFIX='hub:google-ads:presell-campaign-handoff:v1:';
const ACCOUNTS='hub.google-ads-account-directory:v1',ACCOUNT_TARGET='hub:account-map:duplication-target:v1',ACCOUNT_DOMAINS='hub:account-domain-associations:v1';

export function createFichaDraftLabBridge({request,onError=()=>{},referenceStorage=null}){
 if(typeof request!=='function'||typeof onError!=='function')throw Error('Ponte indisponível');
 let states=new Map(),delivery=null,currentScope='',revision=null,loaded=false,queue=Promise.resolve(),failure=null,pending=0;
 async function flush(){await queue;if(failure)throw failure}
 async function open(scope=''){
  await flush();const key=draftStorageKey(scope),keys=[key,JOBS,ACK,SELECTION,ASSET_HANDOFF,ACCOUNTS,ACCOUNT_TARGET,ACCOUNT_DOMAINS,...(scope?[ASSET_PAGE_CURRENT_PREFIX+scope]:[])];
  const operations=[...keys.map(key=>({type:'local_get',input:{key}})),...(scope?[{type:'delivery_get',input:{id:scope}}]:[])];
  const result=await request('/transaction/read',{operations});
  if(!Number.isSafeInteger(result?.revision)||result.results?.length!==operations.length||result.results.some(record=>record.revision!==result.revision))throw Error('Fontes indisponíveis');
  const nextStates=new Map();for(let i=0;i<keys.length;i++){const record=result.results[i];if(!['present','absent'].includes(record.state))throw Error('Fonte inválida');nextStates.set(keys[i],{committed:record.state==='present'?record.value:null,value:record.state==='present'?record.value:null})}
  let page,offset;
  if(scope){
   const pointerRaw=nextStates.get(ASSET_PAGE_CURRENT_PREFIX+scope).value;
   if(pointerRaw!==null){
    let pointer;try{pointer=JSON.parse(pointerRaw)}catch{throw Error('Passagem atual inválida')}
    if(pointer?.campaignDeliveryId!==scope||typeof pointer.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(pointer.id))throw Error('Passagem atual inválida');
    const assetKey=ASSET_PAGE_PREFIX+pointer.id,next=await request('/transaction/read',{expectedRevision:result.revision,operations:[{type:'local_get',input:{key:assetKey}}]}),row=next?.results?.[0];
    if(next?.revision!==result.revision||row?.revision!==result.revision||!['present','absent'].includes(row?.state))throw Error('Passagem indisponível');
    if(row.state==='present')nextStates.set(assetKey,{committed:row.value,value:row.value});
   }else{
    offset=0;do{const next=await request('/transaction/read',{expectedRevision:result.revision,operations:[{type:'local_list',input:{prefix:ASSET_PAGE_PREFIX,offset,limit:500}}]});page=next?.results?.[0];if(next?.revision!==result.revision||page?.revision!==result.revision||!Array.isArray(page.records)||(page.nextOffset!==null&&(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset)))throw Error('Listagem incompleta');for(const row of page.records)nextStates.set(row.key,{committed:row.value,value:row.value});if(nextStates.size>10000)throw Error('Listagem excede limite');offset=page.nextOffset}while(offset!==null);
   }
  }
  const draft=nextStates.get(key).value;if(draft!==null){const parsed=JSON.parse(draft);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Rascunho inválido')}
  const jobs=nextStates.get(JOBS).value;if(jobs!==null&&!Array.isArray(JSON.parse(jobs)))throw Error('Hospedagens inválidas');
  const accounts=nextStates.get(ACCOUNTS).value;if(accounts!==null&&!loadGoogleAdsAccountsCache({storage:{getItem:()=>accounts}}))throw Error('Diretório de contas inválido');
  const domains=nextStates.get(ACCOUNT_DOMAINS).value;if(domains!==null){const value=JSON.parse(domains);if(value?.schemaVersion!==1||!Array.isArray(value.accounts))throw Error('Associações de contas inválidas')}
  const target=nextStates.get(ACCOUNT_TARGET).value;if(target!==null){const value=JSON.parse(target);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Conta selecionada inválida')}
  const deliveryResult=scope?result.results.at(-1):null;if(deliveryResult&&!['present','absent'].includes(deliveryResult.state))throw Error('Entrega indisponível');
  currentScope=scope;delivery=deliveryResult?.state==='present'?deliveryResult.value:null;states=nextStates;revision=result.revision;loaded=true;
 }
 function lookup(key,create=false){if(!loaded||typeof key!=='string')throw Error('Fonte não carregada');if(!states.has(key)&&create&&key.startsWith(HANDOFF_PREFIX))states.set(key,{committed:null,value:null});if(!states.has(key))throw Error('Fonte não carregada');return states.get(key)}
 function enqueue(key,value){
  if(failure){onError(failure);throw failure}
  const state=lookup(key,true);state.value=value;
  pending++;queue=queue.then(async()=>{
   if(failure)throw failure;
   const input={key,expectedState:state.committed===null?'absent':'present',...(state.committed===null?{}:{expectedValue:state.committed}),value};
   const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input}]});
   if(!Number.isSafeInteger(result?.revision))throw Error('Confirmação inválida');
   revision=result.revision;state.committed=value;
  }).catch(error=>{if(!failure){failure=error;onError(error)}}).finally(()=>{pending--});
 }
 const storage={
  getItem(key){if(loaded&&key.startsWith(HANDOFF_PREFIX)&&!states.has(key))return null;const value=lookup(key).value;if(value===null&&[ACCOUNTS,ACCOUNT_TARGET,ACCOUNT_DOMAINS].includes(key)&&referenceStorage){try{return referenceStorage.getItem(key)}catch{return null}}return value},
  setItem(key,value){
   if(typeof value!=='string')throw Error('Fonte inválida');
   if([ACCOUNTS,ACCOUNT_TARGET,ACCOUNT_DOMAINS].includes(key))throw Error('Edição de contas indisponível na base central experimental');
   const state=lookup(key,true);
   if(key===JOBS&&state.value!==null){const previous=JSON.parse(state.value),next=JSON.parse(value);if(!Array.isArray(previous)||!Array.isArray(next)||previous.some(job=>!job||typeof job.id!=='string'||!Array.isArray(job.targets))||previous.some(job=>!next.some(item=>item?.id===job.id)))throw Error('Gravação de hospedagem descartaria registros existentes');}
   enqueue(key,value);
  },
  removeItem(){throw Error('Limpeza indisponível na base central experimental')}
 };
 async function saveAccountDomain(input,{now=new Date().toISOString()}={}){
  await flush();const id=normalizeCustomerId(input?.customerId),domain=normalizeAccountDomain(input?.domain);
  if(!id||!domain)throw Error('Conta ou domínio inválido');
  const raw=storage.getItem(ACCOUNT_DOMAINS),current=raw===null?{schemaVersion:1,accounts:[]}:JSON.parse(raw);
  if(current?.schemaVersion!==1||!Array.isArray(current.accounts))throw Error('Associações inválidas');
  const seen=new Set();for(const account of current.accounts){const accountId=normalizeCustomerId(account?.customerId);if(!accountId||seen.has(accountId)||!account||typeof account!=='object'||Array.isArray(account)||('history' in account&&!Array.isArray(account.history))||(account.domain!=null&&account.domain!==''&&!normalizeAccountDomain(account.domain)))throw Error('Associações ambíguas; não foi possível salvar');seen.add(accountId);if(accountId!==id&&normalizeAccountDomain(account.domain)===domain)throw Error('Domínio já associado a outra conta');}
  const index=current.accounts.findIndex(item=>normalizeCustomerId(item.customerId)===id),old=index<0?null:current.accounts[index];
  const previous=old?normalizeAccountDomain(old.domain):normalizeAccountDomain(input.legacyDomain),history=old?.history?[...old.history]:[];
  if(previous&&previous!==domain)history.push({domain:previous,endedAtUtc:now,source:old?'association':'legacy-name'});
  const updated={...(old||{}),customerId:id,managerCustomerId:normalizeCustomerId(input.managerCustomerId)||null,accountName:String(input.accountName||old?.accountName||'').slice(0,180),managerName:String(input.managerName||old?.managerName||'').slice(0,180),domain,updatedAtUtc:now,history};
  const accounts=[...current.accounts];if(index<0)accounts.push(updated);else accounts[index]=updated;
  enqueue(ACCOUNT_DOMAINS,JSON.stringify({...current,updatedAtUtc:now,accounts}));await flush();return updated;
 }
 async function saveCampaignHandoff(input,jobId){
  await flush();
  const id=globalThis.crypto.randomUUID();
  const payload=validateGoogleAdsPresellCampaignHandoff({...input,id});
  if(!payload||!jobId||payload.sourceJobId!==String(jobId))throw Error('Transferência inválida');
  const key=HANDOFF_PREFIX+id,selection=lookup(SELECTION),value=JSON.stringify(payload),selected=String(jobId);
  const result=await request('/transaction',{expectedRevision:revision,operations:[
   {type:'local_put',input:{key,value,expectedState:'absent'}},
   {type:'local_put',input:{key:SELECTION,value:selected,expectedState:selection.committed===null?'absent':'present',...(selection.committed===null?{}:{expectedValue:selection.committed})}}
  ]});
  if(!Number.isSafeInteger(result?.revision)||result.results?.length!==2)throw Error('Transferência não confirmada');
  revision=result.revision;states.set(key,{committed:value,value});selection.committed=selected;selection.value=selected;
  return payload;
 }
 async function savePartialBatch(record,job){
  await flush();if(!loaded||!currentScope||!record||typeof record!=='object')throw Error('Falha parcial inválida');
  const draftState=lookup(draftStorageKey(currentScope)),jobState=lookup(JOBS),draft=draftState.value===null?{}:JSON.parse(draftState.value),jobs=jobState.value===null?[]:JSON.parse(jobState.value);
  if(!draft||typeof draft!=='object'||Array.isArray(draft)||!Array.isArray(jobs)||('labPartialBatchFailures' in draft&&!Array.isArray(draft.labPartialBatchFailures)))throw Error('Histórico parcial inválido');
  if(job&&(job.campaignDeliveryId!==currentScope||job.labIncompleteGeneration!==true||!job.id||!Array.isArray(job.targets)||!job.targets.length||jobs.some(item=>item?.id===job.id)))throw Error('Tarefa parcial inválida');
  const nextDraft=JSON.stringify({...draft,labPartialBatchFailures:[...(draft.labPartialBatchFailures||[]),record]}),nextJobs=job?JSON.stringify([...jobs,job]):null;
  const input=(key,state,value)=>({type:'local_put',input:{key,value,expectedState:state.committed===null?'absent':'present',...(state.committed===null?{}:{expectedValue:state.committed})}});
  const operations=[input(draftStorageKey(currentScope),draftState,nextDraft),...(job?[input(JOBS,jobState,nextJobs)]:[])];
  const result=await request('/transaction',{expectedRevision:revision,operations});if(!Number.isSafeInteger(result?.revision)||result.results?.length!==operations.length)throw Error('Falha parcial não confirmada');
  revision=result.revision;draftState.value=draftState.committed=nextDraft;if(job)jobState.value=jobState.committed=nextJobs;
 }
 function getDelivery(id){if(!id)return null;if(!loaded||id!==currentScope)throw Error('Entrega não carregada');return delivery?structuredClone(delivery):null}
 function getAssetPageHandoff(id){
  if(!loaded||id!==currentScope)throw Error('Entrega não carregada');
  const raw=lookup(ASSET_PAGE_CURRENT_PREFIX+id).value;
  if(raw!==null){
   let pointer;try{pointer=JSON.parse(raw)}catch{throw Error('Passagem atual inválida')}
   if(pointer?.campaignDeliveryId!==id||typeof pointer.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(pointer.id))throw Error('Passagem atual inválida');
   const state=states.get(ASSET_PAGE_PREFIX+pointer.id);if(!state)throw Error('Passagem atual não encontrada');
   let selected;try{selected=JSON.parse(state.value)}catch{throw Error('Passagem atual inválida')}
   if(selected?.id!==pointer.id||selected?.campaignDeliveryId!==id)throw Error('Passagem atual não corresponde à entrega');return selected;
  }
  const matching=[];for(const [key,state] of states){if(!key.startsWith(ASSET_PAGE_PREFIX))continue;let value;try{value=JSON.parse(state.value)}catch{throw Error('Passagem de Asset Studio inválida')};if(value?.campaignDeliveryId===id)matching.push(value)}
  if(matching.length>1)throw Error('Mais de uma passagem para esta entrega; revisão necessária');return matching[0]||null;
 }
 async function list(){
  await flush();let revision,offset=0;const rows=[];
  while(offset!==null){
   const input={operations:[{type:'local_list',input:{prefix:STORAGE_KEY,offset,limit:500}}],...(revision===undefined?{}:{expectedRevision:revision})};
   const response=await request('/transaction/read',input),page=response?.results?.[0];
   if(!Number.isSafeInteger(response?.revision)||(revision!==undefined&&revision!==response.revision)||page?.revision!==response.revision||!Array.isArray(page.records)||(page.nextOffset!==null&&(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset)))throw Error('Listagem incompleta');
   revision=response.revision;rows.push(...page.records);if(rows.length>10000)throw Error('Listagem excede limite');offset=page.nextOffset;
  }
  const values=new Map(rows.map(row=>[row.key,row.value])),keys=[...values.keys()];
  return listDrafts({length:keys.length,key:index=>keys[index],getItem:key=>values.get(key)??null});
 }
 return {open,flush,list,storage,getDelivery,getAssetPageHandoff,saveAccountDomain,saveCampaignHandoff,savePartialBatch,isDirty(){return pending>0||!!failure}};
}

