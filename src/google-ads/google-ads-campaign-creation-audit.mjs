function accountId(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function attemptOrder(left, right) {
  return Date.parse(left.startedAtUtc) - Date.parse(right.startedAtUtc);
}

export function summarizeGoogleAdsCampaignCreationAudit({ preview, batchCampaigns = [] } = {}) {
  const startedAtUtc = typeof preview?.creationAuditStartedAtUtc === 'string'
    && Number.isFinite(Date.parse(preview.creationAuditStartedAtUtc))
    ? preview.creationAuditStartedAtUtc : '';
  const auditable = preview?.creationAuditVersion === 2 && Boolean(startedAtUtc);
  const startedAt = startedAtUtc ? Date.parse(startedAtUtc) : 0;
  const candidates = Array.isArray(preview?.entries)
    ? preview.entries.filter(entry => entry && typeof entry === 'object')
    : [];
  const rows = candidates.map(entry => {
    const allAttempts = Array.isArray(entry.creationAttempts) ? [...entry.creationAttempts].sort(attemptOrder) : [];
    const attempts = auditable
      ? allAttempts.filter(attempt => Date.parse(attempt.startedAtUtc) >= startedAt)
      : [];
    const historicalAttempts = auditable
      ? allAttempts.filter(attempt => Date.parse(attempt.startedAtUtc) < startedAt)
      : allAttempts;
    const campaignMatches = Array.isArray(batchCampaigns)
      ? batchCampaigns.filter(campaign => accountId(campaign?.customerId) === entry.customerId
        && String(campaign?.campaignName ?? '') === entry.campaignName)
      : [];
    const lastAttempt = attempts.at(-1) || null;
    const previewResultType = entry.previewResult?.resultType || '';
    const eligibleForCreation = previewResultType === 'validated_new' && entry.state === 'previewed';
    let outcome;
    if (previewResultType === 'existing') outcome = 'already_existed';
    else if (!eligibleForCreation && entry.state === 'preview_failed') outcome = 'validation_failed';
    else if (!eligibleForCreation && entry.state === 'preview_stale') outcome = 'stale';
    else if (!eligibleForCreation) outcome = 'not_validated';
    else if (!auditable) outcome = 'legacy_unknown';
    else if (attempts.some(attempt => attempt.state === 'created')) outcome = 'created';
    else if (attempts.some(attempt => ['in_flight', 'uncertain'].includes(attempt.state))) outcome = 'uncertain';
    else if (attempts.length) outcome = 'failed';
    else if (campaignMatches.length) outcome = 'in_batch_without_attempt';
    else if (preview.creationAuditLegacyHistory === true || historicalAttempts.length) outcome = 'legacy_unknown';
    else outcome = 'not_started';
    return {
      managerCustomerId: entry.managerCustomerId,
      customerId: entry.customerId,
      accountName: entry.accountName,
      campaignName: entry.campaignName,
      percent: entry.percent,
      previewState: entry.state,
      previewResultType,
      previewResult: entry.previewResult,
      previewErrorMessage: entry.errorMessage,
      eligibleForCreation,
      outcome,
      inBatch: campaignMatches.length > 0,
      batchCampaigns: campaignMatches,
      attempts,
      historicalAttempts,
      lastAttempt,
    };
  });
  return {
    auditable,
    startedAtUtc,
    legacyHistory: preview?.creationAuditLegacyHistory === true,
    candidateCount: rows.length,
    eligibleCount: rows.filter(row => row.eligibleForCreation).length,
    existingCount: rows.filter(row => row.outcome === 'already_existed').length,
    inBatchCount: rows.filter(row => row.inBatch).length,
    missingFromBatchCount: rows.filter(row => !row.inBatch).length,
    rows,
  };
}
