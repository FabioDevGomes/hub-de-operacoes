import { openDatabase } from '../storage/hub-database.mjs?v=1';
import { BILLING_STORE_NAMES, upsertMccConversionSalesToTransaction } from '../billing/billing-storage.mjs?v=15';
import { readGoogleAdsSourceMode } from './google-ads-source-preference.mjs?v=1';
import { readGoogleAdsCaptureSnapshotRetention, normalizeGoogleAdsCaptureSnapshotRetention } from './google-ads-capture-snapshot-retention.mjs?v=1';

const clock = () => globalThis.performance?.now?.() ?? Date.now();

export function previewDailyCaptures(base, reports, todayByAccount, exchangeRateQuote, database = globalThis.CampaignDatabase, dateFromByAccount = {}, { businessDayPreview = false, activeCampaignsOnly = false, skipBillingCandidates = false } = {}) {
  const result = database.saveGoogleAdsDailyCaptures(base, reports, { todayByAccount, dateFromByAccount, exchangeRateQuote, previewOnly: true, businessTimeZone: businessDayPreview ? 'America/Sao_Paulo' : null, activeCampaignsOnly });
  const billingCandidates = businessDayPreview || skipBillingCandidates ? [] : database.googleAdsApiBillingSales(result.base);
  return { ...result, billingCandidates };
}

export async function saveDailyCaptures(reports, todayByAccount, exchangeRateQuote, { database = globalThis.CampaignDatabase, openDb = openDatabase, sourceMode = readGoogleAdsSourceMode(), dateFromByAccount = {}, businessDayCapture = false, activeCampaignsOnly = false, executionMode = 'manual', executionPass = 'initial', captureSnapshotRetentionLimit = readGoogleAdsCaptureSnapshotRetention() } = {}) {
  const timings = {}, openStartedAt = clock();
  const db = await openDb();
  timings.databaseOpenMs = clock() - openStartedAt;
  let result, failure;
  try {
    await new Promise((resolve, reject) => {
      const transactionStartedAt = clock();
      const tx = db.transaction(['bases', ...(sourceMode === 'api' ? BILLING_STORE_NAMES : [])], 'readwrite');
      const store = tx.objectStore('bases'), request = store.get('atual');
      request.onsuccess = () => {
        try {
          if (!request.result || request.result.schema !== database.SCHEMA) throw new Error('A base atual não foi reconhecida; nenhuma captura foi gravada.');
          timings.baseReadMs = clock() - transactionStartedAt;
          const transformStartedAt = clock();
          result = database.saveGoogleAdsDailyCaptures(request.result, reports, {
            todayByAccount,
            dateFromByAccount,
            exchangeRateQuote,
            previewOnly: false,
            businessTimeZone: businessDayCapture ? 'America/Sao_Paulo' : null,
            activeCampaignsOnly,
            executionMode,
            executionPass,
            captureSnapshotRetentionLimit: normalizeGoogleAdsCaptureSnapshotRetention(captureSnapshotRetentionLimit),
            mutateInput: true,
          });
          timings.captureTransformMs = clock() - transformStartedAt;
          const billingAggregationStartedAt = clock();
          result.billingCandidates = sourceMode === 'api' ? database.googleAdsApiBillingSales(result.base) : [];
          timings.billingAggregationMs = clock() - billingAggregationStartedAt;
          const basePutStartedAt = clock();
          store.put(result.base, 'atual');
          timings.basePutQueueMs = clock() - basePutStartedAt;
          const billingWriteStartedAt = clock();
          if (sourceMode === 'api') upsertMccConversionSalesToTransaction(tx, result.billingCandidates, { sourceMode, preserveExistingPlatform: true });
          timings.billingWriteQueueMs = clock() - billingWriteStartedAt;
          timings.commitWaitStartedAt = clock();
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { timings.transactionCommitMs = timings.commitWaitStartedAt == null ? 0 : clock() - timings.commitWaitStartedAt; resolve(); };
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('A captura e a atualização financeira foram canceladas.'));
    });
    delete timings.commitWaitStartedAt;
    result.timings = timings;
    return result;
  } finally { db.close(); }
}

export async function saveAutomaticCaptureFailure(periodType, failedAtUtc, { database = globalThis.CampaignDatabase, openDb = openDatabase, priorHistory = [], businessDate = null, executionPass = 'initial' } = {}) {
  const failureEntry = database.buildGoogleAdsCaptureFailureHistoryEntry(periodType, { now: failedAtUtc, businessDate, executionPass });
  const db = await openDb();
  let result, failure = null;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['bases'], 'readwrite'), store = tx.objectStore('bases'), request = store.get('atual');
      request.onsuccess = () => {
        try {
          const base = request.result;
          if (!base || base.schema !== database.SCHEMA) throw new Error('A base atual não foi reconhecida; o registro da falha não foi gravado.');
          base.google_ads_api_change_history = database.mergeGoogleAdsCaptureHistory(base.google_ads_api_change_history, priorHistory, [failureEntry]);
          store.put(base, 'atual');
          result = { base, historyEntry: failureEntry };
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('O registro da falha foi cancelado.'));
    });
    return result;
  } finally { db.close(); }
}

export async function setGoogleAdsCaptureSnapshotRetention(limit, { database = globalThis.CampaignDatabase, openDb = openDatabase } = {}) {
  const retentionLimit = normalizeGoogleAdsCaptureSnapshotRetention(limit), db = await openDb();
  let snapshots = [], changed = false, failure = null;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['bases'], 'readwrite'), store = tx.objectStore('bases'), request = store.get('atual');
      request.onsuccess = () => {
        try {
          const base = request.result;
          if (!base || base.schema !== database.SCHEMA) throw new Error('A base atual não foi reconhecida; a retenção dos snapshots não foi alterada.');
          const existing = Array.isArray(base.google_ads_api_capture_snapshots) ? base.google_ads_api_capture_snapshots : [];
          snapshots = database.pruneGoogleAdsCaptureSnapshots(existing, retentionLimit, base.google_ads_api_change_history);
          changed = JSON.stringify(existing) !== JSON.stringify(snapshots);
          if (changed) { base.google_ads_api_capture_snapshots = snapshots; store.put(base, 'atual'); }
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('A retenção dos snapshots foi cancelada.'));
    });
    return { retentionLimit, snapshots, changed };
  } finally { db.close(); }
}
