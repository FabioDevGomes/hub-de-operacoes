import { fetchGoogleAdsConfiguration, fetchGoogleAdsDailyReport, fetchGoogleAdsSaoPauloDayReport } from './google-ads-service.mjs?v=13';
import { normalizeGoogleAdsDailyReport } from './google-ads-domain.mjs?v=6';
import { normalizeGoogleAdsConfiguration } from './google-ads-config-domain.mjs?v=1';
import { loadGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=2';
import { syncGoogleAdsFinalUrlHostCache } from './google-ads-final-url-host-cache.mjs?v=1';

export const GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY = 'hub.google-ads-auto-update:enabled:v1';
export const GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY = 'hub.google-ads-auto-update:status:v1';
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY = 'hub.google-ads-auto-update:interval-minutes:v1';
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export const GOOGLE_ADS_AUTO_UPDATE_INTERVAL_OPTIONS = Object.freeze([30, 40, 50, 60, 70, 80, 120, 240, 360, 720, 1440]);

const DEFAULT_INTERVAL_MINUTES = 60;

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

export function readGoogleAdsAutoUpdateStatus(storage = safeStorage()) {
  const value = readJson(GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY, null, storage);
  return value && value.schemaVersion === 1 ? {
    ...value,
    enabled: readGoogleAdsAutoUpdateEnabled(storage),
    intervalMinutes: readGoogleAdsAutoUpdateIntervalMinutes(storage),
  } : {
    schemaVersion: 1,
    enabled: readGoogleAdsAutoUpdateEnabled(storage),
    intervalMinutes: readGoogleAdsAutoUpdateIntervalMinutes(storage),
    state: readGoogleAdsAutoUpdateEnabled(storage) ? 'waiting' : 'disabled',
    lastD0: null,
    lastD1: null,
  };
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

function accountLabel(account) {
  return String(account?.name || account?.customerId || 'Conta Google Ads').slice(0, 120);
}

function isReportForAccount(report, account) {
  return report.customerId === String(account.customerId)
    && (report.managerCustomerId || null) === (account.managerCustomerId || null)
    && report.currencyCode === account.currencyCode
    && report.timeZone === account.timeZone;
}

function recentRunMatchesDirectory(run, accounts, directorySavedAtUtc) {
  if (!run || run.accountCount !== accounts.length || run.directorySavedAtUtc !== directorySavedAtUtc) return false;
  const datesByAccount = new Map((run.datesByAccount || []).map(item => [String(item.customerId), item]));
  return accounts.every(account => {
    const captured = datesByAccount.get(String(account.customerId));
    return captured?.date === localDateInTimeZone(new Date(), account.timeZone)
      && captured?.timeZone === account.timeZone;
  });
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
  return [...byDate.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate)).slice(-D1_BACKFILL_MAX_DAYS);
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

  async function collectAndSave(period, accounts, directorySavedAtUtc, signal, d1BusinessDate = null, executionPass = 'initial') {
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
        if (signal.aborted || !isEnabled()) throw new DOMException('Atualização automática interrompida.', 'AbortError');
        const index = nextIndex++;
        const account = accounts[index];
        try {
          if (!validAccount(account)) throw new Error('O diretório contém uma conta sem ID, moeda ou fuso válido. Atualize a lista de MCCs e contas.');
          const today = localDateInTimeZone(now(), account.timeZone);
          const reportDate = isD1 ? businessDate : today;
          todayByAccount[account.customerId] = today;
          dateFromByAccount[account.customerId] = reportDate;

          const reportRequest = isD1
            ? fetchGoogleAdsSaoPauloDayReport({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, businessDate }, { signal })
            : fetchGoogleAdsDailyReport({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, dateFrom: reportDate, dateTo: reportDate }, { signal });
          const [payload, configurationPayload] = await Promise.all([
            reportRequest,
            executionPass === 'reconciliation' ? Promise.resolve(null) : fetchGoogleAdsConfiguration(account, { signal }),
          ]);
          const report = normalizeGoogleAdsDailyReport({
            ...payload,
            currency_code: payload.currency_code || account.currencyCode,
            time_zone: payload.time_zone || account.timeZone,
          });
          const configuration = configurationPayload ? normalizeGoogleAdsConfiguration(configurationPayload) : null;

          if (!isReportForAccount(report, account)) throw new Error('A resposta não corresponde à MCC, conta, moeda e fuso do diretório conectado.');
          if (report.dateFrom !== reportDate || report.dateTo !== reportDate || report.queryComplete !== true) {
            throw new Error(`A consulta não confirmou o dia completo ${reportDate}.`);
          }
          if (report.campaignStatusFilter !== 'ALL') throw new Error('A API não confirmou a consulta de todas as campanhas.');
          if (isD1 && (report.businessTimeZone !== 'America/Sao_Paulo' || report.businessDate !== businessDate)) {
            throw new Error(`A consulta não confirmou o dia completo de São Paulo (${businessDate}).`);
          }
          if (executionPass !== 'reconciliation' && (configuration?.complete !== true
              || configuration.customerId !== account.customerId
              || (configuration.managerCustomerId || null) !== (account.managerCustomerId || null)
              || configuration.currencyCode !== report.currencyCode
              || configuration.currencyCode !== account.currencyCode
              || configuration.timeZone !== report.timeZone
              || configuration.timeZone !== account.timeZone)) {
            throw new Error('O inventário de campanhas não corresponde à conta, MCC, moeda e fuso consultados.');
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
          failures.push(`${accountLabel(account)}: ${error?.message || 'Falha na consulta.'}`);
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
    if (failures.length) throw new Error(`${failures.length} conta(s) falharam; o lote completo não foi gravado. ${failures.slice(0, 3).join(' · ')}`);
    if (reports.length !== accounts.length || reports.some(report => !report)) throw new Error('A consulta não cobriu todas as contas; nenhum dado foi gravado.');
    if (isD1 && businessDate > currentD1Date()) throw new Error('A consulta D−1 ficou à frente do último dia fechado em São Paulo; nenhum dado foi gravado.');
    if (!isD1 && accounts.some(account => localDateInTimeZone(now(), account.timeZone) !== todayByAccount[account.customerId])) {
      throw new Error('Virou o dia local de uma conta durante a consulta; nenhum dado foi gravado.');
    }

    if (signal.aborted || !isEnabled()) throw new DOMException('Atualização automática interrompida antes da gravação.', 'AbortError');
    if (getSourceMode() !== 'api') throw new Error('A fonte operacional do perfil mudou para Manifesto MCC durante a consulta; nenhum dado foi gravado.');
    publish({ state: 'running', operation: period, phase: 'Gravando lote completo no banco local', completedAccounts: accounts.length, totalAccounts: accounts.length });
    const saved = await saveCaptures(reports, todayByAccount, dateFromByAccount, {
      businessDate: isD1 ? businessDate : null,
      businessDayCapture: isD1,
      activeCampaignsOnly: false,
      executionMode: 'automatic',
      executionPass,
      refreshOverview: false,
      directorySavedAtUtc,
    });
    const history = Array.isArray(saved?.base?.google_ads_api_change_history) ? saved.base.google_ads_api_change_history : [];
    const historyEntry = [...history].reverse().find(item => item?.executionMode === 'automatic' && item?.periodType === period && (item?.executionPass || 'initial') === executionPass);
    const completedAtUtc = historyEntry?.completedAtUtc || now().toISOString();
    const run = {
      completedAtUtc,
      date: isD1 ? businessDate : null,
      datesByAccount: reports.map(report => ({ customerId: report.customerId, date: report.dateTo, timeZone: report.timeZone })),
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

  async function executeDueOperations() {
    if (!isEnabled()) return;
    if (getSourceMode() !== 'api') {
      publish({ state: 'paused', phase: 'Pausada · fonte operacional deste perfil está no Manifesto MCC', operation: null });
      return;
    }
    if (!supportsLocks()) {
      publish({ state: 'unsupported', phase: 'Atualização automática indisponível neste navegador; a trava contra duplicidade não está disponível.' });
      return;
    }

    const directoryCache = loadGoogleAdsAccountsCache();
    const accounts = directoryCache?.accounts?.accounts || [];
    const directorySavedAtUtc = directoryCache?.savedAtUtc || '';
    if (!accounts.length || !directorySavedAtUtc || directoryCache.accounts.warningCount) {
      const error = !accounts.length
        ? 'Atualize a lista de MCCs e contas conectadas antes de iniciar a rotina automática.'
        : 'O diretório contém avisos. Atualize e confira todas as MCCs e contas antes da captura automática.';
      const retryAt = new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
      publish({ state: 'blocked', phase: 'Aguardando diretório válido', lastError: error, lastD0AttemptDirectorySavedAtUtc: directorySavedAtUtc, lastD1AttemptDirectorySavedAtUtc: directorySavedAtUtc, nextD0AttemptAtUtc: retryAt, nextD1AttemptAtUtc: retryAt });
      return;
    }

    const currentStatus = readGoogleAdsAutoUpdateStatus();
    status = { ...status, ...currentStatus };
    const d0DirectoryChanged = status.lastD0?.directorySavedAtUtc !== directorySavedAtUtc;
    const nextD0At = Date.parse(status.nextD0AttemptAtUtc || '');
    const d0RetryPending = status.lastD0AttemptDirectorySavedAtUtc === directorySavedAtUtc
      && Number.isFinite(nextD0At) && now().getTime() < nextD0At;
    const d0Due = !d0RetryPending && (d0DirectoryChanged
      || !recentRunMatchesDirectory(status.lastD0, accounts, directorySavedAtUtc)
      || !Number.isFinite(nextD0At)
      || now().getTime() >= nextD0At);
    const pendingD1Date = nextD1Date(directorySavedAtUtc);
    const pendingD1State = d1BackfillState(pendingD1Date);
    const d1Due = isD1Due(directorySavedAtUtc, pendingD1Date, pendingD1State);
    const reconciliationState = d1ReconciliationState();
    const reconciliationDue = !pendingD1Date && !d1Due ? reconciliationState.dueItem : null;
    if (!d0Due && !d1Due && !reconciliationDue) {
      const blockedMessage = pendingD1State.d1BackfillBlocked
        ? 'Há um fechamento D−1 pendente fora da janela automática de recuperação de 14 dias.'
        : reconciliationState.d1ReconciliationBlocked
          ? `Há uma revisão D−1 pendente fora da janela de 14 dias (${reconciliationState.d1ReconciliationBlockedDate}).`
          : '';
      publish({
        ...reconciliationState,
        state: pendingD1State.d1BackfillBlocked || reconciliationState.d1ReconciliationBlocked ? 'blocked' : 'waiting',
        phase: blockedMessage || (pendingD1State.pendingD1Date ? 'Aguardando a próxima data D−1 pendente' : reconciliationState.d1ReconciliationPendingDate ? 'Aguardando a revisão automática de D−1' : 'Próxima verificação automática programada'),
        operation: null,
        lastError: blockedMessage,
        ...pendingD1State,
      });
      return;
    }

    const operations = [];
    if (d1Due) operations.push({ period: 'D-1', businessDate: pendingD1Date, executionPass: 'initial' });
    else if (reconciliationDue) operations.push({ period: 'D-1', businessDate: reconciliationDue.businessDate, executionPass: 'reconciliation' });
    if (d0Due) operations.push({ period: 'D0', businessDate: null });
    try {
      const cacheResult = await refreshFinalUrlCache(accounts);
      status.lastFinalUrlHostCacheAttemptAtUtc = now().toISOString();
      status.lastFinalUrlHostCacheError = cacheResult?.failures?.slice?.(0, 3).join(' · ') || '';
      status.lastFinalUrlHostCacheRefreshedAtUtc = cacheResult?.refreshedAccounts?.length ? now().toISOString() : (status.lastFinalUrlHostCacheRefreshedAtUtc || null);
    } catch (error) {
      status.lastFinalUrlHostCacheAttemptAtUtc = now().toISOString();
      status.lastFinalUrlHostCacheError = String(error?.message || 'Falha ao atualizar destinos finais.').slice(0, 500);
    }
    let savedCount = 0;
    const savedOperations = [];
    const failures = [];
    for (const operationItem of operations) {
      const operation = operationItem.period;
      const businessDate = operationItem.businessDate;
      const executionPass = operationItem.executionPass || 'initial';
      if (!isEnabled() || getSourceMode() !== 'api') break;
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
      }
      publish({ state: 'running', operation, phase: executionPass === 'reconciliation' ? 'Preparando revisão de métricas' : 'Preparando consulta', lastError: '', d1ReconciliationRunning: executionPass === 'reconciliation', ...(operation === 'D-1' ? { pendingD1Date: businessDate } : {}), ...d1ReconciliationState(status.d1ReconciliationQueue) });
      activeController = new AbortController();
      const timeout = setTimeout(() => activeController?.abort(), 15 * 60 * 1000);
      try {
        const { run } = await collectAndSave(operation, accounts, directorySavedAtUtc, activeController.signal, businessDate, executionPass);
        if (operation === 'D-1' && executionPass === 'reconciliation') {
          const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue).filter(item => item.businessDate !== businessDate);
          status.lastD1Reconciliation = run;
          Object.assign(status, d1ReconciliationState(queue));
        } else if (operation === 'D-1') {
          status.lastD1 = run;
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
          status.lastD0 = run;
          const intervalMs = readGoogleAdsAutoUpdateIntervalMinutes(storage) * 60 * 1000;
          status.nextD0AttemptAtUtc = new Date(now().getTime() + intervalMs).toISOString();
        }
        savedCount += 1;
        savedOperations.push({ period: operation, executionPass });
        publish({ state: 'running', operation, phase: executionPass === 'reconciliation' ? 'Revisão gravada' : 'Captura gravada', lastError: '', d1ReconciliationRunning: false, ...d1ReconciliationState(status.d1ReconciliationQueue) });
      } catch (error) {
        const disabled = !isEnabled();
        const sourceChanged = getSourceMode() !== 'api';
        const cancelled = disabled || sourceChanged;
        const message = disabled
          ? 'A rotina foi desativada; a consulta em andamento foi interrompida antes de gravar.'
          : sourceChanged
            ? 'A fonte operacional mudou para Manifesto MCC; a tentativa foi interrompida antes de gravar.'
            : String(error?.message || 'Falha na atualização automática.').slice(0, 700);
        if (!cancelled) {
          let failureHistorySaved = true;
          try { await recordFailure?.(operation, now().toISOString(), businessDate, executionPass); } catch { failureHistorySaved = false; }
          failures.push(`${operation}${executionPass === 'reconciliation' ? ' revisão' : ''}: ${message}${failureHistorySaved ? '' : ' O registro da tentativa no histórico não pôde ser salvo.'}`);
        }
        if (operation === 'D-1' && executionPass === 'reconciliation') {
          const retryAt = cancelled ? null : new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
          const queue = normalizeD1ReconciliationQueue(status.d1ReconciliationQueue).map(item => item.businessDate === businessDate ? { ...item, nextAttemptAtUtc: retryAt } : item);
          Object.assign(status, d1ReconciliationState(queue));
        } else if (operation === 'D-1' && executionPass === 'initial') status.nextD1AttemptAtUtc = new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
        else if (operation === 'D0') status.nextD0AttemptAtUtc = new Date(now().getTime() + RETRY_INTERVAL_MS).toISOString();
        publish({ state: disabled ? 'disabled' : sourceChanged ? 'paused' : 'failed', operation, phase: cancelled ? message : executionPass === 'reconciliation' ? 'A revisão não foi gravada' : 'A captura não foi gravada', lastError: cancelled ? '' : message, lastAttemptAtUtc: startedAt.toISOString(), d1ReconciliationRunning: false, ...d1ReconciliationState(status.d1ReconciliationQueue), ...(operation === 'D-1' && executionPass === 'initial' ? { pendingD1Date: businessDate, pendingD1Count: pendingD1State.pendingD1Count, d1BackfillBlocked: false } : {}) });
      } finally {
        clearTimeout(timeout);
        activeController = null;
      }
    }
    if (savedCount && isEnabled()) {
      try { await onBatchSaved({ operations: savedOperations, savedCount }); }
      catch (error) { failures.push(`Atualização da Visão Geral: ${String(error?.message || 'Falha ao atualizar a tela.').slice(0, 500)}`); }
    }
    const remainingD1Date = nextD1Date(directorySavedAtUtc);
    const remainingD1State = d1BackfillState(remainingD1Date);
    const remainingReconciliationState = d1ReconciliationState();
    publish({
      ...remainingReconciliationState,
      state: !isEnabled() ? 'disabled' : getSourceMode() !== 'api' ? 'paused' : failures.length ? 'failed' : remainingD1State.d1BackfillBlocked || remainingReconciliationState.d1ReconciliationBlocked ? 'blocked' : 'waiting',
      operation: null,
      d1ReconciliationRunning: false,
      phase: !isEnabled() ? 'Desativada' : getSourceMode() !== 'api' ? 'Pausada · fonte operacional deste perfil está no Manifesto MCC' : failures.length ? 'Há uma falha para revisar' : remainingD1State.d1BackfillBlocked ? 'Há datas D−1 pendentes fora da janela automática de recuperação' : remainingD1State.pendingD1Date ? 'Aguardando a próxima data D−1 pendente' : remainingReconciliationState.d1ReconciliationBlocked ? 'Há revisões D−1 pendentes fora da janela automática' : remainingReconciliationState.d1ReconciliationPendingDate ? 'Aguardando a revisão automática de D−1' : 'Próxima verificação automática programada',
      lastError: (failures.length ? failures.join(' · ') : remainingD1State.d1BackfillBlocked ? 'Há um fechamento D−1 pendente fora da janela automática de recuperação de 14 dias.' : remainingReconciliationState.d1ReconciliationBlocked ? `Há uma revisão D−1 pendente fora da janela de 14 dias (${remainingReconciliationState.d1ReconciliationBlockedDate}).` : '').slice(0, 700),
      ...remainingD1State,
      lastCycleCompletedAtUtc: now().toISOString(),
    });
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
    try { storage.setItem(GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY, String(intervalMinutes)); }
    catch { throw new Error('Não foi possível salvar o intervalo neste perfil do navegador.'); }
    if (previousInterval === intervalMinutes && status.intervalMinutes === intervalMinutes) {
      return { ...publish({ intervalMinutes }) };
    }
    const nextD0AttemptAtUtc = readGoogleAdsAutoUpdateEnabled(storage)
      ? new Date(now().getTime() + intervalMinutes * 60 * 1000).toISOString()
      : status.nextD0AttemptAtUtc || null;
    return { ...publish({ intervalMinutes, nextD0AttemptAtUtc }) };
  }

  function wake() {
    if (isEnabled()) void tick();
  }

  function start() {
    if (started) return;
    started = true;
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
      if ([GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY, GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY, GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY].includes(event.key)) {
        refreshStatus();
        if (event.key === GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY) wake();
      }
    });
    document.addEventListener('google-ads-source-mode-changed', wake);
    publish({ state: isEnabled() ? 'waiting' : 'disabled', phase: isEnabled() ? 'Preparando a primeira consulta' : 'Desativada', supported: supportsLocks() });
    if (isEnabled()) { void tick(); scheduleNextCheck(); }
  }

  return { start, setEnabled, setIntervalMinutes, wake, getStatus: () => ({ ...status }) };
}
