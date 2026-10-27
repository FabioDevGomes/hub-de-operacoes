export const GOOGLE_ADS_MAX_DATE_RANGE_DAYS = 366;
export const GOOGLE_ADS_MAX_CAMPAIGN_ROWS = 1000;
export const GOOGLE_ADS_DAILY_MAX_DAYS = 14;
export const GOOGLE_ADS_MAX_DAILY_ROWS = 10000;

const idPattern = /^\d{10}$/;

function text(value, limit = 240) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function count(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCurrency(value) {
  const normalized = text(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : '';
}

export function validateGoogleAdsDateRange(startDate, endDate) {
  const isoDate = value => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isoDate(startDate) || !isoDate(endDate)) return { valid: false, reason: 'invalid_date_range' };
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (start > end) return { valid: false, reason: 'invalid_date_range' };
  const inclusiveDays = Math.floor((end - start) / 86400000) + 1;
  if (inclusiveDays > GOOGLE_ADS_MAX_DATE_RANGE_DAYS) return { valid: false, reason: 'date_range_too_large' };
  return { valid: true, inclusiveDays };
}

export function validateGoogleAdsDailyDateRange(startDate, endDate) {
  const range = validateGoogleAdsDateRange(startDate, endDate);
  if (!range.valid) return range;
  if (range.inclusiveDays > GOOGLE_ADS_DAILY_MAX_DAYS) return { valid: false, reason: 'daily_date_range_too_large', inclusiveDays: range.inclusiveDays };
  return range;
}

export function normalizeGoogleAdsAccounts(payload) {
  if (!payload || payload.ok !== true || payload.schema_version !== 1
      || !Array.isArray(payload.managers) || !Array.isArray(payload.accounts)) {
    throw new Error('O servidor retornou uma lista de contas inválida.');
  }
  const managers = payload.managers.flatMap(item => {
    const customerId = item?.customer_id == null ? null : String(item.customer_id);
    if (customerId !== null && !idPattern.test(customerId)) return [];
    return [{
      customerId,
      name: text(item?.name) || (customerId ? `MCC ${customerId}` : 'Contas com acesso direto'),
      currencyCode: validCurrency(item?.currency_code),
      timeZone: text(item?.time_zone, 80),
    }];
  });
  const validManagerKeys = new Set(managers.map(item => item.customerId ?? 'direct'));
  const accounts = payload.accounts.flatMap(item => {
    const customerId = String(item?.customer_id ?? '');
    const managerCustomerId = item?.manager_customer_id == null ? null : String(item.manager_customer_id);
    const managerKey = managerCustomerId ?? 'direct';
    const currencyCode = validCurrency(item?.currency_code);
    if (!idPattern.test(customerId) || !validManagerKeys.has(managerKey) || !currencyCode || item?.manager === true) return [];
    return [{
      customerId,
      managerCustomerId,
      managerName: text(item?.manager_name) || 'Acesso direto',
      name: text(item?.name) || `Conta ${customerId}`,
      currencyCode,
      timeZone: text(item?.time_zone, 80),
      status: text(item?.status, 40).toUpperCase(),
    }];
  });
  const dedupedManagers = [...new Map(managers.map(item => [item.customerId ?? 'direct', item])).values()];
  const dedupedAccounts = [...new Map(accounts.map(item => [item.customerId, item])).values()];
  return {
    managers: dedupedManagers,
    accounts: dedupedAccounts,
    generatedAtUtc: text(payload.generated_at_utc, 40),
    warningCount: Math.max(0, Math.min(1000, Math.trunc(count(payload.warning_count) ?? 0))),
  };
}

export function normalizeGoogleAdsReport(payload) {
  if (!payload || payload.ok !== true || payload.schema_version !== 1 || !Array.isArray(payload.rows)) {
    throw new Error('O servidor retornou um relatório Google Ads inválido.');
  }
  if (payload.rows.length > GOOGLE_ADS_MAX_CAMPAIGN_ROWS) {
    throw new Error('O relatório excedeu o limite de linhas. Reduza o período.');
  }
  const customerId = String(payload.customer_id ?? '');
  const managerCustomerId = payload.manager_customer_id == null ? null : String(payload.manager_customer_id);
  const dateRange = validateGoogleAdsDateRange(payload.date_from, payload.date_to);
  if (!idPattern.test(customerId) || (managerCustomerId !== null && !idPattern.test(managerCustomerId)) || !dateRange.valid) {
    throw new Error('O servidor retornou metadados de relatório inválidos.');
  }
  const rows = payload.rows.flatMap(item => {
    const campaignId = String(item?.campaign_id ?? '');
    if (!/^\d{1,20}$/.test(campaignId)) return [];
    return [{
      campaignId,
      campaignName: text(item?.campaign_name) || `Campanha ${campaignId}`,
      campaignStatus: text(item?.campaign_status, 40).toUpperCase(),
      channelType: text(item?.channel_type, 60).toUpperCase(),
      impressions: count(item?.impressions) ?? 0,
      clicks: count(item?.clicks) ?? 0,
      ctr: count(item?.ctr),
      averageCpcMicros: count(item?.average_cpc_micros),
      costMicros: count(item?.cost_micros) ?? 0,
      conversions: count(item?.conversions) ?? 0,
      costPerConversionMicros: count(item?.cost_per_conversion_micros),
      conversionsValue: numeric(item?.conversions_value) ?? 0,
      searchImpressionShare: count(item?.search_impression_share),
      searchTopImpressionShare: count(item?.search_top_impression_share),
      searchAbsoluteTopImpressionShare: count(item?.search_absolute_top_impression_share),
    }];
  });
  const summary = rows.reduce((total, row) => {
    total.impressions += row.impressions ?? 0;
    total.clicks += row.clicks ?? 0;
    total.costMicros += row.costMicros ?? 0;
    total.conversions += row.conversions ?? 0;
    total.conversionsValue += row.conversionsValue ?? 0;
    return total;
  }, { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValue: 0 });
  summary.ctr = summary.impressions ? summary.clicks / summary.impressions : null;
  summary.averageCpcMicros = summary.clicks ? summary.costMicros / summary.clicks : null;
  summary.costPerConversionMicros = summary.conversions ? summary.costMicros / summary.conversions : null;
  return {
    customerId,
    managerCustomerId,
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
    timeZone: text(payload.time_zone, 80),
    currencyCode: validCurrency(payload.currency_code),
    generatedAtUtc: text(payload.generated_at_utc, 40),
    shareMetricsAvailable: payload.share_metrics_available === true,
    rows,
    summary,
  };
}

export function normalizeGoogleAdsDailyReport(payload) {
  if (!payload || payload.ok !== true || payload.schema_version !== 1 || !Array.isArray(payload.rows)) {
    throw new Error('O servidor retornou uma prévia diária Google Ads inválida.');
  }
  if (payload.rows.length > GOOGLE_ADS_MAX_DAILY_ROWS) {
    throw new Error('A prévia diária excedeu o limite de linhas. Reduza o período.');
  }
  const customerId = String(payload.customer_id ?? '');
  const managerCustomerId = payload.manager_customer_id == null ? null : String(payload.manager_customer_id);
  const dateRange = validateGoogleAdsDailyDateRange(payload.date_from, payload.date_to);
  if (!idPattern.test(customerId) || (managerCustomerId !== null && !idPattern.test(managerCustomerId)) || !dateRange.valid) {
    throw new Error('O servidor retornou metadados de prévia diária inválidos.');
  }
  const seenRows = new Set();
  const rows = payload.rows.flatMap(item => {
    const campaignId = String(item?.campaign_id ?? '');
    const date = text(item?.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < payload.date_from || date > payload.date_to
        || !idPattern.test(customerId) || !/^\d{1,20}$/.test(campaignId)) return [];
    const rowKey = `${date}:${campaignId}`;
    if (seenRows.has(rowKey)) throw new Error('A prévia diária contém linhas duplicadas para a mesma campanha e data.');
    seenRows.add(rowKey);
    return [{
      date,
      campaignId,
      campaignName: text(item?.campaign_name) || `Campanha ${campaignId}`,
      campaignStatus: text(item?.campaign_status, 40).toUpperCase(),
      channelType: text(item?.channel_type, 60).toUpperCase(),
      impressions: count(item?.impressions),
      clicks: count(item?.clicks),
      ctr: count(item?.ctr),
      averageCpcMicros: count(item?.average_cpc_micros),
      costMicros: count(item?.cost_micros),
      conversions: count(item?.conversions),
      costPerConversionMicros: count(item?.cost_per_conversion_micros),
      conversionsValue: numeric(item?.conversions_value),
      searchImpressionShare: count(item?.search_impression_share),
      searchTopImpressionShare: count(item?.search_top_impression_share),
      searchAbsoluteTopImpressionShare: count(item?.search_absolute_top_impression_share),
    }];
  });
  const summary = rows.reduce((total, row) => {
    total.impressions += row.impressions ?? 0;
    total.clicks += row.clicks ?? 0;
    total.costMicros += row.costMicros ?? 0;
    total.conversions += row.conversions ?? 0;
    total.conversionsValue += row.conversionsValue ?? 0;
    return total;
  }, { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValue: 0 });
  summary.ctr = summary.impressions ? summary.clicks / summary.impressions : null;
  summary.averageCpcMicros = summary.clicks ? summary.costMicros / summary.clicks : null;
  summary.costPerConversionMicros = summary.conversions ? summary.costMicros / summary.conversions : null;
  const businessDate = payload.business_date == null ? '' : text(payload.business_date, 10);
  const businessTimeZone = payload.business_time_zone == null ? '' : text(payload.business_time_zone, 80);
  const campaignStatusFilter = payload.campaign_status_filter == null ? 'ALL' : text(payload.campaign_status_filter, 20).toUpperCase();
  if (!['ALL', 'ENABLED'].includes(campaignStatusFilter)) throw new Error('O servidor retornou um filtro de status de campanha inválido.');
  if ((businessDate || businessTimeZone)
      && (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
        || businessDate !== payload.date_from || businessDate !== payload.date_to
        || businessTimeZone !== 'America/Sao_Paulo')) {
    throw new Error('O servidor retornou metadados inválidos para o dia civil de São Paulo.');
  }
  return {
    customerId,
    managerCustomerId,
    dateFrom: payload.date_from,
    dateTo: payload.date_to,
    timeZone: text(payload.time_zone, 80),
    businessDate: businessDate || null,
    businessTimeZone: businessTimeZone || null,
    campaignStatusFilter,
    sourceDateFrom: text(payload.source_date_from, 10) || null,
    sourceDateTo: text(payload.source_date_to, 10) || null,
    currencyCode: validCurrency(payload.currency_code),
    generatedAtUtc: text(payload.generated_at_utc, 40),
    shareMetricsAvailable: payload.share_metrics_available === true,
    queryComplete: payload.query_complete === true,
    rows,
    summary,
  };
}
