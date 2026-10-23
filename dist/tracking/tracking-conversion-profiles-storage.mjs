export const TRACKING_CONVERSION_PROFILES_STORAGE_KEY = 'hub:tracking:conversion-profiles:v1';

const SCHEMA_VERSION = 1;
const MAX_PROFILES = 20;
const MAX_STORAGE_CHARS = 16384;

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function normalizeText(value, field, maxBytes) {
  if (typeof value !== 'string') throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || byteLength(normalized) > maxBytes || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`invalid_${field}`);
  }
  return normalized;
}

export function normalizeTrackingConversionProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
      || typeof profile.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(profile.id)) throw new Error('invalid_profile');
  return Object.freeze({
    id: profile.id,
    label: normalizeText(profile.label, 'profile_label', 120),
    conversionName: normalizeText(profile.conversionName, 'conversion_name', 255),
  });
}

function normalizeProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length > MAX_PROFILES) throw new Error('invalid_profiles');
  const ids = new Set();
  return profiles.map(profile => {
    const normalized = normalizeTrackingConversionProfile(profile);
    if (ids.has(normalized.id)) throw new Error('duplicate_profile');
    ids.add(normalized.id);
    return normalized;
  });
}

export function newTrackingConversionProfileId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* Use the non-secret local identifier fallback below. */ }
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function readTrackingConversionProfiles(storage) {
  const target = getStorage(storage);
  if (!target) return { available: false, profiles: [], selectedProfileId: '' };
  try {
    const raw = target.getItem(TRACKING_CONVERSION_PROFILES_STORAGE_KEY);
    if (raw == null) return { available: true, profiles: [], selectedProfileId: '' };
    if (typeof raw !== 'string' || raw.length > MAX_STORAGE_CHARS) {
      return { available: true, invalid: true, profiles: [], selectedProfileId: '' };
    }
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.schemaVersion !== SCHEMA_VERSION
        || typeof value.selectedProfileId !== 'string') {
      return { available: true, invalid: true, profiles: [], selectedProfileId: '' };
    }
    const profiles = normalizeProfiles(value.profiles);
    if (value.selectedProfileId !== '' && !profiles.some(profile => profile.id === value.selectedProfileId)) {
      return { available: true, invalid: true, profiles: [], selectedProfileId: '' };
    }
    if (profiles.length === 0 && value.selectedProfileId !== '') {
      return { available: true, invalid: true, profiles: [], selectedProfileId: '' };
    }
    return { available: true, profiles, selectedProfileId: value.selectedProfileId };
  } catch {
    return { available: true, invalid: true, profiles: [], selectedProfileId: '' };
  }
}

export function saveTrackingConversionProfiles(profiles, selectedProfileId, storage) {
  const target = getStorage(storage);
  if (!target) return { saved: false };
  try {
    const normalized = normalizeProfiles(profiles);
    if (typeof selectedProfileId !== 'string'
        || (selectedProfileId !== '' && !normalized.some(profile => profile.id === selectedProfileId))
        || (!normalized.length && selectedProfileId !== '')) return { saved: false };
    const serialized = JSON.stringify({ schemaVersion: SCHEMA_VERSION, selectedProfileId, profiles: normalized });
    if (serialized.length > MAX_STORAGE_CHARS) return { saved: false };
    target.setItem(TRACKING_CONVERSION_PROFILES_STORAGE_KEY, serialized);
    return { saved: true };
  } catch {
    return { saved: false };
  }
}
