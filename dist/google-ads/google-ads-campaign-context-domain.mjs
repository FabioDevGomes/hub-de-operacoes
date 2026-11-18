function newest(records = []) {
  return [...records].sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0)
    - Date.parse(left.updatedAt || left.createdAt || 0))[0] || null;
}

function existsDraft(drafts, id) {
  return drafts.some(draft => draft?.id === id);
}

function existsBatch(batches, id) {
  return batches.some(batch => batch?.id === id);
}

export function resolveInitialGoogleAdsCampaignContext({
  savedContext = null,
  drafts = [],
  batches = [],
  activeDraftId = '',
  deliveryBatchId = '',
  externalContext = false,
} = {}) {
  if (deliveryBatchId && existsBatch(batches, deliveryBatchId)) {
    return { type: 'batch', id: deliveryBatchId, source: 'delivery' };
  }
  if (externalContext) return { type: 'external', id: '', source: 'external' };

  if (savedContext?.type === 'batch' && existsBatch(batches, savedContext.id)) {
    return { type: 'batch', id: savedContext.id, source: 'saved' };
  }
  if (savedContext?.type === 'draft' && existsDraft(drafts, savedContext.id)) {
    return { type: 'draft', id: savedContext.id, source: 'saved' };
  }
  if (savedContext?.type === 'new') return { type: 'new', id: '', source: 'saved' };

  const activeDraftExists = existsDraft(drafts, activeDraftId);
  const legacyBatch = activeDraftExists
    ? newest(batches.filter(batch => batch?.draftId === activeDraftId))
    : activeDraftId ? null : newest(batches);
  if (legacyBatch) return { type: 'batch', id: legacyBatch.id, source: 'legacy' };
  if (activeDraftExists) return { type: 'draft', id: activeDraftId, source: 'legacy' };
  const newestDraft = newest(drafts);
  if (newestDraft) return { type: 'draft', id: newestDraft.id, source: 'legacy' };
  return { type: 'new', id: '', source: 'legacy' };
}
