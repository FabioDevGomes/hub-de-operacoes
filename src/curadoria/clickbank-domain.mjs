export const STATUS = Object.freeze({
  FOUND: 'found',
  DIFFERENT_NAME: 'different_name',
  NOT_FOUND: 'not_found',
  RECHECK: 'recheck'
});

export const STATUS_LABELS = Object.freeze({
  [STATUS.FOUND]: 'Encontrado',
  [STATUS.DIFFERENT_NAME]: 'Nome diferente',
  [STATUS.NOT_FOUND]: 'Não encontrado hoje',
  [STATUS.RECHECK]: 'Rever'
});

export function latestVerification(values = []) {
  return [...values].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''))
  )[0] || null;
}

export function upsertVerification(values = [], entry) {
  const list = [...values];
  const index = list.findIndex(item => item.date === entry.date);
  if (index >= 0) list[index] = entry;
  else list.push(entry);
  return list.sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    String(a.capturedAt || '').localeCompare(String(b.capturedAt || ''))
  );
}

export function shortenedSearchTerm(name = '') {
  return String(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[|/–—:-].*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function marketplaceSearchUrl(term = '') {
  const query = new URLSearchParams({
    includeKeywords: String(term).trim(),
    sortField: 'relevance'
  });
  return `https://accounts.clickbank.com/master/dashboard/affiliate-marketplace#/results?${query}`;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || 'Não verificado';
}
