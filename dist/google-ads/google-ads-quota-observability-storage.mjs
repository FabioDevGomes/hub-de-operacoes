import { estimateGoogleAdsQuotaAttempt, normalizeGoogleAdsQuotaOperation, normalizeGoogleAdsQuotaServerCounts } from './google-ads-quota-observability-domain.mjs?v=5';

export const GOOGLE_ADS_QUOTA_TELEMETRY_STORAGE_KEY = 'hub:google-ads:quota-telemetry:v2';
export const GOOGLE_ADS_QUOTA_TELEMETRY_UPDATED_EVENT = 'google-ads-quota-telemetry-updated';
export const GOOGLE_ADS_QUOTA_REFERENCE_STORAGE_KEY = 'hub:google-ads:quota-reference:v1';
const MAX_RECENT_EVENTS = 10000;
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const VALID_REFERENCE_IDS = new Set(['explorer', 'basic', 'standard']);

function emptyState() {
  return { version: 2, startedAtUtc: '', totals: {}, recent: [] };
}

function safeReadState() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return emptyState();
    const parsed = JSON.parse(storage.getItem(GOOGLE_ADS_QUOTA_TELEMETRY_STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== 2 || typeof parsed !== 'object') return emptyState();
    return {
      version: 2,
      startedAtUtc: typeof parsed.startedAtUtc === 'string' ? parsed.startedAtUtc : '',
      totals: parsed.totals && typeof parsed.totals === 'object' && !Array.isArray(parsed.totals) ? parsed.totals : {},
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return emptyState();
  }
}

export function readGoogleAdsQuotaTelemetry() {
  return safeReadState();
}

export function readGoogleAdsQuotaReference() {
  try {
    const value = globalThis.localStorage?.getItem(GOOGLE_ADS_QUOTA_REFERENCE_STORAGE_KEY) || '';
    return VALID_REFERENCE_IDS.has(value) ? value : 'explorer';
  } catch {
    return 'explorer';
  }
}

export function writeGoogleAdsQuotaReference(value) {
  const normalized = VALID_REFERENCE_IDS.has(String(value)) ? String(value) : 'explorer';
  try { globalThis.localStorage?.setItem(GOOGLE_ADS_QUOTA_REFERENCE_STORAGE_KEY, normalized); }
  catch { /* The reference is a convenience; the telemetry remains usable without storage. */ }
  return normalized;
}

function numberOrZero(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

export function recordGoogleAdsQuotaExecution({ operation: rawOperation, outcome: rawOutcome, atUtc = new Date().toISOString(), durationMs = 0, serverCounts: rawServerCounts = null } = {}) {
  const operation = normalizeGoogleAdsQuotaOperation(rawOperation);
  if (!operation) return false;
  const outcome = ['success', 'failed', 'cancelled'].includes(rawOutcome) ? rawOutcome : 'failed';
  const atMs = Date.parse(atUtc);
  const timestamp = Number.isFinite(atMs) ? new Date(atMs).toISOString() : new Date().toISOString();
  const state = safeReadState();
  const serverCounts = normalizeGoogleAdsQuotaServerCounts(rawServerCounts);
  const recent = state.recent.filter(event => {
    const savedAt = Date.parse(event?.atUtc || '');
    return Number.isFinite(savedAt) && savedAt >= Date.now() - RECENT_WINDOW_MS;
  }).slice(-MAX_RECENT_EVENTS + 1);
  const normalizedDuration = Math.round(Math.max(0, Math.min(600000, Number(durationMs) || 0)));
  recent.push({ operation, atUtc: timestamp, durationMs: normalizedDuration, outcome, ...(serverCounts ? { serverCounts } : {}) });

  const previous = state.totals[operation] && typeof state.totals[operation] === 'object' ? state.totals[operation] : {};
  const estimate = estimateGoogleAdsQuotaAttempt(operation, outcome, serverCounts);
  const maxWasUnbounded = previous.estimatedMax == null && Number(previous.attempts) > 0;
  const updated = {
    attempts: numberOrZero(previous.attempts) + 1,
    successes: numberOrZero(previous.successes) + (outcome === 'success' ? 1 : 0),
    failures: numberOrZero(previous.failures) + (outcome === 'failed' ? 1 : 0),
    cancellations: numberOrZero(previous.cancellations) + (outcome === 'cancelled' ? 1 : 0),
    durationTotalMs: numberOrZero(previous.durationTotalMs) + normalizedDuration,
    estimatedMin: numberOrZero(previous.estimatedMin) + (estimate.min == null ? 0 : estimate.min),
    estimatedMax: maxWasUnbounded || estimate.max == null
      ? null
      : numberOrZero(previous.estimatedMax) + estimate.max,
    unknownCostCalls: numberOrZero(previous.unknownCostCalls) + (estimate.unknown && !estimate.serverTracked ? 1 : 0),
    serverTrackedAttempts: numberOrZero(previous.serverTrackedAttempts) + (estimate.serverTracked ? 1 : 0),
    quotaOperationsEstimated: numberOrZero(previous.quotaOperationsEstimated) + (serverCounts?.quotaOperationsEstimated || 0),
    quotaOperationsUnknown: numberOrZero(previous.quotaOperationsUnknown) + (serverCounts?.quotaOperationsUnknown || 0),
    googleAdsRequestsResponded: numberOrZero(previous.googleAdsRequestsResponded) + (serverCounts?.requestsResponded || 0),
    googleAdsRequestsUnknown: numberOrZero(previous.googleAdsRequestsUnknown) + (serverCounts?.requestsUnknown || 0),
    lastAtUtc: timestamp,
    lastOutcome: outcome,
  };
  const next = {
    version: 2,
    startedAtUtc: state.startedAtUtc || timestamp,
    totals: { ...state.totals, [operation]: updated },
    recent,
  };

  try {
    globalThis.localStorage?.setItem(GOOGLE_ADS_QUOTA_TELEMETRY_STORAGE_KEY, JSON.stringify(next));
    globalThis.dispatchEvent?.(new CustomEvent(GOOGLE_ADS_QUOTA_TELEMETRY_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}
