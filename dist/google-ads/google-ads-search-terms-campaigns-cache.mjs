export const GOOGLE_ADS_SEARCH_TERMS_CAMPAIGNS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const STORAGE_PREFIX = 'hub.google-ads-search-terms-campaigns:v1:';
const CUSTOMER_ID = /^\d{10}$/;
const CAMPAIGN_ID = /^[1-9]\d{0,19}$/;

function cacheKey(managerCustomerId, customerId) {
  const manager = managerCustomerId == null ? 'direct' : String(managerCustomerId);
  return `${STORAGE_PREFIX}${manager}:${String(customerId)}`;
}

function validCampaigns(value, { managerCustomerId, customerId }) {
  const expectedManagerId = managerCustomerId == null ? null : String(managerCustomerId);
  if (!value || value.schemaVersion !== 1 || value.customerId !== String(customerId)
    || (value.managerCustomerId ?? null) !== expectedManagerId
    || !Number.isInteger(value.campaignCount) || !Array.isArray(value.campaigns)
    || value.campaignCount !== value.campaigns.length || value.campaigns.length > 1000
    || typeof value.savedAtUtc !== 'string' || Number.isNaN(Date.parse(value.savedAtUtc))) return false;
  if (!CUSTOMER_ID.test(String(value.customerId))
    || !(value.managerCustomerId == null || CUSTOMER_ID.test(String(value.managerCustomerId)))) return false;
  const ids = new Set();
  for (const campaign of value.campaigns) {
    if (!campaign || !CAMPAIGN_ID.test(String(campaign.campaignId)) || !String(campaign.campaignName || '').trim()) return false;
    if (ids.has(String(campaign.campaignId))) return false;
    ids.add(String(campaign.campaignId));
  }
  return true;
}

export function loadGoogleAdsSearchTermsCampaignsCache(managerCustomerId, customerId, { storage = null, now = Date.now() } = {}) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return null;
    const value = JSON.parse(target.getItem(cacheKey(managerCustomerId, customerId)) || 'null');
    if (!validCampaigns(value, { managerCustomerId, customerId })) return null;
    const ageMs = now - Date.parse(value.savedAtUtc);
    return {
      catalog: {
        customerId: value.customerId,
        managerCustomerId: value.managerCustomerId ?? null,
        campaignCount: value.campaignCount,
        campaigns: value.campaigns,
      },
      savedAtUtc: value.savedAtUtc,
      isFresh: ageMs >= 0 && ageMs < GOOGLE_ADS_SEARCH_TERMS_CAMPAIGNS_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function saveGoogleAdsSearchTermsCampaignsCache(catalog, { storage = null, savedAtUtc = new Date().toISOString() } = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  const value = {
    schemaVersion: 1,
    savedAtUtc,
    customerId: String(catalog?.customerId || ''),
    managerCustomerId: catalog?.managerCustomerId == null ? null : String(catalog.managerCustomerId),
    campaignCount: Number(catalog?.campaignCount),
    campaigns: Array.isArray(catalog?.campaigns) ? catalog.campaigns : [],
  };
  if (!validCampaigns(value, { managerCustomerId: value.managerCustomerId, customerId: value.customerId })) {
    throw new Error('A lista de campanhas Search não passou pela validação do cache local.');
  }
  try {
    target.setItem(cacheKey(value.managerCustomerId, value.customerId), JSON.stringify(value));
  } catch {
    throw new Error('Não foi possível guardar as campanhas localmente neste perfil do navegador.');
  }
  return { savedAtUtc };
}
