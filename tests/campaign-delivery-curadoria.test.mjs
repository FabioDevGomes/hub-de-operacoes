import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [html, app, controller, view, progress, store] = await Promise.all([
  read('../src/campaign-delivery/index.html'),
  read('../src/campaign-delivery/app.mjs'),
  read('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs'),
  read('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs'),
  read('../src/campaign-delivery/progress-domain.mjs'),
  read('../src/campaign-delivery/delivery-store.mjs'),
]);

test('Curadoria aparece como primeira das quatro etapas da Entrega', () => {
  const stages = [...html.matchAll(/data-stage="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stages, ['curadoria', 'assets', 'presell', 'campaign']);
  assert.match(html, /data-stage="curadoria"[\s\S]*?<h2>Curadoria<\/h2>[\s\S]*?Editar oferta na Curadoria/);
  assert.match(html, /data-stage="campaign"[\s\S]*?<div class="step-number">4<\/div>/);
});

test('Curadoria reopens the exact linked offer and existing delivery', () => {
  assert.match(app, /stage === 'curadoria'[\s\S]*?active\.offerKey[\s\S]*?offerKey=/);
  assert.match(controller, /requestedOfferKey = new URLSearchParams\(window\.location\.search\)\.get\('offerKey'\)/);
  assert.match(controller, /view\.openOffer\(requestedOfferKey\)/);
  const resumeAt = controller.indexOf('const existing = getCampaignDeliveriesForOffer(item.offerKey)');
  const validationAt = controller.indexOf('const metadata = metadataFor(item)', resumeAt);
  assert.ok(resumeAt >= 0 && validationAt > resumeAt, 'retoma um fluxo existente antes de validar GEOs e comissão para uma nova entrega');
  const resumeBlock = controller.slice(resumeAt, validationAt);
  assert.match(resumeBlock, /syncDeliveryCountries\(item,trendsFor\(item\),metadataFor\(item\)\)[\s\S]*?window\.location\.assign/,
    'ao reabrir, sincroniza os GEOs que já foram salvos na Curadoria antes de navegar para a entrega');
  assert.match(resumeBlock, /await syncDeliveryNegativeKeywords\(item\)[\s\S]*?window\.location\.assign/,
    'ao reabrir, sincroniza candidatas negativas salvas por país antes de navegar para a entrega');
  assert.match(view, /Abrir fluxo da entrega/);
});

test('a valid linked offer and GEO are part of delivery completion', () => {
  assert.match(progress, /const curadoria = Boolean\(String\(delivery\?\.offerKey/);
  assert.match(progress, /complete: !ambiguous && curadoria && assets/);
});

test('saving selected countries and positive keywords in Curadoria updates the existing linked delivery', () => {
  assert.match(store, /export function updateCampaignDeliveryCountriesForOffer\(/);
  assert.match(controller, /function syncDeliveryCountries\([\s\S]*?updateCampaignDeliveryCountriesForOffer\(item\.offerKey,selectedDeliveryCountries/);
  assert.match(controller, /const saved=await Storage\.saveTrendPage\(stored,metadataPatch\);[\s\S]*?syncDeliveryCountries\(item,saved\.record/);
  assert.match(store, /export function updateCampaignDeliveryPositiveKeywordsForOffer\(/);
  assert.match(controller, /function syncDeliveryPositiveKeywords\([\s\S]*?updateCampaignDeliveryPositiveKeywordsForOffer\(item\.offerKey,keywords\)/);
  assert.ok((controller.match(/syncDeliveryPositiveKeywords\(item,saved\.keywordCandidates\)/g)||[]).length>=4,
    'adicionar, colar, editar e remover candidatas positivas sincroniza a entrega');
  assert.match(controller, /negativeKeywords:\s*source\?\.negativeKeywords\s*\|\|\s*\[\]/,
    'uma entrega nova recebe as candidatas negativas atuais da ponte ClickBank');
  assert.match(controller, /negativeKeywordCountries:\s*source\?\.negativeKeywordCountries\s*\|\|\s*\[\]/,
    'uma entrega nova mantém os países associados às candidatas negativas');
});

test('saving, editing or removing negative image candidates syncs the latest per-country list to the linked delivery', () => {
  assert.match(store, /export function updateCampaignDeliveryNegativeKeywordsForOffer\(/);
  assert.match(controller, /async function syncDeliveryNegativeKeywords\([\s\S]*?updateCampaignDeliveryNegativeKeywordsForOffer\(item\.offerKey,source\.negativeKeywords\|\|\[\],source\.negativeKeywordCountries\|\|\[\]\)/);
  const saveImageAt=controller.indexOf('async function saveImage(');
  const addCandidateAt=controller.indexOf('async function addImageKeywordCandidates(',saveImageAt);
  assert.ok(saveImageAt>=0&&addCandidateAt>saveImageAt);
  const saveImageBlock=controller.slice(saveImageAt,addCandidateAt);
  assert.match(saveImageBlock,/await Storage\.putOfferRecord\(Storage\.STORES\.images,stored\)[\s\S]*?await syncDeliveryNegativeKeywords\(item\)/,
    'a lista agregada pela ponte atualiza a entrega após persistir a avaliação mais recente');
  assert.match(view,/onRemove:[\s\S]*?actions\.saveImage\(item\.offerKey,country,assessment\.status,remaining,\{candidateOnly:true\}\)/,
    'remover uma candidata salva também passa pela sincronização');
  assert.match(view,/onEdit:.*openImageCandidateEdit/);
});
