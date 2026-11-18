import { normalizeTrackingDomainInput, normalizeTrackingProductKey } from './tracking-domain-admin.mjs?v=11';

export const TRACKING_SALES_PAGE_SIZE = 200;
export const TRACKING_SALES_MAX_SYNC_PAGES = 250;
export const TRACKING_SALES_MAX_SYNC_RECORDS = TRACKING_SALES_PAGE_SIZE * TRACKING_SALES_MAX_SYNC_PAGES;

const ID_PATTERN = /^(?:0|[1-9]\d{0,19})$/;
const CAMPAIGN_ID_PATTERN = /^[1-9]\d{0,19}$/;
const CAMPAIGN_CANDIDATE_STATUSES = ['not_evaluated', 'click_not_found', 'campaign_id_missing', 'campaign_id_invalid', 'campaign_ambiguous', 'source_conflict', 'candidate'];
const CLICK_LINK_DIAGNOSTIC_STATUSES = ['not_available', 'extclid_missing', 'extclid_unusable', 'exact_click_not_found', 'click_missing_track_metadata', 'click_matches_multiple_tracks', 'track_matched'];
const PAGE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GENERATED_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function onlyKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error(`${label} contém campos inesperados.`);
  }
}

function normalizeId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value) || compareId(value, '18446744073709551615') > 0) {
    throw new Error(`${label} inválido na sincronização de vendas.`);
  }
  return value;
}

