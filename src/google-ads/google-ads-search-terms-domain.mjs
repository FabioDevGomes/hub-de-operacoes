const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SEARCH_TERMS_DAYS = 31;

function parseDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds;
}

export function validateGoogleAdsSearchTermsDateRange(dateFrom, dateTo) {
  const start = parseDate(dateFrom);
  const end = parseDate(dateTo);
  if (start == null || end == null || start > end) return { valid: false, reason: 'invalid_date_range' };
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > MAX_SEARCH_TERMS_DAYS) return { valid: false, reason: 'search_terms_date_range_too_large', days };
  return { valid: true, days };
}

function nonNegativeNumber(value, { integer = false } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isSafeInteger(number))) return null;
  return number;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeGoogleAdsSearchTerms(payload, expected = {}) {
  const managerCustomerId = expected.managerCustomerId || null;
  const expectedCampaignId = expected.campaignId == null || expected.campaignId === '' ? null : String(expected.campaignId);
  const actualCampaignId = payload?.campaign_id_filter === '' ? null : (payload?.campaign_id_filter ?? null);
  const scopeMismatches = [];
  if (!payload || payload.ok !== true) scopeMismatches.push('confirmação de sucesso');
  if (payload?.schema_version !== 1) scopeMismatches.push('versão do formato');
  if (payload?.query_complete !== true) scopeMismatches.push('consulta completa');
  if (payload?.campaign_scope !== 'SEARCH') scopeMismatches.push('escopo de campanhas Search');
  if (payload?.customer_id !== expected.customerId) scopeMismatches.push('conta selecionada');
  if ((payload?.manager_customer_id ?? null) !== managerCustomerId) scopeMismatches.push('MCC selecionada');
  if (payload?.date_from !== expected.dateFrom || payload?.date_to !== expected.dateTo) scopeMismatches.push('período selecionado');
  if (actualCampaignId !== expectedCampaignId) scopeMismatches.push('filtro de campanha');
  if (!Array.isArray(payload?.rows)) scopeMismatches.push('lista de linhas');
  if (scopeMismatches.length) {
    throw new Error(`A resposta não corresponde ao escopo selecionado (${scopeMismatches.join(', ')}). Nenhum dado foi gravado.`);
  }

  const rowCount = nonNegativeNumber(payload.row_count, { integer: true });
  const rowsWithoutKeyword = nonNegativeNumber(payload.rows_without_keyword, { integer: true });
  if (rowCount == null || rowsWithoutKeyword == null || rowCount !== payload.rows.length + rowsWithoutKeyword) {
    throw new Error('A resposta da consulta de termos não confirmou todas as linhas recebidas. Nenhum dado foi gravado.');
  }

  const rows = payload.rows.map(row => {
    const date = text(row?.date);
    const impressions = nonNegativeNumber(row?.impressions, { integer: true });
    const clicks = nonNegativeNumber(row?.clicks, { integer: true });
    const costMicros = nonNegativeNumber(row?.cost_micros);
    const conversions = nonNegativeNumber(row?.conversions);
    const normalized = {
      date,
      campaignId: text(row?.campaign_id),
      campaignName: text(row?.campaign_name),
      adGroupId: text(row?.ad_group_id),
      adGroupName: text(row?.ad_group_name),
      searchTerm: text(row?.search_term),
      keywordText: text(row?.keyword_text),
      keywordMatchType: text(row?.keyword_match_type),
      searchTermMatchType: text(row?.search_term_match_type),
      impressions,
      clicks,
      costMicros,
      conversions,
    };
    if (parseDate(date) == null || date < expected.dateFrom || date > expected.dateTo
      || !normalized.campaignId || !normalized.campaignName || !normalized.adGroupId || !normalized.adGroupName
      || (expectedCampaignId && normalized.campaignId !== expectedCampaignId)
      || !normalized.searchTerm || !normalized.keywordText || impressions == null || impressions < 1
      || clicks == null || costMicros == null || conversions == null) {
      throw new Error('A resposta da consulta contém linha incompleta ou sem palavra-chave associada. Nenhum dado foi gravado.');
    }
    return normalized;
  });

  return {
    customerId: payload.customer_id,
    managerCustomerId,
    managerName: text(expected.managerName) || (managerCustomerId ? `MCC ${managerCustomerId}` : 'Acesso direto'),
    accountName: text(expected.accountName) || `Conta ${payload.customer_id}`,
    currencyCode: text(expected.currencyCode),
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
    campaignIdFilter: expectedCampaignId,
    rowCount,
    rowsWithoutKeyword,
    rows,
  };
}

export function normalizeGoogleAdsSearchTermCampaigns(payload, expected = {}) {
  const managerCustomerId = expected.managerCustomerId || null;
  if (!payload || payload.ok !== true || payload.schema_version !== 1 || payload.query_complete !== true
    || payload.campaign_scope !== 'SEARCH' || payload.customer_id !== expected.customerId
    || (payload.manager_customer_id ?? null) !== managerCustomerId || !Array.isArray(payload.campaigns)
    || payload.campaigns.length > 1000) {
    throw new Error('A lista de campanhas Search veio incompleta ou pertence a outra conta. Nenhum dado foi alterado.');
  }
  const campaignCount = nonNegativeNumber(payload.campaign_count, { integer: true });
  if (campaignCount == null || campaignCount !== payload.campaigns.length) {
    throw new Error('A resposta não confirmou a lista completa de campanhas Search. Nenhum dado foi alterado.');
  }
  const campaigns = payload.campaigns.map(item => ({
    campaignId: text(item?.campaign_id),
    campaignName: text(item?.campaign_name),
  }));
  if (campaigns.some(item => !/^[1-9]\d{0,19}$/.test(item.campaignId) || !item.campaignName)
    || new Set(campaigns.map(item => item.campaignId)).size !== campaigns.length) {
    throw new Error('A lista de campanhas contém IDs inválidos ou duplicados. Nenhum dado foi alterado.');
  }
  campaigns.sort((left, right) => left.campaignName.localeCompare(right.campaignName, 'pt-BR') || left.campaignId.localeCompare(right.campaignId));
  return {
    customerId: payload.customer_id,
    managerCustomerId,
    campaignCount,
    campaigns,
  };
}
