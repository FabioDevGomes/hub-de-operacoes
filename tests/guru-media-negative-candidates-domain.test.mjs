import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  globalCandidatesFromImageRecord,
  planAddCandidates,
} from '../src/curadoria/top-performance/guru-media-negative-candidates-domain.mjs';
import { createGuruMediaNegativeCandidatesController } from '../src/curadoria/top-performance/guru-media-negative-candidates-controller.mjs';
import { buildGuruMediaDeliveryData } from '../src/curadoria/top-performance/guru-media-delivery-domain.mjs';
import {
  CAMPAIGN_DELIVERY_STORAGE_KEY,
  createCampaignDelivery,
  getCampaignDeliveriesForOffer,
  updateCampaignDeliveryNegativeKeywordsForOffer,
} from '../src/campaign-delivery/delivery-store.mjs';

const legacyRecord = {
  assessments: [
    { country: 'US', capturedAt: '2026-10-01T10:00:00Z', negativeKeywordCandidates: ['old us'] },
    { country: 'CA', capturedAt: '2026-10-02T10:00:00Z', relatedProducts: ['shared term', 'canada term'] },
    { country: 'US', capturedAt: '2026-10-03T10:00:00Z', negativeKeywordCandidates: ['new us', 'shared term'] },
  ],
};
assert.deepEqual(globalCandidatesFromImageRecord(legacyRecord), ['new us', 'shared term', 'canada term'], 'registros antigos são agregados por última avaliação de país e deduplicados');
assert.deepEqual(globalCandidatesFromImageRecord({ ...legacyRecord, negativeKeywordCandidates: [] }), [], 'uma lista global vazia salva substitui candidatas antigas por país');
assert.deepEqual(globalCandidatesFromImageRecord({ ...legacyRecord, negativeKeywordCandidates: ['  Alpha ', 'alpha', 'Beta'] }), ['Alpha', 'Beta'], 'a lista global é limpa e deduplicada sem depender de país');

const offer = { offerId: '33109', offerName: 'Nutrova ClearVue Plus · #33109', productName: 'Nutrova ClearVue Plus', payout: { currency: 'USD', value: 110 } };
const delivery = buildGuruMediaDeliveryData({
  offer,
  trendsRecord: { pageDraft: { countries: ['US', 'CA'] }, keywordCandidates: ['[clearvue]'] },
  imagesRecord: { ...legacyRecord, negativeKeywordCandidates: ['global negative', 'shared phrase'] },
});
assert.deepEqual(delivery.countries, ['US', 'CA'], 'GEOs de campanha continuam vindo do Google Trends');
assert.deepEqual(delivery.negativeKeywords, ['global negative', 'shared phrase'], 'a Entrega lê a lista global canônica');
assert.deepEqual(delivery.negativeKeywordCountries, [], 'candidatas negativas não recebem escopo por país');

const deliveryStorageValues = new Map();
const deliveryStorage = {
  getItem: key => deliveryStorageValues.get(key) ?? null,
  setItem: (key, value) => deliveryStorageValues.set(key, value),
};
const clickBankDelivery = createCampaignDelivery({ platformCode: 'CB', offerKey: '33109', offerName: 'Mesmo ID ClickBank · #33109', productName: 'Mesmo ID ClickBank', countries: ['US'], negativeKeywords: ['clickbank only'] }, deliveryStorage);
createCampaignDelivery({
  platformCode: 'GM',
  offerKey: delivery.offerKey,
  offerName: delivery.offerName,
  seller: delivery.seller,
  productName: delivery.productName,
  countries: delivery.countries,
  positiveKeywords: delivery.positiveKeywords,
  negativeKeywords: ['legacy country negative'],
  negativeKeywordCountries: ['CA'],
}, deliveryStorage);
const [syncedDelivery] = updateCampaignDeliveryNegativeKeywordsForOffer(
  delivery.offerKey,
  delivery.negativeKeywords,
  delivery.negativeKeywordCountries,
  deliveryStorage,
  'GM',
);
assert.deepEqual(syncedDelivery.negativeKeywords, ['global negative', 'shared phrase'], 'o armazenamento da Entrega recebe as negativas globais da Curadoria');
assert.deepEqual(syncedDelivery.negativeKeywordCountries, [], 'a lista vazia remove o escopo por país na entrega GM');
assert.deepEqual(getCampaignDeliveriesForOffer('33109', deliveryStorage, 'CB'), [clickBankDelivery], 'a sincronização GM não altera uma entrega ClickBank com a mesma chave');
assert.deepEqual(getCampaignDeliveriesForOffer('33109', deliveryStorage, 'GM'), [syncedDelivery], 'a Entrega GM guarda os termos e escopo globais');
assert.ok(deliveryStorage.getItem(CAMPAIGN_DELIVERY_STORAGE_KEY), 'a integração usa o armazenamento local existente da Entrega');

