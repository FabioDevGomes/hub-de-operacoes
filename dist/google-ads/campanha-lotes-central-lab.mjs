import {GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY as KEY,loadGoogleAdsCampaignBatches,appendGoogleAdsCampaignToBatch,confirmGoogleAdsCampaignBatchStep} from './google-ads-campaign-batches-storage.mjs';
import {GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY as CONTEXT,loadGoogleAdsCampaignActiveContext} from './google-ads-campaign-active-context-storage.mjs';

// Fonte central experimental. A inclusão é aditiva e não normaliza registros anteriores.
export function createCampaignBatchesLab({request}){
 if(typeof request!=='function')throw Error('Serviço indisponível');let snapshot=null;
 async function read(photograph=null){
  snapshot=null;const keys=[KEY,CONTEXT],response=photograph?{revision:photograph.revision,results:keys.map(key=>({...photograph.entries.find(row=>row.key===key),revision:photograph.revision}))}:await request('/transaction/read',{operations:keys.map(key=>({type:'local_get',input:{key}}))});const [row,contextRow]=response?.results||[];
  if(!Number.isSafeInteger(response?.revision)||response.results?.length!==2||[row,contextRow].some(item=>item?.revision!==response.revision||!['present','absent'].includes(item?.state)))throw Error('Lotes indisponíveis');
  const raw=row.state==='present'?row.value:null,contextRaw=contextRow.state==='present'?contextRow.value:null;loadGoogleAdsCampaignBatches({storage:{getItem:()=>raw}});loadGoogleAdsCampaignActiveContext({storage:{getItem:()=>contextRaw}});
  const value=raw===null?{schemaVersion:1,batches:[]}:JSON.parse(raw);snapshot={revision:response.revision,raw,value,contextRaw};return structuredClone(value);
 }
 async function saveSnapshot(batch){
  if(!snapshot)throw Error('Lotes não carregados');
  const {raw,value,revision,contextRaw}=snapshot;
  if(!batch||typeof batch.id!=='string'||!batch.id||!Array.isArray(batch.campaigns))throw Error('Lote inválido');
  const index=value.batches.findIndex(item=>item.id===batch.id),old=index<0?null:value.batches[index];
  const previousDelivery=String(old?.formSnapshot?.__hub_campaign_delivery_source?.deliveryId||'');
  const nextForm=batch.formSnapshot;
  if(previousDelivery&&nextForm!=null&&(typeof nextForm!=='object'||Array.isArray(nextForm)))throw Error('Dados da entrega do lote inválidos');
  if(previousDelivery&&nextForm&&typeof nextForm==='object'&&Object.hasOwn(nextForm,'__hub_campaign_delivery_source')&&String(nextForm.__hub_campaign_delivery_source?.deliveryId||'')!==previousDelivery)throw Error('Lote já vinculado a outra entrega');
  const key=campaign=>String(campaign.customerId)+':'+String(campaign.campaignId);
  const incoming=new Map(batch.campaigns.map(campaign=>[key(campaign),campaign]));
  if(incoming.size!==batch.campaigns.length||old?.campaigns.some(campaign=>!incoming.has(key(campaign))))throw Error('A atualização não preserva todas as campanhas do lote');
  if(old?.campaigns.some(campaign=>{
   const next=incoming.get(key(campaign));
   return String(next?.managerCustomerId)!==String(campaign.managerCustomerId)||String(next?.campaignName)!==String(campaign.campaignName);
  }))throw Error('A identificação de uma campanha diverge do lote salvo');
  for(const field of ['workflowConfirmationHistory','imageUploadConfirmationHistory']){
   const previous=old?.[field];if(previous!==undefined&&(!Array.isArray(previous)||!Array.isArray(batch[field])||previous.some((entry,i)=>JSON.stringify(entry)!==JSON.stringify(batch[field][i]))))throw Error('A atualização não preserva o histórico do lote');
  }
  const oldCampaigns=new Map((old?.campaigns||[]).map(campaign=>[key(campaign),campaign]));
  const nextBatch={...old,...structuredClone(batch),campaigns:batch.campaigns.map(campaign=>({...oldCampaigns.get(key(campaign)),...structuredClone(campaign)}))};
  if(old?.formSnapshot){
   if(nextBatch.formSnapshot==null)nextBatch.formSnapshot=structuredClone(old.formSnapshot);
   else if(typeof nextBatch.formSnapshot==='object'&&!Array.isArray(nextBatch.formSnapshot))nextBatch.formSnapshot={...old.formSnapshot,...nextBatch.formSnapshot};
  }
  const batches=[...value.batches];if(index<0)batches.push(nextBatch);else batches[index]=nextBatch;
  const next={...value,batches},serialized=JSON.stringify(next);loadGoogleAdsCampaignBatches({storage:{getItem:()=>serialized}});
  const context=JSON.stringify({...((contextRaw===null)?{}:JSON.parse(contextRaw)),schemaVersion:1,type:'batch',id:batch.id});
  const expected=(key,previous,value)=>({key,value,expectedState:previous===null?'absent':'present',...(previous===null?{}:{expectedValue:previous})});
  snapshot=null;
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input:expected(KEY,raw,serialized)},{type:'local_put',input:expected(CONTEXT,contextRaw,context)}]});
  if(!Number.isSafeInteger(result?.revision))throw Error('Lote não confirmado');
  snapshot={revision:result.revision,raw:serialized,value:next,contextRaw:context};return structuredClone(nextBatch);
 }
 async function add(batch){
  if(!snapshot)throw Error('Lotes não carregados');const {raw,value,revision,contextRaw}=snapshot;
  if(!batch||value.batches.some(item=>item.id===batch.id))throw Error('Lote já existe ou é inválido');
  const next={...value,batches:[...value.batches,structuredClone(batch)]},serialized=JSON.stringify(next);
  loadGoogleAdsCampaignBatches({storage:{getItem:()=>serialized}});
  const input={key:KEY,value:serialized,expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};snapshot=null;
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input}]});if(!Number.isSafeInteger(result?.revision))throw Error('Lote não confirmado');
  snapshot={revision:result.revision,raw:serialized,value:next,contextRaw};return structuredClone(batch);
 }
 async function appendCampaign(id,campaign){
  if(!snapshot)throw Error('Lotes não carregados');const {raw,value,revision,contextRaw}=snapshot,index=value.batches.findIndex(item=>item.id===id);if(index<0)throw Error('Lote não encontrado');
  let candidateRaw=null;const storage={getItem:()=>raw,setItem:(_key,value)=>{candidateRaw=value}};
  appendGoogleAdsCampaignToBatch(id,campaign,{storage});if(candidateRaw===null)return structuredClone(value.batches[index]);
  const old=value.batches[index],candidate=JSON.parse(candidateRaw).batches.find(item=>item.id===id);
  if(!candidate||candidate.campaigns.length!==old.campaigns.length+1||!Array.isArray(old.imageUploadConfirmationHistory??[]))throw Error('Atualização de lote não preserva os dados');
  const nextBatch={...old,updatedAt:candidate.updatedAt,imageUploadConfirmationHistory:candidate.imageUploadConfirmationHistory,imageUploadConfirmed:false,imageUploadConfirmedAccountIds:[],campaigns:[...old.campaigns,candidate.campaigns.at(-1)]};
  const batches=[...value.batches];batches[index]=nextBatch;const next={...value,batches},serialized=JSON.stringify(next);loadGoogleAdsCampaignBatches({storage:{getItem:()=>serialized}});
  const input={key:KEY,value:serialized,expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};snapshot=null;
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input}]});if(!Number.isSafeInteger(result?.revision))throw Error('Lote não confirmado');snapshot={revision:result.revision,raw:serialized,value:next,contextRaw};return structuredClone(nextBatch);
 }
 async function confirmStep(id,step,campaignSet){
  if(!snapshot)throw Error('Lotes não carregados');const {raw,value,revision,contextRaw}=snapshot,index=value.batches.findIndex(item=>item.id===id);if(index<0)throw Error('Lote não encontrado');
  let candidateRaw=null;confirmGoogleAdsCampaignBatchStep(id,step,campaignSet,{storage:{getItem:()=>raw,setItem:(_key,value)=>{candidateRaw=value}}});
  const old=value.batches[index],candidate=JSON.parse(candidateRaw).batches.find(item=>item.id===id),oldHistory=old.workflowConfirmationHistory??[];
  if(!Array.isArray(oldHistory)||!Array.isArray(candidate?.workflowConfirmationHistory)||candidate.workflowConfirmationHistory.length!==oldHistory.length+1)throw Error('Histórico de lote inválido');
  const nextBatch={...old,updatedAt:candidate.updatedAt,workflowConfirmationHistory:[...oldHistory,candidate.workflowConfirmationHistory.at(-1)],workflowConfirmations:{...(old.workflowConfirmations||{}),[step]:candidate.workflowConfirmations[step]}};
  const batches=[...value.batches];batches[index]=nextBatch;const next={...value,batches},serialized=JSON.stringify(next);loadGoogleAdsCampaignBatches({storage:{getItem:()=>serialized}});
  const input={key:KEY,value:serialized,expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};snapshot=null;
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input}]});if(!Number.isSafeInteger(result?.revision))throw Error('Confirmação não salva');snapshot={revision:result.revision,raw:serialized,value:next,contextRaw};return structuredClone(nextBatch);
 }
 async function select(id){
  if(typeof id!=='string'||!id)throw Error('Lote inválido');snapshot=null;
  const response=await request('/transaction/read',{operations:[{type:'local_get',input:{key:KEY}},{type:'local_get',input:{key:CONTEXT}}]});
  const [batchRow,contextRow]=response?.results||[];if(!Number.isSafeInteger(response?.revision)||response.results?.length!==2||[batchRow,contextRow].some(row=>row?.revision!==response.revision||!['present','absent'].includes(row?.state)))throw Error('Fontes indisponíveis');
  const raw=batchRow.state==='present'?batchRow.value:null,contextRaw=contextRow.state==='present'?contextRow.value:null;
  loadGoogleAdsCampaignBatches({storage:{getItem:()=>raw}});loadGoogleAdsCampaignActiveContext({storage:{getItem:()=>contextRaw}});
  const value=raw===null?{schemaVersion:1,batches:[]}:JSON.parse(raw),batch=value.batches.find(item=>item.id===id);if(!batch)throw Error('Lote não encontrado');
  const context=JSON.stringify({...((contextRaw===null)?{}:JSON.parse(contextRaw)),schemaVersion:1,type:'batch',id});
  const input={key:CONTEXT,value:context,expectedState:contextRaw===null?'absent':'present',...(contextRaw===null?{}:{expectedValue:contextRaw})};
  const result=await request('/transaction',{expectedRevision:response.revision,operations:[{type:'local_put',input}]});if(!Number.isSafeInteger(result?.revision))throw Error('Seleção não confirmada');
  snapshot={revision:result.revision,raw,value,contextRaw:context};return structuredClone(batch);
 }
 async function newContext(){
  snapshot=null;const response=await request('/transaction/read',{operations:[{type:'local_get',input:{key:CONTEXT}}]}),row=response?.results?.[0];
  if(!Number.isSafeInteger(response?.revision)||response.results?.length!==1||row?.revision!==response.revision||!['present','absent'].includes(row?.state))throw Error('Contexto indisponível');
  const raw=row.state==='present'?row.value:null;loadGoogleAdsCampaignActiveContext({storage:{getItem:()=>raw}});
  const value=JSON.stringify({...((raw===null)?{}:JSON.parse(raw)),schemaVersion:1,type:'new'}),input={key:CONTEXT,value,expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};
  const result=await request('/transaction',{expectedRevision:response.revision,operations:[{type:'local_put',input}]});if(!Number.isSafeInteger(result?.revision))throw Error('Contexto não confirmado');return true;
 }
 return {read,add,appendCampaign,confirmStep,select,newContext,saveSnapshot};
}
