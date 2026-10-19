export const TRACKING_TOKEN_STORAGE_KEY = 'hub:tracking:api-token:v1';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function browserStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readTrackingHubToken({ storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { token: '', available: false, invalid: false };
  try {
    const saved = String(target.getItem(TRACKING_TOKEN_STORAGE_KEY) ?? '');
    const valid = TOKEN_PATTERN.test(saved);
    return { token: valid ? saved : '', available: true, invalid: Boolean(saved) && !valid };
  } catch {
    return { token: '', available: false, invalid: false };
  }
}

export function saveTrackingHubToken(token, { storage } = {}) {
  const value = String(token ?? '').trim();
  if (!TOKEN_PATTERN.test(value)) return { saved: false, available: true, invalid: true };
  const target = browserStorage(storage);
  if (!target) return { saved: false, available: false, invalid: false };
  try {
    target.setItem(TRACKING_TOKEN_STORAGE_KEY, value);
    return { saved: true, available: true, invalid: false };
  } catch {
    return { saved: false, available: false, invalid: false };
  }
}

export function clearTrackingHubToken({ storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { removed: false, available: false };
  try {
    target.removeItem(TRACKING_TOKEN_STORAGE_KEY);
    return { removed: true, available: true };
  } catch {
    return { removed: false, available: false };
  }
}