function compareId(left, right) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeUtcTimestamp(value, label, required = false) {
  if (value === null && !required) return null;
  const pattern = label === 'generated_at_utc' ? GENERATED_TIMESTAMP_PATTERN : PAGE_TIMESTAMP_PATTERN;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Horário UTC inválido na sincronização de vendas (${label}).`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || (pattern === PAGE_TIMESTAMP_PATTERN && date.toISOString() !== value)) {
    throw new Error(`Horário UTC inválido na sincronização de vendas (${label}).`);
  }
  return value;
}

function normalizeTrackPair(host, productKey, label) {
  if (typeof host !== 'string' || typeof productKey !== 'string') throw new Error(`${label} sem Track válida.`);
  let normalizedHost;
  let normalizedProductKey;
  try {
    normalizedHost = normalizeTrackingDomainInput(host);
    normalizedProductKey = normalizeTrackingProductKey(productKey);
  } catch {
    throw new Error(`${label} sem Track válida.`);
  }
  if (normalizedHost !== host || normalizedProductKey !== productKey) throw new Error(`${label} sem Track normalizada.`);
  return { presellHost: normalizedHost, productKey: normalizedProductKey };
}

export function normalizeTrackingSale(value, label = 'Venda') {
  onlyKeys(value, ['transaction_id', 'transaction_time_utc', 'received_at_utc', 'commission_total', 'commission_currency', 'attribution_status', 'presell_host', 'product_key', 'click_link_diagnostic', 'click_campaign_candidate'], label);
  const transactionId = normalizeId(value.transaction_id, `${label} · ID da transação`);
  if (transactionId === '0') throw new Error(`${label} · ID da transação deve ser positivo.`);
  const transactionTimeUtc = normalizeUtcTimestamp(value.transaction_time_utc, 'transaction_time_utc');
  const receivedAtUtc = value.received_at_utc === undefined ? null : normalizeUtcTimestamp(value.received_at_utc, 'received_at_utc');
  const commissionTotal = value.commission_total === undefined ? null : value.commission_total;
  const commissionCurrency = value.commission_currency === undefined ? null : value.commission_currency;
  if (!(commissionTotal === null || (typeof commissionTotal === 'string' && /^\d{1,10}(?:\.\d{1,4})?$/.test(commissionTotal)))
      || !(commissionCurrency === null || (typeof commissionCurrency === 'string' && /^[A-Z]{3}$/.test(commissionCurrency)))) {
    throw new Error(`${label} · comissão ou moeda inválida na sincronização de vendas.`);
  }
  if (!['matched', 'unmatched', 'ambiguous'].includes(value.attribution_status)) {
    throw new Error(`${label} · estado da associação inválido.`);
  }
  const rawClickLinkDiagnostic = value.click_link_diagnostic;
  let clickLinkDiagnosticStatus = 'not_available';
  if (rawClickLinkDiagnostic !== undefined) {
    onlyKeys(rawClickLinkDiagnostic, ['status'], `${label} · diagnóstico do clique`);
    if (!CLICK_LINK_DIAGNOSTIC_STATUSES.includes(rawClickLinkDiagnostic.status) || rawClickLinkDiagnostic.status === 'not_available') {
      throw new Error(`${label} · diagnóstico do clique inválido.`);
    }
    clickLinkDiagnosticStatus = rawClickLinkDiagnostic.status;
  }
  const rawCandidate = value.click_campaign_candidate;
  let clickCampaignCandidate;
  if (rawCandidate === undefined) {
    clickCampaignCandidate = Object.freeze({ status: 'not_evaluated', source: null, campaignId: null });
  } else {
    onlyKeys(rawCandidate, ['status', 'source', 'campaign_id'], `${label} · candidato de campanha`);
    if (!CAMPAIGN_CANDIDATE_STATUSES.includes(rawCandidate.status)) {
      throw new Error(`${label} · estado do candidato de campanha inválido.`);
    }
    if (rawCandidate.status === 'candidate') {
      if (rawCandidate.source !== 'utm_campaign_campaignid' || typeof rawCandidate.campaign_id !== 'string' || !CAMPAIGN_ID_PATTERN.test(rawCandidate.campaign_id)) {
        throw new Error(`${label} · candidato de campanha inválido.`);
      }
      clickCampaignCandidate = Object.freeze({ status: 'candidate', source: rawCandidate.source, campaignId: rawCandidate.campaign_id });
    } else {
      if (rawCandidate.source !== null || rawCandidate.campaign_id !== null) {
        throw new Error(`${label} · candidato sem associação não pode conter fonte ou ID.`);
      }
      clickCampaignCandidate = Object.freeze({ status: rawCandidate.status, source: null, campaignId: null });
    }
  }
  if (value.attribution_status === 'matched') {
    const track = normalizeTrackPair(value.presell_host, value.product_key, label);
    return Object.freeze({
      transactionId,
      transactionTimeUtc,
      receivedAtUtc,
      commissionTotal,
      commissionCurrency,
      attributionStatus: 'matched',
      presellHost: track.presellHost,
      productKey: track.productKey,
      clickLinkDiagnosticStatus,
      clickCampaignCandidate,
    });
  }
  if (value.presell_host !== null || value.product_key !== null) throw new Error(`${label} não pode atribuir uma Track quando a associação não é única.`);
  return Object.freeze({
    transactionId,
    transactionTimeUtc,
    receivedAtUtc,
    commissionTotal,
    commissionCurrency,
    attributionStatus: value.attribution_status,
    presellHost: null,
    productKey: null,
    clickLinkDiagnosticStatus,
    clickCampaignCandidate,
  });
}

/** Resolves a candidate only when a trusted Hub or complete API snapshot confirms its local identity. */
export function resolveTrackingSaleCampaign(sale, campaignRows = []) {
  const candidate = sale?.clickCampaignCandidate;
  if (!candidate || candidate.status !== 'candidate' || !CAMPAIGN_ID_PATTERN.test(String(candidate.campaignId || ''))) {
    return Object.freeze({ status: candidate?.status || 'not_evaluated', managerCustomerId: null, customerId: null, campaignId: null });
  }
  if (!Array.isArray(campaignRows)) return Object.freeze({ status: 'candidate_unmapped', managerCustomerId: null, customerId: null, campaignId: candidate.campaignId });
  const matches = campaignRows.filter(row => String(row?.google_ads_campaign_id ?? '').trim() === candidate.campaignId);
  if (!matches.length) return Object.freeze({ status: 'candidate_unmapped', managerCustomerId: null, customerId: null, campaignId: candidate.campaignId });
  const identities = new Map();
  let incomplete = false;
  let unverified = false;
  for (const row of matches) {
    const managerCustomerId = String(row?.mcc_id ?? '').replace(/\D/g, '');
    const customerId = String(row?.conta_id ?? '').replace(/\D/g, '');
    const campaignId = String(row?.google_ads_campaign_id ?? '').trim();
    if ((managerCustomerId && !/^\d{10}$/.test(managerCustomerId)) || !/^\d{10}$/.test(customerId) || campaignId !== candidate.campaignId) {
      incomplete = true;
      continue;
    }
    const key = JSON.stringify([managerCustomerId, customerId, campaignId]);
    const identity = identities.get(key) || { managerCustomerId, customerId, campaignId, trusted: true };
    if (!['hub_created', 'google_ads_api_snapshot'].includes(row?.google_ads_campaign_origem)) identity.trusted = false;
    identities.set(key, identity);
  }
  if (identities.size > 1) return Object.freeze({ status: 'campaign_ambiguous', managerCustomerId: null, customerId: null, campaignId: candidate.campaignId });
  if (incomplete || !identities.size) return Object.freeze({ status: 'campaign_identity_incomplete', managerCustomerId: null, customerId: null, campaignId: candidate.campaignId });
  const identity = identities.values().next().value;
  if (!identity.trusted) unverified = true;
  if (unverified) return Object.freeze({ status: 'campaign_source_unverified', managerCustomerId: null, customerId: null, campaignId: candidate.campaignId });
  return Object.freeze({ status: 'matched', managerCustomerId: identity.managerCustomerId, customerId: identity.customerId, campaignId: identity.campaignId });
}

export function normalizeTrackingSalesPage(value, expected = {}) {
  onlyKeys(value, ['ok', 'schema_version', 'snapshot_max_id', 'after_id', 'next_after_id', 'has_more', 'generated_at_utc', 'sales'], 'A resposta do servidor');
  if (value.ok !== true || ![1, 2, 3, 4].includes(value.schema_version) || typeof value.has_more !== 'boolean' || !Array.isArray(value.sales)) {
    throw new Error('Resposta incompatível da API de vendas por Track.');
  }
  if (value.sales.length > TRACKING_SALES_PAGE_SIZE || (value.has_more && value.sales.length !== TRACKING_SALES_PAGE_SIZE)) {
    throw new Error('A página da API de vendas excede o limite esperado.');
  }
  const snapshotMaxId = normalizeId(value.snapshot_max_id, 'Cursor máximo');
  const afterId = normalizeId(value.after_id, 'Cursor atual');
  const nextAfterId = normalizeId(value.next_after_id, 'Próximo cursor');
  normalizeUtcTimestamp(value.generated_at_utc, 'generated_at_utc', true);
  if (expected.afterId !== undefined && afterId !== expected.afterId) throw new Error('A API retornou um cursor diferente do solicitado.');
  if (expected.snapshotMaxId !== undefined && expected.snapshotMaxId !== null && snapshotMaxId !== expected.snapshotMaxId) {
    throw new Error('O snapshot de vendas mudou durante a paginação; tente atualizar novamente.');
  }
  if (compareId(afterId, snapshotMaxId) > 0) throw new Error('O cursor de vendas ultrapassa o snapshot do servidor.');

  if (value.schema_version === 3 && value.sales.some(sale => !Object.prototype.hasOwnProperty.call(sale || {}, 'click_campaign_candidate'))) {
    throw new Error('A resposta schema 3 não informou o candidato de campanha em todas as vendas.');
  }
  if (value.schema_version === 4 && value.sales.some(sale => !Object.prototype.hasOwnProperty.call(sale || {}, 'click_link_diagnostic')
      || !Object.prototype.hasOwnProperty.call(sale || {}, 'click_campaign_candidate'))) {
    throw new Error('A resposta schema 4 não informou os diagnósticos de clique e campanha em todas as vendas.');
  }
  const sales = value.sales.map((sale, index) => normalizeTrackingSale(sale, `Venda ${index + 1}`));
  const ids = new Set();
  let previousId = afterId;
  for (const sale of sales) {
    if (ids.has(sale.transactionId) || compareId(sale.transactionId, previousId) <= 0 || compareId(sale.transactionId, snapshotMaxId) > 0) {
      throw new Error('A paginação de vendas contém IDs duplicados ou fora de ordem.');
    }
    ids.add(sale.transactionId);
    previousId = sale.transactionId;
  }
  const expectedNext = sales.length ? sales.at(-1).transactionId : afterId;
  if (nextAfterId !== expectedNext || (value.has_more && compareId(nextAfterId, afterId) <= 0)) {
    throw new Error('O próximo cursor da API de vendas é inconsistente.');
  }
  return Object.freeze({
    snapshotMaxId,
    afterId,
    nextAfterId,
    hasMore: value.has_more,
    generatedAtUtc: value.generated_at_utc,
    sales: Object.freeze(sales),
  });
}

export function summarizeTrackingSales(sales, tracks = []) {
  const countsByTrack = new Map();
  let matchedCount = 0;
  let unmatchedCount = 0;
  let ambiguousCount = 0;
  const currentKeys = new Set(tracks.map(track => JSON.stringify([track.hostname, track.productKey])));
  const historicalKeys = new Set();
  for (const sale of sales) {
    if (sale.attributionStatus === 'matched') {
      matchedCount += 1;
      const key = JSON.stringify([sale.presellHost, sale.productKey]);
      countsByTrack.set(key, (countsByTrack.get(key) || 0) + 1);
      if (!currentKeys.has(key)) historicalKeys.add(key);
    } else if (sale.attributionStatus === 'ambiguous') ambiguousCount += 1;
    else unmatchedCount += 1;
  }
  const historicalCount = [...historicalKeys].reduce((total, key) => total + countsByTrack.get(key), 0);
  return Object.freeze({
    totalCount: sales.length,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    historicalCount,
    countsByTrack,
  });
}
