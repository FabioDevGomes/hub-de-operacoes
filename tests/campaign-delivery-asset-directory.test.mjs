import assert from 'node:assert/strict';
import {getCampaignDelivery,getCampaignDeliveryAssetStudioPageDirectory,updateCampaignDeliveryAssetStudioWork} from '../src/campaign-delivery/delivery-store.mjs';

const delivery={
  productName:'VenoPlus 8',
  assetStudioWork:{
    productName:' VenoPlus   8 ',
    pageAssetsProductName:'VenoPlus 8',
    results:[
      {status:'ok',text:'01.png · salvo'},
      {status:'ok',text:'Diretório da Presell atualizado no Hub: C:\\Users\\Fabio-Vaio\\OneDrive\\tráfego pago\\produtos\\VenoPlus 8\\pag01'}
    ]
  }
};

assert.equal(getCampaignDeliveryAssetStudioPageDirectory(delivery),'C:\\Users\\Fabio-Vaio\\OneDrive\\tráfego pago\\produtos\\VenoPlus 8\\pag01','recupera o diretório registrado em uma conclusão bem-sucedida do Asset Studio');
assert.equal(getCampaignDeliveryAssetStudioPageDirectory({...delivery,assetStudioWork:{...delivery.assetStudioWork,results:[{status:'error',text:delivery.assetStudioWork.results[1].text}]}}),'','não usa um diretório de resultado marcado como falha');
assert.equal(getCampaignDeliveryAssetStudioPageDirectory({...delivery,assetStudioWork:{...delivery.assetStudioWork,productName:'Outro produto'}}),'','não mistura o caminho de outro produto da mesma entrega');
assert.equal(getCampaignDeliveryAssetStudioPageDirectory({...delivery,assetStudioWork:{...delivery.assetStudioWork,pageAssetsProductName:'Outro produto'}}),'','não usa um caminho quando os assets salvos pertencem a outro produto');
assert.equal(getCampaignDeliveryAssetStudioPageDirectory({...delivery,assetStudioWork:{...delivery.assetStudioWork,results:[{status:'ok',text:'Diretório da Presell atualizado no Hub: C:\\Users\\Fabio-Vaio\\produtos\\Outro\\pag01'}]}}),'','confere se a pasta de destino corresponde ao nome do produto');
assert.equal(getCampaignDeliveryAssetStudioPageDirectory({...delivery,assetStudioWork:{...delivery.assetStudioWork,pageDirectory:'C:\\Users\\Fabio-Vaio\\produtos\\VenoPlus 8\\pag01',results:[]}}),'C:\\Users\\Fabio-Vaio\\produtos\\VenoPlus 8\\pag01','aceita o campo estruturado para compatibilidade com registros futuros');

const key='hub:campaign-delivery:records:v1',records=new Map([[key,JSON.stringify([{id:'delivery-favicon',productName:'Synthetic product',assetStudioWork:{status:'completed'}}])]]);
const storage={getItem:name=>records.get(name)||null,setItem:(name,value)=>records.set(name,value)};
updateCampaignDeliveryAssetStudioWork('delivery-favicon',{skipFavicon:true},storage);
assert.equal(getCampaignDelivery('delivery-favicon',storage)?.assetStudioWork?.skipFavicon,true,'a decisão Sem favicon fica salva na entrega');
updateCampaignDeliveryAssetStudioWork('delivery-favicon',{productName:'Synthetic product'},storage);
assert.equal(getCampaignDelivery('delivery-favicon',storage)?.assetStudioWork?.skipFavicon,true,'gravações posteriores preservam a decisão quando não a alteram');
updateCampaignDeliveryAssetStudioWork('delivery-favicon',{skipFavicon:false},storage);
assert.equal(getCampaignDelivery('delivery-favicon',storage)?.assetStudioWork?.skipFavicon,false,'a decisão de exigir favicon também pode ser persistida');

console.log('campaign-delivery-asset-directory.test.mjs: ok');
