export const GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY = 'hub.google-ads.campaign-creation.previews:v1';

const idPattern = /^[\w-]{1,120}$/;
const campaignIdPattern = /^[1-9]\d{0,19}$/;

function safeText(value, maxLength = 500) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizePreviewEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const managerCustomerId = String(value.managerCustomerId ?? '');
  const customerId = String(value.customerId ?? '');
  const campaignName = safeText(value.campaignName, 240).trim();
  const previewResult = value.previewResult;
  if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !campaignName
      || !previewResult || typeof previewResult !== 'object' || Array.isArray(previewResult)
      || safeText(previewResult.campaignName, 240) !== campaignName) return null;
  const resultType = safeText(previewResult.resultType, 24) || 'validated_new';
  if (resultType === 'validated_new') {
    if (!/^[A-Z]{3}$/.test(String(previewResult.accountCurrency ?? ''))
        || !/^\d+$/.test(String(previewResult.dailyBudgetMicros ?? ''))
        || (previewResult.targetCpaMicros !== '' && !/^\d+$/.test(String(previewResult.targetCpaMicros ?? '')))) return null;
  } else if (resultType === 'existing') {
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
  } else return null;
  return {
    managerCustomerId,
    customerId,
    campaignName,
    accountName: safeText(value.accountName, 240),
    percent: safeText(value.percent, 12),
    previewResult: {
      resultType,
      campaignName,
      ...(resultType === 'validated_new' ? {
        accountCurrency: String(previewResult.accountCurrency),
        dailyBudgetMicros: String(previewResult.dailyBudgetMicros),
        targetCpaMicros: previewResult.targetCpaMicros === '' ? '' : String(previewResult.targetCpaMicros),
      } : {
        campaignId: String(previewResult.campaignId),
        campaignStatus: String(previewResult.campaignStatus),
        channelType: String(previewResult.channelType),
        audienceGrouped: previewResult.audienceGrouped,
        adGroupId: String(previewResult.adGroupId ?? ''),
        adGroupStatus: String(previewResult.adGroupStatus ?? ''),
        adGroupCount: previewResult.adGroupCount,
      }),
    },
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
  if ((batchId && !idPattern.test(batchId)) || (invalidatedAt && !Number.isFinite(Date.parse(invalidatedAt)))) return null;
  return {
    id: String(value.id),
    draftId: String(value.draftId),
    validatedAt: value.validatedAt,
    payloadFingerprint: String(value.payloadFingerprint || '').toLowerCase(),
    batchId,
    invalidatedAt,
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

export function linkGoogleAdsCampaignPreviewToBatch(previewId, batchId, { storage = null } = {}) {
  if (!previewId || !batchId) return null;
  return updatePreview(previewId, preview => {
    if (preview.batchId && preview.batchId !== batchId) throw new Error('Esta prévia já está vinculada a outro lote.');
    if (preview.invalidatedAt) throw new Error('Esta prévia foi invalidada e não pode ser vinculada a um lote.');
    return { ...preview, batchId, invalidatedAt: '' };
  }, { storage });
}

export function releaseGoogleAdsCampaignPreviewFromBatch(previewId, batchId, { storage = null } = {}) {
  if (!previewId || !batchId) return null;
  return updatePreview(previewId, preview => preview.batchId === batchId ? { ...preview, batchId: '', invalidatedAt: '' } : preview, { storage });
}
