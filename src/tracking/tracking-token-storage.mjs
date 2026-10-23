export const TRACKING_TOKEN_STORAGE_KEY = 'hub:tracking:api-token:v1';
export const TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY = 'hub:tracking:domain-admin-token:v1';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function browserStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function readToken(key, { storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { token: '', available: false, invalid: false };
  try {
    const saved = String(target.getItem(key) ?? '');
    const valid = TOKEN_PATTERN.test(saved);
    return { token: valid ? saved : '', available: true, invalid: Boolean(saved) && !valid };
  } catch {
    return { token: '', available: false, invalid: false };
  }
}

function saveToken(key, token, { storage } = {}) {
  const value = String(token ?? '').trim();
  if (!TOKEN_PATTERN.test(value)) return { saved: false, available: true, invalid: true };
  const target = browserStorage(storage);
  if (!target) return { saved: false, available: false, invalid: false };
  try {
    target.setItem(key, value);
    return { saved: true, available: true, invalid: false };
  } catch {
    return { saved: false, available: false, invalid: false };
  }
}

function clearToken(key, { storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { removed: false, available: false };
  try {
    target.removeItem(key);
    return { removed: true, available: true };
  } catch {
    return { removed: false, available: false };
  }
}

export function readTrackingHubToken(options) {
  return readToken(TRACKING_TOKEN_STORAGE_KEY, options);
}

export function saveTrackingHubToken(token, options) {
  return saveToken(TRACKING_TOKEN_STORAGE_KEY, token, options);
}

export function clearTrackingHubToken(options) {
  return clearToken(TRACKING_TOKEN_STORAGE_KEY, options);
}

export function readTrackingDomainAdminToken(options) {
  return readToken(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY, options);
}

export function saveTrackingDomainAdminToken(token, options) {
  return saveToken(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY, token, options);
}

export function clearTrackingDomainAdminToken(options) {
  return clearToken(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY, options);
}
