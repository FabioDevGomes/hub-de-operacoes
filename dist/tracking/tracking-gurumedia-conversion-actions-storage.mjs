const STORAGE_KEY = 'hub:tracking:gurumedia-conversion-actions:v1';
const SCHEMA_VERSION = 1;
const MAX_MCC_SETTINGS = 100;
const MAX_STORAGE_CHARS = 131072;
const RESOURCE_NAME_PATTERN = /^customers\/(\d{10})\/conversionActions\/(\d{1,20})$/;

function browserStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function normalizeSetting(value) {
  const mccCustomerId = String(value?.mccCustomerId ?? '').replace(/\D/g, '');
  const managerCustomerId = String(value?.managerCustomerId ?? '').replace(/\D/g, '');
  const customerId = String(value?.customerId ?? '').replace(/\D/g, '');
  const resourceName = typeof value?.resourceName === 'string' ? value.resourceName.trim() : '';
  const match = RESOURCE_NAME_PATTERN.exec(resourceName);
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const status = typeof value?.status === 'string' ? value.status.trim().toUpperCase() : '';
  const type = typeof value?.type === 'string' ? value.type.trim().toUpperCase() : '';
  const category = typeof value?.category === 'string' ? value.category.trim().toUpperCase() : '';
  if (!/^\d{10}$/.test(mccCustomerId) || managerCustomerId !== mccCustomerId || customerId !== mccCustomerId
      || !match || match[1] !== customerId || !name || name.length > 255
      || status !== 'ENABLED' || type !== 'UPLOAD_CLICKS' || category !== 'PURCHASE') {
    throw new Error('invalid_conversion_action_setting');
  }
  return {
    mccCustomerId,
    managerCustomerId,
    customerId,
    resourceName,
    name,
    status,
    type,
    category,
    ownerCustomer: typeof value?.ownerCustomer === 'string' ? value.ownerCustomer.slice(0, 80) : '',
    defaultCurrencyCode: typeof value?.defaultCurrencyCode === 'string' && /^[A-Z]{3}$/.test(value.defaultCurrencyCode)
      ? value.defaultCurrencyCode : '',
    savedAtUtc: typeof value?.savedAtUtc === 'string' && Number.isFinite(Date.parse(value.savedAtUtc))
      ? new Date(value.savedAtUtc).toISOString() : new Date(0).toISOString(),
  };
}

function normalizeSettings(value) {
  if (!Array.isArray(value) || value.length > MAX_MCC_SETTINGS) throw new Error('invalid_conversion_action_settings');
  const settings = value.map(normalizeSetting);
  if (new Set(settings.map(setting => setting.mccCustomerId)).size !== settings.length) {
    throw new Error('duplicate_conversion_action_mcc');
  }
  return settings;
}

export function readGuruMediaConversionActionSettings({ storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { settings: [], available: false, invalid: false };
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return { settings: [], available: true, invalid: false };
    if (raw.length > MAX_STORAGE_CHARS) return { settings: [], available: true, invalid: true };
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== SCHEMA_VERSION) return { settings: [], available: true, invalid: true };
    return { settings: normalizeSettings(parsed.settings), available: true, invalid: false };
  } catch {
    return { settings: [], available: true, invalid: true };
  }
}

export function saveGuruMediaConversionActionSetting(setting, { storage, now = () => new Date() } = {}) {
  const target = browserStorage(storage);
  if (!target) return { saved: false, available: false };
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('invalid_save_time');
  let current = readGuruMediaConversionActionSettings({ storage: target });
  if (!current.available || current.invalid) return { saved: false, available: current.available, invalid: current.invalid };
  const next = normalizeSetting({ ...setting, savedAtUtc: date.toISOString() });
  const settings = [...current.settings.filter(item => item.mccCustomerId !== next.mccCustomerId), next]
    .sort((left, right) => left.mccCustomerId.localeCompare(right.mccCustomerId));
  try {
    const serialized = JSON.stringify({ schemaVersion: SCHEMA_VERSION, settings });
    if (serialized.length > MAX_STORAGE_CHARS) return { saved: false, available: true, limitExceeded: true };
    target.setItem(STORAGE_KEY, serialized);
    return { saved: true, available: true, settings, setting: next };
  } catch {
    return { saved: false, available: false };
  }
}

export function removeGuruMediaConversionActionSetting(mccCustomerId, { storage } = {}) {
  const target = browserStorage(storage);
  if (!target) return { removed: false, available: false };
  const id = String(mccCustomerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(id)) return { removed: false, available: true, invalid: true };
  const current = readGuruMediaConversionActionSettings({ storage: target });
  if (!current.available || current.invalid) return { removed: false, available: current.available, invalid: current.invalid };
  const settings = current.settings.filter(item => item.mccCustomerId !== id);
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, settings }));
    return { removed: true, available: true, settings };
  } catch {
    return { removed: false, available: false };
  }
}
