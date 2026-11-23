import {createCampaignSnapshotClient} from './campanha-copia-central.mjs';
import {readCentralPresellHandoff,acknowledgeCentralPresellHandoff} from './campanha-transferencia-copia-central.mjs';
import {readGoogleAdsPresellCampaignHandoffForJob} from './google-ads-presell-url-bridge.mjs';

// Apenas prepara o cliente; o chamador decide quando habilitar a montagem.
export function prepareCampaignCentralClients({fetchImpl=globalThis.fetch}={}) {
  if(typeof fetchImpl!=='function')throw new Error('Serviço central indisponível.');
  const request=async(path,input)=>{
    const response=await fetchImpl('/central'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    if(!response.ok){const error=new Error(response.status===409?'A cópia mudou; recarregue antes de salvar.':'Serviço central indisponível.');if(response.status===409)error.code='VERSION_CONFLICT';throw error}
    return response.json();
  };
  async function readDeliveryForHandoff(payload, deliveryId) {
    if(!deliveryId)return null;
    const result=await request('/transaction/read',{operations:[{type:'local_get',input:{key:'hub:presell-deploy-jobs:v1'}},{type:'delivery_get',input:{id:deliveryId}}]});
    if(!Number.isSafeInteger(result?.revision)||result.results?.length!==2||result.results.some(row=>row.revision!==result.revision))throw Error('Não foi possível conferir a entrega vinculada.');
    const [jobsRow,deliveryRow]=result.results;
    let jobs;try{jobs=JSON.parse(jobsRow.value)}catch{throw Error('Lotes de hospedagem indisponíveis.')}
    const job=Array.isArray(jobs)?jobs.find(item=>item.id===payload.sourceJobId):null;
    if(!job||job.campaignDeliveryId!==deliveryId||deliveryRow.state!=='present'||deliveryRow.value?.id!==deliveryId)throw Error('A entrega não corresponde ao lote recebido.');
    return deliveryRow.value;
  }
  async function readDelivery(id) {
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(id))throw Error('Identificador de entrega inválido.');
    const result=await request('/transaction/read',{operations:[{type:'delivery_get',input:{id}}]});
    const row=result?.results?.[0];
    if(!Number.isSafeInteger(result?.revision)||result.results?.length!==1||row?.revision!==result.revision||row.state!=='present'||row.value?.id!==id)throw Error('Entrega central não encontrada.');
    return row.value;
  }
  async function readSelectedHandoffForDelivery(deliveryId) {
    const result=await request('/transaction/read',{operations:[{type:'local_get',input:{key:'hub:presell-deploy-jobs:v1'}},{type:'local_get',input:{key:'hub:presell-campaign-handoff-selected-job:v1'}}]});
    if(!Number.isSafeInteger(result?.revision)||result.results?.length!==2||result.results.some(row=>row.revision!==result.revision))throw Error('Lote de hospedagem indisponível.');
    const [jobsRow,selection]=result.results;
    if(selection.state==='absent')return null;
    if(jobsRow.state!=='present'||selection.state!=='present'||typeof jobsRow.value!=='string'||typeof selection.value!=='string')throw Error('Lote de hospedagem inválido.');
    let jobs;try{jobs=JSON.parse(jobsRow.value)}catch{throw Error('Lote de hospedagem inválido.')}
    const job=Array.isArray(jobs)?jobs.find(item=>item.id===selection.value):null;
    if(!job||job.campaignDeliveryId!==deliveryId)return null;
    const handoff=readGoogleAdsPresellCampaignHandoffForJob(job.id,{storage:{getItem:()=>jobsRow.value}});
    return handoff.ok?handoff.payload:null;
  }
  return {snapshotClient:createCampaignSnapshotClient({request}),handoffClient:{read:id=>readCentralPresellHandoff(request,id),acknowledge:payload=>acknowledgeCentralPresellHandoff(request,payload),readDeliveryForHandoff,readDelivery,readSelectedHandoffForDelivery}};
}
export function prepareCampaignSnapshotClient(options={}) {return prepareCampaignCentralClients(options).snapshotClient;}
