import { formatCommissionUsd, isCommissionUsd, parseCommissionUsd } from '../../campaign-delivery/commission-domain.mjs?v=2';
import {
  createCampaignDelivery,
  getCampaignDelivery,
  getCampaignDeliveriesForOffer,
  listCampaignDeliveries,
  updateCampaignDeliveryCommissionForOffer,
  updateCampaignDeliveryAffiliateUrlForOffer,
  updateCampaignDeliveryCountriesForOffer,
  updateCampaignDeliveryNegativeKeywordsForOffer,
  updateCampaignDeliveryProductNameForOffer,
  updateCampaignDeliveryPositiveKeywordsForOffer,
} from '../../campaign-delivery/delivery-store.mjs?v=17';
import * as Storage from './top-performance-storage.mjs?v=4';
import { buildGuruMediaDeliveryData, GURU_MEDIA_PLATFORM_CODE } from './guru-media-delivery-domain.mjs?v=5';
import { normalizeAffiliateUrl } from '../../campaign-delivery/affiliate-url-domain.mjs?v=1';
import { globalCandidatesFromImageRecord, MAX_CANDIDATES, uniqueCandidates } from './guru-media-negative-candidates-domain.mjs?v=2';
import {curationBridges} from '../central-bridge-slot.mjs';

async function centralSnapshot(){const snapshot=await curationBridges.delivery.list();curationBridges.guruDeliverySnapshot=snapshot;return snapshot}
async function centralUpdate(offerId,changes){
 const client=curationBridges.delivery;
 const snapshot=curationBridges.guruDeliverySnapshot||await centralSnapshot();
 const linked=client.forOffer(snapshot,String(offerId),'GM');
 await client.update(snapshot,String(offerId),'GM',changes);
 const current=await centralSnapshot();return client.forOffer(current,String(offerId),'GM').filter(row=>linked.some(old=>old.id===row.id));
}

async function readOfferContext(offerId) {
  const key = String(offerId || '').trim();
  if (!key) throw new Error('Oferta Guru Media sem ID.');
  const [offer, trendsRecord, imagesRecord] = await Promise.all([
    Storage.getByKey(Storage.STORES.offers, key),
    Storage.getByKey(Storage.STORES.trends, key),
    Storage.getByKey(Storage.STORES.images, key),
  ]);
  if (!offer) throw new Error('A oferta não está mais salva na Curadoria Guru Media. Atualize a tela e tente novamente.');
  return { offer, trendsRecord: trendsRecord || {}, imagesRecord: imagesRecord || {}, hasTrendsRecord: Boolean(trendsRecord), hasImagesRecord: Boolean(imagesRecord) };
}

export async function saveGuruMediaNegativeKeywordCandidates(offerId, values) {
  const { offer, imagesRecord } = await readOfferContext(offerId);
  const negativeKeywordCandidates = uniqueCandidates(values);
  if (negativeKeywordCandidates.length > MAX_CANDIDATES) {
    throw new Error(`A lista global aceita até ${MAX_CANDIDATES} palavras-chave negativas.`);
  }
  return Storage.put(Storage.STORES.images, {
    ...imagesRecord,
    offerId: String(offerId),
    productName: offer.productName,
    negativeKeywordCandidates,
    negativeKeywordCandidatesReviewedAt: null,
  });
}

export async function confirmGuruMediaNoNegativeKeywordCandidates(offerId) {
  const { offer, imagesRecord } = await readOfferContext(offerId);
  if (globalCandidatesFromImageRecord(imagesRecord).length) {
    throw new Error('A oferta ainda tem candidatas negativas. Revise ou remova os termos antes de confirmar a ausência.');
  }
  return Storage.put(Storage.STORES.images, {
    ...imagesRecord,
    offerId: String(offerId),
    productName: offer.productName,
    negativeKeywordCandidates: [],
    negativeKeywordCandidatesReviewedAt: new Date().toISOString(),
  }, { notifyCuration: false });
}

export async function saveGuruMediaCommission(offerId, value) {
  const commissionAmountUsd = parseCommissionUsd(value);
  if (!isCommissionUsd(commissionAmountUsd)) throw new Error('Informe uma comissão em USD válida, com até duas casas decimais.');
  const { offer } = await readOfferContext(offerId);
  const saved = await Storage.put(Storage.STORES.offers, { ...offer, commissionOverrideUsd: commissionAmountUsd });
  let deliverySyncWarning = '';
  try { if(curationBridges.delivery)await centralUpdate(offerId,{commissionAmountUsd});else updateCampaignDeliveryCommissionForOffer(String(offerId), commissionAmountUsd, undefined, GURU_MEDIA_PLATFORM_CODE); }
  catch (error) { deliverySyncWarning = error?.message || 'Não foi possível sincronizar o valor com a entrega existente.'; }
  return { offer: saved, deliverySyncWarning };
}

