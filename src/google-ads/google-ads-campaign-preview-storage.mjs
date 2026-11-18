export const GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY = 'hub.google-ads.campaign-creation.previews:v1';

const idPattern = /^[\w-]{1,120}$/;
function safeText(value, maxLength = 500) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizePreviewDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = safeText(value.id, 120).trim();
  if (!id || !/^[\w-]+$/.test(id)) return null;
  const safeList = items => Array.isArray(items)
    ? items.slice(0, 3).map(item => safeText(item, 160).trim()).filter(Boolean)
    : [];
  const optionalStatus = item => Number.isSafeInteger(item) && item > 0 ? item : null;
  return {
    id,
    stage: safeText(value.stage, 80),
    upstreamHttpStatus: optionalStatus(value.upstreamHttpStatus),
    googleStatus: safeText(value.googleStatus, 120),
    googleRequestId: safeText(value.googleRequestId, 120),
    googleErrorCodes: safeList(value.googleErrorCodes),
    fieldPaths: safeList(value.fieldPaths),
    curlErrno: optionalStatus(value.curlErrno),
    responseFormat: safeText(value.responseFormat, 80),
    retryable: value.retryable === true,
  };
}

function normalizeCampaignCreationAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !idPattern.test(String(value.attemptId ?? ''))
      || !['in_flight', 'created', 'failed', 'uncertain'].includes(value.state)
      || typeof value.startedAtUtc !== 'string' || !Number.isFinite(Date.parse(value.startedAtUtc))) return null;
  const completedAtUtc = value.completedAtUtc == null || value.completedAtUtc === '' ? '' : String(value.completedAtUtc);
  if ((completedAtUtc && !Number.isFinite(Date.parse(completedAtUtc)))
      || (value.state === 'in_flight' && completedAtUtc)
      || (value.state !== 'in_flight' && !completedAtUtc)) return null;
  const campaignId = value.campaignId == null || value.campaignId === '' ? '' : String(value.campaignId);
  const campaignStatus = value.campaignStatus == null || value.campaignStatus === '' ? '' : String(value.campaignStatus);
  if ((campaignId && !/^[1-9]\d{0,19}$/.test(campaignId))
      || !['', 'PAUSED', 'ENABLED'].includes(campaignStatus)
      || (value.state === 'created' && (!campaignId || !campaignStatus))) return null;
  return {
    attemptId: String(value.attemptId),
    state: value.state,
    startedAtUtc: value.startedAtUtc,
    completedAtUtc,
    campaignId,
    campaignStatus,
    errorMessage: safeText(value.errorMessage, 1000),
    diagnostic: normalizePreviewDiagnostic(value.diagnostic),
  };
}

function normalizePreviewQuotaUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Number(value.version) !== 1) return null;
  const fields = [
    'quotaOperationsEstimated', 'quotaOperationsUnknown', 'requestsObserved',
    'requestsWithServerCounts', 'requestsWithoutServerCounts', 'requestsUnknown',
  ];
  const counts = Object.fromEntries(fields.map(field => [field, Number(value[field])]));
  if (!Object.values(counts).every(count => Number.isSafeInteger(count) && count >= 0 && count <= 1000000)
      || counts.requestsObserved !== counts.requestsWithServerCounts + counts.requestsWithoutServerCounts
      || typeof value.completedAtUtc !== 'string'
      || (value.completedAtUtc && !Number.isFinite(Date.parse(value.completedAtUtc)))) return null;
  return { version: 1, ...counts, completedAtUtc: value.completedAtUtc };
}

function normalizePreviewEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const managerCustomerId = String(value.managerCustomerId ?? '');
  const customerId = String(value.customerId ?? '');
  const campaignName = safeText(value.campaignName, 240).trim();
  const previewResult = value.previewResult && typeof value.previewResult === 'object' && !Array.isArray(value.previewResult)
    ? value.previewResult : null;
  let state = safeText(value.state, 24);
  if (!state && previewResult) state = previewResult.resultType === 'existing' ? 'existing' : 'previewed';
  if (!['pending', 'previewing', 'preview_failed', 'preview_stale', 'existing', 'previewed'].includes(state)
      || !/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !campaignName) return null;
  const errorMessage = safeText(value.errorMessage, 1000);
  const payloadFingerprint = value.payloadFingerprint === '' || value.payloadFingerprint == null
    ? '' : String(value.payloadFingerprint);
  if (payloadFingerprint && !/^[a-f\d]{64}$/i.test(payloadFingerprint)) return null;
  const validatedAt = value.validatedAt == null || value.validatedAt === '' ? '' : String(value.validatedAt);
  if (validatedAt && !Number.isFinite(Date.parse(validatedAt))) return null;
  const creationAttemptsValue = value.creationAttempts == null ? [] : value.creationAttempts;
  if (!Array.isArray(creationAttemptsValue) || creationAttemptsValue.length > 20) return null;
  const creationAttempts = creationAttemptsValue.map(normalizeCampaignCreationAttempt);
  if (creationAttempts.some(attempt => attempt === null)
      || new Set(creationAttempts.map(attempt => attempt.attemptId)).size !== creationAttempts.length) return null;
  if ((state === 'pending' || state === 'preview_failed') && previewResult) return null;
  if (state === 'preview_stale' && (!previewResult || !errorMessage)) return null;
  if (state === 'preview_failed' && !errorMessage) return null;
  if (previewResult && safeText(previewResult.campaignName, 240) !== campaignName) return null;
  const resultType = previewResult ? (safeText(previewResult.resultType, 24) || 'validated_new') : '';
  if (previewResult && resultType === 'validated_new') {
    if (!/^[A-Z]{3}$/.test(String(previewResult.accountCurrency ?? ''))
        || !/^\d+$/.test(String(previewResult.dailyBudgetMicros ?? ''))
        || (previewResult.targetCpaMicros !== '' && !/^\d+$/.test(String(previewResult.targetCpaMicros ?? '')))) return null;
    if (!['previewing', 'preview_stale'].includes(state)) state = 'previewed';
  } else if (previewResult && resultType === 'existing') {
      const campaignId = String(previewResult.campaignId ?? '');
      const campaignStatus = String(previewResult.campaignStatus ?? '');
      const channelType = String(previewResult.channelType ?? '');
      const adGroupId = String(previewResult.adGroupId ?? '');
      const adGroupStatus = String(previewResult.adGroupStatus ?? '');
      const adGroupCount = previewResult.adGroupCount;
      if (!/^[1-9]\d{0,19}$/.test(campaignId) || !['ENABLED', 'PAUSED'].includes(campaignStatus)
          || !/^[A-Z][A-Z_]{1,63}$/.test(channelType)
          || typeof previewResult.audienceGrouped !== 'boolean'
          || !Number.isInteger(adGroupCount) || adGroupCount < 0 || adGroupCount > 2
          || (adGroupCount === 1 && (!/^[1-9]\d{0,19}$/.test(adGroupId) || !['ENABLED', 'PAUSED'].includes(adGroupStatus)))
          || (adGroupCount !== 1 && (adGroupId !== '' || adGroupStatus !== ''))) return null;
      if (!['previewing', 'preview_stale'].includes(state)) state = 'existing';
  } else if (previewResult || ['existing', 'previewed'].includes(state)) return null;
  return {
    managerCustomerId,
    customerId,
    campaignName,
    accountName: safeText(value.accountName, 240),
    percent: safeText(value.percent, 12),
    payloadFingerprint: payloadFingerprint.toLowerCase(),
    validatedAt,
    state,
    errorMessage,
    diagnostic: normalizePreviewDiagnostic(value.diagnostic),
    creationAttempts,
    previewResult: previewResult ? {
      resultType,
      campaignName: safeText(previewResult.campaignName, 240),
      ...(resultType === 'validated_new' ? {
        accountCurrency: String(previewResult.accountCurrency),
        dailyBudgetMicros: String(previewResult.dailyBudgetMicros),
        targetCpaMicros: previewResult.targetCpaMicros === '' ? '' : String(previewResult.targetCpaMicros),
        positiveGeoTargetType: safeText(previewResult.positiveGeoTargetType, 40),
        goalConfigLevel: safeText(previewResult.goalConfigLevel, 30),
        customConversionGoalName: safeText(previewResult.customConversionGoalName, 240),
        conversionActionName: safeText(previewResult.conversionActionName, 240),
        conversionActionResourceName: safeText(previewResult.conversionActionResourceName, 240),
      } : {
        campaignId: String(previewResult.campaignId),
        campaignStatus: String(previewResult.campaignStatus),
        channelType: String(previewResult.channelType),
        audienceGrouped: previewResult.audienceGrouped,
        adGroupId: String(previewResult.adGroupId ?? ''),
        adGroupStatus: String(previewResult.adGroupStatus ?? ''),
        adGroupCount: previewResult.adGroupCount,
      }),
    } : null,
  };
}

