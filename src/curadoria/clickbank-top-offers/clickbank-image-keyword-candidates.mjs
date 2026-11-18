import { latestByCountry } from '../image-search-domain.mjs?v=1';

function candidateKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

export function uniqueClickBankImageCandidates(values = []) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(values) ? values : []) {
    if (typeof raw !== 'string') continue;
    const term = raw.trim();
    const key = candidateKey(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

/** One offer-wide list, with a compatibility read of the latest country snapshots. */
export function clickBankImageCandidates(record = {}) {
  if (Array.isArray(record.negativeKeywordCandidates)) {
    return uniqueClickBankImageCandidates(record.negativeKeywordCandidates);
  }
  const latest = latestByCountry(record.assessments || []);
  return uniqueClickBankImageCandidates([...latest.values()].flatMap(assessment => {
    const candidates = Array.isArray(assessment?.negativeKeywordCandidates)
      ? assessment.negativeKeywordCandidates
      : assessment?.relatedProducts || [];
    return candidates.flatMap(value => typeof value === 'string' ? value.split(/\s*×\s*/u) : []);
  }));
}
