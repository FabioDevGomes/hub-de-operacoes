import { sharedStepFingerprint } from '../campaign-delivery/progress-domain.mjs?v=6';

import { normalizeGoogleAdsCampaignGeoTargetingSnapshot } from './google-ads-campaign-geo-targeting.mjs?v=1';

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

function normalizeCampaignStatusActionResult(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.verified !== true || typeof value.changed !== 'boolean'
      || !['pause_campaign', 'enable_campaign'].includes(value.operation)
      || value.status !== (value.operation === 'pause_campaign' ? 'PAUSED' : 'ENABLED')) return undefined;
  return {
    operation: value.operation,
    verified: true,
    changed: value.changed,
    status: value.status,
    verifiedAtUtc: safeText(value.verifiedAtUtc, 60),
  };
}

function normalizeCampaignStatusLog(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['pause_campaign', 'enable_campaign'].includes(value.operation)
      || typeof value.atUtc !== 'string' || !Number.isFinite(Date.parse(value.atUtc))) return undefined;
  return {
    operation: value.operation,
    atUtc: value.atUtc,
    legacy: value.legacy === true,
    completed: value.completed === true,
  };
}

function normalizeCampaignDeliverySettingsResult(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.verified !== 'boolean'
      || typeof value.presenceVerified !== 'boolean'
      || typeof value.presenceChanged !== 'boolean'
      || typeof value.goalVerified !== 'boolean'
      || typeof value.goalChanged !== 'boolean'
      || !['', 'PAUSED', 'ENABLED'].includes(value.status)
      || (value.verified && (value.status !== 'PAUSED' || !value.presenceVerified || !value.goalVerified
        || value.positiveGeoTargetType !== 'PRESENCE'))) return undefined;
  const verifiedAtUtc = safeText(value.verifiedAtUtc, 60);
  if (verifiedAtUtc && !Number.isFinite(Date.parse(verifiedAtUtc))) return undefined;
  return {
    verified: value.verified,
    presenceVerified: value.presenceVerified,
    presenceChanged: value.presenceChanged,
    positiveGeoTargetType: safeText(value.positiveGeoTargetType, 40),
    goalVerified: value.goalVerified,
    goalChanged: value.goalChanged,
    goalName: safeText(value.goalName, 180),
    conversionActionName: safeText(value.conversionActionName, 180),
    status: value.status,
    verifiedAtUtc,
    failureCode: /^[a-z][a-z0-9_]{2,80}$/.test(String(value.failureCode || '')) ? value.failureCode : '',
  };
}

function normalizeCampaignEuPoliticalAdvertisingResult(value) {
  if (value == null) return null;
  const targetDeclaration = 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.verified !== 'boolean' || typeof value.changed !== 'boolean'
      || !['', 'PAUSED', 'ENABLED'].includes(value.status)
      || !['', 'SEARCH'].includes(value.channelType)
      || typeof value.declaration !== 'string' || value.declaration.length > 80
      || value.targetDeclaration !== targetDeclaration
      || (value.verified && (value.declaration !== targetDeclaration || value.channelType !== 'SEARCH'
        || !['PAUSED', 'ENABLED'].includes(value.status)))) return undefined;
  const verifiedAtUtc = safeText(value.verifiedAtUtc, 60);
  if (verifiedAtUtc && !Number.isFinite(Date.parse(verifiedAtUtc))) return undefined;
  return {
    verified: value.verified,
    changed: value.changed,
    status: value.status,
    channelType: value.channelType,
    declaration: value.declaration,
    targetDeclaration,
    failureCode: /^[a-z][a-z0-9_]{2,80}$/.test(String(value.failureCode || '')) ? value.failureCode : '',
    verifiedAtUtc,
  };
}

