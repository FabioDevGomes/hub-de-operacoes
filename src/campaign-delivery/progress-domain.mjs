import { buildGoogleAdsPresellCampaignHandoff } from '../google-ads/google-ads-presell-campaign-handoff.mjs?v=4';
import { normalizeCampaignSequenceProduct } from '../google-ads/google-ads-campaign-sequence-domain.mjs?v=1';

export const DELIVERY_MANUAL_STEPS = Object.freeze({
  targeting: 'Segmentação', exclusions: 'Exclusões', images: 'Imagens',
});

export const DELIVERY_SHARED_STEPS = Object.freeze({ ...DELIVERY_MANUAL_STEPS, sitelinks: 'Sitelinks' });

export function campaignDeliverySettingsVerified(campaign) {
  if (campaign?.campaignChannelType && campaign.campaignChannelType !== 'SEARCH') return true;
  const result = campaign?.deliverySettingsResult;
  if (result?.verified === true && result.presenceVerified === true && result.goalVerified === true
      && result.status === 'PAUSED' && result.positiveGeoTargetType === 'PRESENCE') return true;
  const customGoalName = String(campaign?.customConversionGoalName || '').trim();
  const conversionActionName = String(campaign?.conversionActionName || '').trim();
  return campaign?.source === 'created' && campaign.verified === true
    && campaign.positiveGeoTargetType === 'PRESENCE'
    && Boolean(customGoalName && conversionActionName);
}

export function linkedLegacyPresellJobIds(batch) {
  const ids = [batch?.formSnapshot?.__hub_presell_campaign_handoff?.sourceJobId,
    ...(Array.isArray(batch?.destinationUrls) ? batch.destinationUrls.map(target => target.sourceJobId) : [])];
  return [...new Set(ids.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))];
}

export function campaignSetSignature(campaigns) {
  if (!Array.isArray(campaigns) || !campaigns.length) return '';
  const keys = campaigns.map(item => String(item?.customerId || '') + ':' + String(item?.campaignId || ''));
  if (keys.some(key => !/^\d{10}:[1-9]\d{0,19}$/.test(key)) || new Set(keys).size !== keys.length) return '';
  return JSON.stringify(keys.sort());
}

export function campaignSitelinksSignature(sitelinks) {
  if (!Array.isArray(sitelinks)) return '';
  return JSON.stringify(sitelinks.map(link => ({
    title: link.title, description1: link.description1, description2: link.description2, anchor: link.anchor,
  })));
}

export function sharedStepFingerprint(batch, step) {
  const campaignSet = campaignSetSignature(batch?.campaigns);
  if (!campaignSet || !Object.hasOwn(DELIVERY_SHARED_STEPS, step)) return '';
  const campaigns = [...batch.campaigns].sort((a, b) => (a.customerId + ':' + a.campaignId).localeCompare(b.customerId + ':' + b.campaignId));
  const details = step === 'targeting' ? campaigns.map(item => item.audienceTargetingResult || null)
    : step === 'exclusions' ? campaigns.map(item => item.audienceExclusionsResult || null)
      : step === 'images' ? (batch.imageAssetUploads || [])
        : { sitelinks: batch.sitelinks || [], results: campaigns.map(item => item.sitelinksResult || null) };
  return JSON.stringify({ campaignSet, details });
}

export function sharedStepStatus(batch) {
  const signature = campaignSetSignature(batch?.campaigns);
  return Object.fromEntries(Object.keys(DELIVERY_SHARED_STEPS).map(step => {
    if (step === 'sitelinks') {
      const sitelinksSignature = campaignSitelinksSignature(batch?.sitelinks);
      const campaigns = Array.isArray(batch?.campaigns) ? batch.campaigns : [];
      return [step, Boolean(signature && sitelinksSignature && campaigns.length
        && campaigns.every(campaign => campaign.sitelinksResult?.verified === true
          && campaign.sitelinksResult.signature === sitelinksSignature))];
    }
    const confirmation = batch?.workflowConfirmations?.[step];
    return [step, Boolean(signature && confirmation?.campaignSet === signature
      && confirmation.fingerprint === sharedStepFingerprint(batch, step) && Number.isFinite(Date.parse(confirmation?.confirmedAtUtc)))];
  }));
}

export function pendingDeliveryManualSteps(batch, requiredSteps = Object.keys(DELIVERY_MANUAL_STEPS)) {
  const status = sharedStepStatus(batch);
  return requiredSteps.filter(step => Object.hasOwn(DELIVERY_MANUAL_STEPS, step) && !status[step]);
}

export function deliveryProgress({ delivery, jobs = [], batches = [], drafts = [], expansionBlocked = false }) {
  const curadoria = Boolean(String(delivery?.offerKey || '').trim()
    && (delivery?.geoTargetingMode === 'WORLD'
      || (Array.isArray(delivery?.countries)
        && delivery.countries.some(country => /^[A-Z]{2}$/.test(String(country || '').trim().toUpperCase())))));
  const linkedDraftIds = new Set(drafts.filter(draft => draft?.values?.__hub_campaign_delivery_source?.deliveryId === delivery?.id).map(draft => draft.id));
  const linkedBatches = batches.filter(batch => batch?.formSnapshot?.__hub_campaign_delivery_source?.deliveryId === delivery?.id || linkedDraftIds.has(batch.draftId));
  const ambiguous = linkedBatches.length > 1;
  const batch = linkedBatches.length === 1 ? linkedBatches[0] : null;
  const legacyJobs = new Set(linkedLegacyPresellJobIds(batch));
  const pages = new Map();
  for (const job of jobs) {
    const linkedByDeliveryId = job?.campaignDeliveryId === delivery?.id;
    const linkedLegacyJob = !job?.campaignDeliveryId && legacyJobs.has(job?.id);
    if ((!linkedByDeliveryId && !linkedLegacyJob)
        || (!linkedByDeliveryId && normalizeCampaignSequenceProduct(job.product) !== normalizeCampaignSequenceProduct(delivery?.productName))) continue;
    for (const target of Array.isArray(job.targets) ? job.targets : []) {
      const candidate = buildGoogleAdsPresellCampaignHandoff({ ...job, targets: [target] });
      if (!candidate.ok) continue;
      const page = candidate.payload.targets[0];
      if (!pages.has(page.accountId)) pages.set(page.accountId, new Set());
      pages.get(page.accountId).add(page.url);
    }
  }
  const campaigns = batch?.campaigns || [];
  const pageComplete = pages.size > 0 && [...pages.values()].every(urls => urls.size === 1)
    && campaigns.every(campaign => pages.has(campaign.customerId) && pages.get(campaign.customerId).size === 1);
  const shared = sharedStepStatus(batch);
  const assetsBypassed = delivery?.assetStudioRoute?.mode === 'existing_local_page'
    && Number.isFinite(Date.parse(delivery?.assetStudioRoute?.selectedAtUtc));
  const assets = assetsBypassed || delivery?.assetStudioWork?.status === 'completed';
  const campaignSettings = campaigns.length > 0 && campaigns.every(campaignDeliverySettingsVerified);
  const campaign = Boolean(batch && campaignSetSignature(campaigns) && campaignSettings && !expansionBlocked);
  return { curadoria, assets, assetsBypassed, presell: pageComplete, campaign, campaignSettings, shared, ambiguous, batch, pages: pages.size,
    complete: !ambiguous && curadoria && assets && pageComplete && campaign && Object.values(shared).every(Boolean) };
}
