import { parseGoogleAdsCampaignName } from '../google-ads/google-ads-campaign-name-parser.mjs?v=6';

const CAMPAIGN_FIELDS = Object.freeze([
  'id', 'nome_mcc', 'nome_exibicao', 'status', 'estado_campanha_observado',
  'data_inicio_confirmada', 'data_inicio_ano_inferido', 'google_ads_campaign_id',
  'google_ads_campaign_origem',
]);

const DIARY_COLUMNS = Object.freeze({
  B: 'impressions', C: 'google_clicks', D: 'platform_clicks', E: 'presell_advances',
  F: 'google_conversions', G: 'ctr', H: 'reported_checkouts', I: 'average_cpc_usd',
  J: 'average_cpc_brl', K: 'absolute_top_impression_share', L: 'top_impression_share',
  M: 'daily_budget', N: 'bidding_strategy', O: 'media_cost_brl', P: 'commission_brl',
  R: 'search_impression_share',
});

const API_METRIC_FIELDS = Object.freeze([
  'impressions', 'clicks', 'conversions', 'costMicros', 'averageCpcMicros',
  'costPerConversionMicros', 'conversionsValue', 'searchImpressionShare',
  'searchTopImpressionShare', 'searchAbsoluteTopImpressionShare',
  'topImpressionPercentage', 'absoluteTopImpressionPercentage',
]);

function scalar(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
  if (/^[+-]?\d+(?:,\d+)?%?$/.test(text)) {
    const percent = text.endsWith('%');
    const number = Number(text.replace('%', '').replace(',', '.'));
    return Number.isFinite(number) ? (percent ? number / 100 : number) : text;
  }
  return text.slice(0, 240);
}

