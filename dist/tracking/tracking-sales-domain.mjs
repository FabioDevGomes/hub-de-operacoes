import { normalizeTrackingDomainInput, normalizeTrackingProductKey } from './tracking-domain-admin.mjs?v=11';

export const TRACKING_SALES_PAGE_SIZE = 200;
export const TRACKING_SALES_MAX_SYNC_PAGES = 250;
export const TRACKING_SALES_MAX_SYNC_RECORDS = TRACKING_SALES_PAGE_SIZE * TRACKING_SALES_MAX_SYNC_PAGES;

const ID_PATTERN = /^(?:0|[1-9]\d{0,19})$/;
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
  onlyKeys(value, ['transaction_id', 'transaction_time_utc', 'attribution_status', 'presell_host', 'product_key'], label);
  const transactionId = normalizeId(value.transaction_id, `${label} · ID da transação`);
  if (transactionId === '0') throw new Error(`${label} · ID da transação deve ser positivo.`);
  const transactionTimeUtc = normalizeUtcTimestamp(value.transaction_time_utc, 'transaction_time_utc');
  if (!['matched', 'unmatched', 'ambiguous'].includes(value.attribution_status)) {
    throw new Error(`${label} · estado da associação inválido.`);
  }
  if (value.attribution_status === 'matched') {
    const track = normalizeTrackPair(value.presell_host, value.product_key, label);
    return Object.freeze({
      transactionId,
      transactionTimeUtc,
      attributionStatus: 'matched',
      presellHost: track.presellHost,
      productKey: track.productKey,
    });
  }
  if (value.presell_host !== null || value.product_key !== null) throw new Error(`${label} não pode atribuir uma Track quando a associação não é única.`);
  return Object.freeze({
    transactionId,
    transactionTimeUtc,
    attributionStatus: value.attribution_status,
    presellHost: null,
    productKey: null,
  });
}

export function normalizeTrackingSalesPage(value, expected = {}) {
  onlyKeys(value, ['ok', 'schema_version', 'snapshot_max_id', 'after_id', 'next_after_id', 'has_more', 'generated_at_utc', 'sales'], 'A resposta do servidor');
  if (value.ok !== true || value.schema_version !== 1 || typeof value.has_more !== 'boolean' || !Array.isArray(value.sales)) {
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
