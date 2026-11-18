import { fetchGoogleAdsGeographicReport } from './google-ads-service.mjs?v=17';
import { googleAdsGeographicReportDateRange } from './google-ads-geographic-domain.mjs?v=1';
import { loadGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=4';
import { saveGoogleAdsGeographicFailure, saveGoogleAdsGeographicReportAttempt } from './google-ads-geographic-storage.mjs?v=1';

export const GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_KEY = 'hub.google-ads-geographic-auto-update:status:v1';
export const GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_EVENT = 'google-ads-geographic-auto-update-status';

const LOCK_NAME = 'hub-google-ads-geographic-auto-update-v1';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const START_HOUR_SAO_PAULO = 20;
const REPORT_WINDOW_DAYS = 14;
const MAX_CONCURRENCY = 2;

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function localDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function saoPauloHour(date) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(date));
}

function emptyStatus(storage) {
  try {
    const value = JSON.parse(storage?.getItem(GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_KEY) || 'null');
    if (value?.schemaVersion === 1) return value;
  } catch { /* Corrupt status is replaced by a clean summary; report rows remain untouched. */ }
  return { schemaVersion: 1, state: 'waiting', lastRunDate: '', lastStartedAtUtc: '', lastCompletedAtUtc: '', lastOutcome: '', accountCount: 0, succeededAccounts: 0, failedAccounts: 0, rowsReceived: 0 };
}

export function readGoogleAdsGeographicAutoUpdateStatus(storage = safeStorage()) {
  return { ...emptyStatus(storage) };
}

