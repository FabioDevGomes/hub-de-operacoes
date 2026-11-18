import { googleAdsSearchTermId } from './google-ads-search-terms-ai.mjs?v=2';

const MIN_CLICKS_FOR_NEGATIVE_REVIEW = 20;
const MIN_SPEND_TO_TARGET_CPA = 2;
const MIN_IMPRESSIONS_FOR_CTR_REVIEW = 100;
const LOW_CTR_VS_VISIBLE_CAMPAIGN = 0.5;
const KEYWORD_MATCH_TYPE_PRIORITY = { EXACT: 0, PHRASE: 1, BROAD: 2 };

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function signedNumeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function captureTimestamp(capture) {
  const timestamp = Date.parse(capture?.configuration?.generatedAtUtc || capture?.capturedAtUtc || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function googleAdsSearchTermCampaignKey(managerCustomerId, customerId, campaignId) {
  return `${digits(managerCustomerId)}|${digits(customerId)}|${String(campaignId ?? '')}`;
}

export function buildGoogleAdsSearchTermCampaignTargets(captures = []) {
  const latestTargets = new Map();
  const completeCaptures = (Array.isArray(captures) ? captures : [])
    .filter(capture => Number(capture?.captureSchemaVersion) >= 2
      && capture?.configuration?.complete === true
      && Array.isArray(capture.configuration.campaigns))
    .sort((left, right) => captureTimestamp(right) - captureTimestamp(left));

  for (const capture of completeCaptures) {
    const managerCustomerId = digits(capture.managerCustomerId);
    const customerId = digits(capture.customerId);
    if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId)) continue;
    for (const campaign of capture.configuration.campaigns) {
      const campaignId = String(campaign?.campaignId || '');
      if (!/^[1-9]\d{0,19}$/.test(campaignId)) continue;
      const key = googleAdsSearchTermCampaignKey(managerCustomerId, customerId, campaignId);
      if (latestTargets.has(key)) continue;

      const resolution = String(campaign.targetCpaResolution || '').toLowerCase();
      const rawTarget = campaign.targetCpaMicros == null ? null : Number(campaign.targetCpaMicros);
      const targetIsAvailable = rawTarget != null && Number.isFinite(rawTarget) && rawTarget > 0
        && !['not_set', 'unresolved_portfolio', 'unavailable'].includes(resolution);
      latestTargets.set(key, {
        targetCpaMicros: targetIsAvailable ? rawTarget : null,
        targetCpaResolution: resolution,
        currencyCode: String(capture.currencyCode || '').toUpperCase(),
      });
    }
  }
  return latestTargets;
}

function recommend(group, visibleCampaignCtr) {
  const targetCpaMicros = group.targetCpaMicros;
  if (group.conversions > 0) {
    if (targetCpaMicros == null) {
      return { kind: 'info', code: 'conversion_without_target', label: 'Conversão registrada · sem meta CPA' };
    }
    const cpaMicros = group.costMicros / group.conversions;
    return cpaMicros <= targetCpaMicros
      ? { kind: 'good', code: 'cpa_within_target', label: 'Conversão · CPA dentro da meta' }
      : { kind: 'review', code: 'cpa_above_target', label: 'Conversão · CPA acima da meta' };
  }

  if (group.purchaseMetricsAvailable && group.purchaseConversions > 0) {
    return { kind: 'info', code: 'purchase_without_primary_conversion', label: 'Compra atribuída · revisar objetivo' };
  }

  if (targetCpaMicros != null
    && group.clicks >= MIN_CLICKS_FOR_NEGATIVE_REVIEW
    && group.costMicros >= targetCpaMicros * MIN_SPEND_TO_TARGET_CPA) {
    return { kind: 'review', code: 'negative_candidate', label: 'Revisar possível negativa' };
  }

  const ctr = group.impressions > 0 ? group.clicks / group.impressions : 0;
  if (group.impressions >= MIN_IMPRESSIONS_FOR_CTR_REVIEW
    && visibleCampaignCtr > 0
    && ctr < visibleCampaignCtr * LOW_CTR_VS_VISIBLE_CAMPAIGN) {
    return { kind: 'review', code: 'low_ctr', label: 'CTR baixa · revisar intenção/anúncio' };
  }

  if (targetCpaMicros == null) {
    return group.clicks < MIN_CLICKS_FOR_NEGATIVE_REVIEW && group.impressions < MIN_IMPRESSIONS_FOR_CTR_REVIEW
      ? { kind: 'low-data', code: 'low_data', label: 'Poucos dados · aguardar' }
      : { kind: 'info', code: 'missing_target', label: 'Meta CPA indisponível · avaliar manualmente' };
  }
  return { kind: 'low-data', code: 'low_data', label: 'Sem conversão · aguardar mais dados' };
}

