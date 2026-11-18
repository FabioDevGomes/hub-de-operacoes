function campaignKey(item) {
  const customerId = String(item?.customer_id ?? item?.customerId ?? '').replace(/\D/g, '');
  const campaignId = String(item?.campaign_id ?? item?.campaignId ?? '');
  return customerId && campaignId ? `${customerId}|${campaignId}` : '';
}

/** Reconcile an uncertain write only when a fresh read now sees the criterion. */
export function reconcileGoogleAdsNegativeKeywordApplyResult({ applyResult, initialPreview, refreshedPreview } = {}) {
  if (!applyResult || !Array.isArray(applyResult.results)
      || !Array.isArray(initialPreview?.campaigns) || !Array.isArray(refreshedPreview?.campaigns)) return null;

  const initial = new Map(initialPreview.campaigns.map(item => [campaignKey(item), item]));
  const current = new Map(refreshedPreview.campaigns.map(item => [campaignKey(item), item]));
  const results = applyResult.results.map(item => {
    if (item?.result !== 'write_unverified') return item;
    const key = campaignKey(item);
    const before = initial.get(key);
    const after = current.get(key);
    if (!before || before.alreadyPresent !== false || after?.alreadyPresent !== true) return item;
    return { ...item, result: 'created_verified' };
  });
  const createdCount = results.filter(item => item?.result === 'created_verified').length;
  const alreadyPresentCount = results.filter(item => item?.result === 'already_present').length;
  const unverifiedCount = results.filter(item => item?.result === 'write_unverified').length;
  const failedCount = results.filter(item => item?.result === 'failed').length;
  const complete = unverifiedCount === 0 && failedCount === 0;
  return {
    ...applyResult,
    results,
    createdCount,
    alreadyPresentCount,
    unverifiedCount,
    failedCount,
    complete,
    verified: complete,
    verifiedAtUtc: complete ? refreshedPreview.previewAtUtc || applyResult.verifiedAtUtc : applyResult.verifiedAtUtc,
  };
}
