import {GOOGLE_ADS_CAMPAIGN_DRAFTS_STORAGE_KEY as KEY,loadGoogleAdsCampaignDrafts,mergeGoogleAdsCampaignDraftValues} from './google-ads-campaign-drafts-storage.mjs';
import {GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY as CONTEXT_KEY,loadGoogleAdsCampaignActiveContext} from './google-ads-campaign-active-context-storage.mjs';

// A interface experimental só confirma uma gravação depois da resposta central.
export function createCampaignDraftsLab({request}){
 if(typeof request!=='function')throw Error('Serviço indisponível');
 let snapshot=null;
 async function read(photograph=null){
  snapshot=null;
  const response=photograph?{revision:photograph.revision,results:[KEY,CONTEXT_KEY].map(key=>({...photograph.entries.find(row=>row.key===key),revision:photograph.revision}))}:await request('/transaction/read',{operations:[{type:'local_get',input:{key:KEY}},{type:'local_get',input:{key:CONTEXT_KEY}}]});
  const row=response?.results?.[0];
  const contextRow=response?.results?.[1];if(!Number.isSafeInteger(response?.revision)||response.results?.length!==2||[row,contextRow].some(item=>item?.revision!==response.revision||!['present','absent'].includes(item?.state)))throw Error('Rascunhos indisponíveis');
  const raw=row.state==='present'?row.value:null;
  const contextRaw=contextRow.state==='present'?contextRow.value:null;loadGoogleAdsCampaignActiveContext({storage:{getItem:()=>contextRaw}});
  loadGoogleAdsCampaignDrafts({storage:{getItem:()=>raw}});
  const value=raw===null?{schemaVersion:1,activeDraftId:'',drafts:[]}:JSON.parse(raw);
  const ids=new Set();for(const draft of value.drafts){if(ids.has(draft.id))throw Error('Rascunhos ambíguos');ids.add(draft.id)}
  snapshot={revision:response.revision,raw,value,contextRaw};return structuredClone(value);
 }
 async function saveDraft(draft,{representedNames=null}={}){
  if(!snapshot)throw Error('Rascunhos não carregados');
  if(!draft||typeof draft.id!=='string'||!draft.id||typeof draft.createdAt!=='string'||typeof draft.updatedAt!=='string'||!draft.values||typeof draft.values!=='object'||Array.isArray(draft.values))throw Error('Rascunho inválido');
  const {value,raw,revision,contextRaw}=snapshot,index=value.drafts.findIndex(item=>item.id===draft.id),drafts=[...value.drafts];
  if(representedNames!==null&&(!Array.isArray(representedNames)||representedNames.some(name=>typeof name!=='string'||!name)))throw Error('Campos representados inválidos');
  if(index>=0){const previous=String(drafts[index].values?.__hub_campaign_delivery_source?.deliveryId||''),next=String(draft.values?.__hub_campaign_delivery_source?.deliveryId||'');if(previous&&(Object.hasOwn(draft.values,'__hub_campaign_delivery_source')||representedNames?.includes('__hub_campaign_delivery_source'))&&previous!==next)throw Error('Rascunho já vinculado a outra entrega');}
  if(index<0)drafts.push(structuredClone(draft));else{const old=drafts[index];drafts[index]={...old,...draft,createdAt:old.createdAt,values:representedNames===null?{...old.values,...draft.values}:mergeGoogleAdsCampaignDraftValues(old.values,draft.values,representedNames)}}
  const next={...value,activeDraftId:draft.id,drafts},input={key:KEY,value:JSON.stringify(next),expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};
  const context=JSON.stringify({...((contextRaw===null)?{}:JSON.parse(contextRaw)),schemaVersion:1,type:'draft',id:draft.id});
  const contextInput={key:CONTEXT_KEY,value:context,expectedState:contextRaw===null?'absent':'present',...(contextRaw===null?{}:{expectedValue:contextRaw})};
  snapshot=null;
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input},{type:'local_put',input:contextInput}]});
  if(!Number.isSafeInteger(result?.revision))throw Error('Gravação não confirmada');
  snapshot={revision:result.revision,raw:input.value,value:next,contextRaw:context};return structuredClone(drafts[index<0?drafts.length-1:index]);
 }
 async function selectDraft(id){
  if(!snapshot)throw Error('Rascunhos não carregados');
  const {value,raw,revision,contextRaw}=snapshot;if(!value.drafts.some(draft=>draft.id===id))throw Error('Rascunho não encontrado');
  const next={...value,activeDraftId:id},input={key:KEY,value:JSON.stringify(next),expectedState:raw===null?'absent':'present',...(raw===null?{}:{expectedValue:raw})};snapshot=null;
  const context=JSON.stringify({...((contextRaw===null)?{}:JSON.parse(contextRaw)),schemaVersion:1,type:'draft',id});
  const contextInput={key:CONTEXT_KEY,value:context,expectedState:contextRaw===null?'absent':'present',...(contextRaw===null?{}:{expectedValue:contextRaw})};
  const result=await request('/transaction',{expectedRevision:revision,operations:[{type:'local_put',input},{type:'local_put',input:contextInput}]});
  if(!Number.isSafeInteger(result?.revision))throw Error('Seleção não confirmada');snapshot={revision:result.revision,raw:input.value,value:next,contextRaw:context};return structuredClone(next.drafts.find(draft=>draft.id===id));
 }
 function context(){if(!snapshot)throw Error('Rascunhos não carregados');return loadGoogleAdsCampaignActiveContext({storage:{getItem:()=>snapshot.contextRaw}})}
 return {read,saveDraft,selectDraft,context};
}