export async function saveGuruMediaAffiliateUrl(offerId, value) {
  const affiliateUrl = normalizeAffiliateUrl(value);
  if (!affiliateUrl) throw new Error('Informe uma URL HTTP ou HTTPS válida para o link de afiliado.');
  const { offer } = await readOfferContext(offerId);
  const saved = await Storage.put(Storage.STORES.offers, { ...offer, affiliateUrl });
  let deliverySyncWarning = '';
  let deliveriesUpdated = 0;
  try {
    deliveriesUpdated = curationBridges.delivery?(await centralUpdate(offerId,{affiliateUrl})).length:updateCampaignDeliveryAffiliateUrlForOffer(String(offerId), affiliateUrl, undefined, GURU_MEDIA_PLATFORM_CODE).length;
  } catch (error) {
    deliverySyncWarning = error?.message || 'Não foi possível sincronizar o link com o fluxo existente.';
  }
  return { offer: saved, deliveriesUpdated, deliverySyncWarning };
}

export async function saveGuruMediaCanonicalProductName(offerId, value) {
  const canonicalProductName = String(value ?? '').trim();
  if (!canonicalProductName || canonicalProductName.length > 100) throw new Error('Informe um nome de produto com até 100 caracteres.');
  const { offer } = await readOfferContext(offerId);
  const normalizedName = canonicalProductName.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  const deliverySnapshot=curationBridges.delivery?await centralSnapshot():null;
  const collision = (deliverySnapshot?deliverySnapshot.deliveries:listCampaignDeliveries()).find(record => (record.platformCode || 'CB') === GURU_MEDIA_PLATFORM_CODE
    && String(record.offerKey || '') !== String(offerId)
    && String(record.productName || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === normalizedName);
  if (collision) throw new Error('Já existe um fluxo Guru Media com esse nome ligado a outra oferta. Escolha um nome distinto para não misturar os fluxos.');
  const saved = await Storage.put(Storage.STORES.offers, { ...offer, canonicalProductName });
  let deliverySyncWarning = '';
  let deliveriesUpdated = 0;
  try {
    const linked = curationBridges.delivery?await centralUpdate(offerId,{productName:canonicalProductName}):updateCampaignDeliveryProductNameForOffer(String(offerId), canonicalProductName, undefined, GURU_MEDIA_PLATFORM_CODE);
    deliveriesUpdated = linked.length;
  } catch (error) {
    deliverySyncWarning = error?.message || 'Não foi possível sincronizar o nome com o fluxo existente.';
  }
  return { offer: saved, deliveriesUpdated, deliverySyncWarning };
}

export async function syncGuruMediaCampaignDelivery(offerId) {
  const context = await readOfferContext(offerId);
  const data = buildGuruMediaDeliveryData(context);
  if(curationBridges.delivery){
    const changes={};
    if(context.hasTrendsRecord){
      if(Array.isArray(context.trendsRecord.pageDraft?.countries)||Array.isArray(context.trendsRecord.assessments)&&context.trendsRecord.assessments.length){changes.countries=data.countries;changes.geoTargetingMode=data.geoTargetingMode}
      if(Array.isArray(context.trendsRecord.keywordCandidates))changes.positiveKeywords=data.positiveKeywords;
    }
    if(context.hasImagesRecord){changes.negativeKeywords=data.negativeKeywords;changes.negativeKeywordCountries=data.negativeKeywordCountries}
    if(data.canonicalProductName)changes.productName=data.canonicalProductName;
    if(data.affiliateUrl)changes.affiliateUrl=data.affiliateUrl;
    if(isCommissionUsd(data.commissionAmountUsd))changes.commissionAmountUsd=data.commissionAmountUsd;
    if(!Object.keys(changes).length){const snapshot=await centralSnapshot();return curationBridges.delivery.forOffer(snapshot,data.offerKey,'GM');}
    return centralUpdate(data.offerKey,changes);
  }
  const linked = getCampaignDeliveriesForOffer(data.offerKey, undefined, GURU_MEDIA_PLATFORM_CODE);
  if (!linked.length) return [];
  if (data.canonicalProductName) {
    updateCampaignDeliveryProductNameForOffer(data.offerKey, data.canonicalProductName, undefined, GURU_MEDIA_PLATFORM_CODE);
  }
  if (data.affiliateUrl) {
    updateCampaignDeliveryAffiliateUrlForOffer(data.offerKey, data.affiliateUrl, undefined, GURU_MEDIA_PLATFORM_CODE);
  }
  updateCampaignDeliveryCountriesForOffer(data.offerKey, data.countries, undefined, GURU_MEDIA_PLATFORM_CODE, data.geoTargetingMode);
  updateCampaignDeliveryPositiveKeywordsForOffer(data.offerKey, data.positiveKeywords, undefined, GURU_MEDIA_PLATFORM_CODE);
  updateCampaignDeliveryNegativeKeywordsForOffer(data.offerKey, data.negativeKeywords, data.negativeKeywordCountries, undefined, GURU_MEDIA_PLATFORM_CODE);
  if (isCommissionUsd(data.commissionAmountUsd)) {
    updateCampaignDeliveryCommissionForOffer(data.offerKey, data.commissionAmountUsd, undefined, GURU_MEDIA_PLATFORM_CODE);
  }
  return linked.map(record => getCampaignDelivery(record.id)).filter(Boolean);
}

export async function startGuruMediaCampaignDelivery(offerId) {
  const context = await readOfferContext(offerId);
  const data = buildGuruMediaDeliveryData(context);
  if (!normalizeAffiliateUrl(data.affiliateUrl)) {
    throw new Error('Informe e salve uma URL HTTP ou HTTPS válida para o link de afiliado antes de iniciar ou continuar a entrega.');
  }
  const snapshot=curationBridges.delivery?await centralSnapshot():null;
  const existing = snapshot?curationBridges.delivery.forOffer(snapshot,data.offerKey,'GM'):getCampaignDeliveriesForOffer(data.offerKey, undefined, GURU_MEDIA_PLATFORM_CODE);
  if (existing.length > 1) throw new Error('Há mais de uma entrega desta oferta Guru Media. Abra Entrega de campanha e selecione o fluxo correto.');
  if (existing.length === 1) {
    await syncGuruMediaCampaignDelivery(data.offerKey);
    return curationBridges.delivery?curationBridges.guruDeliverySnapshot.deliveries.find(record=>record.id===existing[0].id):getCampaignDelivery(existing[0].id);
  }
  if (!data.productName) throw new Error('Defina o nome do produto antes de iniciar a entrega.');
  if (data.geoTargetingMode !== 'WORLD'
      && (!data.countries.length || data.countries.some(country => !/^[A-Z]{2}$/.test(country)))) {
    throw new Error('Selecione e salve pelo menos um país de destino ou Mundo na aba Google Trends antes de iniciar a entrega.');
  }
  if (!isCommissionUsd(data.commissionAmountUsd)) {
    throw new Error('Informe e salve a comissão da oferta em USD antes de iniciar a entrega.');
  }
  const duplicateProduct = (snapshot?snapshot.deliveries:listCampaignDeliveries()).find(record => (record.platformCode || 'CB') === GURU_MEDIA_PLATFORM_CODE
    && String(record.productName || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
      === data.productName.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'));
  if (duplicateProduct && duplicateProduct.offerKey !== data.offerKey) {
    throw new Error('Já existe um fluxo Guru Media para este produto ligado a outra oferta. Confira o fluxo salvo antes de criar outro.');
  }
  const input={
    platformCode: GURU_MEDIA_PLATFORM_CODE,
    offerKey: data.offerKey,
    offerName: data.offerName,
    seller: data.seller,
    productName: data.productName,
    commissionAmountUsd: data.commissionAmountUsd,
    brandBidding: data.brandBidding,
    affiliateUrl: data.affiliateUrl,
    geoTargetingMode: data.geoTargetingMode,
    countries: data.countries,
    positiveKeywords: data.positiveKeywords,
    negativeKeywords: data.negativeKeywords,
    negativeKeywordCountries: data.negativeKeywordCountries,
    operationSnapshot: { type: 'campaign_delivery_started', sourceActivity: 'Curadoria Guru Media', destinationActivity: 'Criação de campanha' },
  };
  if(curationBridges.delivery){const created=await curationBridges.delivery.create(input,snapshot);await centralSnapshot();return created;}
  return createCampaignDelivery(input);
}

export function watchGuruMediaCampaignDeliverySources(onError = () => {}) {
  if (typeof window === 'undefined') return () => {};
  const pending = new Map();
  const handleWrite = event => {
    const detail = event.detail || {};
    if (detail.origin !== 'guru-media-ecommerce-gm' || !['trends', 'images'].includes(detail.store)) return;
    const offerId = String(detail.record?.offerId || '').trim();
    if (!offerId) return;
    const current = pending.get(offerId) || Promise.resolve();
    const next = current.catch(() => {}).then(() => syncGuruMediaCampaignDelivery(offerId));
    pending.set(offerId, next);
    next.catch(error => onError(error, offerId)).finally(() => {
      if (pending.get(offerId) === next) pending.delete(offerId);
    });
  };
  window.addEventListener('curation-record-written', handleWrite);
  return () => window.removeEventListener('curation-record-written', handleWrite);
}

export { formatCommissionUsd, isCommissionUsd };
