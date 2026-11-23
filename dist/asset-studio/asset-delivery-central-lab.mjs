// Cliente assíncrono de entrega para o Asset Studio isolado.
// Não utiliza armazenamento local nem reexecuta operações após conflito.
export function createAssetDeliveryLabClient({request}){
 if(typeof request!=='function')throw Error('Serviço de entrega indisponível');
 let observed=new Map();
 async function list(){
  const response=await request('/transaction/read',{operations:[{type:'delivery_list',input:{}}]});
  const result=response?.results?.[0];
  if(!Number.isSafeInteger(response?.revision)||result?.revision!==response.revision||result?.state!=='present'||!Array.isArray(result.value))throw Error('Resposta de entregas inválida');
  observed=new Map(result.value.map(record=>[record.id,JSON.stringify(record)]));return result.value;
 }
 async function change(id,operation,args){
  if(typeof id!=='string'||!id||!observed.has(id))throw Error('Atualize a entrega antes de salvá-la');
  const response=await request('/transaction/read',{operations:[{type:'delivery_get',input:{id}}]});
  const item=response?.results?.[0];
  if(!Number.isSafeInteger(response?.revision)||item?.revision!==response.revision||item.state!=='present'||!item.value)throw Error('Entrega indisponível');
  if(JSON.stringify(item.value)!==observed.get(id)){const error=Error('Entrega alterada em outra sessão; atualize a tela.');error.code='VERSION_CONFLICT';throw error}
  const saved=await request('/transaction',{expectedRevision:response.revision,operations:[{type:'delivery_operation',input:{operation,args}}]});
  const result=saved?.results?.[0]?.result;
  if(!Number.isSafeInteger(saved?.revision)||!result||result.id!==id)throw Error('Confirmação de entrega inválida');
  observed.set(id,JSON.stringify(result));return result;
 }
 return {
  listCampaignDeliveries:list,
  updateCampaignDeliveryAssetStudioWork:(id,work)=>change(id,'updateAssetWork',[id,work]),
  markCampaignDeliveryOpened:(id,stage)=>change(id,'markOpened',[id,stage]),
 };
}

