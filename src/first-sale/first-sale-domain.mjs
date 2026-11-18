function numeric(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function compareSales(left, right) {
  return String(left?.sale_date || '').localeCompare(String(right?.sale_date || ''))
    || String(left?.sale_time || '').localeCompare(String(right?.sale_time || ''))
    || String(left?.created_at || '').localeCompare(String(right?.created_at || ''))
    || String(left?.sale_id || '').localeCompare(String(right?.sale_id || ''));
}

function apiClickRows(captures = []) {
  const byCampaignDate = new Map();
  for (const capture of captures || []) {
    const captureDate = String(capture?.date || '');
    if (Number(capture?.captureSchemaVersion) < 2
      || capture?.coverageStatus !== 'rows_returned'
      || !/^\d{4}-\d{2}-\d{2}$/.test(captureDate)) continue;
    for (const row of capture.rows || []) {
      const campaignId = String(row?.campaignInternalId || '').trim();
      if (!campaignId || row?.mappingStatus !== 'mapped') continue;
      const key = `${campaignId}|${captureDate}`;
      const previous = byCampaignDate.get(key);
      if (!previous || String(capture.capturedAtUtc || '').localeCompare(previous.capturedAtUtc) > 0) {
        const clicks = numeric(row?.clicks);
        byCampaignDate.set(key, {
          campaignId,
          date: captureDate,
          clicks: clicks != null && clicks >= 0 ? clicks : null,
          impressions: numeric(row?.impressions) != null && numeric(row?.impressions) >= 0 ? numeric(row?.impressions) : null,
          capturedAtUtc: String(capture.capturedAtUtc || ''),
        });
      }
    }
  }
  return byCampaignDate;
}

function totalDailyMetricThroughDate(dailyRows, apiRows, campaignId, date, column, metric) {
  let total = 0;
  let observed = false;
  const dailyByDate = new Map();
  for (const row of dailyRows || []) {
    if (String(row?.campanha_id || '') !== String(campaignId) || !row?.data || row.data > date) continue;
    const value = numeric(row.celulas?.[column]?.value);
    if (value == null) continue;
    dailyByDate.set(row.data, (dailyByDate.get(row.data) || 0) + value);
  }
  for (const [day, value] of dailyByDate) {
    const api = apiRows.get(`${campaignId}|${day}`);
    if (api) {
      if (api[metric] == null) continue;
      total += api[metric];
    } else {
      total += value;
    }
    observed = true;
  }
  for (const api of apiRows.values()) {
    if (api.campaignId !== String(campaignId) || api.date > date || dailyByDate.has(api.date) || api[metric] == null) continue;
    total += api[metric];
    observed = true;
  }
  return observed ? total : null;
}

function mergeFirstSaleSales(persistedSales = [], projectedSales = []) {
  const byId = new Map();
  for (const sale of projectedSales || []) {
    const id = String(sale?.sale_id || '').trim();
    if (id) byId.set(id, sale);
  }
  for (const sale of persistedSales || []) {
    const id = String(sale?.sale_id || '').trim();
    if (id) byId.set(id, sale);
  }
  return [...byId.values()];
}

function firstSaleRows(snapshot = {}) {
  const campaigns = new Map((snapshot.campaigns || [])
    .filter(campaign => campaign?.id)
    .map(campaign => [String(campaign.id), campaign]));
  const apiRows = apiClickRows(snapshot.apiCaptures);
  const firstSales = new Map();

  for (const sale of snapshot.sales || []) {
    const campaignId = String(sale?.campaign_id || '');
    const saleDate = String(sale?.sale_date || '');
    if (!campaignId || sale?.active === false || sale?.cancelled_at || sale?.confirmation_status === 'represented_by_manual'
      || (sale?.source === 'mcc_conversion_aggregate' && !(Number(sale?.conversion_count) > 0))
      || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate)
      || !campaigns.has(campaignId)) continue;
    const current = firstSales.get(campaignId);
    if (!current || compareSales(sale, current) < 0) firstSales.set(campaignId, sale);
  }

  return [...firstSales.entries()].map(([campaignId, sale]) => {
    const campaign = campaigns.get(campaignId);
    return {
      campaignId,
      campaignName: String(campaign.nome_mcc || campaign.nome_exibicao || 'Campanha sem nome'),
      saleDate: String(sale.sale_date),
      saleTime: String(sale.sale_time || ''),
      recordedAt: String(sale.created_at || ''),
      sourceLabel: sale.source === 'gurumedia_click_view'
        ? 'GuruMedia · ClickView'
        : sale.source === 'mcc_conversion_aggregate'
          ? sale.data_source === 'google_ads_api' ? 'Google Ads API · agregado diário' : 'MCC · agregado diário'
          : 'Faturamento',
      clicks: totalDailyMetricThroughDate(snapshot.diary || [], apiRows, campaignId, sale.sale_date, 'C', 'clicks'),
      impressions: totalDailyMetricThroughDate(snapshot.diary || [], apiRows, campaignId, sale.sale_date, 'B', 'impressions'),
    };
  }).sort((left, right) => right.saleDate.localeCompare(left.saleDate)
    || right.saleTime.localeCompare(left.saleTime)
    || left.campaignName.localeCompare(right.campaignName, 'pt-BR'));
}

export { firstSaleRows, mergeFirstSaleSales };
