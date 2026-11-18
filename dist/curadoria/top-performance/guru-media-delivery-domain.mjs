import { isCommissionUsd, parseCommissionUsd } from '../../campaign-delivery/commission-domain.mjs?v=2';
import { normalizeAffiliateUrl } from '../../campaign-delivery/affiliate-url-domain.mjs?v=1';
import { latestAssessment } from '../trends-domain.mjs?v=5';
import { globalCandidatesFromImageRecord } from './guru-media-negative-candidates-domain.mjs?v=2';

export const GURU_MEDIA_PLATFORM_CODE = 'GM';

export function guruMediaCommission(offer = {}) {
  const manual = parseCommissionUsd(offer.commissionOverrideUsd);
  if (isCommissionUsd(manual)) return { amount: manual, source: 'manual' };
  const payout = offer.payout?.currency === 'USD' ? parseCommissionUsd(offer.payout?.value) : null;
  if (isCommissionUsd(payout)) return { amount: payout, source: 'payout' };
  return { amount: null, source: 'missing' };
}

function uniqueTerms(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(value => {
    const key = value.toLocaleLowerCase('pt-BR');
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

export function buildGuruMediaDeliveryData({ offer, trendsRecord = {}, imagesRecord = {} } = {}) {
  const offerId = String(offer?.offerId || '').trim();
  const offerProductName = String(offer?.productName || '').trim();
  const canonicalProductName = String(offer?.canonicalProductName || '').trim();
  const productName = canonicalProductName || offerProductName;
  const selectedCountries = Array.isArray(trendsRecord.pageDraft?.countries)
    ? trendsRecord.pageDraft.countries
    : (latestAssessment(trendsRecord.assessments)?.countries || []);
  const selectedLocations = [...new Set(selectedCountries.map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
  const geoTargetingMode = selectedLocations.includes('WORLD') ? 'WORLD' : 'COUNTRIES';
  const countries = geoTargetingMode === 'WORLD' ? [] : selectedLocations;
  const commission = guruMediaCommission(offer);
  return {
    platformCode: GURU_MEDIA_PLATFORM_CODE,
    offerKey: offerId,
    offerName: offerProductName && offerId ? `${offerProductName} · #${offerId}` : offerProductName,
    seller: 'Guru Media',
    productName,
    canonicalProductName,
    commissionAmountUsd: commission.amount,
    commissionSource: commission.source,
    brandBidding: 'no_brand_bidding',
    affiliateUrl: normalizeAffiliateUrl(offer?.affiliateUrl || offer?.affiliateLink) || '',
    geoTargetingMode,
    countries,
    positiveKeywords: uniqueTerms(trendsRecord.keywordCandidates),
    negativeKeywords: globalCandidatesFromImageRecord(imagesRecord),
    negativeKeywordCountries: [],
  };
}

export { normalizeAffiliateUrl as normalizeGuruMediaAffiliateUrl };
