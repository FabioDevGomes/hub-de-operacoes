import { TRACKING_CLICKS_MAX_DAYS } from './tracking-clicks-domain.mjs?v=5';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,4})?$/;
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const GURUMEDIA_MACRO_PATTERN = /^\{[a-z][a-z0-9_]*\}$/i;
export const GURUMEDIA_POSTBACK_ENDPOINT = 'https://track.travenzo.shop/gurumedia-sales-postback.php';
export const GURUMEDIA_SALES_DETAILS_LIMIT = 1000;
export const GURUMEDIA_POSTBACK_MACRO_DEFAULTS = Object.freeze({
  transactionId: '{transaction_id}',
  offerId: '{offer_id}',
  offerName: '{offer_name}',
  payoutAmount: '{payout_amount}',
  currency: '{offer_currency}',
  conversionTime: '{timestamp}',
});

const GURUMEDIA_POSTBACK_MACRO_MAPPINGS = Object.freeze([
  ['transaction_id', 'transactionId', true],
  ['click_id', null, true],
  ['offer_name', 'offerName', false],
  ['payout_amount', 'payoutAmount', true],
  ['currency', 'currency', true],
  ['conversion_time', 'conversionTime', true],
  ['offer_id', 'offerId', true],
]);

function missingGuruMediaPostbackChecks() {
  return GURUMEDIA_POSTBACK_MACRO_MAPPINGS.map(([parameter, key, required]) => ({
    parameter,
    expectedMacro: key === null ? '{sub6}' : GURUMEDIA_POSTBACK_MACRO_DEFAULTS[key],
    required,
    status: required ? 'missing' : 'optional-missing',
  }));
}

function guruMediaPostbackMacroValue(key, source) {
  if (key === null) return '{sub6}';
  return typeof source?.[key] === 'string' ? source[key].trim() : '';
}

export function buildGuruMediaPostbackMacroParams(macros = {}) {
  const mappings = GURUMEDIA_POSTBACK_MACRO_MAPPINGS.map(([parameter, key, required]) => ({
    parameter,
    macro: guruMediaPostbackMacroValue(key, macros),
    required,
  }));
  if (mappings.some(({ macro, required }) => required && !GURUMEDIA_MACRO_PATTERN.test(macro))) return null;
  if (mappings.some(({ macro }) => macro && !GURUMEDIA_MACRO_PATTERN.test(macro))) return null;
  return mappings.filter(({ macro }) => macro).map(({ parameter, macro }) => `${parameter}=${macro}`);
}

export function inspectGuruMediaPostbackUrl(value) {
  let url;
  try { url = new URL(String(value ?? '').trim()); }
  catch { return { valid: false, endpointMatches: false, tokenPresent: false, checks: missingGuruMediaPostbackChecks() }; }

  const endpoint = new URL(GURUMEDIA_POSTBACK_ENDPOINT);
  const endpointMatches = url.origin === endpoint.origin && url.pathname === endpoint.pathname;
  const tokenValues = url.searchParams.getAll('token');
  const tokenPresent = tokenValues.length === 1 && tokenValues[0].length > 0;
  const checks = GURUMEDIA_POSTBACK_MACRO_MAPPINGS.map(([parameter, key, required]) => {
    const expectedMacro = key === null ? '{sub6}' : GURUMEDIA_POSTBACK_MACRO_DEFAULTS[key];
    const values = url.searchParams.getAll(parameter);
    let status = 'ok';
    if (values.length === 0) status = required ? 'missing' : 'optional-missing';
    else if (values.length !== 1 || values[0] !== expectedMacro) status = 'mismatch';
    return { parameter, expectedMacro, required, status };
  });
  const checksValid = checks.every(({ required, status }) => status === 'ok' || (!required && status === 'optional-missing'));
  return { valid: endpointMatches && tokenPresent && checksValid, endpointMatches, tokenPresent, checks };
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isUtcTimestamp(value) {
  return typeof value === 'string' && UTC_TIMESTAMP_PATTERN.test(value)
    && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function safeText(value, field, maxLength = 253) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`O relatório contém ${field} inválido.`);
  }
  return value;
}

function moneyUnits(value, field = 'payout') {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) throw new Error(`O relatório contém ${field} inválido.`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

function normalizeCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new Error('O relatório contém uma moeda inválida.');
  return value;
}

