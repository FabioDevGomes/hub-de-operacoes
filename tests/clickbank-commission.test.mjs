import assert from 'node:assert/strict';
import {parseClickBankCommissionUsd,isClickBankCommissionUsd,formatClickBankCommissionUsd} from '../src/campaign-delivery/commission-domain.mjs';
import * as OfferStorage from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs';
import {createCampaignDelivery,getCampaignDelivery,listCampaignDeliveries,updateCampaignDeliveryAssetStudioWork} from '../src/campaign-delivery/delivery-store.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';

assert.equal(parseClickBankCommissionUsd('50,25'),50.25);
assert.equal(parseClickBankCommissionUsd('50.25'),50.25);
assert.equal(parseClickBankCommissionUsd('0'),null);
assert.equal(parseClickBankCommissionUsd('50.256'),null);
assert.equal(parseClickBankCommissionUsd('1.234,56'),null);
assert.equal(parseClickBankCommissionUsd('US$ 50'),null);
assert.equal(isClickBankCommissionUsd(50.25),true);
assert.equal(isClickBankCommissionUsd(50.256),false);
assert.match(formatClickBankCommissionUsd(1234.5),/US\$/);
assert.match(formatClickBankCommissionUsd(1234.5),/1\.234,50/);

const originalIndexedDB=globalThis.indexedDB;
try{
  globalThis.indexedDB=memoryIndexedDB();
  const identity={offerKey:'synthetic::commission',productKey:'commission-product',offerName:'Commission product',seller:'Seller'};
  const original={...identity,manualCountries:['US','CA'],salesPageType:'tsl',brandBidding:'no_brand_bidding',canonicalProductName:'Commission product',affiliateLink:'https://aff.example/track'};
  await OfferStorage.putOfferRecord(OfferStorage.STORES.offerMetadata,original);
  const saved=await OfferStorage.saveCommissionUsd(identity,'42,75');
  assert.equal(saved.commissionUsd,42.75);
  assert.deepEqual(saved.manualCountries,['US','CA']);
  assert.equal(saved.salesPageType,'tsl');
  assert.equal(saved.canonicalProductName,'Commission product');
  assert.equal(saved.affiliateLink,'https://aff.example/track');
  assert.deepEqual(await OfferStorage.getAll(OfferStorage.STORES.offerMetadata),[saved]);
  await assert.rejects(OfferStorage.saveCommissionUsd(identity,'0'),/USD válida/);
}finally{
  if(originalIndexedDB===undefined)delete globalThis.indexedDB;
  else globalThis.indexedDB=originalIndexedDB;
}

const memory=new Map();
const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value))};
const base={offerKey:'synthetic::delivery',offerName:'Delivery offer',productName:'Delivery product',commissionAmountUsd:49.99,countries:['US'],positiveKeywords:['delivery keyword']};
const delivery=createCampaignDelivery(base,storage);
assert.equal(delivery.commissionAmountUsd,49.99);
assert.equal(delivery.commissionCurrency,'USD');
assert.equal(getCampaignDelivery(delivery.id,storage).commissionAmountUsd,49.99);
const updated=updateCampaignDeliveryAssetStudioWork(delivery.id,{productName:'Delivery product',status:'completed'},storage);
assert.equal(updated.commissionAmountUsd,49.99,'a gravação posterior do Asset Studio preserva a comissão da Entrega');
assert.equal(listCampaignDeliveries(storage)[0].commissionCurrency,'USD');
assert.throws(()=>createCampaignDelivery({...base,offerKey:'synthetic::invalid-delivery',productName:'Invalid commission product',commissionAmountUsd:0},storage),/USD/);
const legacy=createCampaignDelivery({offerKey:'synthetic::legacy-delivery',offerName:'Legacy offer',productName:'Legacy product'},storage);
assert.equal(Object.hasOwn(legacy,'commissionAmountUsd'),false,'entregas sem comissão continuam legíveis sem migração retroativa');

console.log('clickbank commission integration ok');
