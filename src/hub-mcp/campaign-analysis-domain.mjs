const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const METRICS = Object.freeze({
  impressions: ['B', 'Impressões'],
  google_clicks: ['C', 'Cliques Google'],
  platform_clicks: ['D', 'Cliques plataforma'],
  presell_advances: ['E', 'Avanço pre-sell'],
  conversions: ['F', 'Conversões'],
  ctr: ['G', 'CTR'],
  average_cost_usd: ['I', 'Custo médio US$'],
  average_cost_brl: ['J', 'Custo médio R$'],
  investment_brl: ['O', 'Investimento BRL'],
  commission_brl: ['P', 'Comissão BRL'],
});
const ADDITIVE_METRICS = Object.freeze([
  'impressions', 'google_clicks', 'platform_clicks', 'presell_advances', 'conversions', 'investment_brl', 'commission_brl',
]);

function validDate(value, label) {
  if (value == null || value === '') return null;
  const date = String(value).trim();
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} precisa estar no formato AAAA-MM-DD.`);
  }
  return date;
}

function accountSuffix(accountId) {
  const digits = String(accountId || '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

function campaignRows(base) {
  const campaigns = Array.isArray(base?.campanhas) ? base.campanhas : [];
  const diary = Array.isArray(base?.diario) ? base.diario : [];
  const rowsById = new Map();
  for (const row of diary) {
    const id = String(row?.campanha_id || '');
    if (!id || !ISO_DATE.test(String(row?.data || ''))) continue;
    if (!rowsById.has(id)) rowsById.set(id, []);
    rowsById.get(id).push(row);
  }
  return { campaigns, rowsById };
}

function campaignMccName(base, campaign) {
  const mcc = (base?.mccs || []).find(item => String(item?.id || '') === String(campaign?.mcc_id || ''));
  return String(mcc?.nome || campaign?.mcc_nome || 'MCC não identificada');
}

function datesFor(rows) {
  const dates = rows.map(row => String(row.data)).sort();
  return { first: dates[0] || null, last: dates.at(-1) || null };
}

function numericCell(row, column) {
  const raw = row?.celulas?.[column]?.value;
  if (raw == null || String(raw).trim() === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? value : null;
}

function publicCampaign(base, campaign, rows) {
  const dates = datesFor(rows);
  return {
    campaign_name: String(campaign?.nome_mcc || campaign?.nome_exibicao || ''),
    account_suffix: accountSuffix(campaign?.conta_id),
    mcc_name: campaignMccName(base, campaign),
    hub_status: String(campaign?.status || 'desconhecida'),
    diary: { first_date: dates.first, last_date: dates.last, observed_days: rows.length },
  };
}

function matchesExact(campaign, name) {
  return String(campaign?.nome_mcc || '').trim() === name;
}

function campaignSelector(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    throw new Error('Cada campanha precisa ter nome e, quando necessário, o sufixo da conta.');
  }
  const name = String(selector.name || '').trim();
  if (!name) throw new Error('O nome completo da campanha é obrigatório.');
  const suffix = selector.account_suffix == null ? null : String(selector.account_suffix).replace(/\D/g, '');
  if (suffix && suffix.length !== 4) throw new Error('O sufixo da conta deve ter quatro dígitos.');
  return { name, suffix, mccName: String(selector.mcc_name || '').trim() || null };
}

function summarize(rows) {
  const summary = {};
  for (const key of ADDITIVE_METRICS) {
    const [column] = METRICS[key];
    let total = 0;
    let observedDays = 0;
    for (const row of rows) {
      const value = numericCell(row, column);
      if (value == null) continue;
      total += value;
      observedDays += 1;
    }
    summary[key] = {
      total: observedDays ? Math.round((total + Number.EPSILON) * 1e6) / 1e6 : null,
      observed_days: observedDays,
    };
  }
  const ctrRows = rows.flatMap(row => {
    const impressions = numericCell(row, 'B');
    const clicks = numericCell(row, 'C');
    return impressions != null && impressions > 0 && clicks != null ? [{ impressions, clicks }] : [];
  });
  const impressionTotal = ctrRows.reduce((total, row) => total + row.impressions, 0);
  const clickTotalForCtr = ctrRows.reduce((total, row) => total + row.clicks, 0);
  summary.ctr = {
    period_value: ctrRows.length && impressionTotal > 0 ? Math.round((clickTotalForCtr / impressionTotal + Number.EPSILON) * 1e9) / 1e9 : null,
    observed_days: ctrRows.length,
    method: 'Cliques Google somados ÷ impressões somadas nos dias com ambos observados.',
  };
  for (const [key, column] of [['average_cost_usd', 'I'], ['average_cost_brl', 'J']]) {
    const weightedRows = rows.flatMap(row => {
      const cost = numericCell(row, column);
      const clicks = numericCell(row, 'C');
      return cost != null && clicks != null && clicks > 0 ? [{ cost, clicks }] : [];
    });
    const weightedClicks = weightedRows.reduce((total, row) => total + row.clicks, 0);
    const weightedCost = weightedRows.reduce((total, row) => total + row.cost * row.clicks, 0);
    summary[key] = {
      period_value: weightedClicks ? Math.round((weightedCost / weightedClicks + Number.EPSILON) * 1e6) / 1e6 : null,
      observed_days: weightedRows.length,
      weighted_clicks: weightedClicks,
      method: 'Média ponderada pelos cliques Google observados nos mesmos dias.',
    };
  }
  return summary;
}

function publicDailyRow(campaign, row) {
  const output = {
    campaign_name: String(campaign?.nome_mcc || campaign?.nome_exibicao || ''),
    account_suffix: accountSuffix(campaign?.conta_id),
    date: String(row.data),
    sources: Array.isArray(row.fontes) ? row.fontes.map(source => String(source)).slice(0, 5) : [],
  };
  for (const [key, [column]] of Object.entries(METRICS)) output[key] = numericCell(row, column);
  return output;
}

export function searchCampaigns(base, { query, max_results: maxResults = 25 } = {}) {
  const text = String(query || '').trim();
  if (!text) throw new Error('Informe um trecho do nome da campanha para pesquisar.');
  const limit = Math.max(1, Math.min(50, Math.floor(Number(maxResults) || 25)));
  const { campaigns, rowsById } = campaignRows(base);
  const matches = campaigns.filter(campaign => String(campaign?.nome_mcc || campaign?.nome_exibicao || '')
    .toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR')));
  matches.sort((a, b) => String(a?.nome_mcc || '').localeCompare(String(b?.nome_mcc || ''), 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const results = matches.slice(0, limit).map(campaign => {
    const rows = [...(rowsById.get(String(campaign.id)) || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
    return publicCampaign(base, campaign, rows);
  });
  return { query: text, total_matches: matches.length, truncated: matches.length > limit, campaigns: results };
}

export function getCampaignDailyHistory(base, {
  campaigns: requestedCampaigns,
  start_date: startDateInput,
  end_date: endDateInput,
  max_daily_rows: maxDailyRowsInput = 200,
} = {}) {
  if (!Array.isArray(requestedCampaigns) || requestedCampaigns.length < 1 || requestedCampaigns.length > 10) {
    throw new Error('Informe de 1 a 10 campanhas pelo nome completo.');
  }
  const startDate = validDate(startDateInput, 'A data inicial');
  const endDate = validDate(endDateInput, 'A data final');
  if (startDate && endDate && startDate > endDate) throw new Error('A data inicial deve ser anterior à data final.');
  const maxDailyRows = Math.max(1, Math.min(366, Math.floor(Number(maxDailyRowsInput) || 200)));
  const selectors = requestedCampaigns.map(campaignSelector);
  const { campaigns, rowsById } = campaignRows(base);
  const selected = [];
  const notFound = [];
  const ambiguous = [];

  for (const selector of selectors) {
    let matches = campaigns.filter(campaign => matchesExact(campaign, selector.name));
    if (selector.suffix) matches = matches.filter(campaign => accountSuffix(campaign?.conta_id) === selector.suffix);
    if (selector.mccName) matches = matches.filter(campaign => campaignMccName(base, campaign) === selector.mccName);
    if (!matches.length) {
      notFound.push(selector.name);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push({
        campaign_name: selector.name,
        candidates: matches.map(campaign => ({
          account_suffix: accountSuffix(campaign?.conta_id),
          mcc_name: campaignMccName(base, campaign),
        })),
      });
      continue;
    }
    selected.push(matches[0]);
  }

  const campaignResults = [];
  const allDailyRows = [];
  for (const campaign of selected) {
    const id = String(campaign.id);
    const rows = [...(rowsById.get(id) || [])]
      .filter(row => (!startDate || row.data >= startDate) && (!endDate || row.data <= endDate))
      .sort((a, b) => String(a.data).localeCompare(String(b.data)));
    campaignResults.push({
      ...publicCampaign(base, campaign, rows),
      requested_period: { start_date: startDate, end_date: endDate },
      summary: summarize(rows),
    });
    for (const row of rows) allDailyRows.push(publicDailyRow(campaign, row));
  }

  allDailyRows.sort((a, b) => a.date.localeCompare(b.date) || a.campaign_name.localeCompare(b.campaign_name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const truncated = allDailyRows.length > maxDailyRows;
  const dailyRows = truncated ? allDailyRows.slice(-maxDailyRows) : allDailyRows;
  return {
    requested_period: { start_date: startDate, end_date: endDate },
    not_found: notFound,
    ambiguous,
    campaigns: campaignResults,
    daily_rows: dailyRows,
    daily_rows_total: allDailyRows.length,
    daily_rows_truncated: truncated,
    daily_rows_limit: maxDailyRows,
    metric_columns: Object.fromEntries(Object.entries(METRICS).map(([key, [column, label]]) => [key, { column, label }])),
    metric_units: {
      impressions: 'count', google_clicks: 'count', platform_clicks: 'count', presell_advances: 'count', conversions: 'count',
      ctr: 'ratio (0–1)', average_cost_usd: 'USD por clique', average_cost_brl: 'BRL por clique',
      investment_brl: 'BRL', commission_brl: 'BRL',
    },
    data_scope: 'Diário operacional do Hub; conversões e comissão são dados reportados/importados e não confirmam pagamento.',
  };
}

export const CampaignAnalysisDomain = Object.freeze({ searchCampaigns, getCampaignDailyHistory });
