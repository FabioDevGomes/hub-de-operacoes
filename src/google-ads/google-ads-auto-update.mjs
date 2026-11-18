import { fetchGoogleAdsConfiguration, fetchGoogleAdsDailyReport, fetchGoogleAdsSaoPauloDayReport } from './google-ads-service.mjs?v=16';
import { normalizeGoogleAdsDailyReport } from './google-ads-domain.mjs?v=7';
import { normalizeGoogleAdsConfiguration } from './google-ads-config-domain.mjs?v=2';
import { loadGoogleAdsAccountsCache, saveGoogleAdsAccountMetadataContextToken } from './google-ads-accounts-cache.mjs?v=4';
import { syncGoogleAdsFinalUrlHostCache } from './google-ads-final-url-host-cache.mjs?v=2';

export const GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY = 'hub.google-ads-auto-update:enabled:v1';
export const GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY = 'hub.google-ads-auto-update:status:v1';
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY = 'hub.google-ads-auto-update:interval-minutes:v1';
export const GOOGLE_ADS_AUTO_UPDATE_HTTP_502_RETRY_INTERVAL_KEY = 'hub.google-ads-auto-update:http-502-retry-interval-minutes:v1';
export const GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_ENABLED_KEY = 'hub.google-ads-auto-update:d1-review-enabled:v1';
export const GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_SETTING_CHANGED_EVENT = 'google-ads-auto-update-d1-review-setting-changed';
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_OPTIONS = Object.freeze([30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 240, 360, 720, 1440]);

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_HTTP_502_RETRY_INTERVAL_MINUTES = 60;
const MIN_HTTP_502_RETRY_INTERVAL_MINUTES = 5;
const MAX_HTTP_502_RETRY_INTERVAL_MINUTES = 1440;

const LOCK_NAME = 'hub-google-ads-auto-update-v1';
const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_INTERVAL_MS = 60 * 60 * 1000;
const D1_BACKFILL_MAX_DAYS = 13;
const D1_BACKFILL_STEP_INTERVAL_MS = 5 * 60 * 1000;
const D1_RECONCILIATION_DELAY_MS = 24 * 60 * 60 * 1000;
const D1_START_HOUR_SAO_PAULO = 6;
const D1_OPERATIONAL_START_DATE = '2026-10-26';
const MAX_ACCOUNT_CONCURRENCY = 2;

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function readJson(key, fallback = null, storage = safeStorage()) {
  try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

export function readGoogleAdsAutoUpdateEnabled(storage = safeStorage()) {
  try { return storage?.getItem(GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY) === 'true'; } catch { return false; }
}

export function readGoogleAdsAutoUpdateIntervalMinutes(storage = safeStorage()) {
  let value = NaN;
  try { value = Number(storage?.getItem(GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY)); } catch { /* Use the default when storage is unavailable. */ }
  return GOOGLE_ADS_AUTO_UPDATE_INTERVAL_OPTIONS.includes(value) ? value : DEFAULT_INTERVAL_MINUTES;
}

export function readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage = safeStorage()) {
  let value = NaN;
  try { value = Number(storage?.getItem(GOOGLE_ADS_AUTO_UPDATE_HTTP_502_RETRY_INTERVAL_KEY)); } catch { /* Use the default when storage is unavailable. */ }
  return Number.isInteger(value) && value >= MIN_HTTP_502_RETRY_INTERVAL_MINUTES && value <= MAX_HTTP_502_RETRY_INTERVAL_MINUTES
    ? value
    : DEFAULT_HTTP_502_RETRY_INTERVAL_MINUTES;
}

export function readGoogleAdsD1ReviewEnabled(storage = safeStorage()) {
  try { return storage?.getItem(GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_ENABLED_KEY) !== 'false'; } catch { return true; }
}

export function writeGoogleAdsD1ReviewEnabled(enabled, storage = safeStorage()) {
  if (!storage) throw new Error('O armazenamento local deste perfil não está disponível.');
  const value = enabled === true;
  try { storage.setItem(GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_ENABLED_KEY, String(value)); }
  catch { throw new Error('Não foi possível salvar a preferência de revisão D−1 neste perfil do navegador.'); }
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent(GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_SETTING_CHANGED_EVENT, { detail: { enabled: value } }));
  }
  return value;
}

export function readGoogleAdsAutoUpdateStatus(storage = safeStorage()) {
  const value = readJson(GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY, null, storage);
  return value && value.schemaVersion === 1 ? {
    ...value,
    enabled: readGoogleAdsAutoUpdateEnabled(storage),
    intervalMinutes: readGoogleAdsAutoUpdateIntervalMinutes(storage),
    http502RetryIntervalMinutes: readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage),
    d1ReconciliationEnabled: readGoogleAdsD1ReviewEnabled(storage),
  } : {
    schemaVersion: 1,
    enabled: readGoogleAdsAutoUpdateEnabled(storage),
    intervalMinutes: readGoogleAdsAutoUpdateIntervalMinutes(storage),
    http502RetryIntervalMinutes: readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage),
    d1ReconciliationEnabled: readGoogleAdsD1ReviewEnabled(storage),
    state: readGoogleAdsAutoUpdateEnabled(storage) ? 'waiting' : 'disabled',
    lastD0: null,
    lastD1: null,
  };
}

function nextD0IntervalAtUtc(lastD0, intervalMinutes, fallbackNow) {
  const completedAt = Date.parse(lastD0?.completedAtUtc || '');
  const anchor = Number.isFinite(completedAt) ? completedAt : fallbackNow.getTime();
  return new Date(anchor + intervalMinutes * 60 * 1000).toISOString();
}

function hasPendingD0Retry(status, nowMs) {
  const nextAt = Date.parse(status.nextD0AttemptAtUtc || '');
  if (!Number.isFinite(nextAt) || nextAt <= nowMs) return false;
  if (status.nextD0ScheduleType === 'retry') return true;
  if (status.nextD0ScheduleType === 'interval') return false;

  // Compatibilidade com agendamentos gravados antes deste marcador existir.
  if (status.state === 'running' && status.operation === 'D0') return true;
  const lastAttempt = Date.parse(status.lastAttemptAtUtc || '');
  const lastSuccess = Date.parse(status.lastD0?.completedAtUtc || '');
  return status.state === 'blocked'
    || (Number.isFinite(lastAttempt) && (!Number.isFinite(lastSuccess) || lastAttempt > lastSuccess));
}

function localDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function previousIsoDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetweenIsoDates(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000);
}

function saoPauloHour(date) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
}

function validAccount(account) {
  return account
    && /^\d{10}$/.test(String(account.customerId || ''))
    && (account.managerCustomerId == null || /^\d{10}$/.test(String(account.managerCustomerId)))
    && /^[A-Z]{3}$/.test(String(account.currencyCode || ''))
    && typeof account.timeZone === 'string'
    && account.timeZone.length > 0;
}

