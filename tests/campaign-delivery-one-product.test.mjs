import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignDelivery, getCampaignDeliveriesForOffer, updateCampaignDeliveryCountriesForOffer, updateCampaignDeliveryPositiveKeywordsForOffer, updateCampaignDeliveryNegativeKeywordsForOffer, updateCampaignDeliveryProductNameForOffer, updateCampaignDeliveryAffiliateUrlForOffer, listCampaignDeliveries, markCampaignDeliveryOpened, CAMPAIGN_DELIVERY_STORAGE_KEY } from '../src/campaign-delivery/delivery-store.mjs';

function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
const delivery = { offerKey: 'offer', offerName: 'Offer', productName: 'VenoPlus 8', countries: ['US'] };

test('reopening the same product and offer preserves the original delivery', () => {
  const target = storage();
  const first = createCampaignDelivery(delivery, target);
  const second = createCampaignDelivery({ ...delivery, productName: ' venoplus   8 ', offerName: 'Updated offer title' }, target);
  assert.deepEqual(second, first);
  assert.equal(listCampaignDeliveries(target).length, 1);
});

test('the saved delivery can be found by its stable offer key', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  assert.deepEqual(getCampaignDeliveriesForOffer('offer', target), [original]);
  assert.deepEqual(getCampaignDeliveriesForOffer('missing', target), []);
  assert.deepEqual(getCampaignDeliveriesForOffer('', target), []);
});

test('saving destination countries in Curadoria updates the linked delivery and preserves its progress', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  const progressed = { ...original, countries: [], affiliateUrl: 'https://example.test/offer', assetStudioWork: { status: 'completed', productName: original.productName }, openedAt: { ...original.openedAt, assets: '2026-11-02T12:00:00.000Z' } };
  target.setItem(CAMPAIGN_DELIVERY_STORAGE_KEY, JSON.stringify([progressed]));

  const [updated] = updateCampaignDeliveryCountriesForOffer('offer', ['ca', 'US', 'CA'], target);

  assert.deepEqual(updated.countries, ['CA', 'US']);
  assert.equal(updated.affiliateUrl, progressed.affiliateUrl);
  assert.deepEqual(updated.assetStudioWork, progressed.assetStudioWork);
  assert.deepEqual(updated.openedAt, progressed.openedAt);
  assert.deepEqual(listCampaignDeliveries(target), [updated]);
});

test('invalid destination country updates leave the saved delivery untouched', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  assert.throws(() => updateCampaignDeliveryCountriesForOffer('offer', ['USA'], target), /código de país inválido/);
  assert.deepEqual(listCampaignDeliveries(target), [original]);
});

test('Curadoria positive keyword edits preserve quotes and update only the linked offer delivery', () => {
  const target = storage();
  const original = createCampaignDelivery({ ...delivery, positiveKeywords: ['old term'], negativeKeywords: ['negative term'] }, target);

  const [updated] = updateCampaignDeliveryPositiveKeywordsForOffer('offer', ['"ProvaDent"', ' [secondary] '], target);

  assert.deepEqual(updated.positiveKeywords, ['"ProvaDent"', '[secondary]']);
  assert.deepEqual(updated.negativeKeywords, original.negativeKeywords);
  assert.deepEqual(updated.countries, original.countries);
  assert.equal(updated.affiliateUrl, original.affiliateUrl);
});

test('Curadoria negative keyword edits preserve quotes and sync their GEOs without replacing other delivery data', () => {
  const target = storage();
  const original = createCampaignDelivery({ ...delivery, positiveKeywords: ['"ProvaDent"'], negativeKeywords: ['old term'], negativeKeywordCountries: ['CA'] }, target);

  const [updated] = updateCampaignDeliveryNegativeKeywordsForOffer('offer', [' "prodentim" ', '"votemax"', '"PRODENTIM"'], ['us', 'US'], target);

  assert.deepEqual(updated.negativeKeywords, ['"prodentim"', '"votemax"']);
  assert.deepEqual(updated.negativeKeywordCountries, ['US']);
  assert.deepEqual(updated.positiveKeywords, original.positiveKeywords);
  assert.deepEqual(updated.countries, original.countries);
  assert.equal(updated.affiliateUrl, original.affiliateUrl);
  assert.deepEqual(listCampaignDeliveries(target), [updated]);
});

test('invalid negative-keyword GEO leaves the saved delivery unchanged', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  assert.throws(() => updateCampaignDeliveryNegativeKeywordsForOffer('offer', ['"prodentim"'], ['USA'], target), /país inválido/);
  assert.deepEqual(listCampaignDeliveries(target), [original]);
});

