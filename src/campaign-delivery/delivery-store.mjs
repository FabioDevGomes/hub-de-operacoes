import {isCommissionUsd,parseCommissionUsd} from './commission-domain.mjs?v=2';
import { normalizeAffiliateUrl } from './affiliate-url-domain.mjs?v=1';



const STORAGE_KEY = 'hub:campaign-delivery:records:v1';
const ASSET_STUDIO_WORK_STATUSES = new Set(['draft', 'processing', 'completed', 'completed_with_warnings', 'failed', 'interrupted']);

function storageFrom(storage) {
  if (storage) return storage;
  try { return window.localStorage; } catch { return null; }
}

export function listCampaignDeliveries(storage) {
  const target = storageFrom(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(record => record && typeof record.id === 'string') : [];
  } catch { return []; }
}

export function getCampaignDelivery(id, storage) {
  const key = String(id || '').trim();
  return key ? listCampaignDeliveries(storage).find(record => record.id === key) || null : null;
}

export function getCampaignDeliveriesForOffer(offerKey, storage, platformValue = 'CB') {
  const key = String(offerKey || '').trim();
  const platformCode = normalizePlatformCode(platformValue);
  return key ? listCampaignDeliveries(storage).filter(record => record.offerKey === key && deliveryPlatformCode(record) === platformCode) : [];
}

function normalizePlatformCode(value) {
  const code = String(value || 'CB').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'CB';
}

function deliveryPlatformCode(record) {
  return normalizePlatformCode(record?.platformCode);
}

