export const GOOGLE_ADS_RESOURCE_BOOKMARKS_STORAGE_KEY = 'hub:google-ads:resource-bookmarks:v1';

const GOOGLE_ADS_RESOURCE_PATH = /^\/aw\/assetreport\/associations\/?$/i;

function normalizeBookmark(record) {
  const title = String(record?.title || '').trim().slice(0, 240);
  const rawUrl = String(record?.url || '').trim().slice(0, 4096);
  try {
    const url = new URL(rawUrl);
    if (url.origin !== 'https://ads.google.com' || !GOOGLE_ADS_RESOURCE_PATH.test(url.pathname)
        || url.username || url.password) return null;
    return { title, url: rawUrl };
  } catch {
    return null;
  }
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueByUrl(records) {
  const unique = new Map();
  for (const record of records) {
    const key = record?.url ? `${record.url}\u0000${normalizedText(record.title)}` : '';
    if (key && !unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function uniqueMatchesByUrl(records) {
  const unique = new Map();
  for (const record of records) {
    if (record?.url && !unique.has(record.url)) unique.set(record.url, record);
  }
  return [...unique.values()];
}

export function normalizeGoogleAdsResourceBookmarks(records) {
  if (!Array.isArray(records)) return [];
  return uniqueByUrl(records.map(normalizeBookmark).filter(Boolean));
}

export function matchGoogleAdsResourceBookmark(records, { accountId = '', accountName = '' } = {}) {
  const bookmarks = normalizeGoogleAdsResourceBookmarks(records);
  const normalizedId = String(accountId || '').replace(/\D/g, '');
  const idMatches = normalizedId.length === 10
    ? uniqueMatchesByUrl(bookmarks.filter(bookmark => bookmark.title.replace(/\D/g, '').includes(normalizedId)))
    : [];
  if (idMatches.length === 1) return { status: 'matched', bookmark: idMatches[0], matchedBy: 'account-id-in-title' };
  if (idMatches.length > 1) return { status: 'ambiguous', bookmarks: idMatches, matchedBy: 'account-id-in-title' };

  const normalizedName = normalizedText(accountName);
  if (normalizedName.length < 5) return { status: 'not-found', bookmark: null };
  const nameMatches = uniqueMatchesByUrl(bookmarks.filter(bookmark => normalizedText(bookmark.title).includes(normalizedName)));
  if (nameMatches.length === 1) return { status: 'matched', bookmark: nameMatches[0], matchedBy: 'account-name-in-title' };
  if (nameMatches.length > 1) return { status: 'ambiguous', bookmarks: nameMatches, matchedBy: 'account-name-in-title' };
  return { status: 'not-found', bookmark: null };
}

export function loadGoogleAdsResourceBookmarks(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(GOOGLE_ADS_RESOURCE_BOOKMARKS_STORAGE_KEY) || '[]');
    return normalizeGoogleAdsResourceBookmarks(parsed);
  } catch {
    return [];
  }
}

export function saveGoogleAdsResourceBookmarks(records, storage = globalThis.localStorage) {
  const bookmarks = normalizeGoogleAdsResourceBookmarks(records);
  try {
    if (!storage?.setItem) return { ok: false, bookmarks };
    storage.setItem(GOOGLE_ADS_RESOURCE_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
    return { ok: true, bookmarks };
  } catch {
    return { ok: false, bookmarks };
  }
}

export function summarizeGoogleAdsResourceBookmarkMatches(records, targets = []) {
  const results = targets.map(target => matchGoogleAdsResourceBookmark(records, {
    accountId: target?.accountId,
    accountName: target?.account?.name,
  }));
  return {
    matched: results.filter(result => result.status === 'matched').length,
    ambiguous: results.filter(result => result.status === 'ambiguous').length,
    unmatched: results.filter(result => result.status === 'not-found').length,
  };
}