function normalizeCampaignDeliverySettingsQuotaSummary(value) {
  if (value == null) return null;
  const countFields = ['attemptCount', 'measuredRequestCount', 'unmeasuredRequestCount', 'quotaOperationsEstimated', 'quotaOperationsUnknown'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || countFields.some(field => !validCount(value[field]) || value[field] > 1000000)
      || !['running', 'complete', 'stopped'].includes(value.status)
      || typeof value.updatedAtUtc !== 'string' || !Number.isFinite(Date.parse(value.updatedAtUtc))) return null;
  return {
    attemptCount: value.attemptCount,
    measuredRequestCount: value.measuredRequestCount,
    unmeasuredRequestCount: value.unmeasuredRequestCount,
    quotaOperationsEstimated: value.quotaOperationsEstimated,
    quotaOperationsUnknown: value.quotaOperationsUnknown,
    status: value.status,
    updatedAtUtc: safeText(value.updatedAtUtc, 60),
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

function normalizeImageAssetUploads(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 2000) return null;
  const uploads = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !/^\d{10}$/.test(String(item.customerId ?? ''))
        || !/^[a-f0-9]{64}$/.test(String(item.imageSha256 ?? ''))
        || !['uploaded', 'verification_required', 'failed'].includes(item.status)
        || !Number.isInteger(item.width) || item.width < 1 || item.width > 100000
        || !Number.isInteger(item.height) || item.height < 1 || item.height > 100000
        || !Array.isArray(item.campaignIds) || item.campaignIds.length < 1 || item.campaignIds.length > 100
        || item.campaignIds.some(id => !campaignIdPattern.test(String(id)))
        || !Number.isInteger(item.linkedCount) || item.linkedCount < 0
        || !Number.isInteger(item.alreadyPresentCount) || item.alreadyPresentCount < 0
        || !Number.isInteger(item.reactivatedCount) || item.reactivatedCount < 0
        || !Array.isArray(item.googleErrorCodes) || item.googleErrorCodes.length > 6
        || item.googleErrorCodes.some(code => typeof code !== 'string' || !/^[A-Za-z][A-Za-z0-9_.]{0,100}$/.test(code))
        || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) return null;
    return {
      customerId: String(item.customerId),
      imageSha256: String(item.imageSha256),
      fileName: safeText(item.fileName, 180),
      width: item.width,
      height: item.height,
      campaignIds: [...new Set(item.campaignIds.map(String))],
      status: item.status,
      message: safeText(item.message, 800),
      linkedCount: item.linkedCount,
      alreadyPresentCount: item.alreadyPresentCount,
      reactivatedCount: item.reactivatedCount,
      googleErrorCodes: [...new Set(item.googleErrorCodes)],
      updatedAt: item.updatedAt,
    };
  });
  return uploads.some(item => item === null) ? null : uploads;
}

function normalizeFormSnapshot(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 100) return undefined;
  const snapshot = {};
  for (const [key, entry] of entries) {
    if (!/^[\w-]{1,100}$/.test(key)) return undefined;
    if (typeof entry === 'string' && entry.length <= 50000) {
      snapshot[key] = entry;
      continue;
    }
    if (typeof entry === 'boolean' || (typeof entry === 'number' && Number.isFinite(entry))) {
      snapshot[key] = entry;
      continue;
    }
    if (['__hub_campaign_delivery_source', '__hub_presell_campaign_handoff', '__hub_delivery_cpa'].includes(key) && (entry === null || (typeof entry === 'object' && !Array.isArray(entry)))) {
      try {
        const json = JSON.stringify(entry);
        if (typeof json !== 'string' || json.length > 100000) return undefined;
        snapshot[key] = JSON.parse(json);
      } catch { return undefined; }
      continue;
    }
    if (!Array.isArray(entry) || entry.length > 100) return undefined;
    if (key === '__hub_sitelinks') {
      const sitelinks = normalizeSitelinks(entry);
      if (sitelinks === null) return undefined;
      snapshot[key] = sitelinks;
      continue;
    }
    if (entry.some(item => !(typeof item === 'string' && item.length <= 50000)
        && typeof item !== 'boolean' && !(typeof item === 'number' && Number.isFinite(item)))) return undefined;
    snapshot[key] = [...entry];
  }
  return snapshot;
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