const AUTO_UPDATE_FAILURE_LABELS = Object.freeze({
  google_ads_quota_exceeded: 'A Google Ads API indicou limite de cota.',
  google_ads_access_denied: 'A Google Ads API recusou o acesso.',
  google_ads_auth_failed: 'O serviço não conseguiu autenticar na Google Ads API.',
  google_ads_unavailable: 'O serviço Google Ads não respondeu ou ficou indisponível.',
  google_ads_request_rejected: 'A Google Ads API rejeitou a consulta.',
  google_ads_report_incomplete: 'A Google Ads API devolveu uma resposta incompleta.',
  google_ads_timezone_unavailable: 'Não foi possível confirmar o fuso da conta.',
  sao_paulo_day_timezone_unsupported: 'O fuso da conta não permite fechar o dia de São Paulo com precisão.',
  sao_paulo_day_report_unavailable: 'O serviço privado não oferece o relatório D−1 necessário.',
  sao_paulo_day_not_yesterday: 'A data solicitada não foi aceita pelo serviço privado.',
  sao_paulo_day_outside_window: 'A data está fora da janela de consulta do serviço privado.',
  not_authorized: 'O serviço privado recusou o token do Hub.',
  origin_not_allowed: 'O serviço privado recusou a origem do Hub.',
  api_not_configured: 'O serviço privado não está configurado.',
  credentials_missing: 'A credencial do serviço privado não está disponível.',
  server_error: 'O serviço privado retornou um erro interno.',
  invalid_payload: 'O serviço privado recusou os parâmetros enviados.',
  account_directory_invalid: 'O diretório contém uma conta com dados inválidos.',
  response_account_mismatch: 'A resposta não corresponde à conta ou MCC consultada.',
  response_incomplete: 'A resposta não confirmou o dia e a consulta completos.',
  response_scope_mismatch: 'A resposta não confirmou a consulta de todas as campanhas.',
  response_business_date_mismatch: 'A resposta não confirmou a data civil de São Paulo.',
  configuration_mismatch: 'O inventário de campanhas não corresponde ao relatório consultado.',
  report_coverage_incomplete: 'A resposta não cobriu todas as contas conectadas.',
  business_date_not_closed: 'A data D−1 ainda não estava fechada em São Paulo.',
  day_rolled_during_query: 'O dia local de uma conta mudou durante a consulta.',
  request_timeout: 'A consulta atingiu o limite de tempo.',
  client_network_error: 'O Hub não conseguiu confirmar a resposta do serviço.',
  response_validation_failed: 'A resposta recebida não passou na validação do Hub.',
  local_capture_write_failed: 'A captura validada não pôde ser salva na base local.',
  unclassified: 'A causa ainda não pôde ser classificada.',
});

function autoUpdateFailureSample(error, account = null, responseReceived = false) {
  const diagnostic = error?.diagnostic && typeof error.diagnostic === 'object' ? error.diagnostic : {};
  const knownCode = /^[a-z][a-z0-9_]{0,79}$/.test(String(error?.code || '')) ? String(error.code) : '';
  const message = String(error?.message || '');
  const reasonCode = knownCode || (error?.name === 'AbortError' || /^A consulta excedeu\b/i.test(message)
    ? 'request_timeout'
    : /não foi possível conectar ao servidor/i.test(message)
      ? 'client_network_error'
      : responseReceived ? 'response_validation_failed' : 'unclassified');
  const customerId = String(account?.customerId || '').replace(/\D/g, '');
  const safeDiagnosticId = /^[A-Za-z0-9._:-]{8,120}$/.test(String(diagnostic.id || '')) ? String(diagnostic.id) : null;
  const safeRequestId = /^[A-Za-z0-9._:-]{8,120}$/.test(String(diagnostic.googleRequestId || '')) ? String(diagnostic.googleRequestId) : null;
  const safeCodes = Array.isArray(diagnostic.googleErrorCodes)
    ? [...new Set(diagnostic.googleErrorCodes.filter(code => /^(?:[A-Z][A-Z0-9_]{0,79}|[A-Za-z][A-Za-z0-9_]{0,59}\.[A-Z][A-Z0-9_]{0,79})$/.test(String(code))).map(String))].slice(0, 3)
    : [];
  const stage = ['google_ads_transport', 'oauth_transport', 'google_ads_api', 'oauth_token'].includes(diagnostic.stage) ? diagnostic.stage : null;
  const numericStatus = value => Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
  return {
    ...(customerId.length === 10 ? { accountSuffix: customerId.slice(-4) } : {}),
    reasonCode,
    ...(Number.isInteger(Number(error?.httpStatus)) && Number(error.httpStatus) >= 100 && Number(error.httpStatus) <= 599 ? { httpStatus: Number(error.httpStatus) } : {}),
    ...(safeDiagnosticId ? { diagnosticId: safeDiagnosticId } : {}),
    ...(stage ? { stage } : {}),
    ...(numericStatus(diagnostic.upstreamHttpStatus) ? { upstreamHttpStatus: numericStatus(diagnostic.upstreamHttpStatus) } : {}),
    ...(typeof diagnostic.googleStatus === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(diagnostic.googleStatus) ? { googleStatus: diagnostic.googleStatus } : {}),
    ...(safeRequestId ? { googleRequestId: safeRequestId } : {}),
    ...(safeCodes.length ? { googleErrorCodes: safeCodes } : {}),
    ...(Number.isInteger(Number(diagnostic.curlErrno)) && Number(diagnostic.curlErrno) > 0 ? { curlErrno: Number(diagnostic.curlErrno) } : {}),
    ...(typeof diagnostic.retryable === 'boolean' ? { retryable: diagnostic.retryable } : {}),
  };
}

function buildAutoUpdateFailureInfo(error, account = null, responseReceived = false) {
  if (error?.failureInfo?.schemaVersion === 1 && Array.isArray(error.failureInfo.samples)) return error.failureInfo;
  const samples = [autoUpdateFailureSample(error, account, responseReceived)];
  return { schemaVersion: 1, failureCount: 1, samples };
}

function summarizeAutoUpdateFailure(info) {
  const sample = info?.samples?.[0] || {};
  const label = AUTO_UPDATE_FAILURE_LABELS[sample.reasonCode] || AUTO_UPDATE_FAILURE_LABELS.unclassified;
  const status = sample.upstreamHttpStatus || sample.httpStatus;
  const codes = Array.isArray(sample.googleErrorCodes) ? sample.googleErrorCodes.join(', ') : '';
  const count = Math.max(1, Math.trunc(Number(info?.failureCount) || 1));
  return `${label}${count > 1 ? ` (${count} contas)` : ''}${status ? ` HTTP ${status}` : ''}${codes ? ` · ${codes}` : ''}${sample.diagnosticId ? ` · Diagnóstico ${sample.diagnosticId}` : ''}`;
}

function autoUpdateD0RetryIntervalMs(failureInfo, storage) {
  const hasHttp502 = (Array.isArray(failureInfo?.samples) ? failureInfo.samples : []).some(sample =>
    sample?.reasonCode === 'google_ads_unavailable'
      && (sample?.upstreamHttpStatus || sample?.httpStatus) === 502);
  return hasHttp502
    ? readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage) * 60 * 1000
    : RETRY_INTERVAL_MS;
}

function autoUpdateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isReportForAccount(report, account) {
  return report.customerId === String(account.customerId)
    && (report.managerCustomerId || null) === (account.managerCustomerId || null)
    && report.currencyCode === account.currencyCode
    && report.timeZone === account.timeZone;
}

function accountCoverageMatches(captured, account) {
  if (!captured || String(captured.customerId) !== String(account.customerId) || captured.timeZone !== account.timeZone) return false;
  if (Object.prototype.hasOwnProperty.call(captured, 'managerCustomerId')
      && (captured.managerCustomerId || null) !== (account.managerCustomerId || null)) return false;
  if (Object.prototype.hasOwnProperty.call(captured, 'currencyCode') && captured.currencyCode !== account.currencyCode) return false;
  return true;
}

