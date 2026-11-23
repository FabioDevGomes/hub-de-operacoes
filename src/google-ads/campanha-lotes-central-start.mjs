import {createCampaignBatchesLab} from './campanha-lotes-central-lab.mjs';

export async function prepareCentralCampaignBatches({fetchImpl=globalThis.fetch}={}) {
  const request=async(path,input)=>{
    const response=await fetchImpl('/central'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    if(!response.ok){const error=new Error(response.status===409?'Lote alterado em outra sessão.':'Serviço central indisponível.');if(response.status===409)error.code='VERSION_CONFLICT';throw error}
    return response.json();
  };
  const bridge=createCampaignBatchesLab({request});
  return {bridge,store:await bridge.read()};
}
