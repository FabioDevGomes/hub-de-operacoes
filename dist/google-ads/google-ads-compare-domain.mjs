const metricDefinitions = [
  { key: 'impressions', manifestKey: 'impressoes', tolerance: 0 },
  { key: 'clicks', manifestKey: 'cliques_google', tolerance: 0 },
  { key: 'conversions', manifestKey: 'conversoes', tolerance: 0.0001 },
  { key: 'cost', manifestKey: 'custo_total', tolerance: 0.005 },
  { key: 'conversionValue', manifestKey: 'valor_conversao', tolerance: 0.005 },
];

function valueOf(field) {
  if (field === null || field === undefined || field === '') return null;
  if (typeof field === 'object') {
    if (['ausente', 'invalido', 'limite'].includes(String(field.estado || '').toLowerCase())) return null;
    if (Object.hasOwn(field, 'valor')) return field.valor === '' ? null : field.valor;
    if (Object.hasOwn(field, 'value')) return field.value === '' ? null : field.value;
  }
  return field;
}

function numberOf(field) {
  const raw = valueOf(field);
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  const number = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function canonicalAccountId(value) {
  const digits = String(valueOf(value) ?? '').replace(/\D/g, '');
  return /^\d{10}$/.test(digits) ? digits : '';
}

function isoDate(value) {
  const raw = String(valueOf(value) ?? '').trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  if (iso) {
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso) return iso;
  }
  const local = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!local) return '';
  const date = `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function inRange(date, dateFrom, dateTo) {
  return Boolean(date && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo));
}

function snapshotRecords(manifest, dateFrom, dateTo) {
  const records = [];
  for (const source of manifest?.campanhas || []) {
    const campaignName = String(source?.nome_campanha_exato || '').trim();
    if (!campaignName) continue;
    const periodMetrics = [
      ['d1', source.metricas_D_menos_1],
      ['d0', source.metricas_D_zero],
    ];
    const knownAccountIds = [...new Set(periodMetrics.map(([, metrics]) => canonicalAccountId(metrics?.conta_id)).filter(Boolean))];
    if (knownAccountIds.length > 1) continue;
    for (const [period, metrics] of periodMetrics) {
      if (!metrics) continue;
      const date = isoDate(metrics.data);
      if (!inRange(date, dateFrom, dateTo)) continue;
      const accountId = canonicalAccountId(metrics.conta_id) || knownAccountIds[0] || '';
      if (!accountId) continue;
      records.push({
        accountId,
        managerId: canonicalAccountId(source.mcc_id ?? manifest?.identificacao_mcc?.id),
        date,
        campaignName,
        period,
        source: 'manifest',
        present: metrics.presente !== false,
        currencyCode: String(valueOf(metrics.moeda) || '').trim().toUpperCase(),
        metrics: Object.fromEntries(metricDefinitions.map(({ key, manifestKey }) => [key, numberOf(metrics[manifestKey])])),
      });
    }
  }
  return records;
}

function historicalDiaryRecords(snapshot, dateFrom, dateTo) {
  const campaigns = new Map((snapshot?.campaigns || []).map(campaign => [String(campaign?.id ?? ''), campaign]));
  const records = [];
  const excludedByAccount = new Map();
  for (const row of snapshot?.dailyRows || []) {
    const date = isoDate(row?.data);
    if (!inRange(date, dateFrom, dateTo)) continue;
    const campaign = campaigns.get(String(row?.campanha_id ?? ''));
    if (!campaign) continue;
    const accountId = canonicalAccountId(campaign.conta_id);
    const managerId = canonicalAccountId(campaign.mcc_id);
    if (!accountId || !managerId || !String(campaign.nome_mcc || '').trim()) continue;
    const sources = Array.isArray(row.fontes) ? row.fontes : [];
    if (!sources.includes('manifesto')) continue;
    if (sources.some(source => source !== 'manifesto')) {
      const key = `${accountId}\u0000${managerId}`;
      excludedByAccount.set(key, (excludedByAccount.get(key) || 0) + 1);
      continue;
    }
    records.push({
      accountId,
      managerId,
      date,
      campaignName: String(campaign.nome_mcc).trim(),
      period: 'history',
      source: 'diario',
      present: true,
      currencyCode: 'BRL',
      metrics: {
        impressions: numberOf(row.celulas?.B),
        clicks: numberOf(row.celulas?.C),
        conversions: numberOf(row.celulas?.F),
        // The Hub's historical daily journal stores total cost in BRL.
        cost: numberOf(row.celulas?.O),
        conversionValue: numberOf(row.celulas?.P),
      },
    });
  }
  return { records, excludedByAccount };
}

function recordKey(record) {
  return `${record.accountId}\u0000${record.date}\u0000${record.campaignName}`;
}

function managerCoverageDates(manifest, managerCustomerId, dateFrom, dateTo) {
  const managerId = canonicalAccountId(managerCustomerId);
  if (!managerId) return new Map();
  const dates = new Map();
  for (const field of ['cobertura_D_menos_1_por_mcc', 'cobertura_D_zero_por_mcc']) {
    for (const [rawId, coverage] of Object.entries(manifest?.[field] || {})) {
      if (canonicalAccountId(rawId) !== managerId) continue;
      const date = isoDate(coverage?.data);
      if (!inRange(date, dateFrom, dateTo)) continue;
      dates.set(date, {
        scope: String(coverage?.escopo || '').trim() || null,
        complete: coverage?.completa === true,
      });
    }
  }
  return dates;
}

function comparisonRow({ date, campaignName, apiRows, manifestRows, currencyCode, coverage }) {
  if (apiRows.length > 1 || manifestRows.length > 1) {
    return {
      date, campaignName, status: 'ambiguous',
      reason: `Pareamento ambíguo: ${apiRows.length} linha(s) da API e ${manifestRows.length} registro(s) MCC com o mesmo nome/data.`,
      metrics: {},
    };
  }
  if (!manifestRows.length) {
    const api = apiRows[0];
    const values = { impressions: api.impressions, clicks: api.clicks, conversions: api.conversions, cost: Number.isFinite(api.costMicros) ? api.costMicros / 1_000_000 : null, conversionValue: api.conversionsValue };
    return {
      date, campaignName, status: 'api_only',
      reason: coverage?.complete
        ? 'A campanha não tem registro com esse nome exato no manifesto desta data; isso não foi convertido em zero.'
        : 'Não localizei um registro MCC diário seguro com essa conta, data e nome completo exato; isso não foi convertido em zero.',
      apiCampaignId: apiRows[0]?.campaignId || null,
      apiCurrencyCode: currencyCode,
      metrics: Object.fromEntries(metricDefinitions.map(({ key }) => [key, { api: values[key], manifest: null, delta: null, state: 'mcc_missing' }])),
    };
  }
  if (!apiRows.length) {
    const manifest = manifestRows[0];
    return {
      date, campaignName, status: manifest.present ? 'mcc_only' : 'manifest_not_observed',
      reason: manifest.present ? 'A API não retornou uma linha para esta campanha/data; a ausência não foi tratada como zero.' : 'A captura MCC não observou métricas nesta data; a ausência da API também não foi tratada como zero.',
      manifestCurrencyCode: manifest.currencyCode,
      metrics: Object.fromEntries(metricDefinitions.map(({ key }) => [key, { api: null, manifest: manifest.present ? manifest.metrics[key] : null, delta: null, state: manifest.present ? 'api_missing' : 'manifest_not_observed' }])),
    };
  }

  const api = apiRows[0];
  const manifest = manifestRows[0];
  const apiValues = {
    impressions: api.impressions,
    clicks: api.clicks,
    conversions: api.conversions,
    cost: Number.isFinite(api.costMicros) ? api.costMicros / 1_000_000 : null,
    conversionValue: api.conversionsValue,
  };
  const currencyMatches = Boolean(manifest.currencyCode && currencyCode && manifest.currencyCode === currencyCode);
  const metrics = {};
  let comparedCount = 0;
  let differenceCount = 0;
  const reasons = [];

  for (const definition of metricDefinitions) {
    const apiValue = apiValues[definition.key];
    const manifestValue = manifest.present ? manifest.metrics[definition.key] : null;
    if (!manifest.present) {
      metrics[definition.key] = { api: apiValue, manifest: null, delta: null, state: 'manifest_not_observed' };
      continue;
    }
    if (['cost', 'conversionValue'].includes(definition.key) && !currencyMatches) {
      metrics[definition.key] = { api: apiValue, manifest: manifestValue, delta: null, state: 'currency_mismatch' };
      reasons.push(`Moeda ausente ou divergente; ${definition.key === 'cost' ? 'custo' : 'valor de conversão'} não comparado.`);
      continue;
    }
    if (apiValue === null || manifestValue === null) {
      metrics[definition.key] = { api: apiValue, manifest: manifestValue, delta: null, state: 'metric_missing' };
      reasons.push(`Valor ausente/inválido em ${definition.key}.`);
      continue;
    }
    const delta = apiValue - manifestValue;
    metrics[definition.key] = { api: apiValue, manifest: manifestValue, delta, state: 'compared' };
    comparedCount += 1;
    if (Math.abs(delta) > definition.tolerance) differenceCount += 1;
  }

  let status;
  if (!manifest.present) {
    status = 'manifest_not_observed';
    reasons.push(manifest.period === 'd0' ? 'A captura MCC não observou métricas nesta data.' : 'O manifesto marca esta data como sem observação de métricas.');
  } else if (differenceCount) status = 'difference';
  else if (comparedCount === metricDefinitions.length) status = 'match';
  else if (comparedCount) status = 'partial';
  else status = 'inconclusive';

  return {
    date, campaignName, status,
    reason: reasons.join(' '),
    apiCampaignId: api.campaignId,
    period: manifest.period,
    apiCurrencyCode: currencyCode,
    manifestCurrencyCode: manifest.currencyCode,
    metrics,
  };
}

export function compareGoogleAdsDailyReports(reports, manifest, { dateFrom = '', dateTo = '' } = {}) {
  const snapshot = manifest && (Object.hasOwn(manifest, 'manifest') || Object.hasOwn(manifest, 'manifesto_atual') || Object.hasOwn(manifest, 'dailyRows')) ? manifest : { manifest };
  const currentManifest = snapshot.manifest || snapshot.manifesto_atual || null;
  const hasManifest = Boolean(currentManifest && Array.isArray(currentManifest.campanhas));
  const currentRecords = hasManifest ? snapshotRecords(currentManifest, dateFrom, dateTo) : [];
  const history = historicalDiaryRecords(snapshot, dateFrom, dateTo);
  const currentKeys = new Set(currentRecords.filter(record => record.present).map(recordKey));
  const historicalRecords = history.records.filter(record => !currentKeys.has(recordKey(record)));
  const records = [...historicalRecords, ...currentRecords.filter(record => record.present || !history.records.some(item => recordKey(item) === recordKey(record)))];
  const available = hasManifest || (Array.isArray(snapshot.dailyRows) && snapshot.dailyRows.length > 0);
  const accounts = (Array.isArray(reports) ? reports : []).map(report => {
    const accountId = canonicalAccountId(report.customerId);
    const managerId = canonicalAccountId(report.managerCustomerId);
    const accountRecords = records.filter(record => record.accountId === accountId && (!managerId || record.managerId === managerId));
    const coverageDates = managerCoverageDates(currentManifest, report.managerCustomerId, dateFrom, dateTo);
    const capturedDates = new Set([...coverageDates.keys(), ...accountRecords.map(record => record.date)]);
    const apiByKey = new Map();
    for (const row of report.rows || []) {
      if (!inRange(row.date, dateFrom, dateTo) || !capturedDates.has(row.date)) continue;
      const key = `${row.date}\u0000${String(row.campaignName || '').trim()}`;
      const group = apiByKey.get(key) || [];
      group.push(row);
      apiByKey.set(key, group);
    }
    const manifestByKey = new Map();
    for (const row of accountRecords) {
      const key = `${row.date}\u0000${row.campaignName}`;
      const group = manifestByKey.get(key) || [];
      group.push(row);
      manifestByKey.set(key, group);
    }
    const keys = new Set([...apiByKey.keys(), ...manifestByKey.keys()]);
    const rows = [...keys].map(key => {
      const [date, campaignName] = key.split('\u0000');
      return comparisonRow({
        date,
        campaignName,
        apiRows: apiByKey.get(key) || [],
        manifestRows: manifestByKey.get(key) || [],
        currencyCode: report.currencyCode,
        coverage: coverageDates.get(date),
      });
    }).sort((left, right) => left.date.localeCompare(right.date) || left.campaignName.localeCompare(right.campaignName, 'pt-BR', { numeric: true }));
    const summary = { match: 0, difference: 0, partial: 0, inconclusive: 0, ambiguous: 0, api_only: 0, mcc_only: 0, manifest_not_observed: 0 };
    for (const row of rows) summary[row.status] = (summary[row.status] || 0) + 1;
    return {
      customerId: report.customerId,
      managerCustomerId: report.managerCustomerId,
      accountName: report.accountName,
      available: hasManifest || accountRecords.length > 0,
      historyRowsExcluded: history.excludedByAccount.get(`${accountId}\u0000${managerId}`) || 0,
      capturedDates: [...capturedDates].sort(),
      rows,
      summary,
    };
  });
  return { available: available || hasManifest, accounts };
}