export function validateGuruMediaSalesDateRange(startDate, endDate) {
  if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) throw new Error('invalid_date_range');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > TRACKING_CLICKS_MAX_DAYS) throw new Error('date_range_too_large');
  return { startDate, endDate };
}

export function normalizeGuruMediaSalesReport(payload, expectedRange) {
  const range = validateGuruMediaSalesDateRange(expectedRange?.startDate, expectedRange?.endDate);
  const allowedFields = ['ok', 'schema_version', 'generated_at_utc', 'start_date', 'end_date', 'count_semantics', 'summary', 'rows', 'sale_details', 'sale_details_truncated'];
  const hasSaleDetails = Object.hasOwn(payload || {}, 'sale_details');
  const hasSaleDetailsTruncated = Object.hasOwn(payload || {}, 'sale_details_truncated');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).some(key => !allowedFields.includes(key))
      || hasSaleDetails !== hasSaleDetailsTruncated
      || (hasSaleDetails && (!Array.isArray(payload.sale_details)
        || payload.sale_details.length > GURUMEDIA_SALES_DETAILS_LIMIT
        || typeof payload.sale_details_truncated !== 'boolean'))
      || payload.ok !== true || payload.schema_version !== 1
      || payload.start_date !== range.startDate || payload.end_date !== range.endDate
      || payload.count_semantics !== 'matched_sales_only'
      || typeof payload.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generated_at_utc)
      || !Number.isFinite(Date.parse(payload.generated_at_utc))
      || !payload.summary || typeof payload.summary !== 'object' || Array.isArray(payload.summary)
      || !Array.isArray(payload.summary.payout_by_currency) || !Array.isArray(payload.rows)) {
    throw new Error('O servidor retornou um relatório GuruMedia inválido.');
  }
  const summaryFields = ['sales_count', 'payout_by_currency', 'unmatched_callbacks', 'ambiguous_callbacks', 'conversion_time_coverage'];
  if (Object.keys(payload.summary).some(key => !summaryFields.includes(key))
      || !Number.isSafeInteger(payload.summary.sales_count) || payload.summary.sales_count < 0
      || !Number.isSafeInteger(payload.summary.unmatched_callbacks) || payload.summary.unmatched_callbacks < 0
      || !Number.isSafeInteger(payload.summary.ambiguous_callbacks) || payload.summary.ambiguous_callbacks < 0) {
    throw new Error('O servidor retornou totais GuruMedia inválidos.');
  }
  let saleDetails = null;
  if (hasSaleDetails) {
    if (payload.sale_details_truncated
      ? payload.sale_details.length !== GURUMEDIA_SALES_DETAILS_LIMIT || payload.summary.sales_count <= GURUMEDIA_SALES_DETAILS_LIMIT
      : payload.sale_details.length !== payload.summary.sales_count) {
      throw new Error('Os detalhes GuruMedia não correspondem ao total de vendas.');
    }
    saleDetails = payload.sale_details.map(sale => {
      const fields = ['sale_key', 'received_at_utc', 'conversion_at_utc', 'product_key', 'product_label', 'presell_host', 'offer_name', 'currency', 'payout_amount', 'google_ads_status', 'google_ads_error_code'];
      if (!sale || typeof sale !== 'object' || Array.isArray(sale) || Object.keys(sale).some(key => !fields.includes(key))
          || (sale.sale_key !== undefined && (typeof sale.sale_key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sale.sale_key)))
          || (sale.google_ads_status !== undefined && !['not_sent', 'pending', 'processing', 'validated', 'accepted', 'processed', 'partial_success', 'rejected', 'blocked', 'unknown'].includes(sale.google_ads_status))
          || (sale.google_ads_error_code !== undefined && sale.google_ads_error_code !== null
            && (typeof sale.google_ads_error_code !== 'string' || sale.google_ads_error_code.length > 120 || !/^[A-Za-z0-9_, -]+$/.test(sale.google_ads_error_code)))
          || !isUtcTimestamp(sale.received_at_utc)
          || sale.received_at_utc.slice(0, 10) < range.startDate || sale.received_at_utc.slice(0, 10) > range.endDate
          || !(sale.conversion_at_utc === null || isUtcTimestamp(sale.conversion_at_utc))) {
        throw new Error('O servidor retornou um horário de venda GuruMedia inválido.');
      }
      const productKey = sale.product_key === null ? null : safeText(sale.product_key, 'identificador do produto', 253);
      if (productKey !== null && !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) {
        throw new Error('O servidor retornou um identificador de produto inválido.');
      }
      if (typeof sale.presell_host !== 'string' || !HOST_PATTERN.test(sale.presell_host)) {
        throw new Error('O relatório GuruMedia contém um domínio inválido.');
      }
      const payoutAmount = sale.payout_amount;
      moneyUnits(payoutAmount, 'comissão');
      return {
        saleKey: sale.sale_key?.toLowerCase() || null,
        receivedAtUtc: sale.received_at_utc,
        conversionAtUtc: sale.conversion_at_utc,
        productKey,
        productLabel: safeText(sale.product_label, 'nome do Track'),
        presellHost: sale.presell_host,
        offerName: safeText(sale.offer_name, 'nome da oferta'),
        currency: normalizeCurrency(sale.currency),
        payoutAmount,
        googleAdsStatus: sale.google_ads_status || 'not_sent',
        googleAdsErrorCode: sale.google_ads_error_code || null,
      };
    });
  }
  const rawConversionTimeCoverage = payload.summary.conversion_time_coverage;
  let conversionTimeCoverage = null;
  if (rawConversionTimeCoverage !== undefined) {
    const coverageFields = ['sales_count', 'sales_with_conversion_time', 'sales_missing_conversion_time'];
    if (!rawConversionTimeCoverage || typeof rawConversionTimeCoverage !== 'object' || Array.isArray(rawConversionTimeCoverage)
        || Object.keys(rawConversionTimeCoverage).some(key => !coverageFields.includes(key))
        || !Number.isSafeInteger(rawConversionTimeCoverage.sales_count) || rawConversionTimeCoverage.sales_count < 0
        || !Number.isSafeInteger(rawConversionTimeCoverage.sales_with_conversion_time) || rawConversionTimeCoverage.sales_with_conversion_time < 0
        || !Number.isSafeInteger(rawConversionTimeCoverage.sales_missing_conversion_time) || rawConversionTimeCoverage.sales_missing_conversion_time < 0
        || rawConversionTimeCoverage.sales_count !== payload.summary.sales_count
        || rawConversionTimeCoverage.sales_with_conversion_time + rawConversionTimeCoverage.sales_missing_conversion_time !== rawConversionTimeCoverage.sales_count) {
      throw new Error('O servidor retornou cobertura de horário GuruMedia inválida.');
    }
    conversionTimeCoverage = {
      salesCount: rawConversionTimeCoverage.sales_count,
      salesWithConversionTime: rawConversionTimeCoverage.sales_with_conversion_time,
      salesMissingConversionTime: rawConversionTimeCoverage.sales_missing_conversion_time,
    };
  }
  if (payload.rows.length > 5000 || payload.summary.payout_by_currency.length > 20) {
    throw new Error('O relatório GuruMedia excedeu o limite de linhas ou moedas.');
  }

  const rowTotals = new Map();
  const seen = new Set();
  const rows = payload.rows.map(row => {
    const fields = ['date_utc', 'product_key', 'product_label', 'presell_host', 'offer_name', 'currency', 'sales_count', 'payout_total'];
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !fields.includes(key))) {
      throw new Error('O servidor retornou uma linha GuruMedia inválida.');
    }
    if (!isDate(row.date_utc) || row.date_utc < range.startDate || row.date_utc > range.endDate) {
      throw new Error('O relatório GuruMedia contém uma data fora do período consultado.');
    }
    const productKey = row.product_key === null ? null : safeText(row.product_key, 'identificador do produto', 253);
    if (productKey !== null && !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) {
      throw new Error('O relatório GuruMedia contém um identificador de produto inválido.');
    }
    const productLabel = safeText(row.product_label, 'nome do Track');
    const offerName = safeText(row.offer_name, 'nome da oferta');
    if (typeof row.presell_host !== 'string' || !HOST_PATTERN.test(row.presell_host)) {
      throw new Error('O relatório GuruMedia contém um domínio inválido.');
    }
    const currency = normalizeCurrency(row.currency);
    if (!Number.isSafeInteger(row.sales_count) || row.sales_count < 1) throw new Error('O relatório GuruMedia contém uma contagem inválida.');
    const payoutTotal = row.payout_total;
    const units = moneyUnits(payoutTotal);
    const identity = [row.date_utc, productKey ?? '', productLabel ?? '', row.presell_host, offerName ?? '', currency].join('\0');
    if (seen.has(identity)) throw new Error('O relatório GuruMedia contém uma linha agregada duplicada.');
    seen.add(identity);
    const current = rowTotals.get(currency) || { count: 0, units: 0n };
    current.count += row.sales_count;
    current.units += units;
    rowTotals.set(currency, current);
    return {
      dateUtc: row.date_utc,
      productKey,
      productLabel,
      presellHost: row.presell_host,
      offerName,
      currency,
      salesCount: row.sales_count,
      payoutTotal,
    };
  });

  const payoutByCurrency = payload.summary.payout_by_currency.map(item => {
    const fields = ['currency', 'sales_count', 'payout_total'];
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !fields.includes(key))) {
      throw new Error('O servidor retornou um resumo GuruMedia inválido.');
    }
    const currency = normalizeCurrency(item.currency);
    if (!Number.isSafeInteger(item.sales_count) || item.sales_count < 0) throw new Error('O relatório GuruMedia contém um total inválido.');
    const payoutTotal = item.payout_total;
    const units = moneyUnits(payoutTotal, 'payout total');
    const rowTotal = rowTotals.get(currency) || { count: 0, units: 0n };
    if (item.sales_count !== rowTotal.count || units !== rowTotal.units) throw new Error('Os totais GuruMedia não correspondem às linhas do relatório.');
    rowTotals.delete(currency);
    return { currency, salesCount: item.sales_count, payoutTotal };
  });
  if (rowTotals.size || payoutByCurrency.reduce((sum, item) => sum + item.salesCount, 0) !== payload.summary.sales_count) {
    throw new Error('Os totais GuruMedia não correspondem às linhas do relatório.');
  }
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    generatedAtUtc: payload.generated_at_utc,
    summary: {
      salesCount: payload.summary.sales_count,
      payoutByCurrency,
      unmatchedCallbacks: payload.summary.unmatched_callbacks,
      ambiguousCallbacks: payload.summary.ambiguous_callbacks,
      ...(conversionTimeCoverage ? { conversionTimeCoverage } : {}),
    },
    rows,
    saleDetails,
    saleDetailsTruncated: hasSaleDetails ? payload.sale_details_truncated : false,
  };
}

