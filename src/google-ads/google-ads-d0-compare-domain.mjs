const METRICS = [
  { key: 'impressions', label: 'Impressões', kind: 'integer' },
  { key: 'clicks', label: 'Cliques', kind: 'integer' },
  { key: 'costMicros', label: 'Custo', kind: 'money-micros' },
  { key: 'conversions', label: 'Conversões', kind: 'decimal' },
  { key: 'conversionsValue', label: 'Valor conv.', kind: 'money' },
];

function numeric(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedId(value) {
  const id = String(value ?? '').replace(/\D/g, '');
  return /^\d{10}$/.test(id) ? id : '';
}

function accountKey(managerCustomerId, customerId) {
  const manager = normalizedId(managerCustomerId);
  const customer = normalizedId(customerId);
  return customer ? `${manager || 'direct'}|${customer}` : '';
}

function captureTimestamp(capture) {
  const value = Date.parse(capture?.capturedAtUtc || capture?.generatedAtUtc || '');
  return Number.isFinite(value) ? value : 0;
}

function captureKey(capture) {
  const key = accountKey(capture?.managerCustomerId, capture?.customerId);
  const date = String(capture?.date || '');
  return key && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${key}|${date}` : '';
}

function sameValue(left, right) {
  return left === right || (left != null && right != null && Math.abs(left - right) < 1e-9);
}

function latestCapturesByAccountDate(captures) {
  const latest = new Map();
  for (const capture of Array.isArray(captures) ? captures : []) {
    const key = captureKey(capture);
    if (!key || !Array.isArray(capture.rows)) continue;
    const current = latest.get(key);
    if (!current || captureTimestamp(capture) >= captureTimestamp(current)) latest.set(key, capture);
  }
  return latest;
}

function compareRowMetrics(previous, current, currencyMatches) {
  const changes = [];
  for (const metric of METRICS) {
    const before = numeric(previous?.[metric.key]);
    const after = numeric(current?.[metric.key]);
    if (before == null || after == null) continue;
    if ((metric.kind === 'money' || metric.kind === 'money-micros') && !currencyMatches) continue;
    if (!sameValue(before, after)) changes.push({ ...metric, state: 'changed', before, after, delta: after - before });
  }
  if (previous?.campaignName && current?.campaignName && previous.campaignName !== current.campaignName) {
    changes.push({ key: 'campaignName', label: 'Nome', kind: 'text', state: 'changed', before: previous.campaignName, after: current.campaignName, delta: null });
  }
  if (previous?.campaignStatus && current?.campaignStatus && previous.campaignStatus !== current.campaignStatus) {
    changes.push({ key: 'campaignStatus', label: 'Status', kind: 'status', state: 'changed', before: previous.campaignStatus, after: current.campaignStatus, delta: null });
  }
  return changes;
}

/** Compare each current D0 report with the most recent saved API capture for the same account and date. */
export function compareGoogleAdsD0Snapshots(reports, captures) {
  const latestCaptures = latestCapturesByAccountDate(captures);
  return (Array.isArray(reports) ? reports : []).map(report => {
    const managerCustomerId = normalizedId(report?.managerCustomerId) || null;
    const customerId = normalizedId(report?.customerId);
    const date = String(report?.dateTo || '');
    const key = accountKey(managerCustomerId, customerId);
    const baseline = key && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? latestCaptures.get(`${key}|${date}`) || null
      : null;
    const reportCurrency = String(report?.currencyCode || '').toUpperCase();
    const baselineCurrency = String(baseline?.currencyCode || '').toUpperCase();
    const currencyMatches = Boolean(reportCurrency && baselineCurrency && reportCurrency === baselineCurrency);
    const reportTimeZone = String(report?.timeZone || '');
    const baselineTimeZone = String(baseline?.timeZone || '');
    const timeZoneMatches = Boolean(reportTimeZone && baselineTimeZone && reportTimeZone === baselineTimeZone);
    const activeScope = Array.isArray(report?.activeCampaignIds);
    const activeCampaignIds = activeScope ? new Set(report.activeCampaignIds.map(String)) : null;
    const currentRows = (Array.isArray(report?.rows) ? report.rows : [])
      .filter(row => !activeScope || activeCampaignIds.has(String(row?.campaignId || '')));

    const result = {
      managerCustomerId,
      customerId,
      accountName: String(report?.accountName || `Conta ${customerId}`),
      date,
      currencyCode: reportCurrency,
      baselineCurrencyCode: baselineCurrency,
      timeZone: reportTimeZone,
      activeCampaignsOnly: activeScope,
      currentGeneratedAtUtc: String(report?.generatedAtUtc || ''),
      currentRowCount: currentRows.length,
      baselineCapturedAtUtc: baseline ? String(baseline.capturedAtUtc || baseline.generatedAtUtc || '') : '',
      baselineCampaignStatusFilter: baseline ? String(baseline.campaignStatusFilter || 'ALL').toUpperCase() : '',
      baselineComplete: baseline?.queryComplete === true,
      baselineStatus: !baseline ? 'missing' : !timeZoneMatches ? 'timezone_mismatch' : 'available',
      currencyMatches,
      changes: [],
      unchangedRows: 0,
      currentOnlyRows: 0,
      previousOnlyRows: 0,
    };
    if (!baseline || !timeZoneMatches || !customerId || !date) return result;

    const previousRows = new Map((baseline.rows || [])
      .filter(row => !activeScope || activeCampaignIds.has(String(row?.campaignId || '')))
      .map(row => [String(row?.campaignId || ''), row]));
    const currentIds = new Set();
    for (const current of currentRows) {
      const campaignId = String(current?.campaignId || '');
      if (!campaignId) continue;
      currentIds.add(campaignId);
      const previous = previousRows.get(campaignId);
      if (!previous) {
        result.currentOnlyRows += 1;
        result.changes.push({
          campaignId,
          campaignName: String(current.campaignName || `Campanha ${campaignId}`),
          kind: 'current_only',
          current,
          changes: [],
        });
        continue;
      }
      const changes = compareRowMetrics(previous, current, currencyMatches);
      const hasComparableChange = changes.some(item => item.state === 'changed');
      if (hasComparableChange) {
        result.changes.push({ campaignId, campaignName: String(current.campaignName || previous.campaignName || `Campanha ${campaignId}`), kind: 'changed', previous, current, changes });
      } else {
        result.unchangedRows += 1;
      }
    }

    for (const [campaignId, previous] of previousRows) {
      if (currentIds.has(campaignId)) continue;
      result.previousOnlyRows += 1;
      result.changes.push({
        campaignId,
        campaignName: String(previous?.campaignName || `Campanha ${campaignId}`),
        kind: 'previous_only',
        previous,
        current: null,
        changes: [],
      });
    }

    result.changes.sort((left, right) => left.campaignName.localeCompare(right.campaignName, 'pt-BR') || left.campaignId.localeCompare(right.campaignId));
    return result;
  });
}