function accountsMissingFromRun(run, accounts, businessDate = null) {
  const datesByAccount = new Map((run?.datesByAccount || []).map(item => [String(item.customerId), item]));
  return accounts.filter(account => {
    const captured = datesByAccount.get(String(account.customerId));
    return !accountCoverageMatches(captured, account) || (businessDate && captured.date !== businessDate);
  });
}

function accountRunDateIsCurrent(captured, account, date = localDateInTimeZone(new Date(), account.timeZone)) {
  return accountCoverageMatches(captured, account) && captured.date === date;
}

function recentRunMatchesDirectory(run, accounts, directorySavedAtUtc) {
  if (!run || run.accountCount !== accounts.length || run.directorySavedAtUtc !== directorySavedAtUtc) return false;
  const datesByAccount = new Map((run.datesByAccount || []).map(item => [String(item.customerId), item]));
  return accounts.every(account => accountRunDateIsCurrent(datesByAccount.get(String(account.customerId)), account));
}

function mergeAutoUpdateRunCoverage(previousRun, run, accounts, directorySavedAtUtc) {
  const datesByAccount = new Map((previousRun?.datesByAccount || []).map(item => [String(item.customerId), item]));
  for (const item of run.datesByAccount || []) datesByAccount.set(String(item.customerId), item);
  return {
    ...run,
    datesByAccount: accounts.map(account => datesByAccount.get(String(account.customerId))).filter(Boolean),
    accountCount: accounts.length,
    managerCount: new Set(accounts.map(account => account.managerCustomerId || 'direct')).size,
    directorySavedAtUtc,
  };
}

