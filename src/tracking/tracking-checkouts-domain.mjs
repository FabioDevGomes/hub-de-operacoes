import { normalizeTrackingDomainInput, normalizeTrackingProductKey } from './tracking-domain-admin.mjs?v=11';

function onlyKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error(`${label} contém campos inesperados.`);
  }
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} inválido no relatório de checkouts.`);
  return value;
}

function normalizeGeneratedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
      || !Number.isFinite(Date.parse(value))) {
    throw new Error('O relatório de checkouts não informou um horário válido.');
  }
  return value;
}

export function normalizeTrackingCheckoutsReport(value) {
  onlyKeys(value, [
    'ok', 'schema_version', 'generated_at_utc', 'total_checkouts',
    'matched_count', 'unmatched_count', 'ambiguous_count', 'counts',
  ], 'A resposta do servidor');
  if (value.ok !== true || value.schema_version !== 1 || !Array.isArray(value.counts)) {
    throw new Error('Resposta incompatível da API de checkouts por Track.');
  }

  const generatedAtUtc = normalizeGeneratedAt(value.generated_at_utc);
  const totalCount = nonNegativeSafeInteger(value.total_checkouts, 'total_checkouts');
  const matchedCount = nonNegativeSafeInteger(value.matched_count, 'matched_count');
  const unmatchedCount = nonNegativeSafeInteger(value.unmatched_count, 'unmatched_count');
  const ambiguousCount = nonNegativeSafeInteger(value.ambiguous_count, 'ambiguous_count');
  if (matchedCount + unmatchedCount + ambiguousCount !== totalCount) {
    throw new Error('Os totais do relatório de checkouts não conferem.');
  }

  const seenTracks = new Set();
  let totalByTrack = 0;
  const counts = value.counts.map((row, index) => {
    onlyKeys(row, ['presell_host', 'product_key', 'checkout_count'], `Track ${index + 1}`);
    let hostname;
    let productKey;
    try {
      hostname = normalizeTrackingDomainInput(row.presell_host);
      productKey = normalizeTrackingProductKey(row.product_key);
    } catch {
      throw new Error(`Track ${index + 1} inválida no relatório de checkouts.`);
    }
    if (hostname !== row.presell_host || productKey !== row.product_key) {
      throw new Error(`Track ${index + 1} não está normalizada no relatório de checkouts.`);
    }
    const checkoutCount = nonNegativeSafeInteger(row.checkout_count, `counts[${index}].checkout_count`);
    if (checkoutCount < 1) throw new Error(`Track ${index + 1} tem uma contagem de checkouts vazia.`);
    const key = JSON.stringify([hostname, productKey]);
    if (seenTracks.has(key)) throw new Error('O relatório de checkouts repete uma Track.');
    seenTracks.add(key);
    totalByTrack += checkoutCount;
    return Object.freeze({ hostname, productKey, checkoutCount });
  });
  if (totalByTrack !== matchedCount) throw new Error('A soma dos checkouts associados às Tracks não confere.');

  return Object.freeze({
    generatedAtUtc,
    totalCount,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    counts: Object.freeze(counts),
  });
}
