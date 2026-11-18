const normalizeStatus = value => String(value ?? '').trim().toUpperCase();
const normalizeCustomerId = value => String(value ?? '').replace(/\D/g, '');
const normalizeManagerId = value => normalizeCustomerId(value) || 'direct';

function isPausedTransition(field) {
  return normalizeStatus(field?.after) === 'PAUSED'
    && normalizeStatus(field?.before) !== 'PAUSED';
}

function pauseReasonValues(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean);
  return String(value ?? '').split(/[;,|]/).map(item => item.trim()).filter(Boolean);
}

function isPauseReason(value) {
  return /CAMPAIGN[_ ]PAUSED|CAMPANHA PAUSADA/i.test(String(value ?? ''));
}

export function captureHistoryChangeIndicatesPause(change) {
  const fields = Array.isArray(change?.fields) ? change.fields : [];
  const statusFields = fields.filter(field => ['campaignStatus', 'primaryStatus'].includes(field?.key));
  if (statusFields.length) return statusFields.some(isPausedTransition);

  const pauseReasonField = fields.find(field => field?.key === 'primaryStatusReasons');
  if (!pauseReasonField) return false;
  const before = new Set(pauseReasonValues(pauseReasonField.before));
  return pauseReasonValues(pauseReasonField.after).some(reason => isPauseReason(reason) && !before.has(reason));
}

function baselineForChange(change, record) {
  const directTimestamp = Date.parse(change?.baselineCapturedAtUtc || '');
  if (Number.isFinite(directTimestamp)) return directTimestamp;

  const customerId = normalizeCustomerId(change?.customerId);
  if (!customerId) return null;
  const managerId = normalizeManagerId(change?.managerCustomerId);
  const baseline = (Array.isArray(record?.comparisonBaselines) ? record.comparisonBaselines : []).find(item => {
    if (normalizeCustomerId(item?.customerId) !== customerId || normalizeManagerId(item?.managerCustomerId) !== managerId) return false;
    if (change?.baselineDate) return String(item?.referenceDate || '') === String(change.baselineDate);
    return !change?.date || String(item?.currentDate || '') === String(change.date);
  });
  const timestamp = Date.parse(baseline?.capturedAtUtc || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function googleAdsObservedPauseIntervalForChange(change, record) {
  if (!captureHistoryChangeIndicatesPause(change)) return null;
  const from = baselineForChange(change, record);
  const to = Date.parse(record?.completedAtUtc || '');
  if (from == null || !Number.isFinite(to) || from >= to) return null;
  return { observedFromUtc: new Date(from).toISOString(), observedToUtc: new Date(to).toISOString() };
}

export function findGoogleAdsAutomaticPauseForChange(change, record, history = []) {
  if (!captureHistoryChangeIndicatesPause(change)) return null;
  const customerId = normalizeCustomerId(change?.customerId);
  const managerId = normalizeManagerId(change?.managerCustomerId);
  const campaignId = String(change?.campaignId || '');
  const internalId = String(change?.campaignInternalId || '');
  const captureTime = Date.parse(record?.completedAtUtc || '');
  if (!customerId || !campaignId || !Number.isFinite(captureTime)) return null;
  const baselineTime = baselineForChange(change, record);

  const matches = (Array.isArray(history) ? history : []).flatMap(entry => {
    if (entry?.eventType !== 'automatic_pause' || entry.status !== 'completed') return [];
    const pauseTime = Date.parse(entry.completedAtUtc || '');
    if (!Number.isFinite(pauseTime) || pauseTime > captureTime) return [];
    if (baselineTime != null ? pauseTime <= baselineTime : false) return [];
    return (Array.isArray(entry.changes) ? entry.changes : []).flatMap(pause => {
      const exactCampaign = String(pause?.campaignId || '') === campaignId
        && (!internalId || String(pause?.campaignInternalId || '') === internalId);
      if (normalizeCustomerId(pause?.customerId) !== customerId
        || normalizeManagerId(pause?.managerCustomerId) !== managerId
        || !exactCampaign
        || (baselineTime == null && String(pause?.date || '') !== String(change?.date || ''))) return [];
      return [{ entry, pause, pauseTime }];
    });
  }).sort((left, right) => right.pauseTime - left.pauseTime);
  return matches[0] || null;
}

export function findGoogleAdsObservedPauseForChange(change, record, history = []) {
  if (!captureHistoryChangeIndicatesPause(change)) return null;
  const customerId = normalizeCustomerId(change?.customerId);
  const managerId = normalizeManagerId(change?.managerCustomerId);
  const campaignId = String(change?.campaignId || '');
  const internalId = String(change?.campaignInternalId || '');
  const captureTime = Date.parse(record?.completedAtUtc || '');
  if (!customerId || !campaignId || !Number.isFinite(captureTime)) return null;
  const baselineTime = baselineForChange(change, record);
  if (baselineTime == null) return null;

  const matches = (Array.isArray(history) ? history : []).flatMap(entry => {
    if (entry?.eventType !== 'automatic_pause_observed' || entry.status !== 'observed') return [];
    const from = Date.parse(entry.observedFromUtc || '');
    const to = Date.parse(entry.observedToUtc || '');
    if (!Number.isFinite(from) || !Number.isFinite(to) || from !== baselineTime || to !== captureTime) return [];
    return (Array.isArray(entry.changes) ? entry.changes : []).flatMap(pause => {
      const exactCampaign = String(pause?.campaignId || '') === campaignId
        && (!internalId || String(pause?.campaignInternalId || '') === internalId);
      if (normalizeCustomerId(pause?.customerId) !== customerId
        || normalizeManagerId(pause?.managerCustomerId) !== managerId
        || !exactCampaign) return [];
      return [{ entry, pause, observedFromUtc: entry.observedFromUtc, observedToUtc: entry.observedToUtc }];
    });
  }).sort((left, right) => String(right.entry.recordedAtUtc || '').localeCompare(String(left.entry.recordedAtUtc || '')));
  return matches[0] || null;
}
