export const GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY = 'hub.google-ads.campaign-creation.batches:v1';

const campaignIdPattern = /^[1-9]\d{0,19}$/;

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function safeText(value, maxLength = 5000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizeStringList(value) {
  return Array.isArray(value) && value.length <= 100
    && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 300)
    ? value.map(item => item.slice(0, 300))
    : null;
}

function normalizeAudienceTargetingResult(value) {
  if (value == null) return null;
  const countFields = [
    'submittedCount', 'eligibleCount', 'appliedCount', 'verifiedCount', 'alreadyPresentCount',
    'unrecognizedCount', 'ambiguousCount', 'failedCount',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.verified !== 'boolean'
      || typeof value.targetingSettingVerified !== 'boolean'
      || typeof value.verificationAvailable !== 'boolean'
      || countFields.some(field => !validCount(value[field]))) return undefined;
  return {
    campaignId: safeText(value.campaignId, 32),
    adGroupId: safeText(value.adGroupId, 32),
    targetingMode: safeText(value.targetingMode, 40),
    ...Object.fromEntries(countFields.map(field => [field, value[field]])),
    targetingSettingVerified: value.targetingSettingVerified,
    verificationAvailable: value.verificationAvailable,
    verified: value.verified,
  };
}

function normalizeAudienceExclusionsResult(value) {
  if (value == null) return null;
  const countFields = [
    'submittedCount', 'resolvedCount', 'addedCount', 'reactivatedCount', 'alreadyPresentCount',
    'verifiedCount', 'unresolvedCount', 'ambiguousCount', 'unsupportedCount', 'conflictCount', 'failedCount',
  ];
  const nameFields = ['unresolvedNames', 'ambiguousNames', 'unsupportedNames', 'conflictNames'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.verified !== 'boolean' || typeof value.verificationAvailable !== 'boolean'
      || countFields.some(field => !validCount(value[field]))) return undefined;
  const lists = Object.fromEntries(nameFields.map(field => [field, normalizeStringList(value[field])]));
  if (Object.values(lists).some(items => items === null)) return undefined;
  if (!Array.isArray(value.resolvedSegments) || value.resolvedSegments.length > 100) return undefined;
  const resolvedSegments = value.resolvedSegments.map(segment => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)
        || !campaignIdPattern.test(String(segment.id ?? ''))
        || typeof segment.name !== 'string' || !segment.name
        || typeof segment.apiName !== 'string' || !segment.apiName
        || !['id', 'name'].includes(segment.resolutionSource)) return null;
    return {
      name: segment.name.slice(0, 300),
      id: String(segment.id),
      apiName: segment.apiName.slice(0, 300),
      resolutionSource: segment.resolutionSource,
    };
  });
  if (resolvedSegments.some(segment => segment === null)) return undefined;
  return {
    campaignId: safeText(value.campaignId, 32),
    ...Object.fromEntries(countFields.map(field => [field, value[field]])),
    ...lists,
    resolvedSegments,
    verified: value.verified,
    verificationAvailable: value.verificationAvailable,
  };
}

function normalizeActivationResult(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.verified !== true || typeof value.changed !== 'boolean'
      || value.status !== 'ENABLED') return undefined;
  return {
    verified: true,
    changed: value.changed,
    status: 'ENABLED',
    verifiedAtUtc: safeText(value.verifiedAtUtc, 60),
  };
}

function normalizeSitelinks(value) {
  if (!Array.isArray(value) || value.length > 6) return null;
  const anchors = new Set();
  const sitelinks = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description1 = typeof item.description1 === 'string' ? item.description1.trim() : '';
    const description2 = typeof item.description2 === 'string' ? item.description2.trim() : '';
    const anchor = Number(item.anchor);
    if (!title || Boolean(description1) !== Boolean(description2) || !Number.isInteger(anchor) || anchor < 1 || anchor > 6
        || anchors.has(anchor) || Array.from(title).length > 25
        || Array.from(description1).length > 35 || Array.from(description2).length > 35) return null;
    anchors.add(anchor);
    return { title, description1, description2, anchor };
  });
  return sitelinks.some(item => item === null) ? null : sitelinks;
}

function normalizeSitelinksResult(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.verified !== true || !validCount(value.appliedCount)
      || !validCount(value.alreadyPresentCount) || !validCount(value.reactivatedCount ?? 0) || !validCount(value.submittedCount)
      || value.appliedCount + value.alreadyPresentCount + (value.reactivatedCount ?? 0) !== value.submittedCount) return undefined;
  return {
    verified: true,
    submittedCount: value.submittedCount,
    appliedCount: value.appliedCount,
    alreadyPresentCount: value.alreadyPresentCount,
    reactivatedCount: validCount(value.reactivatedCount) ? value.reactivatedCount : 0,
    verifiedAtUtc: safeText(value.verifiedAtUtc, 60),
    signature: safeText(value.signature, 4096),
  };
}