export function summarizeGoogleAdsSearchTerms(reports = [], campaignTargets = new Map(), { groupByDate = false } = {}) {
  const groups = new Map();
  const campaignTotals = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const managerCustomerId = digits(report.managerCustomerId);
    const customerId = digits(report.customerId);
    for (const row of Array.isArray(report.rows) ? report.rows : []) {
      const campaignId = String(row.campaignId || '');
      const normalizedTerm = String(row.searchTerm || '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
      if (!customerId || !campaignId || !normalizedTerm) continue;
      const matchType = String(row.searchTermMatchType || 'UNKNOWN').toUpperCase();
      const date = groupByDate ? String(row.date || '') : '';
      const campaignKey = googleAdsSearchTermCampaignKey(managerCustomerId, customerId, campaignId);
      const campaignTotalKey = groupByDate ? `${campaignKey}|${date}` : campaignKey;
      const campaignTotal = campaignTotals.get(campaignTotalKey) || { impressions: 0, clicks: 0 };
      campaignTotal.impressions += numeric(row.impressions);
      campaignTotal.clicks += numeric(row.clicks);
      campaignTotals.set(campaignTotalKey, campaignTotal);

      const groupKey = groupByDate
        ? `${campaignKey}|${date}|${matchType}|${normalizedTerm}`
        : `${campaignKey}|${matchType}|${normalizedTerm}`;
      const group = groups.get(groupKey) || {
        managerCustomerId,
        customerId,
        campaignId,
        managerName: report.managerName || 'MCC não identificada',
        accountName: report.accountName || 'Conta não identificada',
        currencyCode: String(report.currencyCode || '').toUpperCase(),
        campaignName: row.campaignName || 'Campanha não identificada',
        ...(groupByDate ? { date } : {}),
        searchTerm: String(row.searchTerm || '').trim().replace(/\s+/g, ' '),
        searchTermMatchType: matchType,
        keywordTexts: new Set(),
        keywordMatchTypesByText: new Map(),
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        purchaseMetricsAvailable: report.purchaseMetricsComplete === true,
        purchaseConversions: report.purchaseMetricsComplete === true ? 0 : null,
        purchaseValue: report.purchaseMetricsComplete === true ? 0 : null,
        targetCpaMicros: null,
      };
      const keywordText = String(row.keywordText || '').trim();
      const keywordMatchType = String(row.keywordMatchType || 'UNKNOWN').toUpperCase();
      group.keywordTexts.add(keywordText);
      const keywordMatchTypes = group.keywordMatchTypesByText.get(keywordText) || new Set();
      keywordMatchTypes.add(keywordMatchType);
      group.keywordMatchTypesByText.set(keywordText, keywordMatchTypes);
      group.impressions += numeric(row.impressions);
      group.clicks += numeric(row.clicks);
      group.costMicros += numeric(row.costMicros);
      group.conversions += numeric(row.conversions);
      if (group.purchaseMetricsAvailable && row.purchaseConversions != null && row.purchaseValue != null) {
        group.purchaseConversions += numeric(row.purchaseConversions);
        group.purchaseValue += signedNumeric(row.purchaseValue);
      } else {
        group.purchaseMetricsAvailable = false;
        group.purchaseConversions = null;
        group.purchaseValue = null;
      }
      const target = campaignTargets.get(campaignKey);
      if (target && (!target.currencyCode || !group.currencyCode || target.currencyCode === group.currencyCode)) {
        group.targetCpaMicros = target.targetCpaMicros;
      }
      groups.set(groupKey, group);
    }
  }

  const results = [...groups.values()].map(group => {
    const { keywordMatchTypesByText, ...serializableGroup } = group;
    const campaignKey = googleAdsSearchTermCampaignKey(group.managerCustomerId, group.customerId, group.campaignId);
    const campaignTotal = campaignTotals.get(groupByDate ? `${campaignKey}|${group.date}` : campaignKey);
    const visibleCampaignCtr = campaignTotal?.impressions ? campaignTotal.clicks / campaignTotal.impressions : 0;
    return {
      ...serializableGroup,
      termId: googleAdsSearchTermId(group),
      keywordTexts: [...group.keywordTexts].filter(Boolean).sort((left, right) => left.localeCompare(right, 'pt-BR')),
      keywordMatchDetails: [...keywordMatchTypesByText.entries()]
        .filter(([text]) => Boolean(text))
        .map(([text, matchTypes]) => ({
          text,
          matchTypes: [...matchTypes].sort((left, right) => (KEYWORD_MATCH_TYPE_PRIORITY[left] ?? 9) - (KEYWORD_MATCH_TYPE_PRIORITY[right] ?? 9) || left.localeCompare(right, 'pt-BR')),
        }))
        .sort((left, right) => left.text.localeCompare(right.text, 'pt-BR')),
      ctr: group.impressions ? group.clicks / group.impressions : 0,
      cpaMicros: group.conversions > 0 ? group.costMicros / group.conversions : null,
      purchaseCpaMicros: group.purchaseMetricsAvailable && group.purchaseConversions > 0
        ? group.costMicros / group.purchaseConversions
        : null,
      targetCpaMicros: group.targetCpaMicros,
      recommendation: recommend(group, visibleCampaignCtr),
    };
  });
  const priority = { negative_candidate: 0, cpa_above_target: 1, purchase_without_primary_conversion: 2, low_ctr: 3, cpa_within_target: 4, conversion_without_target: 5, missing_target: 6, low_data: 7 };
  results.sort((left, right) => (groupByDate ? right.date.localeCompare(left.date) : 0)
    || (priority[left.recommendation.code] ?? 9) - (priority[right.recommendation.code] ?? 9)
    || right.costMicros - left.costMicros
    || right.impressions - left.impressions
    || left.searchTerm.localeCompare(right.searchTerm, 'pt-BR'));
  return results;
}