function normalizeDeliveryGeography(values, requestedMode) {
  const raw = [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
  const mode = requestedMode == null
    ? (raw.includes('WORLD') ? 'WORLD' : 'COUNTRIES')
    : String(requestedMode).trim().toUpperCase();
  if (!['COUNTRIES', 'WORLD'].includes(mode)) throw new Error('O modo de destino geográfico da entrega é inválido.');
  if (mode === 'WORLD') return { geoTargetingMode: 'WORLD', countries: [] };
  if (raw.includes('WORLD')) throw new Error('Mundo não pode ser combinado com países específicos no mesmo modo de destino.');
  if (raw.some(country => !/^[A-Z]{2}$/.test(country))) throw new Error('A entrega contém um código de país inválido.');
  return { geoTargetingMode: 'COUNTRIES', countries: raw };
}

export function updateCampaignDeliveryCountriesForOffer(offerKey, values, storage, platformValue = 'CB', requestedMode) {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const platformCode = normalizePlatformCode(platformValue);
  const { geoTargetingMode, countries } = normalizeDeliveryGeography(values, requestedMode);

  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    matching.push(record);
    const previous = normalizeDeliveryGeography(record.countries, record.geoTargetingMode);
    if (previous.geoTargetingMode === geoTargetingMode && previous.countries.length === countries.length
        && previous.countries.every((country, countryIndex) => country === countries[countryIndex])) continue;
    records[index] = { ...record, geoTargetingMode, countries, updatedAt };
    matching[matching.length - 1] = records[index];
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryPositiveKeywordsForOffer(offerKey, values, storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const platformCode = normalizePlatformCode(platformValue);
  const positiveKeywords = cleanList(values, 100);
  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    matching.push(record);
    const previous = cleanList(record.positiveKeywords, 100);
    if (previous.length === positiveKeywords.length && previous.every((term, termIndex) => term === positiveKeywords[termIndex])) continue;
    records[index] = { ...record, positiveKeywords, updatedAt };
    matching[matching.length - 1] = records[index];
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryNegativeKeywordsForOffer(offerKey, values, countryValues = [], storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const platformCode = normalizePlatformCode(platformValue);
  const negativeKeywords = cleanList(values, 100);
  const negativeKeywordCountries = [...new Set(cleanList(countryValues, 20).map(country => country.toUpperCase()))];
  if (negativeKeywordCountries.some(country => !/^[A-Z]{2}$/.test(country))) throw new Error('A entrega contém um país inválido para palavras-chave negativas.');

  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    matching.push(record);
    const previousKeywords = cleanList(record.negativeKeywords, 100);
    const previousCountries = [...new Set(cleanList(record.negativeKeywordCountries, 20).map(country => country.toUpperCase()))];
    const keywordsEqual = previousKeywords.length === negativeKeywords.length
      && previousKeywords.every((term, termIndex) => term === negativeKeywords[termIndex]);
    const countriesEqual = previousCountries.length === negativeKeywordCountries.length
      && previousCountries.every((country, countryIndex) => country === negativeKeywordCountries[countryIndex]);
    if (keywordsEqual && countriesEqual) continue;
    records[index] = { ...record, negativeKeywords, negativeKeywordCountries, updatedAt };
    matching[matching.length - 1] = records[index];
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryImageSearchTermForOffer(offerKey, value, storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const platformCode = normalizePlatformCode(platformValue);
  const imageSearchTerm = String(value ?? '').trim().slice(0, 250);
  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    if (String(record.imageSearchTerm ?? '') === imageSearchTerm) {
      matching.push(record);
      continue;
    }
    records[index] = { ...record, imageSearchTerm, updatedAt };
    matching.push(records[index]);
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryCommissionForOffer(offerKey, amount, storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const commissionAmountUsd = amount == null ? null : parseCommissionUsd(amount);
  if (amount != null && !isCommissionUsd(commissionAmountUsd)) throw new Error('Informe uma comissão válida em USD, com até duas casas decimais.');
  const platformCode = normalizePlatformCode(platformValue);
  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    const next = commissionAmountUsd == null
      ? (({ commissionAmountUsd: _amount, commissionCurrency: _currency, ...rest }) => ({ ...rest, updatedAt }))(record)
      : { ...record, commissionAmountUsd, commissionCurrency: 'USD', updatedAt };
    const previousAmount = record.commissionCurrency === 'USD' && isCommissionUsd(record.commissionAmountUsd) ? record.commissionAmountUsd : null;
    if (previousAmount === commissionAmountUsd && (commissionAmountUsd == null || record.commissionCurrency === 'USD')) {
      matching.push(record);
      continue;
    }
    records[index] = next;
    matching.push(next);
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryProductNameForOffer(offerKey, value, storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const productName = String(value ?? '').trim();
  if (!productName || productName.length > 100) throw new Error('Informe um nome de produto com até 100 caracteres.');
  const platformCode = normalizePlatformCode(platformValue);
  const records = listCampaignDeliveries(target);
  const normalizedName = normalizedProductName(productName);
  const collision = records.find(record => record.offerKey !== key
    && deliveryPlatformCode(record) === platformCode
    && normalizedProductName(record.productName) === normalizedName);
  if (collision) throw new Error('Já existe uma entrega nesta plataforma com esse nome de produto, vinculada a outra oferta.');

  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    if (record.productName === productName) {
      matching.push(record);
      continue;
    }
    records[index] = { ...record, productName, updatedAt };
    matching.push(records[index]);
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

export function updateCampaignDeliveryAffiliateUrlForOffer(offerKey, value, storage, platformValue = 'CB') {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(offerKey || '').trim();
  if (!key) return [];
  const affiliateUrl = normalizeAffiliateUrl(value);
  if (!affiliateUrl) throw new Error('Informe um link de afiliado HTTP ou HTTPS válido.');
  const platformCode = normalizePlatformCode(platformValue);
  const records = listCampaignDeliveries(target);
  const matching = [];
  let changed = false;
  const updatedAt = new Date().toISOString();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.offerKey !== key || deliveryPlatformCode(record) !== platformCode) continue;
    if (record.affiliateUrl === affiliateUrl) {
      matching.push(record);
      continue;
    }
    records[index] = { ...record, affiliateUrl, updatedAt };
    matching.push(records[index]);
    changed = true;
  }
  if (changed) target.setItem(STORAGE_KEY, JSON.stringify(records));
  return matching;
}

function normalizedProductName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function isAssetStudioDirectoryForProduct(directory, productName) {
  const normalizedPath = String(directory || '').trim().replace(/[\\/]+$/, '');
  if (!normalizedPath) return false;
  const parts = normalizedPath.split(/[\\/]+/);
  return parts.length >= 3
    && parts.at(-1).toLocaleLowerCase('pt-BR') === 'pag01'
    && normalizedProductName(parts.at(-2)) === normalizedProductName(productName);
}

export function getCampaignDeliveryAssetStudioPageDirectory(delivery) {
  const work = delivery?.assetStudioWork;
  const productName = normalizedProductName(delivery?.productName);
  if (!work || !productName || normalizedProductName(work.productName) !== productName) return '';
  if (work.pageAssetsProductName && normalizedProductName(work.pageAssetsProductName) !== productName) return '';

  const savedDirectory = String(work.pageDirectory || '').trim();
  const resultRow = [...(Array.isArray(work.results) ? work.results : [])].reverse().find(row => {
    if (row?.status !== 'ok') return false;
    return /Diretório da Presell atualizado no Hub:\s*.+$/i.test(String(row.text || ''));
  });
  const resultDirectory = String(resultRow?.text || '').match(/Diretório da Presell atualizado no Hub:\s*(.+?)\s*$/i)?.[1]?.trim() || '';
  const directory = savedDirectory || resultDirectory;
  return isAssetStudioDirectoryForProduct(directory, delivery.productName) ? directory : '';
}

function cleanList(value, limit = 100) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(item => {
    const key = item.toLocaleLowerCase('pt-BR');
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function cleanAssetStudioRows(value) {
  return (Array.isArray(value) ? value : []).slice(-100).map(row => ({
    text: String(row?.text || '').trim().slice(0, 2000),
    status: ['ok', 'error', 'warning'].includes(row?.status) ? row.status : ''
  })).filter(row => row.text);
}

function cleanSelectedProductImages(value) {
  return (Array.isArray(value) ? value : []).slice(0, 2).map(image => ({
    id: String(image?.id || '').slice(0, 80),
    alt: String(image?.alt || '').trim().slice(0, 180),
    width: Math.max(0, Math.round(Number(image?.width) || 0)),
    height: Math.max(0, Math.round(Number(image?.height) || 0)),
    fileName: String(image?.fileName || '').slice(0, 120),
    sizeBytes: Math.max(0, Math.round(Number(image?.sizeBytes) || 0))
  })).filter(image => image.id || image.fileName || image.alt);
}

export function updateCampaignDeliveryAssetStudioWork(id, input = {}, storage) {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(id || '').trim();
  if (!key) throw new Error('Selecione uma entrega antes de salvar o estado do Asset Studio.');
  const records = listCampaignDeliveries(target);
  const index = records.findIndex(record => record.id === key);
  if (index < 0) throw new Error('A entrega selecionada não está salva neste navegador.');
  const record = records[index];
  const previous = record.assetStudioWork && typeof record.assetStudioWork === 'object' ? record.assetStudioWork : {};
  const status = ASSET_STUDIO_WORK_STATUSES.has(input.status) ? input.status : (ASSET_STUDIO_WORK_STATUSES.has(previous.status) ? previous.status : 'draft');
  const now = new Date().toISOString();
  const terminal = ['completed', 'completed_with_warnings', 'failed', 'interrupted'].includes(status);
  const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : '';
  const skipFavicon = typeof input.skipFavicon === 'boolean'
    ? input.skipFavicon
    : typeof previous.skipFavicon === 'boolean' ? previous.skipFavicon : undefined;
  const work = {
    status,
    productName: String(input.productName ?? previous.productName ?? '').trim().slice(0, 100),
    startedAtUtc: validTimestamp(input.startedAtUtc) || validTimestamp(previous.startedAtUtc) || (status === 'processing' ? now : ''),
    completedAtUtc: status === 'processing' ? '' : validTimestamp(input.completedAtUtc) || (terminal ? now : validTimestamp(previous.completedAtUtc)),
    updatedAtUtc: now,
    results: Array.isArray(input.results) ? cleanAssetStudioRows(input.results) : cleanAssetStudioRows(previous.results),
    productImageResults: Array.isArray(input.productImageResults) ? cleanAssetStudioRows(input.productImageResults) : cleanAssetStudioRows(previous.productImageResults),
    productImageStatus: String(input.productImageStatus ?? previous.productImageStatus ?? '').trim().slice(0, 500),
    ...(typeof skipFavicon === 'boolean' ? { skipFavicon } : {}),
    selectedProductImages: Array.isArray(input.selectedProductImages) ? cleanSelectedProductImages(input.selectedProductImages) : cleanSelectedProductImages(previous.selectedProductImages),
    pageAssetsProductName: String(input.pageAssetsProductName ?? previous.pageAssetsProductName ?? '').trim().slice(0, 100),
    productImagesProductName: String(input.productImagesProductName ?? previous.productImagesProductName ?? '').trim().slice(0, 100),
    productImageFiles: Array.isArray(input.productImageFiles)
      ? [...new Set(input.productImageFiles.map(value => String(value || '').trim()).filter(value => /^imagem-produto-0[12]\.(?:png|jpg)$/i.test(value)))].slice(0, 2)
      : (Array.isArray(previous.productImageFiles) ? previous.productImageFiles : [])
  };
  records[index] = { ...record, assetStudioWork: work };
  target.setItem(STORAGE_KEY, JSON.stringify(records));
  return records[index];
}

export function updateCampaignDeliveryAssetStudioRoute(id, useExistingLocalPage, storage) {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const key = String(id || '').trim();
  if (!key) throw new Error('Selecione uma entrega antes de salvar o fluxo do Asset Studio.');
  const records = listCampaignDeliveries(target);
  const index = records.findIndex(record => record.id === key);
  if (index < 0) throw new Error('A entrega selecionada não está salva neste navegador.');
  const record = records[index];
  const next = { ...record, updatedAt: new Date().toISOString() };
  if (useExistingLocalPage === true) {
    next.assetStudioRoute = { mode: 'existing_local_page', selectedAtUtc: new Date().toISOString() };
  } else {
    delete next.assetStudioRoute;
  }
  records[index] = next;
  target.setItem(STORAGE_KEY, JSON.stringify(records));
  return next;
}

export function createCampaignDelivery(input = {}, storage) {
  const target = storageFrom(storage);
  if (!target) throw new Error('O armazenamento local do navegador não está disponível.');
  const offerKey = String(input.offerKey || '').trim();
  const platformCode = normalizePlatformCode(input.platformCode);
  const offerName = String(input.offerName || '').trim();
  const productName = String(input.productName || '').trim();
  if (!offerKey || !offerName || !productName) throw new Error('A oferta precisa ter uma identificação, um nome e um produto.');
  const { geoTargetingMode, countries } = normalizeDeliveryGeography(input.countries, input.geoTargetingMode);
  if (geoTargetingMode === 'COUNTRIES' && !countries.length) throw new Error('Selecione pelo menos um país ou escolha Mundo antes de iniciar a entrega.');
  const existing = listCampaignDeliveries(target).filter(record => deliveryPlatformCode(record) === platformCode
    && normalizedProductName(record.productName) === normalizedProductName(productName));
  if (existing.length > 1) throw new Error('Este produto possui mais de uma entrega salva nesta plataforma. Abra Entrega de campanha e confira o fluxo; nenhum dado foi alterado.');
  if (existing.length === 1) {
    if (existing[0].offerKey !== offerKey) throw new Error('Já existe uma entrega para este produto e plataforma vinculada a outra oferta. Abra Entrega de campanha para conferir o fluxo; nenhum dado foi alterado.');
    const existingGeo = normalizeDeliveryGeography(existing[0].countries, existing[0].geoTargetingMode);
    if (!existingGeo.countries.length && existingGeo.geoTargetingMode === 'COUNTRIES') {
      const records = listCampaignDeliveries(target);
      const index = records.findIndex(record => record.id === existing[0].id);
      if (index >= 0) {
        records[index] = { ...records[index], geoTargetingMode, countries, updatedAt: new Date().toISOString() };
        target.setItem(STORAGE_KEY, JSON.stringify(records));
        return records[index];
      }
    }
    return existing[0];
  }
  const commissionAmountUsd = input.commissionAmountUsd == null ? null : parseCommissionUsd(input.commissionAmountUsd);
  if (input.commissionAmountUsd != null && (commissionAmountUsd == null || !isCommissionUsd(commissionAmountUsd))) throw new Error('A comissão da oferta precisa ser um valor válido em USD.');
  const operationSnapshot = input.operationSnapshot?.type === 'campaign_delivery_started'
    ? {
      type: 'campaign_delivery_started',
      sourceActivity: String(input.operationSnapshot.sourceActivity || '').trim() || `Curadoria ${platformCode === 'GM' ? 'Guru Media' : 'ClickBank'}`,
      destinationActivity: String(input.operationSnapshot.destinationActivity || '').trim() || 'Criação de campanha',
    }
    : null;
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = {
    id: `delivery-${id}`,
    createdAt: now,
    updatedAt: now,
    offerKey,
    platformCode,
    offerName,
    seller: String(input.seller || '').trim(),
    productName,
    ...(commissionAmountUsd != null ? { commissionAmountUsd, commissionCurrency: 'USD' } : {}),
    ...(Object.hasOwn(input,'brandBidding') ? {brandBidding:['brand_bidding','no_brand_bidding'].includes(input.brandBidding)?input.brandBidding:null} : {}),
    affiliateUrl: String(input.affiliateUrl || '').trim(),
    geoTargetingMode,
    countries,
    positiveKeywords: cleanList(input.positiveKeywords),
    negativeKeywords: cleanList(input.negativeKeywords),
    negativeKeywordCountries: cleanList(input.negativeKeywordCountries, 20).map(value => value.toUpperCase()),
    ...(String(input.imageSearchTerm ?? '').trim() ? { imageSearchTerm: String(input.imageSearchTerm).trim().slice(0, 250) } : {}),
    openedAt: { curadoria: '', assets: '', presell: '', campaign: '' },
    ...(operationSnapshot ? { operationSnapshot } : {}),
  };
  const records = listCampaignDeliveries(target);
  records.unshift(record);
  target.setItem(STORAGE_KEY, JSON.stringify(records));
  return record;
}

export function markCampaignDeliveryOpened(id, stage, storage) {
  if (!['curadoria', 'assets', 'presell', 'campaign'].includes(stage)) return null;
  const target = storageFrom(storage);
  if (!target) return null;
  const records = listCampaignDeliveries(target);
  const index = records.findIndex(record => record.id === String(id || ''));
  if (index < 0) return null;
  const record = records[index];
  const next = { ...record, updatedAt: new Date().toISOString(), openedAt: { ...(record.openedAt || {}), [stage]: new Date().toISOString() } };
  records[index] = next;
  target.setItem(STORAGE_KEY, JSON.stringify(records));
  return next;
}

export const CAMPAIGN_DELIVERY_STORAGE_KEY = STORAGE_KEY;