function normalizeCampaign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const managerCustomerId = String(value.managerCustomerId ?? '');
  const customerId = String(value.customerId ?? '');
  const campaignId = String(value.campaignId ?? '');
  const adGroupId = value.adGroupId == null || value.adGroupId === '' ? '' : String(value.adGroupId);
  const campaignName = safeText(value.campaignName, 240).trim();
  if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId)
      || !campaignIdPattern.test(campaignId) || (adGroupId && !campaignIdPattern.test(adGroupId))
      || !campaignName) return null;
  const audienceTargetingResult = normalizeAudienceTargetingResult(value.audienceTargetingResult);
  const audienceExclusionsResult = normalizeAudienceExclusionsResult(value.audienceExclusionsResult);
  const activationResult = normalizeActivationResult(value.activationResult);
  const sitelinksResult = normalizeSitelinksResult(value.sitelinksResult);
  if (audienceTargetingResult === undefined || audienceExclusionsResult === undefined
      || activationResult === undefined || sitelinksResult === undefined) return null;
  return {
    ...value,
    managerCustomerId,
    customerId,
    campaignId,
    adGroupId,
    campaignName,
    accountName: safeText(value.accountName, 240),
    status: ['PAUSED', 'ENABLED'].includes(value.status) ? value.status : '',
    campaignChannelType: safeText(value.campaignChannelType, 40),
    audienceGrouped: typeof value.audienceGrouped === 'boolean' ? value.audienceGrouped : null,
    adGroupStatus: safeText(value.adGroupStatus, 40),
    source: ['created', 'existing'].includes(value.source) ? value.source : '',
    audienceTargetingResult,
    audienceTargetingError: safeText(value.audienceTargetingError),
    audienceExclusionsResult,
    audienceExclusionsError: safeText(value.audienceExclusionsError),
    activationResult,
    activationError: safeText(value.activationError, 3000),
    sitelinksResult,
    sitelinksError: safeText(value.sitelinksError, 3000),
  };
}

function normalizeBatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.id !== 'string' || !/^[\w-]{1,100}$/.test(value.id)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
      || !Array.isArray(value.campaigns) || value.campaigns.length < 1 || value.campaigns.length > 100) return null;
  const campaigns = value.campaigns.map(normalizeCampaign);
  if (campaigns.some(campaign => campaign === null)) return null;
  const sitelinks = normalizeSitelinks(value.sitelinks ?? []);
  if (sitelinks === null) return null;
  const imageUploadConfirmedAccountIds = Array.isArray(value.imageUploadConfirmedAccountIds)
    ? [...new Set(value.imageUploadConfirmedAccountIds.map(String).filter(accountId => /^\d{10}$/.test(accountId)))].slice(0, 100)
    : [];
  const campaignKeys = new Set(campaigns.map(campaign => campaign.customerId + ':' + campaign.campaignId));
  const selectedCampaignKey = typeof value.selectedCampaignKey === 'string' && campaignKeys.has(value.selectedCampaignKey)
    ? value.selectedCampaignKey
    : campaigns[0].customerId + ':' + campaigns[0].campaignId;
  return {
    ...value,
    id: value.id,
    label: safeText(value.label, 300),
    source: value.source === 'associated' ? 'associated' : '',
    draftId: typeof value.draftId === 'string' && /^[\w-]{1,120}$/.test(value.draftId) ? value.draftId : '',
    previewId: typeof value.previewId === 'string' && /^[\w-]{1,120}$/.test(value.previewId) ? value.previewId : '',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    selectedCampaignKey,
    sitelinks,
    imageUploadConfirmed: value.imageUploadConfirmed === true,
    imageUploadConfirmedAccountIds,
    campaigns,
  };
}

function normalizeStore(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.batches)) return null;
  const batches = value.batches.map(normalizeBatch);
  if (batches.some(batch => batch === null)
      || new Set(batches.map(batch => batch.id)).size !== batches.length) return null;
  return { ...value, schemaVersion: 1, batches };
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

export function loadGoogleAdsCampaignBatches({ storage = null } = {}) {
  const target = getStorage(storage);
  let raw;
  try { raw = target.getItem(GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY); }
  catch { throw new Error('Não foi possível ler os lotes de campanhas salvos neste navegador.'); }
  if (!raw) return { schemaVersion: 1, batches: [] };
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Os lotes de campanhas salvos estão ilegíveis e foram preservados.'); }
  const normalized = normalizeStore(value);
  if (!normalized) throw new Error('O formato dos lotes salvos não é reconhecido. Os dados existentes foram preservados.');
  return normalized;
}

export function saveGoogleAdsCampaignBatch(batch, { storage = null } = {}) {
  const target = getStorage(storage);
  let store;
  try { store = loadGoogleAdsCampaignBatches({ storage: target }); }
  catch (error) { throw error; }
  const normalizedBatch = normalizeBatch(batch);
  if (!normalizedBatch) throw new Error('O lote de campanhas não passou pela validação local.');
  const exists = store.batches.some(item => item.id === normalizedBatch.id);
  const batches = exists
    ? store.batches.map(item => item.id === normalizedBatch.id ? normalizedBatch : item)
    : [...store.batches, normalizedBatch];
  const nextStore = { ...store, schemaVersion: 1, batches };
  try { target.setItem(GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY, JSON.stringify(nextStore)); }
  catch { throw new Error('Não foi possível salvar o lote neste navegador. Confira o espaço disponível no armazenamento local.'); }
  return nextStore;
}
