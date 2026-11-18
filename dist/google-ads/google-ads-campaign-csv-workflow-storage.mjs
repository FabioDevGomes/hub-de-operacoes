import { normalizeGoogleAdsCampaignGeoTargetingSnapshot } from './google-ads-campaign-geo-targeting.mjs?v=1';

export const GOOGLE_ADS_CAMPAIGN_CSV_WORKFLOWS_STORAGE_KEY = 'hub.google-ads.campaign-creation.csv-workflows:v1';

function safeText(value, maxLength = 500) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function validTimestamp(value, optional = false) {
  return optional && value === '' || typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeCampaignSet(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 30000) return undefined;
  try {
    const keys = JSON.parse(value);
    if (!Array.isArray(keys) || keys.length > 500
        || keys.some(key => typeof key !== 'string' || !/^\d{10}:[1-9]\d{0,19}$/.test(key))) return undefined;
    const normalized = [...new Set(keys)].sort();
    return JSON.stringify(normalized) === value ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizeCampaigns(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) return null;
  const campaigns = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const managerCustomerId = String(item.managerCustomerId || '');
    const customerId = String(item.customerId || '');
    const campaignName = safeText(item.campaignName, 255).trim();
    const geoTargetingSnapshot = normalizeGoogleAdsCampaignGeoTargetingSnapshot(item.geoTargetingSnapshot);
    if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !campaignName) return null;
    if (geoTargetingSnapshot === undefined) return null;
    return { managerCustomerId, customerId, campaignName, geoTargetingSnapshot };
  });
  if (campaigns.includes(null)) return null;
  const keys = campaigns.map(item => item.managerCustomerId + ':' + item.customerId + ':' + item.campaignName);
  return new Set(keys).size === keys.length ? campaigns : null;
}

function normalizeManagers(value, plannedCampaigns) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const ids = new Set();
  const managers = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const managerCustomerId = String(item.managerCustomerId || '');
    const name = safeText(item.name, 160).trim();
    const campaignCount = item.campaignCount;
    const accountCount = item.accountCount;
    if (!/^\d{10}$/.test(managerCustomerId) || ids.has(managerCustomerId) || !name
        || !Number.isInteger(campaignCount) || campaignCount < 1 || campaignCount > 500
        || !Number.isInteger(accountCount) || accountCount < 1 || accountCount > 500) return null;
    ids.add(managerCustomerId);
    return { managerCustomerId, name, campaignCount, accountCount };
  });
  if (managers.includes(null)) return null;
  const plannedManagerIds = new Set(plannedCampaigns.map(item => item.managerCustomerId));
  return managers.length === plannedManagerIds.size && managers.every(item => plannedManagerIds.has(item.managerCustomerId))
    ? managers : null;
}

function normalizeManagerIds(value, managers) {
  if (!Array.isArray(value) || value.length > managers.length) return null;
  const allowed = new Set(managers.map(item => item.managerCustomerId));
  const ids = value.map(String);
  return ids.every(id => allowed.has(id)) && new Set(ids).size === ids.length ? ids : null;
}

function normalizeWorkflow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.id !== 'string' || !/^csv-flow-[\w-]{1,100}$/.test(value.id)
      || typeof value.draftId !== 'string' || !/^[\w-]{1,120}$/.test(value.draftId)
      || !(value.batchId === '' || typeof value.batchId === 'string' && /^[\w-]{1,100}$/.test(value.batchId))
      || !validTimestamp(value.createdAtUtc) || !validTimestamp(value.updatedAtUtc)
      || !validTimestamp(value.associationConfirmedAtUtc, true)
      || !validTimestamp(value.euDeclarationConfirmedAtUtc, true)
      || !validTimestamp(value.deliverySettingsConfirmedAtUtc, true)
      || !validTimestamp(value.completedAtUtc, true)) return null;
  const plannedCampaigns = normalizeCampaigns(value.plannedCampaigns);
  if (!plannedCampaigns) return null;
  const managers = normalizeManagers(value.managers, plannedCampaigns);
  if (!managers) return null;
  const downloadedManagerIds = normalizeManagerIds(value.downloadedManagerIds, managers);
  const uploadedManagerIds = normalizeManagerIds(value.uploadedManagerIds, managers);
  if (!downloadedManagerIds || !uploadedManagerIds
      || uploadedManagerIds.some(id => !downloadedManagerIds.includes(id))) return null;
  const associationCampaignSet = normalizeCampaignSet(value.associationCampaignSet);
  const euDeclarationCampaignSet = normalizeCampaignSet(value.euDeclarationCampaignSet);
  const deliverySettingsCampaignSet = normalizeCampaignSet(value.deliverySettingsCampaignSet);
  if (associationCampaignSet === undefined || euDeclarationCampaignSet === undefined
      || deliverySettingsCampaignSet === undefined) return null;
  return {
    id: value.id,
    draftId: value.draftId,
    batchId: value.batchId,
    product: safeText(value.product, 240),
    plannedCampaigns,
    managers,
    downloadedManagerIds,
    uploadedManagerIds,
    associationConfirmedAtUtc: value.associationConfirmedAtUtc,
    associationCampaignSet,
    euDeclarationConfirmedAtUtc: value.euDeclarationConfirmedAtUtc,
    euDeclarationCampaignSet,
    deliverySettingsConfirmedAtUtc: value.deliverySettingsConfirmedAtUtc,
    deliverySettingsCampaignSet,
    completedAtUtc: value.completedAtUtc,
    createdAtUtc: value.createdAtUtc,
    updatedAtUtc: value.updatedAtUtc,
  };
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

export function loadGoogleAdsCampaignCsvWorkflows({ storage = null } = {}) {
  const target = getStorage(storage);
  let raw;
  try { raw = target.getItem(GOOGLE_ADS_CAMPAIGN_CSV_WORKFLOWS_STORAGE_KEY); }
  catch { throw new Error('Não foi possível ler o progresso dos fluxos CSV salvos neste navegador.'); }
  if (!raw) return { schemaVersion: 1, workflows: [] };
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('O progresso dos fluxos CSV está ilegível e foi preservado.'); }
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.workflows) || value.workflows.length > 500) {
    throw new Error('O formato dos fluxos CSV não é reconhecido. Os dados foram preservados.');
  }
  const workflows = value.workflows.map(normalizeWorkflow);
  if (workflows.includes(null) || new Set(workflows.map(item => item.id)).size !== workflows.length) {
    throw new Error('Há um fluxo CSV inválido ou duplicado. Os dados foram preservados.');
  }
  return { schemaVersion: 1, workflows };
}

export function saveGoogleAdsCampaignCsvWorkflow(workflow, { storage = null } = {}) {
  const target = getStorage(storage);
  const normalized = normalizeWorkflow(workflow);
  if (!normalized) throw new Error('O progresso do fluxo CSV não passou pela validação local.');
  const store = loadGoogleAdsCampaignCsvWorkflows({ storage: target });
  const exists = store.workflows.some(item => item.id === normalized.id);
  if (!exists && store.workflows.length >= 500) {
    throw new Error('O limite local de fluxos CSV foi alcançado; os registros anteriores foram preservados.');
  }
  const workflows = exists
    ? store.workflows.map(item => item.id === normalized.id ? normalized : item)
    : [...store.workflows, normalized];
  try { target.setItem(GOOGLE_ADS_CAMPAIGN_CSV_WORKFLOWS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, workflows })); }
  catch { throw new Error('Não foi possível salvar o progresso do fluxo CSV neste navegador.'); }
  return normalized;
}
