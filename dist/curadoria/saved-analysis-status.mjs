const hasValue = value => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value != null && typeof value === 'object' ? Object.keys(value).length > 0 : value != null && value !== false;
};

/** Indicates that an offer has saved curation inputs but no completed assessment yet. */
export function hasSavedAnalysisInput({ trend = null, metadata = null } = {}) {
  if (trend && (
    hasValue(trend.pageDraft) || hasValue(trend.salesPageType) || hasValue(trend.keywordCandidates) ||
    hasValue(trend.searchHistory) || hasValue(trend.lastSearchedAt)
  )) return true;

  if (!metadata) return false;
  return [
    metadata.manualCountries,
    metadata.salesPageType,
    metadata.brandBidding,
    metadata.commissionUsd,
    metadata.canonicalProductName,
    metadata.affiliateLink,
    metadata.dtcCountryCapture,
  ].some(hasValue);
}
