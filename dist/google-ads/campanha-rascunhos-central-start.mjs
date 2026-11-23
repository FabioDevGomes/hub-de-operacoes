import {createCampaignDraftsLab} from './campanha-rascunhos-central-lab.mjs';
import {createOperationalDraftController} from './campanha-operacional-rascunhos-central.mjs';

export async function prepareCentralCampaignDrafts({fetchImpl=globalThis.fetch,createId=()=>crypto.randomUUID()}={}) {
  const request=async(path,input)=>{
    const response=await fetchImpl('/central'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    if(!response.ok){const error=new Error(response.status===409?'Rascunho alterado em outra sessão.':'Serviço central indisponível.');if(response.status===409)error.code='VERSION_CONFLICT';throw error}
    return response.json();
  };
  const bridge=createCampaignDraftsLab({request});
  const controller=createOperationalDraftController({bridge,createId});
  const {store}=await controller.open();
  return {store,controller,context:bridge.context()};
}
