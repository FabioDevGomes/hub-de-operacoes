import { validateGoogleAdsSearchTermsDateRange } from './google-ads-search-terms-domain.mjs?v=5';

const STORAGE_KEY = 'hub.google-ads-search-terms:last-query:v1';
const MAX_CACHE_LENGTH = 1_500_000;
const CUSTOMER_ID = /^\d{10}$/;
const CAMPAIGN_ID = /^[1-9]\d{0,19}$/;
const CONSULTATION_ID = /^gsc-[a-z0-9-]{8,100}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validText(value, maxLength = 500) {
  return typeof value === 'string' && value.length <= maxLength;
}

function validNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validReport(report, query) {
  if (!report || !CUSTOMER_ID.test(String(report.customerId || ''))
    || !(report.managerCustomerId == null || CUSTOMER_ID.test(String(report.managerCustomerId)))
    || !validText(report.managerName, 250) || !validText(report.accountName, 250)
    || (report.currencyCode && !/^[A-Z]{3}$/.test(String(report.currencyCode)))
    || report.dateFrom !== query.dateFrom || report.dateTo !== query.dateTo
    || (report.campaignIdFilter == null ? null : String(report.campaignIdFilter)) !== query.campaignId
    || !Number.isSafeInteger(report.rowCount) || report.rowCount < 0
    || !Number.isSafeInteger(report.rowsWithoutKeyword) || report.rowsWithoutKeyword < 0
    || (report.purchaseMetricsComplete != null && typeof report.purchaseMetricsComplete !== 'boolean')
    || !Array.isArray(report.rows) || report.rowCount !== report.rows.length + report.rowsWithoutKeyword
    || !validTimestamp(report.queryCompletedAtUtc)) return false;

  return report.rows.every(row => row
    && validDate(row.date) && row.date >= query.dateFrom && row.date <= query.dateTo
    && validText(row.campaignId, 30) && CAMPAIGN_ID.test(row.campaignId)
    && validText(row.campaignName, 500) && Boolean(row.campaignName)
    && validText(row.adGroupId, 30) && Boolean(row.adGroupId)
    && validText(row.adGroupName, 500) && Boolean(row.adGroupName)
    && validText(row.searchTerm, 2000) && Boolean(row.searchTerm)
    && validText(row.keywordText, 2000) && Boolean(row.keywordText)
    && validText(row.keywordMatchType, 100) && validText(row.searchTermMatchType, 100)
    && Number.isSafeInteger(row.impressions) && row.impressions >= 1
    && Number.isSafeInteger(row.clicks) && row.clicks >= 0
    && validNonNegativeNumber(row.costMicros)
    && validNonNegativeNumber(row.conversions)
    && (report.purchaseMetricsComplete !== true
      || (validNonNegativeNumber(row.purchaseConversions) && validFiniteNumber(row.purchaseValue))));
}

function validQuery(value) {
  if (!value || value.schemaVersion !== 1 || !validTimestamp(value.savedAtUtc)
    || (value.consultationId != null && (typeof value.consultationId !== 'string' || !CONSULTATION_ID.test(value.consultationId)))
    || !validDate(value.dateFrom) || !validDate(value.dateTo)
    || !validateGoogleAdsSearchTermsDateRange(value.dateFrom, value.dateTo).valid
    || !(value.managerKey === 'direct' || CUSTOMER_ID.test(String(value.managerKey)))
    || !Array.isArray(value.selectedCustomerIds) || value.selectedCustomerIds.length < 1
    || value.selectedCustomerIds.length > 1000
    || value.selectedCustomerIds.some(id => !CUSTOMER_ID.test(String(id)))
    || new Set(value.selectedCustomerIds).size !== value.selectedCustomerIds.length
    || !(value.campaignId == null || CAMPAIGN_ID.test(String(value.campaignId)))
    || !validText(value.campaignName, 240)
    || (value.campaignId && (!value.campaignName || value.selectedCustomerIds.length !== 1))
    || !Array.isArray(value.reports) || value.reports.length < 1 || value.reports.length > 100
    || !Array.isArray(value.failures) || value.failures.length > value.selectedCustomerIds.length) return false;

  const query = { ...value, campaignId: value.campaignId == null ? null : String(value.campaignId) };
  const rowCount = value.reports.reduce((count, report) => count + (Array.isArray(report?.rows) ? report.rows.length : 0), 0);
  return rowCount <= 20_000
    && value.reports.every(report => value.selectedCustomerIds.includes(String(report.customerId))
      && (value.managerKey === 'direct' ? report.managerCustomerId == null : String(report.managerCustomerId) === value.managerKey)
      && validReport(report, query))
    && value.failures.every(failure => failure && validText(failure.accountName, 250) && validText(failure.message, 5000));
}

export function loadGoogleAdsSearchTermsCache({ storage = null } = {}) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return null;
    const value = JSON.parse(target.getItem(STORAGE_KEY) || 'null');
    return validQuery(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveGoogleAdsSearchTermsCache(query, { storage = null, savedAtUtc = new Date().toISOString() } = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste navegador não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste navegador não está disponível.');

  const value = { ...query, schemaVersion: 1, savedAtUtc };
  if (!validQuery(value)) throw new Error('A consulta não passou pela validação do cache local.');
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_CACHE_LENGTH) {
    throw new Error('A consulta é grande demais para o cache local do navegador.');
  }
  try {
    target.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error('Não foi possível guardar a consulta no cache local deste navegador.');
  }
  return { savedAtUtc };
}
