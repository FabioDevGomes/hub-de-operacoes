// Passagens por entrega são aditivas; apenas dados do laboratório.
export const ASSET_PAGE_PREFIX='hub:asset-studio:page-handoff:v1:';
export const ASSET_PAGE_CURRENT_PREFIX='hub:asset-studio:page-current:v1:';
export async function publishGeneratedPageLab({result,productName,deliveryId,bridge,id=crypto.randomUUID(),now=new Date().toISOString()}){
 if(!result?.directory||!bridge?.write)throw Error('Passagem central indisponível.');
 const handoff={id,directory:result.directory,productName:result.productName||productName,pageFolder:result.pageFolder||'pag01',generatedAtUtc:now,campaignDeliveryId:deliveryId};
 await bridge.write(handoff);return handoff;
}
export function createAssetPageHandoffLab({request}){
 if(typeof request!=='function')throw Error('Serviço indisponível');
 return {
  async write(handoff){
   if(!handoff||typeof handoff.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(handoff.id)||typeof handoff.campaignDeliveryId!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(handoff.campaignDeliveryId)||typeof handoff.productName!=='string'||!handoff.productName.trim()||typeof handoff.directory!=='string'||!handoff.directory.trim())throw Error('Passagem incompleta');
   const key=ASSET_PAGE_PREFIX+handoff.id,value=JSON.stringify(handoff),pointerKey=ASSET_PAGE_CURRENT_PREFIX+handoff.campaignDeliveryId;
   const snapshot=await request('/transaction/read',{operations:[{type:'local_get',input:{key}},{type:'delivery_get',input:{id:handoff.campaignDeliveryId}},{type:'local_get',input:{key:pointerKey}}]});
   if(!Number.isSafeInteger(snapshot?.revision)||snapshot.results?.length!==3||snapshot.results.some(row=>row.revision!==snapshot.revision))throw Error('Fontes indisponíveis');
   const [current,delivery,pointer]=snapshot.results;
   if(delivery.state!=='present'||String(delivery.value?.id)!==handoff.campaignDeliveryId)throw Error('Entrega não encontrada');
   const normalized=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
   if(normalized(delivery.value.productName)!==normalized(handoff.productName))throw Error('Produto não corresponde à entrega');
   if(current.state==='present'){if(current.value===value)return;throw Error('Identificador de passagem já utilizado')}
   if(current.state!=='absent')throw Error('Passagem indisponível');
   if(!['present','absent'].includes(pointer.state))throw Error('Passagem atual indisponível');
   if(pointer.state==='present'){let prior;try{prior=JSON.parse(pointer.value)}catch{throw Error('Passagem atual inválida')};if(prior?.campaignDeliveryId!==handoff.campaignDeliveryId||typeof prior.id!=='string'||!prior.id)throw Error('Passagem atual inválida')}
   const pointerValue=JSON.stringify({id:handoff.id,campaignDeliveryId:handoff.campaignDeliveryId});
   const saved=await request('/transaction',{expectedRevision:snapshot.revision,operations:[{type:'local_put',input:{key,value,expectedState:'absent'}},{type:'local_put',input:{key:pointerKey,value:pointerValue,expectedState:pointer.state,...(pointer.state==='present'?{expectedValue:pointer.value}:{})}}]});
   if(!Number.isSafeInteger(saved?.revision)||saved.results?.length!==2)throw Error('Passagem não confirmada');
  }
 };
}

