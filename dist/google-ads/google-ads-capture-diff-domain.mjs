const fields = [
  { key: 'B', label: 'Impressões', type: 'integer' }, { key: 'C', label: 'Cliques', type: 'integer' },
  { key: 'F', label: 'Conversões', type: 'decimal' }, { key: 'G', label: 'CTR', type: 'percent' },
  { key: 'I', label: 'CPC na moeda da conta', type: 'money-account' }, { key: 'J', label: 'CPC convertido (R$)', type: 'money-brl' },
  { key: 'K', label: 'Topo absoluto', type: 'percent' }, { key: 'L', label: 'Topo', type: 'percent' },
  { key: 'M', label: 'Orçamento', type: 'text' }, { key: 'N', label: 'Estratégia', type: 'text' },
  { key: 'O', label: 'Custo (R$)', type: 'money-brl' }, { key: 'P', label: 'Valor de conversão (R$)', type: 'money-brl' },
  { key: 'Q', label: 'Qualificação', type: 'text' }, { key: 'R', label: 'Parcela de pesquisa', type: 'percent' },
];

function cellValue(cell) {
  if (cell == null) return null;
  if (typeof cell === 'object' && Object.hasOwn(cell, 'value')) return cell.value === '' ? null : cell.value;
  return cell === '' ? null : cell;
}

function valuesEqual(before, after, tolerance = 0) {
  const left = cellValue(before), right = cellValue(after);
  if (left == null || right == null) return left == null && right == null;
  const leftNumber = Number(left), rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return Math.abs(leftNumber - rightNumber) <= tolerance;
  return String(left).trim() === String(right).trim();
}

function indexRows(rows, index, duplicates = null) {
  for (const row of rows || []) {
    const key = `${row.campanha_id}|${row.data}`;
    if (index.has(key)) duplicates?.add(key);
    else index.set(key, row);
  }
}

function emptyAccount(report, sourceMode) {
  return { customerId: report.customerId, managerCustomerId: report.managerCustomerId || null, sourceMode, changed: [], changedFields: 0, unchangedRows: 0, unmappedRows: 0, ambiguousRows: 0, notProjectedRows: 0, capturedRows: 0 };
}

export function buildGoogleAdsCaptureDiff(saved, reports = [], { activeCampaignsOnly = false } = {}) {
  const preview = saved?.operationalDiff;
  if (!preview?.current || !preview?.proposed || !saved?.base) return null;
  const sourceMode = preview.sourceMode === 'api' ? 'Google Ads API' : 'Manifesto MCC';
  const scopeKey = item => `${item.managerCustomerId || 'direct'}|${item.customerId}`;
  const scopes = new Map(reports.map(report => [scopeKey(report), report]));
  const activeCampaignsByScope = new Map(reports.map(report => [scopeKey(report), new Set((report.configuration?.campaigns || []).filter(item => item.campaignStatus === 'ENABLED').map(item => item.campaignId))]));
  const accounts = new Map(reports.map(report => [scopeKey(report), emptyAccount(report, sourceMode)]));
  const currentRows = new Map(), currentDuplicates = new Set(), proposedRows = new Map();
  indexRows(preview.current.diario, currentRows, currentDuplicates);
  indexRows(preview.proposed.diario, proposedRows);
  const currentCampaigns = new Map((preview.current.campanhas || []).map(item => [String(item.id), item]));
  const proposedCampaigns = new Map((preview.proposed.campanhas || []).map(item => [String(item.id), item]));
  const captures = (saved.base.google_ads_api_daily_captures || []).filter(capture => {
    const scope = scopes.get(`${capture.managerCustomerId || 'direct'}|${capture.customerId}`);
    return scope && capture.date >= scope.dateFrom && capture.date <= scope.dateTo;
  });
  const seen = new Set();

  for (const capture of captures) {
    const accountKey = `${capture.managerCustomerId || 'direct'}|${capture.customerId}`;
    const account = accounts.get(accountKey);
    if (!account) continue;
    for (const row of capture.rows || []) {
      if (activeCampaignsOnly && !activeCampaignsByScope.get(accountKey)?.has(row.campaignId)) continue;
      account.capturedRows += 1;
      if (row.mappingStatus !== 'mapped' || !row.campaignInternalId) {
        if (row.mappingStatus === 'ambiguous' || row.mappingStatus === 'mapping_conflict') account.ambiguousRows += 1;
        else account.unmappedRows += 1;
        continue;
      }
      const key = `${row.campaignInternalId}|${capture.date}`;
      if (seen.has(`${accountKey}|${key}`)) continue;
      seen.add(`${accountKey}|${key}`);
      const proposed = proposedRows.get(key);
      if (!proposed || currentDuplicates.has(key)) { account.notProjectedRows += 1; continue; }
      const before = currentRows.get(key);
      const changes = [];
      for (const field of fields) {
        const nextCell = proposed.celulas?.[field.key];
        if (nextCell?.origem !== 'google_ads_api') continue;
        const oldCell = before?.celulas?.[field.key];
        const tolerance = field.type === 'decimal' || field.type.startsWith('money') ? 0.005 : field.type === 'percent' ? 0.000001 : 0;
        if (!valuesEqual(oldCell, nextCell, tolerance)) changes.push({ key: field.key, label: field.label, type: field.type, before: oldCell || null, after: nextCell });
      }
      const config = capture.configuration?.campaigns?.find(item => item.campaignId === row.campaignId && item.campaignInternalId === row.campaignInternalId);
      if (config?.campaignStatus) {
        const oldStatus = currentCampaigns.get(String(row.campaignInternalId))?.status || '';
        const nextStatus = proposedCampaigns.get(String(row.campaignInternalId))?.status || '';
        if (nextStatus && !valuesEqual({ value: oldStatus }, { value: nextStatus })) changes.push({ key: 'status', label: 'Status no Hub', type: 'status', before: oldStatus ? { value: oldStatus } : null, after: { value: nextStatus } });
      }
      if (changes.length) {
        const campaign = proposedCampaigns.get(String(row.campaignInternalId));
        const metrics = {
          impressions: { before: before?.celulas?.B || null, after: proposed.celulas?.B || null },
          clicks: { before: before?.celulas?.C || null, after: proposed.celulas?.C || null },
          cost: { before: before?.celulas?.O || null, after: proposed.celulas?.O || null },
        };
        account.changed.push({ date: capture.date, campaignName: campaign?.nome_mcc || row.campaignName, campaignId: row.campaignId, isNew: !before, changes, metrics });
        account.changedFields += changes.length;
      } else account.unchangedRows += 1;
    }
  }
  return { sourceMode, accounts: [...accounts.values()] };
}
