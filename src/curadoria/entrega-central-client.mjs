// Cliente assíncrono para as telas de curadoria na cópia isolada.
// O chamador deve manter a revisão obtida na leitura e recarregar em caso de conflito.
export function createCurationDeliveryClient(bridge){
 if(typeof bridge?.listDeliveries!=='function'||typeof bridge?.updateDeliveries!=='function'||typeof bridge?.createDelivery!=='function')throw Error('Serviço central de entrega indisponível');
 const platforms=new Set(['GM','CB']);
 function forOffer(snapshot,offerKey,platform){
  if(!Array.isArray(snapshot?.deliveries)||!Number.isSafeInteger(snapshot?.revision)||typeof offerKey!=='string'||!offerKey||!platforms.has(platform))throw Error('Consulta de entrega inválida');
  return snapshot.deliveries.filter(row=>row?.offerKey===offerKey&&(row.platformCode||'CB')===platform);
 }
 async function update(snapshot,offerKey,platform,changes){
  const linked=forOffer(snapshot,offerKey,platform);
  const current=await bridge.listDeliveries();
  if(JSON.stringify(forOffer(current,offerKey,platform))!==JSON.stringify(linked)){const error=Error('A entrega foi alterada em outra sessão; atualize a tela.');error.code='VERSION_CONFLICT';throw error}
  if(!linked.length)return {updated:false};
  if(!changes||typeof changes!=='object'||Array.isArray(changes))throw Error('Alterações inválidas');
  const operations=[];
  if(Object.hasOwn(changes,'countries'))operations.push({operation:'updateCountries',args:[offerKey,changes.countries,platform,changes.geoTargetingMode]});
  if(Object.hasOwn(changes,'positiveKeywords'))operations.push({operation:'updatePositiveKeywords',args:[offerKey,changes.positiveKeywords,platform]});
  if(Object.hasOwn(changes,'negativeKeywords'))operations.push({operation:'updateNegativeKeywords',args:[offerKey,changes.negativeKeywords,changes.negativeKeywordCountries||[],platform]});
  if(Object.hasOwn(changes,'imageSearchTerm'))operations.push({operation:'updateImageSearchTerm',args:[offerKey,changes.imageSearchTerm,platform]});
  if(Object.hasOwn(changes,'commissionAmountUsd'))operations.push({operation:'updateCommission',args:[offerKey,changes.commissionAmountUsd,platform]});
  if(Object.hasOwn(changes,'productName'))operations.push({operation:'updateProductName',args:[offerKey,changes.productName,platform]});
  if(Object.hasOwn(changes,'affiliateUrl'))operations.push({operation:'updateAffiliateUrl',args:[offerKey,changes.affiliateUrl,platform]});
  if(!operations.length)throw Error('Nenhuma alteração de entrega informada');
  return {updated:true,...await bridge.updateDeliveries(current,operations)};
 }
 async function create(input,snapshot){
  if(!snapshot)return bridge.createDelivery(input);
  const current=await bridge.listDeliveries();
  if(JSON.stringify(forOffer(current,input.offerKey,input.platformCode))!==JSON.stringify(forOffer(snapshot,input.offerKey,input.platformCode))){const error=Error('A entrega foi alterada em outra sessão; atualize a tela.');error.code='VERSION_CONFLICT';throw error}
  return bridge.createDelivery(input,current);
 }
 return {list:()=>bridge.listDeliveries(),forOffer,update,create};
}

