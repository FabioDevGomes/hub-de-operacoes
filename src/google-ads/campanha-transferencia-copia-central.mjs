import {GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX,GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY,validateGoogleAdsPresellCampaignHandoff,googleAdsPresellCampaignHandoffFingerprint} from './google-ads-presell-campaign-handoff.mjs';

// A transferência permanece na base central enquanto o recebimento é preparado.
export async function readCentralPresellHandoff(request,id) {
  if(typeof request!=='function'||typeof id!=='string'||!/^[A-Za-z0-9-]{12,80}$/.test(id))throw new Error('Transferência inválida.');
  const result=await request('/transaction/read',{operations:[{type:'local_get',input:{key:GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX+id}}]});
  const row=result?.results?.[0];
  if(!Number.isSafeInteger(result?.revision)||result.results?.length!==1||row?.revision!==result.revision||row.state!=='present'||typeof row.value!=='string')throw new Error('Transferência central indisponível.');
  let payload;try{payload=validateGoogleAdsPresellCampaignHandoff(JSON.parse(row.value))}catch{throw new Error('Transferência central inválida.')}
  if(!payload||payload.id!==id)throw new Error('Transferência central inválida.');
  return {revision:result.revision,payload};
}

// Confirma sem remover a transferência e sem descartar confirmações anteriores.
export async function acknowledgeCentralPresellHandoff(request,payload,now=new Date().toISOString()) {
  const valid=validateGoogleAdsPresellCampaignHandoff(payload);
  if(typeof request!=='function'||!valid?.sourceJobId||!Number.isFinite(Date.parse(now)))throw new Error('Confirmação inválida.');
  const result=await request('/transaction/read',{operations:[{type:'local_get',input:{key:GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY}}]});
  const row=result?.results?.[0];
  if(!Number.isSafeInteger(result?.revision)||result.results?.length!==1||row?.revision!==result.revision||!['present','absent'].includes(row.state)||(row.state==='present'&&typeof row.value!=='string'))throw new Error('Confirmações centrais indisponíveis.');
  let entries={};
  if(row.state==='present'){
    try{entries=JSON.parse(row.value)}catch{throw new Error('Confirmações centrais inválidas.')}
    if(!entries||typeof entries!=='object'||Array.isArray(entries))throw new Error('Confirmações centrais inválidas.');
  }
  const fingerprint=googleAdsPresellCampaignHandoffFingerprint(valid);
  const value=JSON.stringify({...entries,[valid.sourceJobId]:{fingerprint,acknowledgedAt:now}});
  const input={key:GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY,value,expectedState:row.state,...(row.state==='present'?{expectedValue:row.value}:{})};
  const written=await request('/transaction',{expectedRevision:result.revision,operations:[{type:'local_put',input}]});
  if(!Number.isSafeInteger(written?.revision)||written.results?.length!==1||written.results[0]?.revision!==written.revision)throw new Error('Confirmação central não comprovada.');
  return {revision:written.revision,fingerprint};
}