function normalizeDestinationUrlResult(value) {
  if (value == null) return null;
  const countFields = [
    'adsUpdated', 'criteriaUpdated', 'assetsUpdated', 'adsAlreadyCurrent', 'criteriaAlreadyCurrent',
    'assetsAlreadyCurrent', 'assetsSkippedShared', 'assetsSkippedAccountLevel', 'accountScopedUrlAssetsNotChanged',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.verified !== true || typeof value.complete !== 'boolean'
      || countFields.some(field => !validCount(value[field]))) return undefined;
  return {
    verified: true,
    complete: value.complete,
    ...Object.fromEntries(countFields.map(field => [field, value[field]])),
    verifiedAtUtc: safeText(value.verifiedAtUtc, 60),
    signature: safeText(value.signature, 4096),
  };
}

function normalizeDestinationUrls(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  const accountIds = new Set();
  const targets = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const accountId = String(item.accountId ?? '');
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    let validUrl = url === '';
    if (url) {
      try {
        const parsed = new URL(url);
        validUrl = parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.hash;
      } catch { /* URLs inválidas são recusadas abaixo. */ }
    }
    if (!/^\d{10}$/.test(accountId) || accountIds.has(accountId) || !validUrl || url.length > 2048) return null;
    accountIds.add(accountId);
    return {
      accountId,
      url,
      sourceJobId: safeText(item.sourceJobId, 120),
      sourceProduct: safeText(item.sourceProduct, 200),
      updatedAt: safeText(item.updatedAt, 60),
    };
  });
  return targets.some(item => item === null) ? null : targets;
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
  const statusActionResult = normalizeCampaignStatusActionResult(value.statusActionResult);
  const deliverySettingsResult = normalizeCampaignDeliverySettingsResult(value.deliverySettingsResult);
  const euPoliticalAdvertisingResult = normalizeCampaignEuPoliticalAdvertisingResult(value.euPoliticalAdvertisingResult);
  const sitelinksResult = normalizeSitelinksResult(value.sitelinksResult);
  const destinationUrlResult = normalizeDestinationUrlResult(value.destinationUrlResult);
  const geoTargetingSnapshot = normalizeGoogleAdsCampaignGeoTargetingSnapshot(value.geoTargetingSnapshot);
  if (audienceTargetingResult === undefined || audienceExclusionsResult === undefined
      || activationResult === undefined || statusActionResult === undefined || deliverySettingsResult === undefined
      || euPoliticalAdvertisingResult === undefined || sitelinksResult === undefined
      || destinationUrlResult === undefined || geoTargetingSnapshot === undefined) return null;
  return {
    ...value,
    managerCustomerId,
    customerId,
    campaignId,
    adGroupId,
    campaignName,
    accountName: safeText(value.accountName, 240),
    finalUrl: safeText(value.finalUrl, 2048),
    status: ['PAUSED', 'ENABLED'].includes(value.status) ? value.status : '',
    campaignChannelType: safeText(value.campaignChannelType, 40),
    audienceGrouped: typeof value.audienceGrouped === 'boolean' ? value.audienceGrouped : null,
    adGroupStatus: safeText(value.adGroupStatus, 40),
    source: ['created', 'existing'].includes(value.source) ? value.source : '',
    audienceTargetingResult,
    audienceTargetingError: safeText(value.audienceTargetingError),
    geoTargetingSnapshot,
    audienceExclusionsResult,
    audienceExclusionsError: safeText(value.audienceExclusionsError),
    activationResult,
    activationError: safeText(value.activationError, 3000),
    statusActionResult,
    statusActionError: safeText(value.statusActionError, 3000),
    deliverySettingsResult,
    deliverySettingsError: safeText(value.deliverySettingsError, 1000),
    euPoliticalAdvertisingResult,
    euPoliticalAdvertisingError: safeText(value.euPoliticalAdvertisingError, 1000),
    sitelinksResult,
    sitelinksError: safeText(value.sitelinksError, 3000),
    destinationUrlResult,
    destinationUrlError: safeText(value.destinationUrlError, 3000),
  };
}