function normalizePreview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !idPattern.test(String(value.id ?? '')) || !idPattern.test(String(value.draftId ?? ''))
      || typeof value.validatedAt !== 'string' || !Number.isFinite(Date.parse(value.validatedAt))
      || (value.payloadFingerprint !== '' && !/^[a-f\d]{64}$/i.test(String(value.payloadFingerprint ?? '')))
      || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 100) return null;
  const entries = value.entries.map(normalizePreviewEntry);
  if (entries.some(entry => entry === null)) return null;
  const batchId = value.batchId == null || value.batchId === '' ? '' : String(value.batchId);
  const invalidatedAt = value.invalidatedAt == null || value.invalidatedAt === '' ? '' : String(value.invalidatedAt);
  const creationAuditStartedAtUtc = value.creationAuditStartedAtUtc == null || value.creationAuditStartedAtUtc === ''
    ? '' : String(value.creationAuditStartedAtUtc);
  if ((batchId && !idPattern.test(batchId)) || (invalidatedAt && !Number.isFinite(Date.parse(invalidatedAt)))) return null;
  if (creationAuditStartedAtUtc && !Number.isFinite(Date.parse(creationAuditStartedAtUtc))) return null;
  const creationAuditVersion = [1, 2].includes(value.creationAuditVersion) ? value.creationAuditVersion : 0;
  const creationAuditBaseline = value.creationAuditBaseline === true;
  const quotaUsage = value.quotaUsage == null ? null : normalizePreviewQuotaUsage(value.quotaUsage);
  if (value.quotaUsage != null && !quotaUsage) return null;
  return {
    id: String(value.id),
    draftId: String(value.draftId),
    validatedAt: value.validatedAt,
    payloadFingerprint: String(value.payloadFingerprint || '').toLowerCase(),
    batchId,
    invalidatedAt,
    creationAuditVersion,
    creationAuditStartedAtUtc,
    creationAuditBaseline,
    creationAuditLegacyHistory: value.creationAuditLegacyHistory === true,
    quotaUsage,
    entries,
  };
}

function normalizeStore(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.previews)) return null;
  const previews = value.previews.map(normalizePreview);
  if (previews.some(preview => preview === null)
      || new Set(previews.map(preview => preview.id)).size !== previews.length) return null;
  return { schemaVersion: 1, previews };
}

function getStorage(storage) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) throw new Error();
    return target;
  } catch {
    throw new Error('O armazenamento local deste navegador não está disponível.');
  }
}

export function loadGoogleAdsCampaignPreviews({ storage = null } = {}) {
  const target = getStorage(storage);
  let raw;
  try { raw = target.getItem(GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY); }
  catch { throw new Error('Não foi possível ler as prévias salvas neste navegador.'); }
  if (!raw) return { schemaVersion: 1, previews: [] };
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('As prévias salvas estão ilegíveis e foram preservadas.'); }
  const normalized = normalizeStore(value);
  if (!normalized) throw new Error('O formato das prévias salvas não é reconhecido. Os dados existentes foram preservados.');
  return normalized;
}

function writeStore(store, target) {
  try { target.setItem(GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY, JSON.stringify(store)); }
  catch { throw new Error('Não foi possível salvar a prévia neste navegador. Confira o espaço disponível no armazenamento local.'); }
  return store;
}

export function saveGoogleAdsCampaignPreview(preview, { storage = null } = {}) {
  const target = getStorage(storage);
  const store = loadGoogleAdsCampaignPreviews({ storage: target });
  const normalized = normalizePreview(preview);
  if (!normalized) throw new Error('A prévia não passou pela validação local de armazenamento.');
  const previews = store.previews.some(item => item.id === normalized.id)
    ? store.previews.map(item => item.id === normalized.id ? normalized : item)
    : [...store.previews, normalized];
  return writeStore({ schemaVersion: 1, previews }, target);
}

