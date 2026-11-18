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
  const baseKeys = [
    'ok', 'schema_version', 'generated_at_utc', 'total_checkouts',
    'matched_count', 'unmatched_count', 'ambiguous_count', 'counts',
  ];
  const hasCampaignAttribution = value?.schema_version === 2;
  onlyKeys(value, hasCampaignAttribution ? [...baseKeys, 'campaign_counts'] : baseKeys, 'A resposta do servidor');
  if (value.ok !== true || ![1, 2].includes(value.schema_version) || !Array.isArray(value.counts)
      || (hasCampaignAttribution && !Array.isArray(value.campaign_counts))) {
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

  const seenCampaignGroups = new Set();
  let totalByCampaignGroup = 0;
  const campaignCounts = hasCampaignAttribution
    ? value.campaign_counts.map((row, index) => {
      onlyKeys(row, ['presell_host', 'product_key', 'campaign_id', 'attribution_status', 'checkout_count'], `Campanha da Track ${index + 1}`);
      if (!Object.prototype.hasOwnProperty.call(row, 'campaign_id')) {
        throw new Error(`Campanha da Track ${index + 1} não informa o ID da campanha.`);
      }
      let hostname;
      let productKey;
      try {
        hostname = normalizeTrackingDomainInput(row.presell_host);
        productKey = normalizeTrackingProductKey(row.product_key);
      } catch {
        throw new Error(`Track ${index + 1} inválida no relatório de campanhas dos checkouts.`);
      }
      if (hostname !== row.presell_host || productKey !== row.product_key) {
        throw new Error(`Track ${index + 1} não está normalizada no relatório de campanhas dos checkouts.`);
      }
      const attributionStatus = row.attribution_status;
      if (!['attributed', 'missing', 'invalid', 'ambiguous'].includes(attributionStatus)) {
        throw new Error(`Estado de atribuição inválido na linha ${index + 1} do relatório de checkouts.`);
      }
      let campaignId = null;
      if (attributionStatus === 'attributed') {
        if (typeof row.campaign_id !== 'string' || !/^[1-9]\d{0,19}$/.test(row.campaign_id)) {
          throw new Error(`ID de campanha inválido na linha ${index + 1} do relatório de checkouts.`);
        }
        campaignId = row.campaign_id;
      } else if (row.campaign_id !== null) {
        throw new Error(`Uma linha sem atribuição segura contém ID de campanha na linha ${index + 1}.`);
      }
      const checkoutCount = nonNegativeSafeInteger(row.checkout_count, `campaign_counts[${index}].checkout_count`);
      if (checkoutCount < 1) throw new Error(`Campanha da Track ${index + 1} tem uma contagem de checkouts vazia.`);
      const key = JSON.stringify([hostname, productKey, attributionStatus, campaignId]);
      if (seenCampaignGroups.has(key)) throw new Error('O relatório de checkouts repete uma associação de campanha.');
      seenCampaignGroups.add(key);
      totalByCampaignGroup += checkoutCount;
      return Object.freeze({ hostname, productKey, campaignId, attributionStatus, checkoutCount });
    })
    : [];
  if (hasCampaignAttribution && totalByCampaignGroup !== matchedCount) {
    throw new Error('A soma dos checkouts associados às campanhas não confere.');
  }

  return Object.freeze({
    schemaVersion: value.schema_version,
    generatedAtUtc,
    totalCount,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    campaignAttributionAvailable: hasCampaignAttribution,
    counts: Object.freeze(counts),
    campaignCounts: Object.freeze(campaignCounts),
  });
}

export function resolveTrackingCheckoutCampaign(campaignId, campaignRows = []) {
  const normalizedId = String(campaignId ?? '').trim();
  if (!/^[1-9]\d{0,19}$/.test(normalizedId) || !Array.isArray(campaignRows)) {
    return Object.freeze({ status: 'invalid', campaignName: '' });
  }
  const matches = campaignRows.filter(row => String(row?.google_ads_campaign_id ?? '').trim() === normalizedId);
  if (matches.length === 0) return Object.freeze({ status: 'not-found', campaignName: '' });
  if (matches.length !== 1) return Object.freeze({ status: 'ambiguous', campaignName: '' });
  const campaignName = String(matches[0]?.nome_mcc || matches[0]?.nome_exibicao || '').trim();
  return Object.freeze({ status: 'resolved', campaignName: campaignName || 'Campanha sem nome no cadastro local' });
}