export function normalizeGuruMediaCampaignAttribution(payload, expectedRange) {
  const range = validateGuruMediaSalesDateRange(expectedRange?.startDate, expectedRange?.endDate);
  const fields = ['ok', 'schema_version', 'report_type', 'generated_at_utc', 'start_date', 'end_date', 'summary', 'query_count', 'account_timezone_query_count', 'click_view_query_count', 'truncated', 'rows'];
  const summaryFields = ['matched_count', 'no_match_count', 'missing_gclid_count', 'ambiguous_count', 'lookup_error_count', 'not_queried_count'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).some(key => !fields.includes(key))
      || payload.ok !== true || payload.schema_version !== 1 || payload.report_type !== 'campaign_attribution'
      || payload.start_date !== range.startDate || payload.end_date !== range.endDate
      || typeof payload.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generated_at_utc)
      || !Number.isFinite(Date.parse(payload.generated_at_utc))
      || !payload.summary || typeof payload.summary !== 'object' || Array.isArray(payload.summary)
      || Object.keys(payload.summary).some(key => !summaryFields.includes(key))
      || summaryFields.some(key => !Number.isSafeInteger(payload.summary[key]) || payload.summary[key] < 0)
      || !Number.isSafeInteger(payload.query_count) || payload.query_count < 0 || payload.query_count > 20
      || !Number.isSafeInteger(payload.account_timezone_query_count) || payload.account_timezone_query_count < 0 || payload.account_timezone_query_count > payload.query_count
      || !Number.isSafeInteger(payload.click_view_query_count) || payload.click_view_query_count < 0 || payload.click_view_query_count > payload.query_count
      || payload.account_timezone_query_count + payload.click_view_query_count !== payload.query_count
      || typeof payload.truncated !== 'boolean' || !Array.isArray(payload.rows) || payload.rows.length > 500) {
    throw new Error('O servidor retornou um relatório de campanhas GuruMedia inválido. Publique os serviços privados atualizados.');
  }
  const statuses = new Set([
    'matched', 'no_match', 'gclid_missing', 'gclid_missing_braid_present', 'click_ambiguous', 'ambiguous_campaign',
    'lookup_error', 'lookup_limit', 'outside_click_view_window', 'click_date_future', 'track_mapping_missing', 'gclid_invalid',
    'click_missing', 'click_time_invalid',
  ]);
  const rows = payload.rows.map(row => {
    const rowFields = ['received_at_utc', 'conversion_at_utc', 'product_key', 'product_label', 'presell_host', 'offer_name', 'currency', 'payout_amount', 'status', 'campaign_id', 'campaign_name', 'error_code', 'click_at_utc', 'gclid_masked'];
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some(key => !rowFields.includes(key))
        || !isUtcTimestamp(row.received_at_utc)
        || row.received_at_utc.slice(0, 10) < range.startDate || row.received_at_utc.slice(0, 10) > range.endDate
        || !(row.conversion_at_utc === null || isUtcTimestamp(row.conversion_at_utc))
        || !(row.click_at_utc === undefined || row.click_at_utc === null || isUtcTimestamp(row.click_at_utc))
        || !(row.gclid_masked === undefined || row.gclid_masked === null || (typeof row.gclid_masked === 'string' && /^…[!-~]{6}$/.test(row.gclid_masked)))
        || typeof row.presell_host !== 'string' || !HOST_PATTERN.test(row.presell_host)
        || typeof row.status !== 'string' || !statuses.has(row.status)) {
      throw new Error('O servidor retornou uma venda GuruMedia com dados de campanha inválidos.');
    }
    const productKey = row.product_key === null ? null : safeText(row.product_key, 'identificador do produto', 253);
    if (productKey !== null && !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) {
      throw new Error('O relatório de campanhas contém um identificador de produto inválido.');
    }
    const payoutAmount = row.payout_amount;
    moneyUnits(payoutAmount, 'comissão');
    const campaignId = row.campaign_id;
    const campaignName = row.campaign_name;
    if (row.status === 'matched') {
      if (typeof campaignId !== 'string' || !/^[1-9]\d{0,19}$/.test(campaignId)
          || typeof campaignName !== 'string' || !campaignName.trim()
          || row.error_code !== null) {
        throw new Error('O relatório de campanhas contém uma campanha identificada inválida.');
      }
    } else if (campaignId !== null || campaignName !== null) {
      throw new Error('O relatório de campanhas associa uma campanha a uma venda não resolvida.');
    }
    const errorCode = row.error_code === null ? null : safeText(row.error_code, 'código de consulta', 64);
    if ((row.status === 'lookup_error') !== (errorCode !== null)) {
      throw new Error('O relatório de campanhas contém um estado de erro inconsistente.');
    }
    return {
      receivedAtUtc: row.received_at_utc,
      conversionAtUtc: row.conversion_at_utc,
      productKey,
      productLabel: row.product_label === null ? null : safeText(row.product_label, 'nome do Track'),
      presellHost: row.presell_host,
      offerName: row.offer_name === null ? null : safeText(row.offer_name, 'nome da oferta'),
      currency: normalizeCurrency(row.currency),
      payoutAmount,
      campaignAttribution: {
        status: row.status,
        campaignId,
        campaignName,
        errorCode,
        clickAtUtc: row.click_at_utc ?? null,
        gclidMasked: row.gclid_masked ?? null,
      },
    };
  });
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    generatedAtUtc: payload.generated_at_utc,
    summary: { ...payload.summary },
    queryCount: payload.query_count,
    accountTimeZoneQueryCount: payload.account_timezone_query_count,
    clickViewQueryCount: payload.click_view_query_count,
    truncated: payload.truncated,
    rows,
  };
}