export function listGoogleAdsCampaignPreviews({ draftId = '', storage = null } = {}) {
  const store = loadGoogleAdsCampaignPreviews({ storage });
  return store.previews.filter(preview => !draftId || preview.draftId === draftId)
    .sort((left, right) => Date.parse(right.validatedAt) - Date.parse(left.validatedAt));
}

export function loadGoogleAdsCampaignPreview(previewId, { storage = null } = {}) {
  if (!previewId) return null;
  return loadGoogleAdsCampaignPreviews({ storage }).previews.find(preview => preview.id === previewId) || null;
}

function updatePreview(previewId, update, { storage = null } = {}) {
  const target = getStorage(storage);
  const store = loadGoogleAdsCampaignPreviews({ storage: target });
  const current = store.previews.find(preview => preview.id === previewId);
  if (!current) throw new Error('A prévia salva não está mais disponível neste navegador.');
  const normalized = normalizePreview(update(current));
  if (!normalized) throw new Error('A atualização da prévia não passou pela validação local.');
  return writeStore({
    schemaVersion: 1,
    previews: store.previews.map(preview => preview.id === previewId ? normalized : preview),
  }, target);
}

export function invalidateGoogleAdsCampaignPreview(previewId, { at = new Date().toISOString(), storage = null } = {}) {
  if (!previewId) return null;
  return updatePreview(previewId, preview => preview.batchId ? preview : { ...preview, invalidatedAt: at }, { storage });
}

export function linkGoogleAdsCampaignPreviewToBatch(previewId, batchId, { at = new Date().toISOString(), storage = null } = {}) {
  if (!previewId || !batchId) return null;
  if (!Number.isFinite(Date.parse(at))) throw new Error('O horário de início da trilha local é inválido.');
  return updatePreview(previewId, preview => {
    if (preview.batchId && preview.batchId !== batchId) throw new Error('Esta prévia já está vinculada a outro lote.');
    if (preview.invalidatedAt) throw new Error('Esta prévia foi invalidada e não pode ser vinculada a um lote.');
    const creationAuditLegacyHistory = preview.creationAuditLegacyHistory === true
      || (!preview.creationAuditBaseline
        && (preview.creationAuditVersion !== 2 || !preview.creationAuditStartedAtUtc));
    return {
      ...preview,
      batchId,
      invalidatedAt: '',
      creationAuditVersion: 2,
      creationAuditStartedAtUtc: preview.creationAuditVersion === 2 && preview.creationAuditStartedAtUtc
        ? preview.creationAuditStartedAtUtc : at,
      creationAuditLegacyHistory,
    };
  }, { storage });
}

export function saveGoogleAdsCampaignCreationAttempt(previewId, { managerCustomerId, customerId, campaignName, attempt } = {}, { storage = null } = {}) {
  if (!previewId) throw new Error('A prévia vinculada não está disponível para registrar a tentativa.');
  const normalizedAttempt = normalizeCampaignCreationAttempt(attempt);
  if (!normalizedAttempt) throw new Error('O resultado da tentativa de criação não passou pela validação local.');
  return updatePreview(previewId, preview => {
    if (!preview.batchId || preview.creationAuditVersion !== 2 || !preview.creationAuditStartedAtUtc) {
      throw new Error('A prévia não tem trilha de criação write-ahead vinculada a um lote. Nenhuma tentativa foi registrada.');
    }
    const matches = preview.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.managerCustomerId === String(managerCustomerId || '')
        && entry.customerId === String(customerId || '')
        && entry.campaignName === String(campaignName || ''));
    if (matches.length !== 1) throw new Error('A campanha não corresponde a uma única linha da prévia salva.');
    const { index } = matches[0];
    const entries = [...preview.entries];
    const previous = entries[index];
    const attempts = [...previous.creationAttempts];
    const existingIndex = attempts.findIndex(item => item.attemptId === normalizedAttempt.attemptId);
    if (existingIndex >= 0) attempts[existingIndex] = normalizedAttempt;
    else attempts.push(normalizedAttempt);
    entries[index] = { ...previous, creationAttempts: attempts.slice(-20) };
    return { ...preview, creationAuditVersion: 2, entries };
  }, { storage });
}

export function releaseGoogleAdsCampaignPreviewFromBatch(previewId, batchId, { storage = null } = {}) {
  if (!previewId || !batchId) return null;
  return updatePreview(previewId, preview => preview.batchId === batchId ? { ...preview, batchId: '', invalidatedAt: '' } : preview, { storage });
}
