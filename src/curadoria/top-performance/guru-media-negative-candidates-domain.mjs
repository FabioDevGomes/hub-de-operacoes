import { parseKeywordLine } from '../../google-ads/google-ads-keyword-match.mjs?v=1';
import { latestByCountry } from '../image-search-domain.mjs?v=3';

export const MAX_CANDIDATES = 100;

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

export function uniqueCandidates(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const term = String(value ?? '').trim();
    const key = normalize(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

export function globalCandidatesFromImageRecord(record = {}) {
  if (Array.isArray(record.negativeKeywordCandidates)) return uniqueCandidates(record.negativeKeywordCandidates);
  const latest = latestByCountry(record.assessments || []);
  return uniqueCandidates([...latest.values()].flatMap(assessment =>
    Array.isArray(assessment.negativeKeywordCandidates)
      ? assessment.negativeKeywordCandidates
      : assessment.relatedProducts || []));
}

export function parseCandidateLines(value = '') {
  return String(value ?? '').split(/\r?\n/u).map(term => term.trim()).filter(Boolean);
}

function invalidTerms(terms) {
  return terms.flatMap((term, index) => {
    const parsed = parseKeywordLine(term);
    return parsed.ok ? [] : [{ line: index + 1, message: parsed.error }];
  });
}

export function planAddCandidates(currentValues, pastedValues) {
  const current = uniqueCandidates(currentValues);
  const incoming = parseCandidateLines(pastedValues);
  if (!incoming.length) return { ok: false, reason: 'empty', candidates: current };

  const invalid = invalidTerms(incoming);
  if (invalid.length) return { ok: false, reason: 'invalid', invalid, candidates: current };

  const seen = new Set(current.map(normalize));
  const additions = [];
  let duplicateCount = 0;
  for (const term of incoming) {
    const key = normalize(term);
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    additions.push(term);
  }

  if (current.length + additions.length > MAX_CANDIDATES) {
    return { ok: false, reason: 'limit', duplicateCount, candidates: current };
  }
  if (!additions.length) return { ok: true, changed: false, duplicateCount, candidates: current };
  return { ok: true, changed: true, additions, duplicateCount, candidates: [...current, ...additions] };
}

export function planEditCandidate(currentValues, index, value) {
  const candidates = uniqueCandidates(currentValues);
  if (!Number.isSafeInteger(index) || index < 0 || index >= candidates.length) {
    return { ok: false, reason: 'missing', candidates };
  }
  const term = String(value ?? '').trim();
  if (!term) return { ok: false, reason: 'empty-edit', candidates };
  const parsed = parseKeywordLine(term);
  if (!parsed.ok) return { ok: false, reason: 'invalid-edit', invalid: [{ line: 1, message: parsed.error }], candidates };
  if (candidates.some((candidate, candidateIndex) => candidateIndex !== index && normalize(candidate) === normalize(term))) {
    return { ok: false, reason: 'duplicate', candidates };
  }
  if (candidates[index] === term) return { ok: true, changed: false, candidates };
  const updated = [...candidates];
  updated[index] = term;
  return { ok: true, changed: true, candidates: updated };
}

export function planRemoveCandidate(currentValues, index) {
  const candidates = uniqueCandidates(currentValues);
  if (!Number.isSafeInteger(index) || index < 0 || index >= candidates.length) {
    return { ok: false, reason: 'missing', candidates };
  }
  candidates.splice(index, 1);
  return { ok: true, changed: true, candidates };
}