test('saving a canonical product name updates only the linked platform delivery and preserves progress', () => {
  const target = storage();
  const original = createCampaignDelivery({ ...delivery, platformCode: 'GM', offerName: 'Guru offer · #33109', productName: 'Nutrova ClearVue Plus' }, target);
  const progressed = { ...original, assetStudioWork: { status: 'completed', productName: original.productName }, affiliateUrl: 'https://example.test/offer', openedAt: { ...original.openedAt, assets: '2026-11-02T12:00:00.000Z' } };
  target.setItem(CAMPAIGN_DELIVERY_STORAGE_KEY, JSON.stringify([progressed]));

  const [updated] = updateCampaignDeliveryProductNameForOffer('offer', 'ClearVue Plus', target, 'GM');

  assert.equal(updated.productName, 'ClearVue Plus');
  assert.equal(updated.offerName, progressed.offerName);
  assert.equal(updated.affiliateUrl, progressed.affiliateUrl);
  assert.deepEqual(updated.assetStudioWork, progressed.assetStudioWork);
  assert.deepEqual(updated.openedAt, progressed.openedAt);
  assert.deepEqual(listCampaignDeliveries(target), [updated]);
  assert.throws(() => updateCampaignDeliveryProductNameForOffer('offer', 'x'.repeat(101), target, 'GM'), /até 100 caracteres/);
  assert.deepEqual(listCampaignDeliveries(target), [updated]);
});

test('saving an affiliate URL updates only the linked offer and platform while preserving delivery progress', () => {
  const target = storage();
  const guru = createCampaignDelivery({ ...delivery, platformCode: 'GM', affiliateUrl: 'https://old.example/offer' }, target);
  const clickbank = createCampaignDelivery({ ...delivery, offerKey: 'other', affiliateUrl: 'https://cb.example/offer' }, target);
  const progressed = { ...guru, assetStudioWork: { status: 'completed', productName: guru.productName }, openedAt: { ...guru.openedAt, assets: '2026-11-02T12:00:00.000Z' }, affiliateUrl: 'https://old.example/offer' };
  target.setItem(CAMPAIGN_DELIVERY_STORAGE_KEY, JSON.stringify([progressed, clickbank]));

  const [updated] = updateCampaignDeliveryAffiliateUrlForOffer('offer', ' https://new.example/aff?x=1 ', target, 'GM');

  assert.equal(updated.affiliateUrl, 'https://new.example/aff?x=1');
  assert.deepEqual(updated.assetStudioWork, progressed.assetStudioWork);
  assert.deepEqual(updated.openedAt, progressed.openedAt);
  assert.deepEqual(listCampaignDeliveries(target), [updated, clickbank]);
  assert.throws(() => updateCampaignDeliveryAffiliateUrlForOffer('offer', 'javascript:alert(1)', target, 'GM'), /link de afiliado HTTP ou HTTPS válido/);
  assert.deepEqual(listCampaignDeliveries(target), [updated, clickbank]);
});

test('opening Curadoria records the stage while preserving the delivery snapshot', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  const opened = markCampaignDeliveryOpened(original.id, 'curadoria', target);
  assert.equal(opened.openedAt.curadoria.length > 0, true);
  assert.deepEqual(opened.countries, original.countries);
  assert.equal(listCampaignDeliveries(target).length, 1);
});

test('ambiguous or differently linked legacy deliveries are never merged', () => {
  const target = storage();
  const first = createCampaignDelivery(delivery, target);
  assert.throws(() => createCampaignDelivery({ ...delivery, offerKey: 'other' }, target), /outra oferta/);
  target.setItem(CAMPAIGN_DELIVERY_STORAGE_KEY, JSON.stringify([first, { ...first, id: 'legacy' }]));
  assert.throws(() => createCampaignDelivery(delivery, target), /mais de uma entrega/);
  assert.equal(listCampaignDeliveries(target).length, 2);
});

test('starting a delivery requires at least one valid destination country and writes nothing otherwise', () => {
  const target = storage();
  assert.throws(() => createCampaignDelivery({ ...delivery, countries: [] }, target), /pelo menos um país|país de destino/);
  assert.throws(() => createCampaignDelivery({ ...delivery, countries: ['USA'] }, target), /código de país inválido/);
  assert.equal(listCampaignDeliveries(target).length, 0);
});

test('explicit destination country fills a legacy delivery that had no country and preserves its other state', () => {
  const target = storage();
  const original = createCampaignDelivery(delivery, target);
  const legacy = { ...original, countries: [], assetStudioWork: { status: 'completed', productName: original.productName } };
  target.setItem(CAMPAIGN_DELIVERY_STORAGE_KEY, JSON.stringify([legacy]));

  const recovered = createCampaignDelivery({ ...delivery, countries: ['CA'] }, target);

  assert.equal(recovered.id, original.id);
  assert.deepEqual(recovered.countries, ['CA']);
  assert.deepEqual(recovered.assetStudioWork, legacy.assetStudioWork);
  assert.equal(listCampaignDeliveries(target).length, 1);
});
