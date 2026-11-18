import { normalize } from './top-performance-domain.mjs';

export const MAX_CANDIDATES = 100;
export const MAX_CANDIDATE_LENGTH = 80;

function candidateKey(value) {
  const term = String(value ?? '').trim();
  let matchType = 'broad';
  let text = term;
  if (term.length >= 2 && term.startsWith('[') && term.endsWith(']')) {
    matchType = 'exact';
    text = term.slice(1, -1);
  } else if (term.length >= 2 && term.startsWith('"') && term.endsWith('"')) {
    matchType = 'phrase';
    text = term.slice(1, -1);
  }
  return `${matchType}:${normalize(text)}`;
}

export function uniqueCandidates(values = []) {
  const seen = new Set();
  const candidates = [];
  for (const value of Array.isArray(values) ? values : []) {
    const term = String(value ?? '').trim();
    const key = candidateKey(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    candidates.push(term);
  }
  return candidates;
}

export function parseCandidateLines(value = '') {
  return String(value ?? '').split(/\r?\n/u).map(term => term.trim()).filter(Boolean);
}

export function planAddCandidates(currentValues, pastedValues) {
  const current = uniqueCandidates(currentValues);
  const incoming = parseCandidateLines(pastedValues);
  if (!incoming.length) return { ok: false, reason: 'empty', candidates: current };

  const tooLongCount = incoming.filter(term => Array.from(term).length > MAX_CANDIDATE_LENGTH).length;
  if (tooLongCount) return { ok: false, reason: 'too-long', tooLongCount, candidates: current };

  const seen = new Set(current.map(candidateKey));
  const additions = [];
  for (const term of incoming) {
    const key = candidateKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(term);
  }

  const duplicateCount = incoming.length - additions.length;
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
  if (!term) return { ok: false, reason: 'empty', candidates };
  if (Array.from(term).length > MAX_CANDIDATE_LENGTH) return { ok: false, reason: 'too-long', candidates };
  if (candidates.some((candidate, candidateIndex) => candidateIndex !== index && candidateKey(candidate) === candidateKey(term))) {
    return { ok: false, reason: 'duplicate', candidates };
  }
  if (candidates[index] === term) return { ok: true, changed: false, candidates };
  candidates[index] = term;
  return { ok: true, changed: true, candidates };
}

export function planRemoveCandidate(currentValues, index) {
  const candidates = uniqueCandidates(currentValues);
  if (!Number.isSafeInteger(index) || index < 0 || index >= candidates.length) {
    return { ok: false, reason: 'missing', candidates };
  }
  candidates.splice(index, 1);
  return { ok: true, changed: true, candidates };
}
