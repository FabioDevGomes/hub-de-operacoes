export const GOOGLE_ADS_MANAGER_BOOKMARKS_STORAGE_KEY = 'hub:google-ads:manager-account-bookmarks:v1';
const ACCOUNTS_PATH = /^\/aw\/(?:manager-accounts\/)?accounts\/?$/i;

function normalizeBookmark(value) {
  const title = String(value?.title || '').trim().slice(0, 240);
  const rawUrl = String(value?.url || '').trim().slice(0, 4096);
  try {
    const url = new URL(rawUrl);
    if (url.origin !== 'https://ads.google.com' || !ACCOUNTS_PATH.test(url.pathname) || url.username || url.password) return null;
    return { title, url: rawUrl };
  } catch { return null; }
}

function normalizeMatchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeGoogleAdsManagerBookmarks(values) {
  const unique = new Map();
  for (const bookmark of (Array.isArray(values) ? values : []).map(normalizeBookmark).filter(Boolean)) {
    const key = bookmark.url + '\u0000' + bookmark.title.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, bookmark);
  }
  return [...unique.values()];
}

export function matchGoogleAdsManagerBookmark(values, { managerId = '', managerName = '' } = {}) {
  const bookmarks = normalizeGoogleAdsManagerBookmarks(values);
  const id = String(managerId || '').replace(/\D/g, '');
  const byId = /^\d{10}$/.test(id)
    ? [...new Map(bookmarks.filter(item => item.title.replace(/\D/g, '').includes(id)).map(item => [item.url, item])).values()]
    : [];
  if (byId.length === 1) return { status: 'matched', bookmark: byId[0] };
  if (byId.length > 1) return { status: 'ambiguous', bookmark: null };
  const name = normalizeMatchText(managerName);
  if (name.length < 4) return { status: 'not-found', bookmark: null };
  const byName = [...new Map(bookmarks.filter(item => normalizeMatchText(item.title).includes(name)).map(item => [item.url, item])).values()];
  if (byName.length === 1) return { status: 'matched', bookmark: byName[0] };
  return { status: byName.length ? 'ambiguous' : 'not-found', bookmark: null };
}

export function loadGoogleAdsManagerBookmarks(storage = globalThis.localStorage) {
  try { return normalizeGoogleAdsManagerBookmarks(JSON.parse(storage?.getItem(GOOGLE_ADS_MANAGER_BOOKMARKS_STORAGE_KEY) || '[]')); }
  catch { return []; }
}

export function saveGoogleAdsManagerBookmarks(values, storage = globalThis.localStorage) {
  const bookmarks = normalizeGoogleAdsManagerBookmarks(values);
  try { if (!storage?.setItem) return { ok: false, bookmarks }; storage.setItem(GOOGLE_ADS_MANAGER_BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks)); return { ok: true, bookmarks }; }
  catch { return { ok: false, bookmarks }; }
}
