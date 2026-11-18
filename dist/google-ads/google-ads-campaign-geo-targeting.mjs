import { normalizeGoogleAdsCountryCodeInput, normalizeGoogleAdsCountryCodes } from './google-ads-country-codes.mjs?v=1';

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const CAMPAIGN_ID_PATTERN = /^[1-9]\d{0,19}$/;
const CUSTOMER_ID_PATTERN = /^\d{10}$/;
const GEO_SOURCES = new Set(['hub_creation', 'csv_export', 'batch_form']);

function normalizedCodes(value) {
  if (!Array.isArray(value)) return null;
  const codes = normalizeGoogleAdsCountryCodes(value.map(code => String(code ?? '').trim().toUpperCase()));
  if (codes.some(code => !COUNTRY_CODE_PATTERN.test(code)) || new Set(codes).size !== codes.length) return null;
  return codes.sort();
}

export function normalizeGoogleAdsCampaignGeoTargetingSnapshot(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const mode = String(value.mode || '').toUpperCase();
  const source = String(value.source || '');
  const recordedAtUtc = String(value.recordedAtUtc || '');
  const countryCodes = normalizedCodes(value.countryCodes);
  if (!['COUNTRIES', 'WORLD'].includes(mode) || !GEO_SOURCES.has(source)
      || !Number.isFinite(Date.parse(recordedAtUtc)) || countryCodes === null
      || (mode === 'WORLD' && countryCodes.length !== 0)
      || (mode === 'COUNTRIES' && countryCodes.length < 1)) return undefined;
  return { mode, countryCodes, source, recordedAtUtc: new Date(recordedAtUtc).toISOString() };
}

export function googleAdsCampaignGeoTargetingFromPayload(payload, {
  source = 'hub_creation',
  recordedAtUtc = new Date().toISOString(),
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const rawMode = String(payload.geoTargetingMode ?? payload.geo_targeting_mode ?? 'COUNTRIES').toUpperCase();
  const mode = rawMode === 'WORLD' ? 'WORLD' : rawMode === 'COUNTRIES' ? 'COUNTRIES' : '';
  const rawCodes = payload.geoTargetCountryCodes ?? payload.geo_target_country_codes;
  const countryCodes = mode === 'WORLD'
    ? []
    : Array.isArray(rawCodes) ? rawCodes
      : typeof rawCodes === 'string' ? normalizeGoogleAdsCountryCodeInput(rawCodes).countryCodes
        : null;
  if (!mode || countryCodes === null) return null;
  const snapshot = normalizeGoogleAdsCampaignGeoTargetingSnapshot({ mode, countryCodes, source, recordedAtUtc });
  return snapshot || null;
}

export function googleAdsCampaignGeoTargetingFromFormSnapshot(values, {
  source = 'batch_form',
  recordedAtUtc = new Date().toISOString(),
} = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const deliverySource = values.__hub_campaign_delivery_source && typeof values.__hub_campaign_delivery_source === 'object'
    ? values.__hub_campaign_delivery_source : {};
  const rawMode = String(values.geoTargetingMode ?? values.geo_targeting_mode ?? deliverySource.geoTargetingMode ?? '').toUpperCase();
  const mode = rawMode === 'WORLD' ? 'WORLD' : 'COUNTRIES';
  const rawCodes = values.geoTargetCountryCodes ?? values.geo_target_country_codes;
  const countryCodes = mode === 'WORLD'
    ? []
    : Array.isArray(rawCodes) ? rawCodes
      : typeof rawCodes === 'string' ? normalizeGoogleAdsCountryCodeInput(rawCodes).countryCodes
        : null;
  if (countryCodes === null) return null;
  const snapshot = normalizeGoogleAdsCampaignGeoTargetingSnapshot({ mode, countryCodes, source, recordedAtUtc });
  return snapshot || null;
}

export function googleAdsCampaignGeoTargetingFromBatch(_batch, campaign) {
  const saved = normalizeGoogleAdsCampaignGeoTargetingSnapshot(campaign?.geoTargetingSnapshot);
  return saved || null;
}

function campaignKey(managerCustomerId, customerId, campaignId) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  if (!CUSTOMER_ID_PATTERN.test(manager) || !CUSTOMER_ID_PATTERN.test(customer) || !CAMPAIGN_ID_PATTERN.test(campaign)) return '';
  return `${manager}|${customer}|${campaign}`;
}

function sameSnapshot(left, right) {
  return left.mode === right.mode && left.countryCodes.length === right.countryCodes.length
    && left.countryCodes.every((code, index) => code === right.countryCodes[index]);
}

export function buildGoogleAdsCampaignGeoTargetingIndex(batches) {
  const index = new Map();
  const conflicts = new Set();
  for (const batch of Array.isArray(batches) ? batches : []) {
    for (const campaign of Array.isArray(batch?.campaigns) ? batch.campaigns : []) {
      const key = campaignKey(campaign?.managerCustomerId, campaign?.customerId, campaign?.campaignId);
      const snapshot = googleAdsCampaignGeoTargetingFromBatch(batch, campaign);
      if (!key || !snapshot || conflicts.has(key)) continue;
      const previous = index.get(key);
      if (previous && !sameSnapshot(previous, snapshot)) {
        index.delete(key);
        conflicts.add(key);
      } else if (!previous) index.set(key, snapshot);
    }
  }
  for (const key of conflicts) index.set(key, { conflict: true });
  return index;
}

export function googleAdsGeographicCountryTargetStatus(index, row) {
  const key = campaignKey(row?.managerCustomerId, row?.customerId, row?.campaignId);
  const snapshot = key ? index?.get(key) : null;
  if (snapshot?.conflict) return {
    state: 'conflict', label: 'GEO conflitante',
    title: 'Há lotes salvos com listas de países diferentes para esta campanha; a comparação foi omitida.',
  };
  if (!snapshot) return {
    state: 'unknown', label: 'Sem GEO salvo',
    title: 'O Hub não tem uma lista de países associada a esta campanha.',
  };
  if (snapshot.mode === 'WORLD') return {
    state: 'world', label: 'Mundo',
    title: 'O lote foi registrado sem restrição de país. Isso não confirma a configuração atual no Google Ads.',
  };
  const included = snapshot.countryCodes.includes(String(row?.countryCode ?? '').toUpperCase());
  return included
    ? { state: 'included', label: 'Incluído', title: 'País incluído no GEO salvo no lote; alterações posteriores no Google Ads não são verificadas.' }
    : { state: 'outside', label: 'Fora da lista', title: 'País não consta no GEO salvo no lote; alterações posteriores no Google Ads não são verificadas.' };
}