function safeDate(value) {
  const date = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function safeLabel(value, max = 160) {
  return String(value || '').replace(/https?:\/\/\S+/gi, '[URL removida]').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function lastFour(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

function coverage(rows, dateField = 'date') {
  const dates = rows.map(row => safeDate(row?.[dateField])).filter(Boolean).sort();
  return {
    rows: rows.length,
    date_from: dates[0] || null,
    date_to: dates.at(-1) || null,
    dates_available: [...new Set(dates)],
  };
}

function campaignRows(base) {
  return (Array.isArray(base?.campanhas) ? base.campanhas : []).map(campaign => {
    const row = {};
    for (const field of CAMPAIGN_FIELDS) {
      const value = campaign?.[field];
      if (value !== undefined && value !== null && value !== '') row[field] = value;
    }
    const parsedName = parseGoogleAdsCampaignName(campaign?.nome_mcc || campaign?.nome_exibicao || '');
    if (parsedName.ok) row.campaign_name_parameters = {
      source: 'parsed_from_campaign_name',
      affiliate_platform: parsedName.platform,
      bidding_model: parsedName.biddingModel,
      target_cpa_percent_of_commission: scalar(parsedName.targetCpaPercent),
      commission_amount_from_name: scalar(parsedName.commissionAmount),
      commission_currency_from_name: parsedName.commissionCurrency,
      desired_cpa_from_name: scalar(parsedName.desiredCpa),
      geo_targeting_mode_from_name: parsedName.geoTargetingMode,
      countries_from_name: [...parsedName.countries],
    };
    if (campaign?.conta_id) row.account_suffix = lastFour(campaign.conta_id);
    if (campaign?.mcc_id) row.manager_suffix = lastFour(campaign.mcc_id);
    return row;
  });
}

function diaryRows(base) {
  return (Array.isArray(base?.diario) ? base.diario : []).map(record => {
    const metrics = {};
    for (const [column, name] of Object.entries(DIARY_COLUMNS)) {
      const cell = record?.celulas?.[column];
      if (!cell || !Object.hasOwn(cell, 'value')) continue;
      metrics[name] = scalar(cell.value);
    }
    return {
      campaign_id: String(record?.campanha_id || ''),
      date: safeDate(record?.data),
      periods: Array.isArray(record?.periodos) ? [...record.periodos] : [],
      sources: Array.isArray(record?.fontes) ? [...record.fontes] : [],
      metrics,
    };
  }).filter(row => row.date);
}

function apiDailyCaptures(base) {
  return (Array.isArray(base?.google_ads_api_daily_captures) ? base.google_ads_api_daily_captures : []).map(capture => ({
    date: safeDate(capture?.date),
    captured_at_utc: capture?.capturedAtUtc || capture?.generatedAtUtc || null,
    time_zone: capture?.timeZone || null,
    business_time_zone: capture?.businessTimeZone || null,
    currency: capture?.currencyCode || null,
    period: capture?.businessTimeZone === 'America/Sao_Paulo' ? 'D-1' : 'D0_or_recent_window',
    query_complete: capture?.queryComplete === true,
    coverage_status: capture?.coverageStatus || null,
    scope: capture?.campaignStatusFilter || 'ALL',
    campaigns: (Array.isArray(capture?.rows) ? capture.rows : []).map(row => ({
      campaign_id: String(row?.campaignInternalId || ''),
      google_ads_campaign_id: String(row?.campaignId || ''),
      mapping_status: row?.mappingStatus || 'unknown',
      campaign_status: row?.campaignStatus || null,
      channel_type: row?.channelType || null,
      metrics: Object.fromEntries(API_METRIC_FIELDS.map(field => [field, scalar(row?.[field])])),
      inferred_zero: row?.inferredZero === true,
    })),
    configuration: (Array.isArray(capture?.configuration?.campaigns) ? capture.configuration.campaigns : []).map(row => ({
      campaign_id: String(row?.campaignInternalId || ''),
      google_ads_campaign_id: String(row?.campaignId || ''),
      campaign_status: row?.campaignStatus || null,
      bidding_strategy: row?.biddingStrategyType || null,
      target_cpa_micros: scalar(row?.targetCpaMicros),
      target_cpa_resolution: row?.targetCpaResolution || null,
      budget_period: row?.budgetPeriod || null,
      budget_amount_micros: scalar(row?.budgetAmountMicros),
      budget_total_amount_micros: scalar(row?.budgetTotalAmountMicros),
      budget_shared: typeof row?.budgetShared === 'boolean' ? row.budgetShared : null,
    })),
    account_suffix: lastFour(capture?.customerId),
    manager_suffix: lastFour(capture?.managerCustomerId),
  })).filter(row => row.date);
}

function captureSnapshots(base) {
  return (Array.isArray(base?.google_ads_api_capture_snapshots) ? base.google_ads_api_capture_snapshots : []).map(snapshot => ({
    captured_at_utc: snapshot?.completedAtUtc || null,
    period: snapshot?.periodType || null,
    execution_mode: snapshot?.executionMode || null,
    scope: snapshot?.scope || 'ALL',
    complete_account_count: snapshot?.accountCount ?? null,
    campaigns: (Array.isArray(snapshot?.accounts) ? snapshot.accounts : []).flatMap(account =>
      (Array.isArray(account?.campaigns) ? account.campaigns : []).map(row => ({
        date: safeDate(account?.date),
        campaign_id: String(row?.campaignInternalId || ''),
        google_ads_campaign_id: String(row?.campaignId || ''),
        campaign_name: String(row?.campaignName || '').slice(0, 240),
        campaign_status: row?.campaignStatus || null,
        channel_type: row?.channelType || null,
        mapping_status: row?.mappingStatus || 'unknown',
        currency: account?.currencyCode || null,
        time_zone: account?.timeZone || null,
        query_complete: account?.queryComplete === true,
        metrics_available: row?.metricsAvailable === true,
        inferred_zero: row?.inferredZero === true,
        metrics: Object.fromEntries(API_METRIC_FIELDS.map(field => [field, scalar(row?.[field])])),
      }))),
  }));
}

function campaignStatusReconciliation(base, overview) {
  if (!overview) return null;
  const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  const rows = values => {
    const entries = (Array.isArray(values) ? values : []).map(value => {
    const campaignId = String(value?.campaign_id || value?.campaignInternalId || '').trim();
    const campaignName = String(value?.campaign_name || value?.campaignName || value || '').trim();
    const key = campaignId ? `id:${campaignId}` : `name:${normalizeName(campaignName)}`;
    return [key, { campaign_id: campaignId || null, campaign_name: campaignName || null, match_basis: campaignId ? 'campaign_id' : 'campaign_name' }];
    }).filter(([key, value]) => key !== 'name:' && (value.campaign_id || value.campaign_name));
    return [...new Map(entries).values()];
  };
  const snapshots = Array.isArray(base?.google_ads_api_capture_snapshots) ? base.google_ads_api_capture_snapshots : [];
  const latest = snapshots
    .filter(snapshot => String(snapshot?.scope || 'ALL').toUpperCase() === 'ALL'
      && Array.isArray(snapshot?.accounts) && snapshot.accounts.length > 0
      && snapshot.accounts.every(account => account?.queryComplete === true))
    .sort((left, right) => String(right?.completedAtUtc || '').localeCompare(String(left?.completedAtUtc || '')))[0] || null;
  const apiRows = (Array.isArray(latest?.accounts) ? latest.accounts : [])
    .flatMap(account => Array.isArray(account?.campaigns) ? account.campaigns : [])
    .filter(row => String(row?.campaignInternalId || row?.campaignId || row?.campaignName || '').trim());
  const apiEnabled = rows(apiRows.filter(row => String(row?.campaignStatus || '').toUpperCase() === 'ENABLED').map(row => ({ campaign_id: row.campaignInternalId, campaign_name: row.campaignName })));
  const cardActive = rows(overview.card_active_campaigns);
  const tableActive = rows(overview.table_active_campaigns);
  const difference = (left, right) => {
    const rightKeys = new Set(right.map(row => row.campaign_id ? `id:${row.campaign_id}` : `name:${normalizeName(row.campaign_name)}`));
    return left.filter(row => !rightKeys.has(row.campaign_id ? `id:${row.campaign_id}` : `name:${normalizeName(row.campaign_name)}`));
  };
  const matchBasis = [...cardActive, ...tableActive, ...apiEnabled].every(row => row.campaign_id) ? 'campaign_id' : 'campaign_id_with_name_fallback';
  return {
    operational_source_mode: overview.operational_source_mode || null,
    dashboard_card_active_count: Number.isInteger(overview.card_active_count) ? overview.card_active_count : null,
    dashboard_table_active_count: Number.isInteger(overview.table_active_count) ? overview.table_active_count : null,
    dashboard_table_filter: overview.table_filter || null,
    latest_saved_api_snapshot: latest ? {
      captured_at_utc: latest.completedAtUtc || null,
      scope: latest.scope || 'ALL',
      active_enabled_count: apiEnabled.length,
      campaign_count_with_names: apiRows.length,
    } : null,
    comparison_match_basis: matchBasis,
    differences: {
      card_active_not_enabled_in_latest_api_snapshot: difference(cardActive, apiEnabled),
      table_active_not_enabled_in_latest_api_snapshot: difference(tableActive, apiEnabled),
      latest_api_enabled_not_active_on_card: difference(apiEnabled, cardActive),
    },
    note: 'A contagem do cartão e a tabela podem usar status operacionais diferentes; a captura da API é um snapshot salvo, não uma consulta ao vivo.',
  };
}

function changeHistory(base) {
  const allowedFields = new Set([
    ...API_METRIC_FIELDS, 'campaignName', 'campaignStatus', 'primaryStatus',
    'primaryStatusReasons', 'biddingStrategyType', 'targetCpaResolution',
    'budgetPeriod', 'budgetAmountMicros', 'budgetTotalAmountMicros', 'budgetShared',
  ]);
  return (Array.isArray(base?.google_ads_api_change_history) ? base.google_ads_api_change_history : []).map(record => ({
    captured_at_utc: record?.completedAtUtc || null,
    period: record?.periodType || null,
    execution_mode: record?.executionMode || null,
    status: record?.status || 'completed',
    scope: record?.scope || null,
    date_from: safeDate(record?.dateFrom),
    date_to: safeDate(record?.dateTo),
    changed_campaign_count: record?.diffRowCount ?? null,
    changed_field_count: record?.changedFieldCount ?? null,
    changes: (Array.isArray(record?.changes) ? record.changes : []).map(change => ({
      campaign_id: String(change?.campaignInternalId || ''),
      google_ads_campaign_id: String(change?.campaignId || ''),
      fields: (Array.isArray(change?.fields) ? change.fields : [])
        .filter(field => allowedFields.has(field?.key))
        .map(field => ({ key: field.key, before: scalar(field.before), after: scalar(field.after) })),
    })),
  }));
}

function campaignEvents(base) {
  const output = [];
  for (const observation of Array.isArray(base?.observacoes_diario) ? base.observacoes_diario : []) {
    for (const event of Array.isArray(observation?.eventos) ? observation.eventos : []) {
      const type = event?.tipo;
      if (!['google_ads_cpa_adjustment', 'google_ads_budget_adjustment', 'google_ads_auto_pause', 'google_ads_auto_pause_observed'].includes(type)) continue;
      const row = {
        campaign_id: String(observation?.campanha_id || ''),
        date: safeDate(observation?.data),
        event_type: type,
        occurred_at_utc: event?.ocorrido_em_utc || event?.observado_ate_utc || null,
      };
      if (type === 'google_ads_cpa_adjustment') Object.assign(row, {
        direction: event.direcao || null,
        previous_target_cpa_micros: scalar(event.valor_anterior_micros),
        new_target_cpa_micros: scalar(event.valor_novo_micros),
        commission_target_cents: scalar(event.comissao_total_centavos),
        currency: event.moeda || null,
        step_percentage_points: scalar(event.passo_pontos_percentuais),
      });
      if (type === 'google_ads_budget_adjustment') Object.assign(row, {
        direction: event.direcao || null,
        previous_budget_micros: scalar(event.orcamento_anterior_micros),
        new_budget_micros: scalar(event.orcamento_novo_micros),
        currency: event.moeda || null,
        adjustment_percent: scalar(event.percentual_ajuste),
      });
      if (type === 'google_ads_auto_pause_observed') Object.assign(row, {
        observed_from_utc: event.observado_de_utc || null,
        observed_to_utc: event.observado_ate_utc || null,
        user_reported: event.relatado_pelo_usuario === true,
      });
      if (type === 'google_ads_auto_pause') Object.assign(row, {
        rule: /^[a-z][a-z0-9_:-]{0,79}$/i.test(String(event.regra || '')) ? event.regra : null,
      });
      output.push(row);
    }
  }
  return output.sort((left, right) => String(left.occurred_at_utc || '').localeCompare(String(right.occurred_at_utc || '')));
}

function billingSales(rows = []) {
  return rows.map(sale => ({
    date: safeDate(sale?.sale_date),
    time: sale?.sale_time || null,
    campaign_id: sale?.campaign_id || null,
    platform: safeLabel(sale?.platform || 'unknown', 80),
    product: safeLabel(sale?.product || ''),
    value_brl: scalar(sale?.value_brl),
    value_usd: scalar(sale?.value_usd),
    conversion_count: scalar(sale?.conversion_count),
    payment_status: sale?.payment_status || 'unknown',
    confirmation_status: sale?.confirmation_status || null,
    source: /^[a-z][a-z0-9_:-]{0,79}$/i.test(String(sale?.source || '')) ? String(sale.source) : 'other',
    active: sale?.active !== false && !sale?.cancelled_at,
    cancelled: Boolean(sale?.cancelled_at),
  })).filter(row => row.date);
}


function saoPauloDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return safeDate(part('year') + '-' + part('month') + '-' + part('day'));
}

function shiftIsoDate(value, days) {
  if (!safeDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function campaignPrefixStart(name, referenceDate) {
  const match = String(name || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?=$|\s|[–—-])/);
  if (!match || !safeDate(referenceDate)) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearText = match[3] || '';
  const year = yearText ? Number(yearText.length === 2 ? '20' + yearText : yearText) : Number(referenceDate.slice(0, 4));
  const date = new Date(Date.UTC(year, month - 1, day));
  const iso = date.toISOString().slice(0, 10);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { date: iso, year_inferred: !yearText, prefix: match[0].trim() };
}

function dateSpan(start, end) {
  if (!safeDate(start) || !safeDate(end) || start > end) return [];
  const dates = [];
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) dates.push(date);
  return dates;
}

function clickCoverage(byDate, start, end) {
  if (!safeDate(start) || !safeDate(end)) return {
    start_date: safeDate(start), end_date: safeDate(end), expected_days: null,
    observed_days: 0, closed_days: 0, missing_days: null, unclosed_days: null,
    complete: false, clicks_observed: null,
  };
  if (start > end) return {
    start_date: start, end_date: end, expected_days: 0,
    observed_days: 0, closed_days: 0, missing_days: 0, unclosed_days: 0,
    complete: true, clicks_observed: 0,
  };
  const dates = dateSpan(start, end);
  let observed = 0;
  let closed = 0;
  let total = 0;
  for (const date of dates) {
    const row = byDate.get(date);
    const clicks = row?.metrics?.google_clicks;
    if (typeof clicks === 'number' && Number.isFinite(clicks)) {
      observed += 1;
      total += clicks;
      if (Array.isArray(row?.periods) && row.periods.includes('d1')) closed += 1;
    }
  }
  const missing = dates.length - observed;
  const unclosed = observed - closed;
  return {
    start_date: start, end_date: end, expected_days: dates.length,
    observed_days: observed, closed_days: closed, missing_days: missing,
    unclosed_days: unclosed, complete: missing === 0 && unclosed === 0,
    clicks_observed: observed ? total : null,
  };
}

function saleCandidate(sale) {
  const status = String(sale?.confirmation_status || '').toLowerCase();
  const count = sale?.conversion_count;
  return Boolean(safeDate(sale?.date))
    && sale?.active !== false && sale?.cancelled !== true
    && status !== 'not_confirmed' && status !== 'represented_by_billing_sale'
    && (count === null || count === undefined || (typeof count === 'number' && count > 0));
}

function firstSaleClickAnalysis(base, daily, sales, referenceDate) {
  const sourceCampaigns = Array.isArray(base?.campanhas) ? base.campanhas : [];
  const byId = new Map(sourceCampaigns.map(campaign => [String(campaign?.id || ''), campaign]).filter(([id]) => id));
  const dailyByCampaign = new Map();
  for (const row of daily) {
    if (!row.campaign_id || !row.date) continue;
    const dates = dailyByCampaign.get(row.campaign_id) || new Map();
    dates.set(row.date, row);
    dailyByCampaign.set(row.campaign_id, dates);
  }
  const eligibleSales = sales.filter(saleCandidate);
  const salesByCampaign = new Map();
  for (const sale of eligibleSales) {
    const id = String(sale?.campaign_id || '').trim();
    if (!id || !byId.has(id)) continue;
    const rows = salesByCampaign.get(id) || [];
    rows.push(sale);
    salesByCampaign.set(id, rows);
  }
  const campaignRowsOut = sourceCampaigns.map(campaign => {
    const id = String(campaign?.id || '').trim();
    const name = String(campaign?.nome_mcc || campaign?.nome_exibicao || '').trim();
    const start = campaignPrefixStart(name, referenceDate);
    const byDate = dailyByCampaign.get(id) || new Map();
    const linkedSales = (salesByCampaign.get(id) || []).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
    const firstSaleDate = linkedSales[0]?.date || null;
    const firstSaleRows = firstSaleDate ? linkedSales.filter(row => row.date === firstSaleDate) : [];
    const end14 = start ? shiftIsoDate(start.date, 13) : null;
    const observedThrough14 = start && referenceDate >= start.date
      ? (referenceDate < end14 ? referenceDate : end14) : null;
    const windowStats = observedThrough14 ? clickCoverage(byDate, start.date, observedThrough14) : null;
    const windowStatus = !start ? 'start_prefix_unavailable'
      : referenceDate < start.date ? 'not_started'
        : referenceDate < end14 ? 'in_progress'
          : windowStats?.complete ? 'complete'
            : windowStats?.missing_days > 0 ? 'missing_daily_data' : 'daily_close_unconfirmed';
    let firstSale = null;
    if (firstSaleRows.length) {
      const record = firstSaleRows[0];
      const dayNumber = start ? Math.floor((Date.parse(firstSaleDate + 'T00:00:00Z') - Date.parse(start.date + 'T00:00:00Z')) / 86400000) + 1 : null;
      const beforeEnd = shiftIsoDate(firstSaleDate, -1);
      const before = start && firstSaleDate >= start.date ? clickCoverage(byDate, start.date, beforeEnd) : null;
      const through = start && firstSaleDate >= start.date ? clickCoverage(byDate, start.date, firstSaleDate) : null;
      const saleDateRow = byDate.get(firstSaleDate);
      const saleDayClicks = saleDateRow?.metrics?.google_clicks;
      firstSale = {
        date: firstSaleDate,
        time: record.time || null,
        source: record.source || null,
        platform: record.platform || null,
        confirmation_status: record.confirmation_status || null,
        payment_status: record.payment_status || null,
        conversion_count: record.conversion_count ?? null,
        records_on_first_date: firstSaleRows.length,
        days_from_campaign_start_inclusive: Number.isInteger(dayNumber) ? dayNumber : null,
        within_first_14_days: Number.isInteger(dayNumber) ? dayNumber >= 1 && dayNumber <= 14 : null,
        clicks_before_sale_date_observed: before?.clicks_observed ?? null,
        coverage_before_sale_date: before,
        clicks_on_sale_date: typeof saleDayClicks === 'number' && Number.isFinite(saleDayClicks) ? saleDayClicks : null,
        clicks_through_sale_date_observed: through?.clicks_observed ?? null,
        coverage_through_sale_date: through,
        sale_day_order: 'unknown_daily_granularity',
      };
    }
    return {
      campaign_id: id || null,
      campaign_name: safeLabel(name, 240),
      campaign_start_date: start?.date || null,
      campaign_start_source: start ? 'campaign_name_prefix' : null,
      campaign_start_prefix: start?.prefix || null,
      campaign_start_year_inferred: start?.year_inferred ?? null,
      first_14_days: {
        start_date: start?.date || null,
        end_date: end14,
        status: windowStatus,
        expected_days_as_of_export: windowStats?.expected_days ?? (windowStatus === 'not_started' ? 0 : null),
        observed_days: windowStats?.observed_days ?? 0,
        closed_days: windowStats?.closed_days ?? 0,
        missing_days: windowStats?.missing_days ?? null,
        unclosed_days: windowStats?.unclosed_days ?? null,
        clicks_observed: windowStats?.clicks_observed ?? null,
      },
      first_sale: firstSale,
    };
  });
  const unmatchedSales = eligibleSales.filter(sale => {
    const id = String(sale?.campaign_id || '').trim();
    return !id || !byId.has(id);
  }).map(sale => ({
    date: sale.date,
    time: sale.time || null,
    campaign_id: sale.campaign_id || null,
    product: safeLabel(sale.product || ''),
    platform: safeLabel(sale.platform || 'unknown', 80),
    source: sale.source || null,
    confirmation_status: sale.confirmation_status || null,
    payment_status: sale.payment_status || null,
    match_status: sale.campaign_id ? 'campaign_not_in_exported_base' : 'campaign_id_missing',
  }));
  return {
    as_of_date: referenceDate,
    campaign_start_rule: 'Prefixo individual do nome da campanha (dd/mm ou dd/mm/aaaa); quando o ano não está no prefixo, infere o ano da data de exportação em São Paulo. Data manual de produto não substitui o prefixo.',
    first_14_day_rule: '14 dias de calendário inclusivos; a data de início conta como dia 1.',
    click_source: 'campaign_daily_metrics.google_clicks (Diário); capturas API permanecem separadas e não são somadas.',
    first_sale_rule: 'Primeiro registro ativo, não cancelado, com vínculo por ID da campanha e sem estado de duplicidade ou não confirmação. Estados pendentes permanecem identificados.',
    sale_day_click_limit: 'Métricas são diárias; a ordem dos cliques e da venda dentro do mesmo dia é desconhecida.',
    campaigns: campaignRowsOut,
    sales_without_campaign_match: unmatchedSales,
  };
}

function trackingSaleAggregates(sales = []) {
  const groups = new Map();
  for (const sale of sales) {
    const timestamp = sale?.transactionTimeUtc || sale?.receivedAtUtc || null;
    const date = timestamp ? timestamp.slice(0, 10) : null;
    if (!safeDate(date)) continue;
    const currency = sale?.commissionCurrency || null;
    const key = JSON.stringify([date, sale?.productKey || null, sale?.presellHost || null, sale?.attributionStatus || 'unknown', currency]);
    const group = groups.get(key) || {
      date, platform: 'ClickBank', product_key: sale?.productKey || null,
      presell_host: sale?.presellHost || null, attribution_status: sale?.attributionStatus || 'unknown',
      sale_count: 0, commission_currency: currency, commission_total: 0, commission_observed_count: 0,
      date_basis: sale?.transactionTimeUtc ? 'transaction_time_utc' : 'received_at_utc_fallback',
    };
    group.sale_count += 1;
    const amount = Number(sale?.commissionTotal);
    if (Number.isFinite(amount)) { group.commission_total += amount; group.commission_observed_count += 1; }
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    ...group,
    commission_total: group.commission_observed_count ? Number(group.commission_total.toFixed(4)) : null,
  })).sort((left, right) => left.date.localeCompare(right.date) || String(left.product_key || '').localeCompare(String(right.product_key || '')));
}