export function normalizeGuruMediaBillingSalesPage(payload, expectedRange) {
  const range = validateGuruMediaSalesDateRange(expectedRange?.startDate, expectedRange?.endDate);
  const pageFields = ['ok', 'schema_version', 'report_type', 'generated_at_utc', 'start_date', 'end_date', 'date_filter_basis', 'total_sales', 'page_size', 'has_more', 'next_cursor', 'sales'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).some(key => !pageFields.includes(key))
      || payload.ok !== true || payload.schema_version !== 2 || payload.report_type !== 'billing_sales'
      || payload.start_date !== range.startDate || payload.end_date !== range.endDate
      || payload.date_filter_basis !== 'received_at_utc'
      || !Number.isSafeInteger(payload.total_sales) || payload.total_sales < 0
      || !Number.isSafeInteger(payload.page_size) || payload.page_size < 1 || payload.page_size > 500
      || typeof payload.has_more !== 'boolean' || !Array.isArray(payload.sales)
      || payload.sales.length > payload.page_size || (payload.has_more && payload.sales.length !== payload.page_size)
      || (payload.has_more ? typeof payload.next_cursor !== 'string' : payload.next_cursor !== null)
      || typeof payload.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generated_at_utc)
      || !Number.isFinite(Date.parse(payload.generated_at_utc))) {
    throw new Error('O servidor retornou uma página de vendas GuruMedia inválida. Publique a versão atual do serviço privado.');
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sales = payload.sales.map((sale, index) => {
    const fields = ['sale_key', 'source_platform', 'conversion_at_utc', 'received_at_utc', 'billing_at_utc', 'billing_date_source', 'product_key', 'product_label', 'presell_host', 'offer_id', 'offer_name', 'payout_amount', 'currency'];
    if (!sale || typeof sale !== 'object' || Array.isArray(sale) || Object.keys(sale).some(key => !fields.includes(key))
        || typeof sale.sale_key !== 'string' || !uuidPattern.test(sale.sale_key)
        || sale.source_platform !== 'gurumedia'
        || !isUtcTimestamp(sale.received_at_utc)
        || sale.received_at_utc.slice(0, 10) < range.startDate || sale.received_at_utc.slice(0, 10) > range.endDate
        || !(sale.conversion_at_utc === null || isUtcTimestamp(sale.conversion_at_utc))
        || sale.billing_at_utc !== (sale.conversion_at_utc || sale.received_at_utc)
        || sale.billing_date_source !== (sale.conversion_at_utc ? 'conversion_time' : 'received_time_fallback')) {
      throw new Error(`A venda GuruMedia ${index + 1} tem identidade ou horário inválido.`);
    }
    if (typeof sale.presell_host !== 'string' || !HOST_PATTERN.test(sale.presell_host)) throw new Error('A venda GuruMedia contém um domínio inválido.');
    const productKey = sale.product_key === null ? null : safeText(sale.product_key, 'identificador do produto', 253);
    if (productKey !== null && !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) throw new Error('A venda GuruMedia contém um identificador de produto inválido.');
    const payoutAmount = sale.payout_amount;
    moneyUnits(payoutAmount, 'comissão');
    return Object.freeze({
      saleKey: sale.sale_key,
      conversionAtUtc: sale.conversion_at_utc,
      receivedAtUtc: sale.received_at_utc,
      billingAtUtc: sale.billing_at_utc,
      billingDateSource: sale.billing_date_source,
      productKey,
      productLabel: safeText(sale.product_label, 'nome do Track'),
      presellHost: sale.presell_host,
      offerId: sale.offer_id === null ? null : safeText(sale.offer_id, 'ID da oferta', 64),
      offerName: safeText(sale.offer_name, 'nome da oferta'),
      payoutAmount,
      currency: normalizeCurrency(sale.currency),
    });
  });
  const seen = new Set();
  for (const sale of sales) {
    if (seen.has(sale.saleKey)) throw new Error('A página GuruMedia contém chaves de venda duplicadas.');
    seen.add(sale.saleKey);
  }
  if (payload.has_more && payload.next_cursor !== sales.at(-1)?.saleKey) throw new Error('O cursor da página GuruMedia é inconsistente.');
  return Object.freeze({
    startDate: range.startDate,
    endDate: range.endDate,
    generatedAtUtc: payload.generated_at_utc,
    totalSales: payload.total_sales,
    pageSize: payload.page_size,
    hasMore: payload.has_more,
    nextCursor: payload.next_cursor,
    sales: Object.freeze(sales),
  });
}

export function sumGuruMediaPayouts(values) {
  const units = values.reduce((sum, value) => sum + moneyUnits(value), 0n);
  const whole = units / 10000n;
  const fraction = String(units % 10000n).padStart(4, '0');
  return `${whole}.${fraction}`;
}

export function formatGuruMediaPayout(value, currency) {
  const units = moneyUnits(value);
  const whole = new Intl.NumberFormat('pt-BR').format(units / 10000n);
  let fraction = String(units % 10000n).padStart(4, '0');
  while (fraction.length > 2 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${currency} ${whole},${fraction.padEnd(2, '0')}`;
}

export function guruMediaTrackFilterKey(row) {
  return `${row.productKey ?? ''}\0${row.presellHost}`;
}
