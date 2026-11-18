export const TABLE_VIEW_PREFERENCES_KEY = 'hub:curation:guru-media-top-performance:view:v1';

const FILTER_IDS = Object.freeze([
  'search', 'idFilter', 'categoryFilter', 'badgeFilter', 'countryFilter',
  'payoutMin', 'payoutMax', 'featureFilter', 'languageFilter', 'decisionFilter',
  'movementFilter', 'presenceFilter', 'visibilityFilter'
]);
const DYNAMIC_FILTER_IDS = new Set(['categoryFilter', 'countryFilter', 'languageFilter']);
const SORT_KEYS = new Set([
  'id', 'product', 'trends', 'images', 'badges', 'details', 'countries',
  'payout', 'movement', 'decision', 'lastSeen', 'glimpse', 'automaticSignal'
]);
const FILTER_VALUE_LIMITS = Object.freeze({ search: 300, idFilter: 40, categoryFilter: 200 });

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function defaults() {
  return {
    filters: Object.fromEntries(FILTER_IDS.map(id => [id, id === 'visibilityFilter' ? 'visible' : ''])),
    sortKey: 'payout',
    sortDirection: 'desc'
  };
}

function normalize(value) {
  const result = defaults();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const id of FILTER_IDS) {
    const candidate = value.filters?.[id];
    if (typeof candidate !== 'string') continue;
    result.filters[id] = candidate.slice(0, FILTER_VALUE_LIMITS[id] || 100);
  }
  if (['visible', 'hidden', 'all'].includes(result.filters.visibilityFilter) === false) {
    result.filters.visibilityFilter = 'visible';
  }
  if (SORT_KEYS.has(value.sortKey)) result.sortKey = value.sortKey;
  if (value.sortDirection === 'asc' || value.sortDirection === 'desc') result.sortDirection = value.sortDirection;
  return result;
}

export function readGuruMediaTablePreferences(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(TABLE_VIEW_PREFERENCES_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

export function saveGuruMediaTablePreferences(preferences, storage = browserStorage()) {
  try {
    storage?.setItem(TABLE_VIEW_PREFERENCES_KEY, JSON.stringify(normalize(preferences)));
    return true;
  } catch {
    return false;
  }
}

export function captureGuruMediaTablePreferences(root, { sortKey, sortDirection } = {}) {
  const filters = {};
  for (const id of FILTER_IDS) {
    const control = root?.getElementById?.(id);
    filters[id] = typeof control?.value === 'string' ? control.value : (id === 'visibilityFilter' ? 'visible' : '');
  }
  return normalize({ filters, sortKey, sortDirection });
}

export function restoreGuruMediaTableFilters(root, preferences, { dynamic = false } = {}) {
  const filters = normalize(preferences).filters;
  for (const id of FILTER_IDS) {
    if (DYNAMIC_FILTER_IDS.has(id) !== dynamic) continue;
    const control = root?.getElementById?.(id);
    if (!control) continue;
    const value = filters[id];
    if (control.tagName === 'SELECT' && ![...(control.options || [])].some(option => option.value === value)) continue;
    control.value = value;
  }
}