export function createGoogleAdsGeographicAutoUpdater({
  getSourceMode = () => 'manifest',
  isAutomaticEnabled = () => false,
  storage = safeStorage(),
  now = () => new Date(),
} = {}) {
  let started = false;
  let timer = null;
  let status = emptyStatus(storage);
  let channel = null;

  function publish(patch) {
    status = { ...status, ...patch, schemaVersion: 1, updatedAtUtc: now().toISOString() };
    try { storage?.setItem(GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_KEY, JSON.stringify(status)); } catch { /* IndexedDB remains authoritative for report rows. */ }
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_EVENT, { detail: { ...status } }));
    try { channel?.postMessage({ type: 'status', status }); } catch { /* BroadcastChannel is optional. */ }
    return status;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { void tick(); }, CHECK_INTERVAL_MS);
  }

  async function collectAccount(account, range) {
    try {
      const report = await fetchGoogleAdsGeographicReport({
        managerCustomerId: account.managerCustomerId,
        customerId: account.customerId,
        ...range,
      });
      await saveGoogleAdsGeographicReportAttempt(report, { account, completedAtUtc: now().toISOString() });
      return { ok: true, rows: report.rows.length };
    } catch (error) {
      const errorCode = String(error?.code || error?.name || 'unclassified').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 80) || 'unclassified';
      try {
        await saveGoogleAdsGeographicFailure({
          account,
          ...range,
          failedAtUtc: now().toISOString(),
          errorCode,
        });
      } catch { /* Keep the error summary private; never replace existing report rows. */ }
      return { ok: false, rows: 0 };
    }
  }

  async function runForToday(today) {
    if (!storage) {
      publish({ state: 'storage_unavailable', phase: 'Não foi possível registrar o dia da consulta; nenhuma consulta foi iniciada.' });
      return;
    }
    const directory = loadGoogleAdsAccountsCache({ storage });
    const accounts = directory?.accounts?.accounts;
    if (!Array.isArray(accounts) || !accounts.length) {
      publish({ state: 'waiting_directory', phase: 'Atualize a lista de MCCs e contas para habilitar o relatório geográfico.', lastDirectoryRefreshAtUtc: directory?.refreshedAtUtc || '' });
      return;
    }
    if (Number(directory.accounts.warningCount) > 0) {
      publish({ state: 'waiting_directory', phase: 'O diretório de contas contém avisos. Atualize a lista antes da consulta geográfica.', lastDirectoryRefreshAtUtc: directory.refreshedAtUtc || '' });
      return;
    }

    const startedAtUtc = now().toISOString();
    publish({ state: 'running', phase: 'Consultando países dos cliques dos últimos 14 dias fechados.', lastRunDate: today, lastStartedAtUtc: startedAtUtc, lastCompletedAtUtc: '', lastOutcome: 'running', accountCount: accounts.length, succeededAccounts: 0, failedAccounts: 0, rowsReceived: 0, lastDirectoryRefreshAtUtc: directory.refreshedAtUtc || '' });
    const results = new Array(accounts.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, accounts.length) }, async () => {
      while (nextIndex < accounts.length) {
        const index = nextIndex++;
        const account = accounts[index];
        try {
          const range = googleAdsGeographicReportDateRange(now(), account.timeZone, REPORT_WINDOW_DAYS);
          results[index] = await collectAccount(account, range);
        } catch {
          results[index] = { ok: false, rows: 0 };
        }
      }
    });
    await Promise.all(workers);
    const succeededAccounts = results.filter(result => result?.ok).length;
    const failedAccounts = results.length - succeededAccounts;
    const rowsReceived = results.reduce((sum, result) => sum + (Number(result?.rows) || 0), 0);
    const completedAtUtc = now().toISOString();
    publish({
      state: failedAccounts ? (succeededAccounts ? 'partial' : 'failed') : 'complete',
      phase: failedAccounts ? 'A consulta terminou com falhas em algumas contas.' : 'Consulta geográfica diária concluída.',
      lastCompletedAtUtc: completedAtUtc,
      lastOutcome: failedAccounts ? (succeededAccounts ? 'partial' : 'failed') : 'complete',
      accountCount: accounts.length,
      succeededAccounts,
      failedAccounts,
      rowsReceived,
      dateTo: today,
    });
  }

  async function maybeRun() {
    const current = now();
    const today = localDateInTimeZone(current, 'America/Sao_Paulo');
    if (getSourceMode() !== 'api' || !isAutomaticEnabled() || saoPauloHour(current) < START_HOUR_SAO_PAULO || status.lastRunDate === today) return;
    if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
      publish({ state: 'locking_unavailable', phase: 'A consulta aguarda um navegador com trava entre abas.' });
      return;
    }
    await navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) return;
      status = emptyStatus(storage);
      if (status.lastRunDate === today || getSourceMode() !== 'api' || !isAutomaticEnabled()) return;
      await runForToday(today);
    });
  }

  async function tick() {
    if (!started) return;
    try { await maybeRun(); }
    catch {
      publish({ state: 'failed', phase: 'A consulta geográfica automática não pôde ser concluída.', lastCompletedAtUtc: now().toISOString(), lastOutcome: 'failed' });
    } finally { if (started) schedule(); }
  }

  function start() {
    if (started) return;
    started = true;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('hub-google-ads-geographic-auto-update');
      channel.onmessage = event => {
        if (event.data?.type === 'status' && event.data.status?.schemaVersion === 1) status = event.data.status;
      };
    }
    globalThis.addEventListener?.('storage', event => {
      if (event.key === GOOGLE_ADS_GEOGRAPHIC_AUTO_STATUS_KEY || event.key === 'hub.google-ads-auto-update:enabled:v1') status = emptyStatus(storage);
      if (event.key === 'hub.google-ads-account-directory:v1' || event.key === 'hub.google-ads-auto-update:enabled:v1') void tick();
    });
    document.addEventListener('google-ads-source-mode-changed', () => { status = emptyStatus(storage); void tick(); });
    publish({ state: status.lastOutcome || 'waiting', phase: status.phase || 'Aguardando horário da consulta diária.' });
    void tick();
    schedule();
  }

  return { start, wake: () => { void tick(); }, getStatus: () => ({ ...status }) };
}
