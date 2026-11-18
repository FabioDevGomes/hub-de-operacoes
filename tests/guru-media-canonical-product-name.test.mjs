import assert from 'node:assert/strict';
import { memoryIndexedDB } from './helpers/manual-memory-idb.mjs';
import * as OfferStorage from '../src/curadoria/top-performance/top-performance-storage.mjs';
import { buildGuruMediaDeliveryData } from '../src/curadoria/top-performance/guru-media-delivery-domain.mjs';
import { saveGuruMediaAffiliateUrl, saveGuruMediaCanonicalProductName, startGuruMediaCampaignDelivery } from '../src/curadoria/top-performance/guru-media-campaign-delivery.mjs';
import { createCampaignDelivery, getCampaignDelivery, updateCampaignDeliveryAssetStudioWork } from '../src/campaign-delivery/delivery-store.mjs';

const previousIndexedDB = globalThis.indexedDB;
const previousWindow = globalThis.window;
const local = new Map();
const localStorage = { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)) };

try {
  globalThis.indexedDB = memoryIndexedDB();
  globalThis.window = { localStorage, dispatchEvent() {} };

  const offer = { offerId: '33109', productName: 'Nutrova ClearVue Plus', payout: { currency: 'USD', value: 110 }, manualCountries: ['US'] };
  await OfferStorage.put(OfferStorage.STORES.offers, offer);
  await OfferStorage.put(OfferStorage.STORES.trends, { offerId: '33109', pageDraft: { countries: ['US'] }, keywordCandidates: ['[clearvue]'] });
  await assert.rejects(startGuruMediaCampaignDelivery('33109'), /link de afiliado.*obrigatório|link de afiliado.*antes de iniciar ou continuar/u);
  assert.equal(localStorage.getItem('hub:campaign-delivery:records:v1'), null, 'sem link de afiliado, a entrega não é criada');
  const saved = await saveGuruMediaCanonicalProductName('33109', 'ClearVue Plus');
  assert.equal(saved.offer.canonicalProductName, 'ClearVue Plus');
  assert.equal(saved.offer.payout.value, 110);
  assert.deepEqual(saved.offer.manualCountries, ['US']);

  const data = buildGuruMediaDeliveryData({ offer: saved.offer, trendsRecord: { pageDraft: { countries: ['US'] }, keywordCandidates: ['[clearvue]'] }, imagesRecord: {} });
  assert.equal(data.productName, 'ClearVue Plus');
  assert.equal(data.offerName, 'Nutrova ClearVue Plus · #33109');
  assert.deepEqual(data.positiveKeywords, ['[clearvue]']);
  const delivery = createCampaignDelivery({ ...data, commissionAmountUsd: 110 }, localStorage);
  const progressed = updateCampaignDeliveryAssetStudioWork(delivery.id, { productName: delivery.productName, status: 'completed' }, localStorage);
  const renamed = await saveGuruMediaCanonicalProductName('33109', 'ClearVue Plus Dental');
  const updated = getCampaignDelivery(delivery.id, localStorage);
  assert.equal(renamed.deliveriesUpdated, 1);
  assert.equal(updated.productName, 'ClearVue Plus Dental');
  assert.equal(updated.offerName, delivery.offerName);
  assert.equal(updated.commissionAmountUsd, 110);
  assert.deepEqual(updated.countries, delivery.countries);
  assert.deepEqual(updated.positiveKeywords, delivery.positiveKeywords);
  assert.deepEqual(updated.assetStudioWork, progressed.assetStudioWork);

  const affiliateSaved = await saveGuruMediaAffiliateUrl('33109', ' https://aff.example/offer?click=33109 ');
  assert.equal(affiliateSaved.offer.affiliateUrl, 'https://aff.example/offer?click=33109');
  assert.equal(affiliateSaved.deliveriesUpdated, 1);
  const linkedAffiliate = getCampaignDelivery(delivery.id, localStorage);
  assert.equal(linkedAffiliate.affiliateUrl, 'https://aff.example/offer?click=33109');
  assert.deepEqual(linkedAffiliate.assetStudioWork, updated.assetStudioWork);
  assert.deepEqual(linkedAffiliate.openedAt, updated.openedAt);
  assert.equal((await startGuruMediaCampaignDelivery('33109')).id, delivery.id, 'a entrega existente só pode ser retomada depois que a Curadoria salvar o link');

  createCampaignDelivery({ platformCode: 'GM', offerKey: 'another-offer', offerName: 'Other offer', productName: 'Other product', countries: ['US'] }, localStorage);
  await assert.rejects(saveGuruMediaCanonicalProductName('33109', 'Other product'), /outra oferta/);
  assert.equal((await OfferStorage.getByKey(OfferStorage.STORES.offers, '33109')).canonicalProductName, 'ClearVue Plus Dental');
  await assert.rejects(saveGuruMediaCanonicalProductName('33109', 'x'.repeat(101)), /até 100 caracteres/);
  await assert.rejects(saveGuruMediaAffiliateUrl('33109', 'javascript:alert(1)'), /URL HTTP ou HTTPS válida/);
} finally {
  if (previousIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

console.log('guru media canonical product name integration ok');
