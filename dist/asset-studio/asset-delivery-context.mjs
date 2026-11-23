// No modo central, uma captura só pode ser restaurada na entrega a que pertence.
export function assertAssetDeliveryContext(record,deliveryId){
 if(!record||typeof deliveryId!=='string'||!deliveryId||record.campaignDeliveryId!==deliveryId)throw Error('A captura não está vinculada à entrega selecionada.');
 return true;
}