function normalizeD1ReconciliationQueue(value) {
  if (!Array.isArray(value)) return [];
  const byDate = new Map();
  for (const item of value) {
    const businessDate = String(item?.businessDate || '');
    const dueAtUtc = String(item?.dueAtUtc || '');
    if (!validIsoDate(businessDate) || !Number.isFinite(Date.parse(dueAtUtc))) continue;
    const nextAttemptAtUtc = Number.isFinite(Date.parse(item?.nextAttemptAtUtc || '')) ? item.nextAttemptAtUtc : null;
    const normalized = {
      businessDate,
      dueAtUtc: new Date(dueAtUtc).toISOString(),
      nextAttemptAtUtc,
      attemptCount: Math.max(0, Math.min(100, Math.trunc(Number(item?.attemptCount) || 0))),
    };
    const previous = byDate.get(businessDate);
    if (!previous || Date.parse(normalized.dueAtUtc) >= Date.parse(previous.dueAtUtc)) byDate.set(businessDate, normalized);
  }
  return [...byDate.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
}

export function createGoogleAdsAutoUpdater({
  getSourceMode = () => 'manifest',
  saveCaptures,
  recordFailure = null,
  refreshFinalUrlCache = syncGoogleAdsFinalUrlHostCache,
  onBatchSaved = () => {},
  storage = safeStorage(),
  now = () => new Date(),
} = {}) {
  let started = false;
  let timer = null;
  let activeController = null;
  let status = readGoogleAdsAutoUpdateStatus(storage);
  let channel = null;

  const supportsLocks = () => typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
  const notify = () => {
    document.dispatchEvent(new CustomEvent('google-ads-auto-update-status', { detail: { ...status } }));
  };

  function publish(patch) {
    status = {
      ...status,
      ...patch,
      schemaVersion: 1,
      enabled: readGoogleAdsAutoUpdateEnabled(storage),
      intervalMinutes: readGoogleAdsAutoUpdateIntervalMinutes(storage),
      http502RetryIntervalMinutes: readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage),
      d1ReconciliationEnabled: readGoogleAdsD1ReviewEnabled(storage),
      supported: supportsLocks(),
      updatedAtUtc: now().toISOString(),
    };
    try { storage?.setItem(GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY, JSON.stringify(status)); } catch { /* Status is mirrored in memory if storage is unavailable. */ }
    notify();
    try { channel?.postMessage({ type: 'status', status }); } catch { /* Broadcast is optional. */ }
    return status;
  }

  function refreshStatus() {
    status = readGoogleAdsAutoUpdateStatus(storage);
    notify();
  }

  function scheduleNextCheck(delay = CHECK_INTERVAL_MS) {
    clearTimeout(timer);
    timer = setTimeout(() => { void tick(); }, delay);
  }

  function isEnabled() {
    return readGoogleAdsAutoUpdateEnabled();
  }

  function isD1ReviewEnabled() {
    return readGoogleAdsD1ReviewEnabled(storage);
  }

  function currentD1Date() {
    return previousIsoDate(localDateInTimeZone(now(), 'America/Sao_Paulo'));
  }

  function nextD1Date(directorySavedAtUtc) {
    const yesterday = currentD1Date();
    const previousRun = status.lastD1;
    if (!validIsoDate(previousRun?.date)) {
      const attemptedDate = validIsoDate(status.lastD1AttemptBusinessDate) ? status.lastD1AttemptBusinessDate : null;
      return attemptedDate && attemptedDate <= yesterday ? attemptedDate : yesterday;
    }
    if (previousRun.date > yesterday) return null;
    const directoryChanged = previousRun.directorySavedAtUtc !== directorySavedAtUtc;
    const targetDate = directoryChanged ? previousRun.date : shiftIsoDate(previousRun.date, 1);
    return targetDate <= yesterday ? targetDate : null;
  }

  function d1BackfillState(targetDate) {
    if (!targetDate) return { pendingD1Date: null, pendingD1Count: 0, d1BackfillBlocked: false };
    const yesterday = currentD1Date();
    const retentionStart = shiftIsoDate(yesterday, -(D1_BACKFILL_MAX_DAYS - 1));
    const operationalStart = String(globalThis.CampaignDatabase?.GOOGLE_ADS_API_OPERATIONAL_START_DATE || D1_OPERATIONAL_START_DATE);
    const earliestRecoverableDate = retentionStart < operationalStart ? operationalStart : retentionStart;
    return {
      pendingD1Date: targetDate,
      pendingD1Count: Math.max(0, daysBetweenIsoDates(targetDate, yesterday) + 1),
      d1BackfillBlocked: targetDate < earliestRecoverableDate,
    };
  }

  function d1ReconciliationState(queue = status.d1ReconciliationQueue) {
    const normalizedQueue = normalizeD1ReconciliationQueue(queue);
    const yesterday = currentD1Date();
    const retentionStart = shiftIsoDate(yesterday, -(D1_BACKFILL_MAX_DAYS - 1));
    const operationalStart = String(globalThis.CampaignDatabase?.GOOGLE_ADS_API_OPERATIONAL_START_DATE || D1_OPERATIONAL_START_DATE);
    const earliestRecoverableDate = retentionStart < operationalStart ? operationalStart : retentionStart;
    const blockedItems = normalizedQueue.filter(item => item.businessDate < earliestRecoverableDate || item.businessDate > yesterday);
    const availableItems = normalizedQueue.filter(item => item.businessDate >= earliestRecoverableDate && item.businessDate <= yesterday);
    const scheduledItems = availableItems.map(item => ({
      item,
      atUtc: item.nextAttemptAtUtc && Date.parse(item.nextAttemptAtUtc) > Date.parse(item.dueAtUtc) ? item.nextAttemptAtUtc : item.dueAtUtc,
    }));
    scheduledItems.sort((a, b) => Date.parse(a.atUtc) - Date.parse(b.atUtc) || a.item.businessDate.localeCompare(b.item.businessDate));
    return {
      d1ReconciliationQueue: normalizedQueue,
      d1ReconciliationPendingDate: scheduledItems[0]?.item.businessDate || normalizedQueue[0]?.businessDate || null,
      d1ReconciliationPendingCount: normalizedQueue.length,
      d1ReconciliationNextAtUtc: scheduledItems[0]?.atUtc || null,
      d1ReconciliationBlocked: blockedItems.length > 0,
      d1ReconciliationBlockedDate: blockedItems[0]?.businessDate || null,
      dueItem: scheduledItems.find(entry => Date.parse(entry.atUtc) <= now().getTime())?.item || null,
    };
  }

  function queueD1Reconciliation(businessDate, completedAtUtc) {
    const completedAt = Date.parse(completedAtUtc);
    if (!validIsoDate(businessDate) || businessDate !== currentD1Date() || !Number.isFinite(completedAt)) {
      return d1ReconciliationState(status.d1ReconciliationQueue);
    }
    const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue)
      .filter(item => item.businessDate !== businessDate);
    queue.push({
      businessDate,
      dueAtUtc: new Date(completedAt + D1_RECONCILIATION_DELAY_MS).toISOString(),
      nextAttemptAtUtc: null,
      attemptCount: 0,
    });
    return d1ReconciliationState(queue);
  }

  function isD1Due(directorySavedAtUtc, targetDate, backfill = d1BackfillState(targetDate)) {
    if (!targetDate || backfill.d1BackfillBlocked) return false;
    const retryAt = Date.parse(status.nextD1AttemptAtUtc || '');
    const retryPending = status.lastD1AttemptDirectorySavedAtUtc === directorySavedAtUtc
      && Number.isFinite(retryAt) && now().getTime() < retryAt;
    return saoPauloHour(now()) >= D1_START_HOUR_SAO_PAULO
      && !retryPending;
  }

  async function collectAndSave(period, accounts, directorySavedAtUtc, signal, d1BusinessDate = null, executionPass = 'initial', { triggerReason = null, triggerAccountCount = 0, manualRun = false } = {}) {
    const isD1 = period === 'D-1';
    const businessDate = isD1 ? (d1BusinessDate || currentD1Date()) : null;
    const reports = new Array(accounts.length);
    const failures = [];
    const todayByAccount = {};
    const dateFromByAccount = {};
    let nextIndex = 0;
    let completed = 0;

    publish({
      state: 'running',
      operation: period,
      phase: 'Consultando métricas e inventário',
      startedAtUtc: now().toISOString(),
      completedAccounts: 0,
      totalAccounts: accounts.length,
      lastError: '',
    });

    const worker = async () => {
      while (nextIndex < accounts.length) {
        if (signal.aborted || (!manualRun && !isEnabled())) throw new DOMException('Atualização automática interrompida.', 'AbortError');
        const index = nextIndex++;
        const account = accounts[index];
        let reportResponseReceived = false;
        try {
          if (!validAccount(account)) throw autoUpdateError('account_directory_invalid', 'O diretório contém uma conta sem ID, moeda ou fuso válido. Atualize a lista de MCCs e contas.');
          const today = localDateInTimeZone(now(), account.timeZone);
          const reportDate = isD1 ? businessDate : today;
          todayByAccount[account.customerId] = today;
          dateFromByAccount[account.customerId] = reportDate;

          const useAccountMetadataContext = !manualRun && !isD1;
          const rememberAccountMetadataContext = response => {
            if (!useAccountMetadataContext || !response || response.customer_id !== account.customerId
                || (response.manager_customer_id || null) !== (account.managerCustomerId || null)
                || response.currency_code !== account.currencyCode || response.time_zone !== account.timeZone) return response;
            if (response.date_from != null && (response.date_from !== reportDate || response.date_to !== reportDate)) return response;
            const token = response.account_metadata_context_token;
            if (typeof token === 'string' && saveGoogleAdsAccountMetadataContextToken({
              customerId: account.customerId,
              managerCustomerId: account.managerCustomerId,
              accountMetadataContextToken: token,
            })) account.accountMetadataContextToken = token;
            return response;
          };
          const reportRequest = isD1
            ? fetchGoogleAdsSaoPauloDayReport({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, businessDate }, { signal })
            : fetchGoogleAdsDailyReport({
              managerCustomerId: account.managerCustomerId,
              customerId: account.customerId,
              dateFrom: reportDate,
              dateTo: reportDate,
              accountMetadataContextToken: useAccountMetadataContext ? account.accountMetadataContextToken || null : null,
              accountMetadataContextDate: useAccountMetadataContext ? reportDate : null,
            }, { signal }).then(rememberAccountMetadataContext);
          const configurationRequest = executionPass === 'reconciliation'
            ? Promise.resolve(null)
            : fetchGoogleAdsConfiguration({
              ...account,
              accountMetadataContextDate: useAccountMetadataContext ? reportDate : null,
            }, { signal }).then(rememberAccountMetadataContext);
          const [payload, configurationPayload] = await Promise.all([reportRequest, configurationRequest]);
          reportResponseReceived = true;
          const report = normalizeGoogleAdsDailyReport({
            ...payload,
            currency_code: payload.currency_code || account.currencyCode,
            time_zone: payload.time_zone || account.timeZone,
          });
          const configuration = configurationPayload ? normalizeGoogleAdsConfiguration(configurationPayload) : null;

          if (!isReportForAccount(report, account)) throw autoUpdateError('response_account_mismatch', 'A resposta não corresponde à MCC, conta, moeda e fuso do diretório conectado.');
          if (report.dateFrom !== reportDate || report.dateTo !== reportDate || report.queryComplete !== true) {
            throw autoUpdateError('response_incomplete', `A consulta não confirmou o dia completo ${reportDate}.`);
          }
          if (report.campaignStatusFilter !== 'ALL') throw autoUpdateError('response_scope_mismatch', 'A API não confirmou a consulta de todas as campanhas.');
          if (isD1 && (report.businessTimeZone !== 'America/Sao_Paulo' || report.businessDate !== businessDate)) {
            throw autoUpdateError('response_business_date_mismatch', `A consulta não confirmou o dia completo de São Paulo (${businessDate}).`);
          }
          if (executionPass !== 'reconciliation' && (configuration?.complete !== true
              || configuration.customerId !== account.customerId
              || (configuration.managerCustomerId || null) !== (account.managerCustomerId || null)
              || configuration.currencyCode !== report.currencyCode
              || configuration.currencyCode !== account.currencyCode
              || configuration.timeZone !== report.timeZone
              || configuration.timeZone !== account.timeZone)) {
            throw autoUpdateError('configuration_mismatch', 'O inventário de campanhas não corresponde à conta, MCC, moeda e fuso consultados.');
          }

          reports[index] = {
            ...report,
            ...(configuration ? { configuration } : {}),
            activeCampaignsOnly: false,
            accountName: account.name,
            managerName: account.managerName,
            managerCustomerId: account.managerCustomerId,
          };
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          failures.push(autoUpdateFailureSample(error, account, reportResponseReceived));
        } finally {
          completed += 1;
          publish({
            state: 'running',
            operation: period,
            phase: `Consultando contas · ${completed}/${accounts.length}`,
            completedAccounts: completed,
            totalAccounts: accounts.length,
          });
        }
      }
    };

    const workers = Math.min(MAX_ACCOUNT_CONCURRENCY, accounts.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (failures.length) {
      const error = autoUpdateError('report_coverage_incomplete', `${failures.length} conta(s) falharam; o lote completo não foi gravado.`);
      error.failureInfo = { schemaVersion: 1, failureCount: failures.length, samples: failures.slice(0, 3) };
      throw error;
    }
    if (reports.length !== accounts.length || reports.some(report => !report)) throw autoUpdateError('report_coverage_incomplete', 'A consulta não cobriu todas as contas; nenhum dado foi gravado.');
    if (isD1 && businessDate > currentD1Date()) throw autoUpdateError('business_date_not_closed', 'A consulta D−1 ficou à frente do último dia fechado em São Paulo; nenhum dado foi gravado.');
    if (!isD1 && accounts.some(account => localDateInTimeZone(now(), account.timeZone) !== todayByAccount[account.customerId])) {
      throw autoUpdateError('day_rolled_during_query', 'Virou o dia local de uma conta durante a consulta; nenhum dado foi gravado.');
    }

    if (signal.aborted || (!manualRun && !isEnabled())) throw new DOMException('Atualização automática interrompida antes da gravação.', 'AbortError');
    if (getSourceMode() !== 'api') throw new Error('A fonte operacional do perfil mudou para Manifesto MCC durante a consulta; nenhum dado foi gravado.');
    publish({ state: 'running', operation: period, phase: 'Gravando lote completo no banco local', completedAccounts: accounts.length, totalAccounts: accounts.length });
    let saved;
    try {
      saved = await saveCaptures(reports, todayByAccount, dateFromByAccount, {
        businessDate: isD1 ? businessDate : null,
        businessDayCapture: isD1,
        activeCampaignsOnly: false,
        executionMode: 'automatic',
        executionPass,
        triggerReason,
        triggerAccountCount,
        refreshOverview: false,
        directorySavedAtUtc,
      });
    } catch {
      throw autoUpdateError('local_capture_write_failed', 'A captura validada não pôde ser salva na base local.');
    }
    const history = Array.isArray(saved?.base?.google_ads_api_change_history) ? saved.base.google_ads_api_change_history : [];
    const historyEntry = [...history].reverse().find(item => item?.executionMode === 'automatic' && item?.periodType === period && (item?.executionPass || 'initial') === executionPass && (period !== 'D-1' || !businessDate || item?.dateTo === businessDate) && (item?.triggerReason || null) === triggerReason);
    const completedAtUtc = historyEntry?.completedAtUtc || now().toISOString();
    const run = {
      completedAtUtc,
      date: isD1 ? businessDate : null,
      datesByAccount: reports.map(report => ({ customerId: report.customerId, managerCustomerId: report.managerCustomerId || null, currencyCode: report.currencyCode, date: report.dateTo, timeZone: report.timeZone })),
      accountCount: accounts.length,
      managerCount: new Set(accounts.map(account => account.managerCustomerId || 'direct')).size,
      savedRows: Number(saved?.savedRows) || 0,
      diffRowCount: Number(historyEntry?.diffRowCount) || 0,
      changedFieldCount: Number(historyEntry?.changedFieldCount) || 0,
      directorySavedAtUtc,
      durationMs: Math.max(0, now().getTime() - Date.parse(status.startedAtUtc || completedAtUtc)),
    };
    return { run, saved };
  }

  async function executeDueOperations({ manualRun = false } = {}) {
    if (!manualRun && !isEnabled()) return { savedCount: 0, savedOperations: [], failures: [] };
    if (getSourceMode() !== 'api') {
      publish({ state: 'paused', phase: 'Pausada · fonte operacional deste perfil está no Manifesto MCC', operation: null });
      return { savedCount: 0, savedOperations: [], failures: ['Ative Google Ads API como fonte operacional neste perfil antes de executar a atualização.'] };
    }
    if (!supportsLocks()) {
      publish({ state: 'unsupported', phase: 'Atualização automática indisponível neste navegador; a trava contra duplicidade não está disponível.' });
      return { savedCount: 0, savedOperations: [], failures: ['A atualização exige um navegador com trava contra execuções duplicadas.'] };
    }

    const directoryCache = loadGoogleAdsAccountsCache();
    const accounts = directoryCache?.accounts?.accounts || [];
    const directorySavedAtUtc = directoryCache?.savedAtUtc || '';
    if (!accounts.length || !directorySavedAtUtc || directoryCache.accounts.warningCount) {
      const error = !accounts.length
        ? 'Atualize a lista de MCCs e contas conectadas antes de iniciar a rotina automática.'
        : 'O diretório contém avisos. Atualize e confira todas as MCCs e contas antes da captura automática.';
      const retryAt = new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
      publish({ state: 'blocked', phase: 'Aguardando diretório válido', lastError: error, lastD0AttemptDirectorySavedAtUtc: directorySavedAtUtc, lastD1AttemptDirectorySavedAtUtc: directorySavedAtUtc, nextD0AttemptAtUtc: retryAt, nextD0ScheduleType: 'retry', nextD1AttemptAtUtc: retryAt });
      return { savedCount: 0, savedOperations: [], failures: [error] };
    }

    const currentStatus = readGoogleAdsAutoUpdateStatus();
    status = { ...status, ...currentStatus };
    const d0DirectoryChanged = status.lastD0?.directorySavedAtUtc !== directorySavedAtUtc;
    const nextD0At = Date.parse(status.nextD0AttemptAtUtc || '');
    const d0RetryPending = status.lastD0AttemptDirectorySavedAtUtc === directorySavedAtUtc
      && Number.isFinite(nextD0At) && now().getTime() < nextD0At;
    const d0ChangedAccounts = d0DirectoryChanged ? accountsMissingFromRun(status.lastD0, accounts) : [];
    const d0ChangedIds = new Set(d0ChangedAccounts.map(account => String(account.customerId)));
    const d0ExistingCoverageStale = d0DirectoryChanged && accounts.some(account => !d0ChangedIds.has(String(account.customerId))
      && !accountRunDateIsCurrent(new Map((status.lastD0?.datesByAccount || []).map(item => [String(item.customerId), item])).get(String(account.customerId)), account));
    const d0ScheduledDue = !Number.isFinite(nextD0At) || now().getTime() >= nextD0At;
    const d0FullDue = !status.lastD0 || d0ScheduledDue || d0ExistingCoverageStale
      || (!d0DirectoryChanged && !recentRunMatchesDirectory(status.lastD0, accounts, directorySavedAtUtc));
    const d0Due = manualRun || (!d0RetryPending && (d0FullDue || (d0DirectoryChanged && d0ChangedAccounts.length > 0)));
    const d0ScopedToDirectoryChanges = !manualRun && d0Due && d0DirectoryChanged && !d0FullDue && d0ChangedAccounts.length > 0;
    const d0AccountsToCapture = d0ScopedToDirectoryChanges ? d0ChangedAccounts : accounts;
    if (d0DirectoryChanged && !d0Due && d0ChangedAccounts.length === 0 && status.lastD0) {
      status.lastD0 = { ...status.lastD0, accountCount: accounts.length, managerCount: new Set(accounts.map(account => account.managerCustomerId || 'direct')).size, directorySavedAtUtc };
    }

    let pendingD1Date = nextD1Date(directorySavedAtUtc);
    let pendingD1State = d1BackfillState(pendingD1Date);
    const d1DirectoryChanged = status.lastD1?.directorySavedAtUtc !== directorySavedAtUtc;
    let d1ChangedAccounts = d1DirectoryChanged && status.lastD1?.date === pendingD1Date
      ? accountsMissingFromRun(status.lastD1, accounts, pendingD1Date)
      : accounts;
    if (d1DirectoryChanged && status.lastD1?.date === pendingD1Date && d1ChangedAccounts.length === 0 && status.lastD1) {
      status.lastD1 = { ...status.lastD1, accountCount: accounts.length, managerCount: new Set(accounts.map(account => account.managerCustomerId || 'direct')).size, directorySavedAtUtc };
      pendingD1Date = nextD1Date(directorySavedAtUtc);
      pendingD1State = d1BackfillState(pendingD1Date);
      d1ChangedAccounts = accounts;
    }
    const d1Due = isD1Due(directorySavedAtUtc, pendingD1Date, pendingD1State);
    const d1ScopedToDirectoryChanges = d1Due && d1DirectoryChanged && status.lastD1?.date === pendingD1Date && d1ChangedAccounts.length > 0;
    const d1AccountsToCapture = d1ScopedToDirectoryChanges ? d1ChangedAccounts : accounts;
    const reconciliationState = d1ReconciliationState();
    const d1ReconciliationEnabled = isD1ReviewEnabled();
    const reconciliationDue = d1ReconciliationEnabled && !pendingD1Date && !d1Due ? reconciliationState.dueItem : null;
    const reconciliationPaused = !d1ReconciliationEnabled && reconciliationState.d1ReconciliationPendingCount > 0;
    if (!d0Due && !d1Due && !reconciliationDue) {
      const blockedMessage = pendingD1State.d1BackfillBlocked
        ? 'Há um fechamento D−1 pendente fora da janela automática de recuperação de 14 dias.'
        : reconciliationState.d1ReconciliationBlocked
          ? `Há uma revisão D−1 pendente fora da janela de 14 dias (${reconciliationState.d1ReconciliationBlockedDate}).`
          : '';
      publish({
        ...reconciliationState,
        state: pendingD1State.d1BackfillBlocked || reconciliationState.d1ReconciliationBlocked ? 'blocked' : 'waiting',
        phase: blockedMessage || (reconciliationPaused ? 'Revisão D−1 pausada nas configurações' : pendingD1State.pendingD1Date ? 'Aguardando a próxima data D−1 pendente' : reconciliationState.d1ReconciliationPendingDate ? 'Aguardando a revisão automática de D−1' : 'Próxima verificação automática programada'),
        operation: null,
        lastError: blockedMessage,
        ...pendingD1State,
      });
      return { savedCount: 0, savedOperations: [], failures: [] };
    }

    const operations = [];
    if (d1Due) operations.push({ period: 'D-1', businessDate: pendingD1Date, executionPass: 'initial', accounts: d1AccountsToCapture, triggerReason: d1ScopedToDirectoryChanges ? 'account_directory_change' : null, triggerAccountCount: d1ScopedToDirectoryChanges ? d1ChangedAccounts.length : 0 });
    else if (reconciliationDue) operations.push({ period: 'D-1', businessDate: reconciliationDue.businessDate, executionPass: 'reconciliation', accounts });
    if (d0Due) operations.push({ period: 'D0', businessDate: null, accounts: d0AccountsToCapture, triggerReason: d0DirectoryChanged && d0ChangedAccounts.length ? 'account_directory_change' : null, triggerAccountCount: d0DirectoryChanged ? d0ChangedAccounts.length : 0, preserveNextD0AtUtc: d0ScopedToDirectoryChanges ? status.nextD0AttemptAtUtc : null, preserveNextD0IntervalMinutes: d0ScopedToDirectoryChanges ? readGoogleAdsAutoUpdateIntervalMinutes(storage) : null });
    if (operations.some(item => item.executionPass !== 'reconciliation')) {
      try {
        const accountsToRefresh = [...new Map(operations.filter(item => item.executionPass !== 'reconciliation').flatMap(item => item.accounts || accounts).map(account => [String(account.customerId), account])).values()];
        const cacheResult = await refreshFinalUrlCache(accountsToRefresh);
        status.lastFinalUrlHostCacheAttemptAtUtc = now().toISOString();
        status.lastFinalUrlHostCacheError = cacheResult?.failures?.slice?.(0, 3).join(' · ') || '';
        status.lastFinalUrlHostCacheRefreshedAtUtc = cacheResult?.refreshedAccounts?.length ? now().toISOString() : (status.lastFinalUrlHostCacheRefreshedAtUtc || null);
      } catch (error) {
        status.lastFinalUrlHostCacheAttemptAtUtc = now().toISOString();
        status.lastFinalUrlHostCacheError = String(error?.message || 'Falha ao atualizar destinos finais.').slice(0, 500);
      }
    }
    let savedCount = 0;
    const savedOperations = [];
    const failures = [];
    for (const operationItem of operations) {
      const operation = operationItem.period;
      const businessDate = operationItem.businessDate;
      const executionPass = operationItem.executionPass || 'initial';
      const operationAccounts = operationItem.accounts || accounts;
      if ((!manualRun && !isEnabled()) || getSourceMode() !== 'api') break;
      if (executionPass === 'reconciliation' && !isD1ReviewEnabled()) continue;
      const startedAt = now();
      const attemptRetryAt = new Date(startedAt.getTime() + RETRY_INTERVAL_MS).toISOString();
      if (operation === 'D-1' && executionPass === 'reconciliation') {
        const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue).map(item => item.businessDate === businessDate
          ? { ...item, attemptCount: Math.min(100, item.attemptCount + 1), nextAttemptAtUtc: null }
          : item);
        Object.assign(status, d1ReconciliationState(queue));
      } else if (operation === 'D-1') {
        status.lastD1AttemptDirectorySavedAtUtc = directorySavedAtUtc;
        status.lastD1AttemptBusinessDate = businessDate;
        status.nextD1AttemptAtUtc = attemptRetryAt;
        status.pendingD1Date = businessDate;
        status.pendingD1Count = pendingD1State.pendingD1Count;
        status.d1BackfillBlocked = false;
      } else {
        status.lastD0AttemptDirectorySavedAtUtc = directorySavedAtUtc;
        status.nextD0AttemptAtUtc = attemptRetryAt;
        status.nextD0ScheduleType = 'retry';
      }
      publish({ state: 'running', operation, phase: executionPass === 'reconciliation' ? 'Preparando revisão de métricas' : 'Preparando consulta', lastError: '', d1ReconciliationRunning: executionPass === 'reconciliation', ...(operation === 'D-1' ? { pendingD1Date: businessDate } : {}), ...d1ReconciliationState(status.d1ReconciliationQueue) });
      activeController = new AbortController();
      const timeout = setTimeout(() => activeController?.abort(), 15 * 60 * 1000);
      try {
        const { run } = await collectAndSave(operation, operationAccounts, directorySavedAtUtc, activeController.signal, businessDate, executionPass, { ...operationItem, manualRun });
        if (operation === 'D-1' && executionPass === 'reconciliation') {
          const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue).filter(item => item.businessDate !== businessDate);
          status.lastD1Reconciliation = run;
          Object.assign(status, d1ReconciliationState(queue));
        } else if (operation === 'D-1') {
          status.lastD1 = mergeAutoUpdateRunCoverage(status.lastD1, run, accounts, directorySavedAtUtc);
          Object.assign(status, queueD1Reconciliation(businessDate, run.completedAtUtc));
          const nextDate = nextD1Date(directorySavedAtUtc);
          const nextState = d1BackfillState(nextDate);
          status.pendingD1Date = nextState.pendingD1Date;
          status.pendingD1Count = nextState.pendingD1Count;
          status.d1BackfillBlocked = nextState.d1BackfillBlocked;
          status.nextD1AttemptAtUtc = nextDate && !nextState.d1BackfillBlocked
            ? new Date(now().getTime() + D1_BACKFILL_STEP_INTERVAL_MS).toISOString()
            : null;
        } else {
          status.lastD0 = mergeAutoUpdateRunCoverage(status.lastD0, run, accounts, directorySavedAtUtc);
          const intervalMinutes = readGoogleAdsAutoUpdateIntervalMinutes(storage);
          const canPreserveSchedule = operationItem.preserveNextD0AtUtc
            && operationItem.preserveNextD0IntervalMinutes === intervalMinutes;
          status.nextD0AttemptAtUtc = canPreserveSchedule
            ? operationItem.preserveNextD0AtUtc
            : nextD0IntervalAtUtc(status.lastD0, intervalMinutes, now());
          status.nextD0ScheduleType = 'interval';
        }
        savedCount += 1;
        savedOperations.push({ period: operation, executionPass });
        publish({ state: 'running', operation, phase: executionPass === 'reconciliation' ? 'Revisão gravada' : 'Captura gravada', lastError: '', d1ReconciliationRunning: false, ...d1ReconciliationState(status.d1ReconciliationQueue) });
      } catch (error) {
        const disabled = !manualRun && !isEnabled();
        const sourceChanged = getSourceMode() !== 'api';
        const reviewDisabled = operation === 'D-1' && executionPass === 'reconciliation' && !isD1ReviewEnabled();
        const cancelled = disabled || sourceChanged || reviewDisabled;
        const failureInfo = cancelled ? null : {
          ...buildAutoUpdateFailureInfo(error),
          ...(operationItem.triggerReason === 'account_directory_change' ? {
            triggerReason: 'account_directory_change',
            triggerAccountCount: operationItem.triggerAccountCount,
            attemptedAccountCount: operationAccounts.length,
          } : {}),
        };
        const message = disabled
          ? 'A rotina foi desativada; a consulta em andamento foi interrompida antes de gravar.'
          : sourceChanged
            ? 'A fonte operacional mudou para Manifesto MCC; a tentativa foi interrompida antes de gravar.'
            : reviewDisabled
              ? 'A revisão automática D−1 foi pausada; a tentativa foi interrompida antes de gravar.'
            : summarizeAutoUpdateFailure(failureInfo);
        if (!cancelled) {
          let failureHistorySaved = true;
          try { await recordFailure?.(operation, now().toISOString(), businessDate, executionPass, failureInfo, operationItem.triggerReason, operationItem.triggerAccountCount); } catch { failureHistorySaved = false; }
          failures.push(`${operation}${executionPass === 'reconciliation' ? ' revisão' : ''}: ${message}${failureHistorySaved ? '' : ' O registro da tentativa no histórico não pôde ser salvo.'}`);
        }
        if (operation === 'D-1' && executionPass === 'reconciliation') {
          const retryAt = cancelled ? null : new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
          const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue).map(item => item.businessDate === businessDate ? { ...item, nextAttemptAtUtc: retryAt } : item);
          Object.assign(status, d1ReconciliationState(queue));
        } else if (operation === 'D-1' && executionPass === 'initial') status.nextD1AttemptAtUtc = new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
        else if (operation === 'D0') {
          status.nextD0AttemptAtUtc = new Date(now().getTime() + autoUpdateD0RetryIntervalMs(failureInfo, storage)).toISOString();
          status.nextD0ScheduleType = 'retry';
        }
        publish({ state: disabled ? 'disabled' : sourceChanged ? 'paused' : reviewDisabled ? 'waiting' : 'failed', operation: reviewDisabled ? null : operation, phase: cancelled ? message : executionPass === 'reconciliation' ? 'A revisão não foi gravada' : 'A captura não foi gravada', lastError: cancelled ? '' : message, lastAttemptAtUtc: startedAt.toISOString(), d1ReconciliationRunning: false, ...d1ReconciliationState(status.d1ReconciliationQueue), ...(operation === 'D-1' && executionPass === 'initial' ? { pendingD1Date: businessDate, pendingD1Count: pendingD1State.pendingD1Count, d1BackfillBlocked: false } : {}) });
      } finally {
        clearTimeout(timeout);
        activeController = null;
      }
    }
    if (savedCount && (manualRun || isEnabled())) {
      try { await onBatchSaved({ operations: savedOperations, savedCount }); }
      catch (error) { failures.push(`Atualização da Visão Geral: ${String(error?.message || 'Falha ao atualizar a tela.').slice(0, 500)}`); }
    }
    const remainingD1Date = nextD1Date(directorySavedAtUtc);
    const remainingD1State = d1BackfillState(remainingD1Date);
    const remainingReconciliationState = d1ReconciliationState();
    const remainingReviewPaused = !isD1ReviewEnabled() && remainingReconciliationState.d1ReconciliationPendingCount > 0;
    publish({
      ...remainingReconciliationState,
      state: failures.length ? 'failed' : !isEnabled() ? 'disabled' : getSourceMode() !== 'api' ? 'paused' : remainingD1State.d1BackfillBlocked || remainingReconciliationState.d1ReconciliationBlocked ? 'blocked' : 'waiting',
      operation: null,
      d1ReconciliationRunning: false,
      phase: failures.length ? 'Há uma falha para revisar' : !isEnabled() ? (manualRun ? 'Execução manual concluída · rotina automática desativada' : 'Desativada') : getSourceMode() !== 'api' ? 'Pausada · fonte operacional deste perfil está no Manifesto MCC' : remainingD1State.d1BackfillBlocked ? 'Há datas D−1 pendentes fora da janela automática de recuperação' : remainingD1State.pendingD1Date ? 'Aguardando a próxima data D−1 pendente' : remainingReconciliationState.d1ReconciliationBlocked ? 'Há revisões D−1 pendentes fora da janela automática' : remainingReviewPaused ? 'Revisão D−1 pausada nas configurações' : remainingReconciliationState.d1ReconciliationPendingDate ? 'Aguardando a revisão automática de D−1' : 'Próxima verificação automática programada',
      lastError: (failures.length ? failures.join(' · ') : remainingD1State.d1BackfillBlocked ? 'Há um fechamento D−1 pendente fora da janela automática de recuperação de 14 dias.' : remainingReconciliationState.d1ReconciliationBlocked ? `Há uma revisão D−1 pendente fora da janela de 14 dias (${remainingReconciliationState.d1ReconciliationBlockedDate}).` : '').slice(0, 700),
      ...remainingD1State,
      lastCycleCompletedAtUtc: now().toISOString(),
    });
    return { savedCount, savedOperations, failures };
  }

  async function runNow() {
    if (getSourceMode() !== 'api') throw new Error('Ative Google Ads API como fonte operacional neste perfil antes de executar a atualização.');
    if (!supportsLocks()) throw new Error('A atualização exige um navegador com trava contra execuções duplicadas.');
    let acquired = false;
    let result = null;
    try {
      await navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) return;
        acquired = true;
        result = await executeDueOperations({ manualRun: true });
      });
    } catch (error) {
      publish({ state: 'failed', phase: 'Falha ao iniciar a atualização manual', lastError: String(error?.message || 'Não foi possível iniciar a atualização agora.').slice(0, 700) });
      throw error;
    }
    if (!acquired) return { started: false, busy: true, savedCount: 0, savedOperations: [], failures: [] };
    if (!result?.savedCount && result?.failures?.length) throw new Error(result.failures.join(' · '));
    if (!result?.savedCount) throw new Error(status.lastError || 'A atualização terminou sem gravar uma captura. Confira a fonte operacional e o diretório de contas.');
    return { started: true, ...result, status: { ...status } };
  }

  async function tick() {
    if (!started) return;
    if (!isEnabled()) {
      if (status.state !== 'disabled') publish({ state: 'disabled', phase: 'Desativada', operation: null, lastError: '' });
      clearTimeout(timer);
      return;
    }
    if (!supportsLocks()) {
      publish({ state: 'unsupported', phase: 'Atualização automática indisponível neste navegador; a trava contra duplicidade não está disponível.' });
      scheduleNextCheck();
      return;
    }
    try {
      await navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock || !isEnabled()) return;
        await executeDueOperations();
      });
    } catch (error) {
      publish({ state: 'failed', phase: 'Falha na rotina automática', lastError: String(error?.message || 'Não foi possível iniciar a atualização automática.').slice(0, 700) });
    } finally {
      if (isEnabled()) scheduleNextCheck();
      else clearTimeout(timer);
    }
  }

  function setEnabled(enabled) {
    const value = enabled === true;
    if (!storage) throw new Error('O armazenamento local deste perfil não está disponível.');
    try { storage?.setItem(GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY, String(value)); }
    catch { throw new Error('Não foi possível salvar a preferência de atualização automática neste perfil do navegador.'); }
    if (!value) activeController?.abort();
    publish({ state: value ? 'waiting' : 'disabled', phase: value ? 'Preparando a primeira consulta' : 'Desativada', operation: null, lastError: '' });
    if (value) void tick();
    else clearTimeout(timer);
    return { ...status };
  }

  function setIntervalMinutes(value) {
    const intervalMinutes = Number(value);
    if (!GOOGLE_ADS_AUTO_UPDATE_INTERVAL_OPTIONS.includes(intervalMinutes)) {
      throw new Error('Selecione um intervalo disponível para a captura D0.');
    }
    if (!storage) throw new Error('O armazenamento local deste perfil não está disponível.');
    const previousInterval = readGoogleAdsAutoUpdateIntervalMinutes(storage);
    status = { ...status, ...readGoogleAdsAutoUpdateStatus(storage) };
    try { storage.setItem(GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY, String(intervalMinutes)); }
    catch { throw new Error('Não foi possível salvar o intervalo neste perfil do navegador.'); }
    if (previousInterval === intervalMinutes && status.intervalMinutes === intervalMinutes) {
      return { ...publish({ intervalMinutes }) };
    }
    const pendingRetry = hasPendingD0Retry(status, now().getTime());
    const enabled = readGoogleAdsAutoUpdateEnabled(storage);
    const nextD0AttemptAtUtc = pendingRetry
      ? status.nextD0AttemptAtUtc
      : status.lastD0?.completedAtUtc
        ? nextD0IntervalAtUtc(status.lastD0, intervalMinutes, now())
        : enabled
          ? nextD0IntervalAtUtc(null, intervalMinutes, now())
          : null;
    const nextD0ScheduleType = pendingRetry ? 'retry' : nextD0AttemptAtUtc ? 'interval' : null;
    return { ...publish({ intervalMinutes, nextD0AttemptAtUtc, nextD0ScheduleType }) };
  }

  function setHttp502RetryIntervalMinutes(value) {
    const intervalMinutes = Number(value);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < MIN_HTTP_502_RETRY_INTERVAL_MINUTES || intervalMinutes > MAX_HTTP_502_RETRY_INTERVAL_MINUTES) {
      throw new Error('Informe um intervalo inteiro entre 5 minutos e 24 horas para retentativas após HTTP 502.');
    }
    if (!storage) throw new Error('O armazenamento local deste perfil não está disponível.');
    try { storage.setItem(GOOGLE_ADS_AUTO_UPDATE_HTTP_502_RETRY_INTERVAL_KEY, String(intervalMinutes)); }
    catch { throw new Error('Não foi possível salvar o intervalo de retentativa neste perfil do navegador.'); }
    return { ...publish({ http502RetryIntervalMinutes: intervalMinutes }) };
  }

  function reconcileD0IntervalSchedule() {
    status = { ...status, ...readGoogleAdsAutoUpdateStatus(storage) };
    if (status.nextD0ScheduleType || !status.lastD0?.completedAtUtc) return;
    if (hasPendingD0Retry(status, now().getTime())) return;
    publish({
      nextD0AttemptAtUtc: nextD0IntervalAtUtc(status.lastD0, readGoogleAdsAutoUpdateIntervalMinutes(storage), now()),
      nextD0ScheduleType: 'interval',
    });
  }

  function wake() {
    if (isEnabled()) void tick();
  }

  function start() {
    if (started) return;
    started = true;
    reconcileD0IntervalSchedule();
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('hub-google-ads-auto-update');
      channel.onmessage = event => {
        if (event.data?.type === 'status' && event.data.status?.schemaVersion === 1) {
          status = event.data.status;
          notify();
        }
      };
    }
    globalThis.addEventListener?.('storage', event => {
      if ([GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY, GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY, GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY, GOOGLE_ADS_AUTO_UPDATE_HTTP_502_RETRY_INTERVAL_KEY, GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_ENABLED_KEY].includes(event.key)) {
        refreshStatus();
        if (event.key === GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_ENABLED_KEY) {
          const enabled = isD1ReviewEnabled();
          if (!enabled && status.d1ReconciliationRunning) activeController?.abort();
          if (enabled) wake();
        }
        if (event.key === GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY) wake();
      }
    });
    document.addEventListener(GOOGLE_ADS_AUTO_UPDATE_D1_REVIEW_SETTING_CHANGED_EVENT, () => {
      const enabled = isD1ReviewEnabled();
      const wasRunningReview = status.d1ReconciliationRunning === true;
      if (!enabled && wasRunningReview) activeController?.abort();
      publish({
        d1ReconciliationEnabled: enabled,
        ...(wasRunningReview && !enabled ? {
          state: isEnabled() ? 'waiting' : 'disabled',
          phase: 'Revisão D−1 pausada nas configurações',
          operation: null,
          d1ReconciliationRunning: false,
        } : {}),
      });
      if (enabled) wake();
    });
    document.addEventListener('google-ads-source-mode-changed', wake);
    publish({ state: isEnabled() ? 'waiting' : 'disabled', phase: isEnabled() ? 'Preparando a primeira consulta' : 'Desativada', supported: supportsLocks() });
    if (isEnabled()) { void tick(); scheduleNextCheck(); }
  }

  return { start, setEnabled, setIntervalMinutes, setHttp502RetryIntervalMinutes, wake, runNow, getStatus: () => ({ ...status, http502RetryIntervalMinutes: readGoogleAdsAutoUpdateHttp502RetryIntervalMinutes(storage) }) };
}