function trackingClickSnapshots(snapshots = []) {
  return snapshots.map(snapshot => ({
    platform: snapshot?.platform || 'unsegmented',
    start_date: safeDate(snapshot?.startDate),
    end_date: safeDate(snapshot?.endDate),
    generated_at_utc: snapshot?.generatedAtUtc || null,
    saved_at_utc: snapshot?.savedAtUtc || null,
    count_semantics: 'events_not_unique_visitors',
    rows: (Array.isArray(snapshot?.rows) ? snapshot.rows : []).map(row => ({
      date_utc: safeDate(row?.dateUtc),
      product_key: row?.productKey || null,
      product_label: row?.productLabel || null,
      presell_host: row?.presellHost || null,
      page_views: scalar(row?.pageViews),
      outbound_clicks: scalar(row?.outboundClicks),
    })),
  }));
}

export function buildOperationalAnalysisExport({
  base, billingSales: sales = [], billingStatus = 'available', trackingSales = null,
  trackingSalesStatus = 'not_checked', trackingClicks = null, trackingClicksStatus = 'not_checked',
  overviewCampaignStatus = null,
  now = new Date(),
} = {}) {
  const daily = diaryRows(base);
  const apiDaily = apiDailyCaptures(base);
  const snapshots = captureSnapshots(base);
  const events = campaignEvents(base);
  const trackedSales = trackingSales ? trackingSaleAggregates(trackingSales.sales || []) : [];
  const clicks = trackingClicks ? trackingClickSnapshots(trackingClicks) : [];
  const salesOutput = billingSales(sales);
  const generatedAt = now.toISOString();
  const referenceDate = saoPauloDate(now);
  const firstSaleAnalysis = firstSaleClickAnalysis(base, daily, salesOutput, referenceDate);
  return {
    schema: 'hub_operational_analysis_v2',
    schema_version: 2,
    generated_at_utc: generatedAt,
    timezone: 'America/Sao_Paulo',
    purpose: 'Pacote de contexto e dados observados para análise conversacional por uma IA.',
    analysis_context: {
      affiliate_platforms: ['ClickBank', 'GuruMedia'],
      google_ads_conversions_are_priority_signal: true,
      financial_outcome_definition: 'Comissões registradas menos custo de mídia no Google Ads; valor de conversão do Google Ads permanece separado da comissão real.',
      clickbank_checkout_metric: 'Cliques distintos identificados por extclid que chegaram ao checkout; checkout não equivale a venda.',
      clickbank_only_checkout_tracking: true,
      comparison_windows_days: [3, 7, 14],
      campaign_start_date_basis: 'date prefix on the individual campaign name',
      first_14_day_window_includes_start_date: true,
      click_counts_source: 'campaign diary by campaign ID and calendar date',
      review_topics_requested: ['verificar sinais de alterações excessivas de CPA/orçamento', 'avaliar se há evidência suficiente para considerar ajuste de CPA'],
      recommendation_thresholds_or_rules_embedded: false,
      instruction: 'Explore os dados com o usuário em conversa; diferencie observações, associação comprovada, incerteza e ausência de dados. Não conclua causalidade apenas pela sequência temporal.',
    },
    sources: {
      hub_campaign_base: {
        status: base ? 'available' : 'unavailable',
        updated_at: base?.atualizado_em || null,
        campaign_count: Array.isArray(base?.campanhas) ? base.campanhas.length : 0,
      },
      campaign_diary: { status: base ? 'available' : 'unavailable', ...coverage(daily) },
      google_ads_api_daily_captures: { status: apiDaily.length ? 'available' : 'no_saved_rows', ...coverage(apiDaily) },
      google_ads_api_capture_snapshots: {
        status: snapshots.length ? 'available' : 'no_saved_snapshots',
        snapshot_count: snapshots.length,
        retained_periods: [...new Set(snapshots.map(row => row.period).filter(Boolean))],
        dates: [...new Set(snapshots.flatMap(row => row.campaigns.map(campaign => campaign.date)).filter(Boolean))].sort(),
      },
      google_ads_api_change_history: { status: Array.isArray(base?.google_ads_api_change_history) ? 'available' : 'unavailable', entries: Array.isArray(base?.google_ads_api_change_history) ? base.google_ads_api_change_history.length : 0 },
      campaign_adjustment_events: { status: 'available_from_saved_events', ...coverage(events, 'date') },
      billing_sales: { status: billingStatus, rows: sales.length, ...coverage(billingSales(sales), 'date') },
      clickbank_tracking_sales: {
        status: trackingSalesStatus,
        cached_sale_count: trackingSales?.sales?.length ?? null,
        last_synced_at_utc: trackingSales?.metadata?.lastSyncedAtUtc || null,
        report_generated_at_utc: trackingSales?.metadata?.generatedAtUtc || null,
        rows_after_aggregation: trackedSales.length,
        ...coverage(trackedSales),
      },
      tracking_click_snapshots: {
        status: trackingClicksStatus,
        snapshot_count: clicks.length,
        dates: [...new Set(clicks.flatMap(snapshot => snapshot.rows.map(row => row.date_utc)).filter(Boolean))].sort(),
      },
      clickbank_checkout_time_series: {
        status: 'not_available_in_local_export_sources',
        reason: 'A tela de Tracking exibe uma consulta agregada de checkouts, mas este export não consulta a rede e o cache local atual não guarda uma série diária de eventos por campanha.',
        required_for_windows: true,
      },
    },
    campaigns: campaignRows(base),
    campaign_first_sale_analysis: firstSaleAnalysis,
    campaign_status_reconciliation: campaignStatusReconciliation(base, overviewCampaignStatus),
    campaign_daily_metrics: daily,
    google_ads_api_daily_captures: apiDaily,
    google_ads_api_capture_snapshots: snapshots,
    google_ads_api_change_history: changeHistory(base),
    campaign_adjustment_events: events,
    billing_sales: salesOutput,
    clickbank_tracking_sales_by_day_and_track: trackedSales,
    tracking_click_snapshots: clicks,
    data_quality_notes: [
      'Valores ausentes permanecem null ou ausentes; não são convertidos em zero.',
      'Métricas do Diário e capturas da API são mantidas em conjuntos separados para evitar somar duas representações da mesma atividade.',
      'Vendas do Faturamento e vendas de Tracking também são fontes separadas e podem representar registros sobrepostos; não some as listas sem conciliação por fonte.',
      'IDs de transação, extclid, GCLID, notas livres, URLs completas, tokens e identificadores de conta/MCC não são exportados.',
      'Checkouts com série diária por campanha não estão no cache local atual; o pacote informa essa lacuna em vez de inferir zero.',
      'A análise por campanha usa somente o prefixo individual do nome; datas agregadas/manuais de produto não substituem essa origem.',
      'Cobertura diária ausente é reportada como lacuna, nunca como zero; o total de cliques no dia da venda não revela a ordem intradiária.',
      'Vendas sem ID de campanha ou sem correspondência exata na base são listadas sem associação aproximada.',
    ],
  };
}
