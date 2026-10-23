import { normalizeTrackingDomainList } from './tracking-domain-admin.mjs?v=7';

export const TRACKING_DOMAIN_LIST_STORAGE_KEY = 'hub:tracking:domain-list-cache:v1';

const SCHEMA_VERSION = 1;
const MAX_DOMAINS = 1000;
const MAX_STORAGE_CHARS = 262144;

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function normalizeStoredDomains(domains) {
  if (!Array.isArray(domains) || domains.length > MAX_DOMAINS) throw new Error('invalid_domains');
  const normalized = normalizeTrackingDomainList({
    ok: true,
    domains: domains.map(row => ({
      page_host: row?.page_host,
      origin: row?.origin,
      product_key: row?.product_key,
      product_label: row?.product_label,
      created_at_utc: typeof row?.created_at_utc === 'string' && row.created_at_utc.length <= 64
        ? row.created_at_utc
        : '',
    })),
  });
  if (new Set(normalized.map(row => row.hostname)).size !== normalized.length) throw new Error('duplicate_domains');
  return normalized;
}

export function readTrackingDomainList(storage) {
  const target = getStorage(storage);
  if (!target) return { available: false, loaded: false, rows: [], updatedAtUtc: '' };
  let raw;
  try {
    raw = target.getItem(TRACKING_DOMAIN_LIST_STORAGE_KEY);
  } catch {
    return { available: false, loaded: false, rows: [], updatedAtUtc: '' };
  }
  try {
    if (raw == null) return { available: true, loaded: false, rows: [], updatedAtUtc: '' };
    if (typeof raw !== 'string' || raw.length > MAX_STORAGE_CHARS) {
      return { available: true, invalid: true, loaded: false, rows: [], updatedAtUtc: '' };
    }
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.schemaVersion !== SCHEMA_VERSION || !isIsoTimestamp(value.updatedAtUtc)) {
      return { available: true, invalid: true, loaded: false, rows: [], updatedAtUtc: '' };
    }
    const rows = normalizeStoredDomains(value.domains);
    return { available: true, loaded: true, rows, updatedAtUtc: value.updatedAtUtc };
  } catch {
    return { available: true, invalid: true, loaded: false, rows: [], updatedAtUtc: '' };
  }
}

export function saveTrackingDomainList(rows, storage, now = new Date()) {
  const target = getStorage(storage);
  if (!target) return { saved: false };
  try {
    if (!Array.isArray(rows) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return { saved: false };
    const normalized = normalizeStoredDomains(rows.map(row => ({
      page_host: row?.hostname,
      origin: row?.origin,
      product_key: row?.productKey,
      product_label: row?.productLabel,
      created_at_utc: row?.createdAtUtc,
    })));
    const updatedAtUtc = now.toISOString();
    const value = {
      schemaVersion: SCHEMA_VERSION,
      updatedAtUtc,
      domains: normalized.map(row => ({
        page_host: row.hostname,
        origin: row.origin,
        product_key: row.productKey,
        product_label: row.productLabel,
        created_at_utc: row.createdAtUtc,
      })),
    };
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_STORAGE_CHARS) return { saved: false };
    target.setItem(TRACKING_DOMAIN_LIST_STORAGE_KEY, serialized);
    return { saved: true, updatedAtUtc };
  } catch {
    return { saved: false };
  }
}
