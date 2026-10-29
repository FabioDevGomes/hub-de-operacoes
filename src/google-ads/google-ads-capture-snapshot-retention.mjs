export const GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_KEY = 'hub:google-ads:capture-snapshot-retention:v1';
export const GOOGLE_ADS_CAPTURE_SNAPSHOT_LEGACY_LIMIT_KEY = 'hub:google-ads:capture-history-display-limit:v1';
export const GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT = 10;
export const GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX = 100;

export function normalizeGoogleAdsCaptureSnapshotRetention(value, fallback = GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT) {
  const parsed = Number(value);
  const normalizedFallback = Number.isInteger(Number(fallback))
    ? Math.max(1, Math.min(GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX, Number(fallback)))
    : GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT;
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX, parsed))
    : normalizedFallback;
}

export function readGoogleAdsCaptureSnapshotRetention(storage = globalThis.localStorage) {
  try {
    const configured = storage?.getItem(GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_KEY);
    if (configured != null) return normalizeGoogleAdsCaptureSnapshotRetention(configured);
    const previousDisplayLimit = storage?.getItem(GOOGLE_ADS_CAPTURE_SNAPSHOT_LEGACY_LIMIT_KEY);
    return normalizeGoogleAdsCaptureSnapshotRetention(previousDisplayLimit);
  } catch {
    return GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT;
  }
}

export function writeGoogleAdsCaptureSnapshotRetention(value, storage = globalThis.localStorage) {
  const normalized = normalizeGoogleAdsCaptureSnapshotRetention(value);
  try {
    storage?.setItem(GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_KEY, String(normalized));
    return true;
  } catch {
    return false;
  }
}