function normalizeBatchKeywordSnapshot(value, requireAdGroup = false) {
  if (value == null) return { inputText: '', preview: null, result: null, updatedAt: '' };
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.inputText !== 'string' || value.inputText.length > 9000) return null;
  const previewValue = value.preview == null ? null : value.preview;
  let preview = null;
  if (previewValue && typeof previewValue === 'object' && !Array.isArray(previewValue)
      && /^\d{10}$/.test(String(previewValue.managerCustomerId || ''))
      && /^[a-f0-9]{64}$/.test(String(previewValue.fingerprint || ''))
      && Array.isArray(previewValue.campaigns) && previewValue.campaigns.length >= 1 && previewValue.campaigns.length <= 100
      && Array.isArray(previewValue.terms) && previewValue.terms.length >= 1 && previewValue.terms.length <= 100
      && Array.isArray(previewValue.pairs) && previewValue.pairs.length <= 10000
      && Number.isInteger(previewValue.campaignCount) && Number.isInteger(previewValue.termCount)
      && Number.isInteger(previewValue.pairCount) && Number.isInteger(previewValue.alreadyPresentCount)
      && Number.isInteger(previewValue.toCreateCount)) {
    const campaigns = previewValue.campaigns.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !/^\d{10}$/.test(String(item.customerId || ''))
          || !campaignIdPattern.test(String(item.campaignId || '')) || typeof item.campaignName !== 'string'
          || !item.campaignName || item.campaignName.length > 255 || !['ENABLED', 'PAUSED'].includes(item.status)
          || (requireAdGroup && (!campaignIdPattern.test(String(item.adGroupId || '')) || !['ENABLED', 'PAUSED'].includes(item.adGroupStatus)))) return null;
      return { customerId: item.customerId, campaignId: item.campaignId, campaignName: item.campaignName, status: item.status,
        ...(requireAdGroup ? { adGroupId: String(item.adGroupId), adGroupStatus: item.adGroupStatus } : {}) };
    });
    const terms = previewValue.terms.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.text !== 'string'
          || !item.text || item.text.length > 80 || !['BROAD', 'PHRASE', 'EXACT'].includes(item.matchType)) return null;
      return { text: item.text, matchType: item.matchType };
    });
    const pairs = previewValue.pairs.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !/^\d{10}$/.test(String(item.customerId || ''))
          || !campaignIdPattern.test(String(item.campaignId || '')) || typeof item.term !== 'string'
          || !item.term || item.term.length > 80 || !['BROAD', 'PHRASE', 'EXACT'].includes(item.matchType)
          || (requireAdGroup && !campaignIdPattern.test(String(item.adGroupId || '')))
          || typeof item.alreadyPresent !== 'boolean') return null;
      return { customerId: item.customerId, campaignId: item.campaignId, term: item.term,
        ...(requireAdGroup ? { adGroupId: String(item.adGroupId) } : {}),
        matchType: item.matchType, alreadyPresent: item.alreadyPresent };
    });
    if (!campaigns.includes(null) && !terms.includes(null) && !pairs.includes(null)
        && previewValue.campaignCount === campaigns.length && previewValue.termCount === terms.length
        && previewValue.pairCount === campaigns.length * terms.length && previewValue.pairs.length === previewValue.pairCount
        && previewValue.alreadyPresentCount >= 0 && previewValue.toCreateCount >= 0
        && previewValue.alreadyPresentCount + previewValue.toCreateCount === previewValue.pairCount) {
      preview = {
        managerCustomerId: previewValue.managerCustomerId,
        campaignCount: previewValue.campaignCount,
        termCount: previewValue.termCount,
        pairCount: previewValue.pairCount,
        alreadyPresentCount: previewValue.alreadyPresentCount,
        toCreateCount: previewValue.toCreateCount,
        fingerprint: previewValue.fingerprint,
        campaigns,
        terms,
        pairs,
        previewAtUtc: safeText(previewValue.previewAtUtc, 40),
      };
    }
  }
  const resultValue = value.result == null ? null : value.result;
  let result = null;
  if (resultValue && typeof resultValue === 'object' && !Array.isArray(resultValue)
      && ['complete', 'partial', 'error'].includes(resultValue.status)
      && Array.isArray(resultValue.results) && resultValue.results.length <= 10000
      && ['createdCount', 'alreadyPresentCount', 'unverifiedCount', 'failedCount'].every(field => validCount(resultValue[field]))) {
    const results = resultValue.results.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !/^\d{10}$/.test(String(item.customerId || ''))
          || !campaignIdPattern.test(String(item.campaignId || '')) || typeof item.term !== 'string' || !item.term
          || item.term.length > 80 || !['BROAD', 'PHRASE', 'EXACT'].includes(item.matchType)
          || (requireAdGroup && !campaignIdPattern.test(String(item.adGroupId || '')))
          || !['already_present', 'created_verified', 'write_unverified', 'failed'].includes(item.result)) return null;
      return { customerId: item.customerId, campaignId: item.campaignId, term: item.term,
        ...(requireAdGroup ? { adGroupId: String(item.adGroupId) } : {}),
        matchType: item.matchType, result: item.result };
    });
    if (!results.includes(null)) {
      result = {
        status: resultValue.status,
        inputText: safeText(resultValue.inputText, 9000),
        campaignCount: validCount(resultValue.campaignCount) ? resultValue.campaignCount : 0,
        termCount: validCount(resultValue.termCount) ? resultValue.termCount : 0,
        pairCount: validCount(resultValue.pairCount) ? resultValue.pairCount : results.length,
        createdCount: resultValue.createdCount,
        alreadyPresentCount: resultValue.alreadyPresentCount,
        unverifiedCount: resultValue.unverifiedCount,
        failedCount: resultValue.failedCount,
        results,
        message: safeText(resultValue.message, 1000),
        verifiedAtUtc: safeText(resultValue.verifiedAtUtc, 40),
      };
    }
  }
  return { inputText: value.inputText, preview, result, updatedAt: safeText(value.updatedAt, 40) };
}

