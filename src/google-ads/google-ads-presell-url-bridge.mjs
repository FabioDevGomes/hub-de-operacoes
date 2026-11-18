import {
  GOOGLE_ADS_PRESELL_HANDOFF_SELECTION_KEY,
  buildGoogleAdsPresellCampaignHandoff,
  validateGoogleAdsPresellCampaignHandoff,
} from './google-ads-presell-campaign-handoff.mjs?v=4';

export const GOOGLE_ADS_PRESELL_DEPLOY_JOBS_STORAGE_KEY = 'hub:presell-deploy-jobs:v1';

function normalizeProduct(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchesGoogleAdsProductPhrase(value, product) {
  const text = normalizeProduct(value);
  const phrase = normalizeProduct(product);
  if (!text || !phrase) return false;
  return text === phrase || (` ${text} `).includes(` ${phrase} `);
}

/** Rebuild a validated handoff from a specific, fully published local Pre-Sell job. */
export function readGoogleAdsPresellCampaignHandoffForJob(jobId, { storage = globalThis.localStorage } = {}) {
  try {
    const selectedJobId = String(jobId || '').trim();
    if (!selectedJobId) return { ok: false, reason: 'no-selected-job' };
    const jobs = JSON.parse(storage?.getItem(GOOGLE_ADS_PRESELL_DEPLOY_JOBS_STORAGE_KEY) || '[]');
    if (!Array.isArray(jobs)) return { ok: false, reason: 'invalid-job-store' };
    const job = jobs.find(item => item && item.id === selectedJobId);
    if (!job) return { ok: false, reason: 'selected-job-not-found' };
    const prepared = buildGoogleAdsPresellCampaignHandoff(job);
    if (!prepared.ok) return prepared;
    const safeJobId = selectedJobId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 68);
    if (safeJobId.length < 8) return { ok: false, reason: 'invalid-selected-job' };
    const id = `presell-job-${safeJobId}`;
    const payload = validateGoogleAdsPresellCampaignHandoff({ ...prepared.payload, id });
    if (!payload) return { ok: false, reason: 'invalid-selected-job' };
    return {
      ...prepared,
      payload,
    };
  } catch {
    return { ok: false, reason: 'storage-unavailable' };
  }
}

/** Read the explicitly selected, fully published Pre-Sell job from the prior local step. */
export function readSelectedGoogleAdsPresellCampaignHandoff({ storage = globalThis.localStorage, jobId = '' } = {}) {
  let selectedJobId = String(jobId || '').trim();
  if (!selectedJobId) {
    try { selectedJobId = String(storage?.getItem(GOOGLE_ADS_PRESELL_HANDOFF_SELECTION_KEY) || '').trim(); }
    catch { return { ok: false, reason: 'storage-unavailable' }; }
  }
  return readGoogleAdsPresellCampaignHandoffForJob(selectedJobId, { storage });
}

function productMatch(handoff, campaignProduct, offerName) {
  const product = String(handoff?.product || '').trim();
  const campaign = String(campaignProduct || '').trim();
  const offer = String(offerName || '').trim();
  if (!product) return { matched: false, reason: 'no-product', product, targets: [] };
  if (!campaign && !offer) return { matched: false, reason: 'no-campaign-product', product, targets: [] };
  const campaignMatches = !campaign || matchesGoogleAdsProductPhrase(product, campaign)
    || (normalizeProduct(campaign).startsWith(normalizeProduct(product) + ' ')
      && /^[a-z]{2}\d{2}$/i.test(normalizeProduct(campaign).slice(normalizeProduct(product).length + 1)));
  if (!campaignMatches) return { matched: false, reason: 'product-mismatch', product, targets: [] };
  if (offer && !matchesGoogleAdsProductPhrase(offer, product)) return { matched: false, reason: 'offer-mismatch', product, targets: [] };
  return { matched: true, product };
}

/** Resolve only the explicit, one-time Pre-Sell handoff accepted by campaign creation. */
export function resolveGoogleAdsPresellUrl({ handoff, accountId, campaignProduct, offerName } = {}) {
  const accepted = validateGoogleAdsPresellCampaignHandoff(handoff);
  if (!accepted) return { ok: false, reason: 'no-handoff' };
  const match = productMatch(accepted, campaignProduct, offerName);
  if (!match.matched) return { ok: false, reason: match.reason, product: match.product };
  const id = String(accountId || '').replace(/\D/g, '');
  if (!id) return { ok: false, reason: 'no-account', product: accepted.product };
  const target = accepted.targets.find(item => item.accountId === id);
  if (!target) return { ok: false, reason: 'account-not-selected', product: accepted.product };
  return { ok: true, url: target.url, product: accepted.product, accountId: id };
}

/** Return the explicit handoff targets for the product, including any invalid directory mapping. */
export function resolveGoogleAdsPresellTargets({ handoff, campaignProduct, offerName } = {}) {
  const accepted = validateGoogleAdsPresellCampaignHandoff(handoff);
  if (!accepted) return { matched: false, reason: 'no-handoff', targets: [] };
  const match = productMatch(accepted, campaignProduct, offerName);
  if (!match.matched) return { ...match, targets: [] };
  return {
    matched: true,
    product: accepted.product,
    targets: accepted.targets.map(target => ({
      accountId: target.accountId,
      accountName: target.accountName,
      ...resolveGoogleAdsPresellUrl({ handoff: accepted, accountId: target.accountId, campaignProduct, offerName }),
    })),
  };
}