let saved = { offerId: '33109', negativeKeywordCandidates: ['competitor'] };
const controller = createGuruMediaNegativeCandidatesController({
  getSnapshot: () => ({ offerId: saved.offerId, candidates: globalCandidatesFromImageRecord(saved) }),
  saveCandidates: async (_snapshot, candidates) => {
    saved = { ...saved, negativeKeywordCandidates: candidates };
    return saved;
  },
});
const addPlan = planAddCandidates(['competitor'], 'new term\n"quoted product"');
assert.deepEqual(addPlan.candidates, ['competitor', 'new term', '"quoted product"']);
const add = await controller.add('new term\n"quoted product"');
assert.equal(add.ok, true);
assert.deepEqual(saved.negativeKeywordCandidates, ['competitor', 'new term', '"quoted product"'], 'o controlador grava a lista única sem country/status');
assert.equal((await controller.edit(1, '[new term]')).ok, true);
assert.equal((await controller.remove(0)).ok, true);
assert.deepEqual(saved.negativeKeywordCandidates, ['[new term]', '"quoted product"']);

const service = await readFile(new URL('../src/curadoria/top-performance/guru-media-campaign-delivery.mjs', import.meta.url), 'utf8');
const campaignView = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
const campaignService = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-service.mjs', import.meta.url), 'utf8');
const deliveryApp = await readFile(new URL('../src/campaign-delivery/app.mjs', import.meta.url), 'utf8');
assert.match(service, /Storage\.put\(Storage\.STORES\.images,[\s\S]*?negativeKeywordCandidates,/u, 'a edição global é salva no registro de Imagens existente');
assert.match(service, /\['trends',\s*'images'\][\s\S]*?syncGuruMediaCampaignDelivery\(offerId\)/u, 'a gravação de Imagens dispara a sincronização da Entrega da oferta');
assert.match(service, /updateCampaignDeliveryNegativeKeywordsForOffer\(data\.offerKey, data\.negativeKeywords, data\.negativeKeywordCountries/u, 'a Entrega recebe termos e escopo global vazio');
assert.match(service, /negativeKeywords:\s*data\.negativeKeywords/u, 'iniciar fluxo cria a Entrega com as negativas globais da Curadoria');
assert.match(campaignView, /negativeKeywords:\s*Array\.isArray\(delivery\.negativeKeywords\)\s*\?\s*delivery\.negativeKeywords\s*:\s*\[\]/u, 'a criação de campanha lê as negativas da Entrega local');
assert.match(campaignView, /negativeKeywords:\s*textLines\(form\.elements\.namedItem\('negative_keywords'\)\.value\)/u, 'o formulário da campanha encaminha as negativas importadas');
assert.match(campaignService, /negative_keywords:\s*negativeKeywords/u, 'a solicitação de criação da campanha contém as negativas no payload');
assert.ok(deliveryApp.includes("listMarkup('Palavras-chave negativas', active.negativeKeywords)"), 'a página da Entrega apresenta a mesma lista sincronizada');

console.log('Guru Media global negative candidates domain and integration passed');
