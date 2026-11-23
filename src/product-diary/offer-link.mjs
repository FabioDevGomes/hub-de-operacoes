import {guruMediaOfferUrl} from '../curadoria/gurumedia-offer-link.mjs';
import {clickBankOfferDetailsUrl} from '../curadoria/clickbank-top-offers/clickbank-top-offers-domain.mjs';

export async function campaignOfferSource(snapshot, centralClients) {
  const action=snapshot?.googleAdsCampaignAction||{}, digits=value=>String(value||'').replace(/\D/g,''), customer=digits(action.customerId), manager=digits(action.managerCustomerId), campaign=String(action.campaignId||'');
  if(action.mappingStatus!=='mapped'||!/^\d{10}$/.test(customer)||!/^\d{10}$/.test(manager)||!/^[1-9]\d{0,19}$/.test(campaign))return null;
  const sources=[];
  for(const batch of snapshot?.campaignBatches||[]){
    if(!(batch.campaigns||[]).some(item=>digits(item.managerCustomerId)===manager&&digits(item.customerId)===customer&&String(item.campaignId||'')===campaign))continue;
    const source=batch.formSnapshot?.__hub_campaign_delivery_source;
    if(source?.offerKey&&['GM','CB'].includes(source.platformCode))sources.push(source);
  }
  if(centralClients){
    const {snapshots}=await centralClients.snapshotClient.list();
    for(const copy of snapshots){
      const data=copy?.data||{};
      if(!(data.createdCampaigns||[]).some(item=>digits(item.managerCustomerId)===manager&&digits(item.customerId)===customer&&String(item.campaignId||'')===campaign))continue;
      if(!data.deliveryId)continue;
      const delivery=await centralClients.handoffClient.readDelivery(data.deliveryId);
      if(delivery?.offerKey&&['GM','CB'].includes(delivery.platformCode))sources.push(delivery);
    }
  }
  const keys=new Set(sources.map(source=>`${source.platformCode}:${source.offerKey}`));
  if(keys.size!==1)return null;
  return sources.find(source=>String(source.productName||source.offerName||'').trim())||sources[0];
}

export async function campaignOfferUrl(snapshot, readCaptures, centralClients) {
  const source=await campaignOfferSource(snapshot, centralClients);
  if(!source)return null;
  if(source.platformCode==='GM')return guruMediaOfferUrl(source.offerKey);
  const captures=await readCaptures(),ids=new Set();
  for(const capture of captures||[])for(const offer of capture.offers||[])if(offer.offerKey===source.offerKey&&offer.offerId)ids.add(String(offer.offerId));
  return ids.size===1?clickBankOfferDetailsUrl([...ids][0]):null;
}