function normalizeBatchNegativeKeywordSnapshot(value) {
  return normalizeBatchKeywordSnapshot(value, false);
}

function normalizeBatchPositiveKeywordSnapshot(value) {
  return normalizeBatchKeywordSnapshot(value, true);
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
  const imageAssetUploads = normalizeImageAssetUploads(value.imageAssetUploads ?? []);
  if (imageAssetUploads === null) return null;
  const destinationUrls = normalizeDestinationUrls(value.destinationUrls ?? []);
  if (destinationUrls === null) return null;
  const campaignStatusLog = normalizeCampaignStatusLog(value.campaignStatusLog);
  const deliverySettingsQuotaSummary = normalizeCampaignDeliverySettingsQuotaSummary(value.deliverySettingsQuotaSummary);
  const euPoliticalAdvertisingQuotaSummary = normalizeCampaignDeliverySettingsQuotaSummary(value.euPoliticalAdvertisingQuotaSummary);
  if (campaignStatusLog === undefined) return null;
  const formSnapshot = normalizeFormSnapshot(value.formSnapshot);
  if (formSnapshot === undefined) return null;
  const negativeKeywordsBatch = normalizeBatchNegativeKeywordSnapshot(value.negativeKeywordsBatch);
  if (negativeKeywordsBatch === null) return null;
  const positiveKeywordsBatch = normalizeBatchPositiveKeywordSnapshot(value.positiveKeywordsBatch);
  if (positiveKeywordsBatch === null) return null;
  const imageUploadConfirmedAccountIds = Array.isArray(value.imageUploadConfirmedAccountIds)
    ? [...new Set(value.imageUploadConfirmedAccountIds.map(String).filter(accountId => /^\d{10}$/.test(accountId)))].slice(0, 100)
    : [];
  const imageUploadSelectedAccountIds = value.imageUploadSelectedAccountIds == null
    ? null
    : Array.isArray(value.imageUploadSelectedAccountIds)
      ? [...new Set(value.imageUploadSelectedAccountIds.map(String).filter(accountId => /^\d{10}$/.test(accountId)))].slice(0, 100)
      : undefined;
  if (imageUploadSelectedAccountIds === undefined) return null;
  const campaignKeys = new Set(campaigns.map(campaign => campaign.customerId + ':' + campaign.campaignId));
  const selectedCampaignKey = typeof value.selectedCampaignKey === 'string' && campaignKeys.has(value.selectedCampaignKey)
    ? value.selectedCampaignKey
    : campaigns[0].customerId + ':' + campaigns[0].campaignId;
  return {
    ...value,
    id: value.id,
    label: safeText(value.label, 300),
    source: value.source === 'associated' ? 'associated' : '',
    creationMode: ['api', 'csv', 'associated'].includes(value.creationMode) ? value.creationMode : '',
    draftId: typeof value.draftId === 'string' && /^[\w-]{1,120}$/.test(value.draftId) ? value.draftId : '',
    previewId: typeof value.previewId === 'string' && /^[\w-]{1,120}$/.test(value.previewId) ? value.previewId : '',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    selectedCampaignKey,
    campaignStatusLog,
    deliverySettingsQuotaSummary,
    euPoliticalAdvertisingQuotaSummary,
    sitelinks,
    imageAssetUploads,
    destinationUrls,
    negativeKeywordsBatch,
    positiveKeywordsBatch,
    formSnapshot,
    imageUploadConfirmed: value.imageUploadConfirmed === true,
    imageUploadConfirmedAccountIds,
    imageUploadSelectedAccountIds,
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

// Append only a confirmed campaign; retries after a local save are idempotent.
export function appendGoogleAdsCampaignToBatch(batchId, campaign, { storage = null } = {}) {
  const store = loadGoogleAdsCampaignBatches({ storage });
  const batch = store.batches.find(item => item.id === batchId);
  if (!batch) throw new Error('O lote original não está disponível. A campanha confirmada permanece no registro da tentativa.');
  const candidate = normalizeCampaign(campaign);
  if (!candidate || candidate.status !== 'PAUSED' || !candidate.adGroupId) throw new Error('A campanha não foi confirmada com grupo e status pausado.');
  const sameId = batch.campaigns.find(item => item.customerId === candidate.customerId && item.campaignId === candidate.campaignId);
  if (sameId) {
    if (sameId.campaignName !== candidate.campaignName || sameId.managerCustomerId !== candidate.managerCustomerId) throw new Error('A identificação da campanha diverge do lote salvo.');
    return store;
  }
  if (batch.campaigns.some(item => item.customerId === candidate.customerId && item.campaignName === candidate.campaignName)) throw new Error('O lote já contém outro ID para este nome e conta.');
  const history = batch.imageUploadConfirmationHistory == null ? [] : batch.imageUploadConfirmationHistory;
  if (!Array.isArray(history)) throw new Error('O histórico de imagens está ilegível e foi preservado.');
  const previousConfirmation = batch.imageUploadConfirmed ? [{
    campaignSet: JSON.stringify(batch.campaigns.map(item => item.customerId + ':' + item.campaignId).sort()),
    accountIds: batch.imageUploadConfirmedAccountIds, recordedAtUtc: new Date().toISOString(),
  }] : [];
  return saveGoogleAdsCampaignBatch({ ...batch, updatedAt: new Date().toISOString(),
    imageUploadConfirmationHistory: [...history, ...previousConfirmation],
    imageUploadConfirmed: false, imageUploadConfirmedAccountIds: [],
    campaigns: [...batch.campaigns, candidate] }, { storage });
}

export function confirmGoogleAdsCampaignBatchStep(batchId, step, campaignSet, { storage = null } = {}) {
  if (!['targeting', 'exclusions', 'images', 'sitelinks'].includes(step)) throw new Error('Etapa inválida.');
  const store = loadGoogleAdsCampaignBatches({ storage });
  const batch = store.batches.find(item => item.id === batchId);
  if (!batch) throw new Error('Lote não encontrado.');
  const keys = batch.campaigns.map(item => item.customerId + ':' + item.campaignId).sort();
  if (!campaignSet || campaignSet !== JSON.stringify(keys)) throw new Error('As campanhas do lote mudaram; confira todas antes de confirmar.');
  const confirmation = { campaignSet, fingerprint: sharedStepFingerprint(batch, step), confirmedAtUtc: new Date().toISOString() };
  const history = batch.workflowConfirmationHistory == null ? [] : batch.workflowConfirmationHistory;
  if (!Array.isArray(history)) throw new Error('O histórico de confirmações está ilegível e foi preservado.');
  return saveGoogleAdsCampaignBatch({ ...batch, updatedAt: new Date().toISOString(), workflowConfirmationHistory: [
    ...history, { step, ...confirmation },
  ], workflowConfirmations: {
    ...(batch.workflowConfirmations && typeof batch.workflowConfirmations === 'object' ? batch.workflowConfirmations : {}),
    [step]: confirmation,
  } }, { storage });
}
