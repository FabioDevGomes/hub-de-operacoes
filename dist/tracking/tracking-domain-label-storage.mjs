import { normalizeTrackingProductKey, normalizeTrackingProductLabel } from './tracking-domain-admin.mjs?v=11';

export const TRACKING_PRODUCT_LABELS_STORAGE_KEY = 'hub:tracking:product-labels:v1';
const MAX_LABELS = 1000;
const MAX_STORAGE_CHARS = 262144;

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

export function readTrackingProductLabels(storage) {
  const target = getStorage(storage);
  if (!target) return { available: false, labels: new Map() };
  try {
    const raw = target.getItem(TRACKING_PRODUCT_LABELS_STORAGE_KEY);
    if (raw == null) return { available: true, labels: new Map() };
    if (raw.length > MAX_STORAGE_CHARS) return { available: false, invalid: true, labels: new Map() };
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { available: false, invalid: true, labels: new Map() };
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_LABELS) return { available: false, invalid: true, labels: new Map() };
    const labels = new Map();
    for (const [rawKey, rawLabel] of entries) {
      const key = normalizeTrackingProductKey(rawKey);
      const label = normalizeTrackingProductLabel(rawLabel);
      if (key !== rawKey) return { available: false, invalid: true, labels: new Map() };
      labels.set(key, label);
    }
    return { available: true, labels };
  } catch {
    return { available: false, invalid: true, labels: new Map() };
  }
}

export function saveTrackingProductLabel(productKey, productLabel, storage) {
  const target = getStorage(storage);
  if (!target) return { saved: false };
  try {
    const key = normalizeTrackingProductKey(productKey);
    const label = normalizeTrackingProductLabel(productLabel);
    const labels = readTrackingProductLabels(target).labels;
    labels.delete(key);
    labels.set(key, label);
    while (labels.size > MAX_LABELS) labels.delete(labels.keys().next().value);
    const serialized = JSON.stringify(Object.fromEntries(labels));
    if (serialized.length > MAX_STORAGE_CHARS) return { saved: false };
    target.setItem(TRACKING_PRODUCT_LABELS_STORAGE_KEY, serialized);
    return { saved: true };
  } catch {
    return { saved: false };
  }
}
