import { normalizeTrackingClicksReport } from './tracking-clicks-domain.mjs?v=6';

export const TRACKING_CLICKS_DB_NAME = 'hub-tracking-clicks';
export const TRACKING_CLICKS_DB_VERSION = 1;
export const TRACKING_CLICKS_SNAPSHOT_STORE = 'report_snapshots';

function normalizedReport(report) {
  const startDate = report?.startDate;
  const endDate = report?.endDate;
  return normalizeTrackingClicksReport({
    ok: true,
    schema_version: 2,
    platform: report?.platform ?? 'unsegmented',
    generated_at_utc: report?.generatedAtUtc,
    start_date: startDate,
    end_date: endDate,
    count_semantics: 'events_not_unique_visitors',
    rows: Array.isArray(report?.rows) ? report.rows.map(row => ({
      date_utc: row?.dateUtc,
      product_key: row?.productKey ?? null,
      product_label: row?.productLabel ?? null,
      presell_host: row?.presellHost ?? null,
      page_views: row?.pageViews,
      outbound_clicks: row?.outboundClicks,
    })) : report?.rows,
  }, { startDate, endDate });
}

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('Este navegador não permite abrir o cache local do Tracking.'));
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDBImpl.open(TRACKING_CLICKS_DB_NAME, TRACKING_CLICKS_DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Não foi possível abrir o cache local do Tracking.'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACKING_CLICKS_SNAPSHOT_STORE)) {
        db.createObjectStore(TRACKING_CLICKS_SNAPSHOT_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache local do Tracking.'));
    request.onblocked = () => reject(new Error('O cache local do Tracking está ocupado em outra aba. Feche-a e tente novamente.'));
  });
}

export async function readTrackingClicksSnapshots({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let snapshots = [];
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível ler o cache local do Tracking.'));
    };
    let transaction;
    try {
      transaction = db.transaction(TRACKING_CLICKS_SNAPSHOT_STORE, 'readonly');
      const request = transaction.objectStore(TRACKING_CLICKS_SNAPSHOT_STORE).getAll();
      request.onsuccess = () => { snapshots = Array.isArray(request.result) ? request.result : []; };
      request.onerror = () => fail(request.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        resolve(snapshots);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A leitura do cache local foi cancelada.'));
    } catch (error) {
      fail(error);
    }
  });
}

export async function appendTrackingClicksSnapshot(report, { indexedDBImpl = globalThis.indexedDB, now = () => new Date() } = {}) {
  const normalized = normalizedReport(report);
  const savedAt = typeof now === 'function' ? now() : now;
  if (!(savedAt instanceof Date) || !Number.isFinite(savedAt.getTime())) throw new Error('O horário local da consulta é inválido.');
  const snapshot = {
    platform: normalized.platform,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    generatedAtUtc: normalized.generatedAtUtc,
    savedAtUtc: savedAt.toISOString(),
    rows: normalized.rows,
  };
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let id;
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível salvar o cache local do Tracking.'));
    };
    try {
      const transaction = db.transaction(TRACKING_CLICKS_SNAPSHOT_STORE, 'readwrite');
      const request = transaction.objectStore(TRACKING_CLICKS_SNAPSHOT_STORE).add(snapshot);
      request.onsuccess = () => { id = request.result; };
      request.onerror = () => fail(request.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        resolve({ id, ...snapshot });
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A gravação do cache local foi cancelada.'));
    } catch (error) {
      fail(error);
    }
  });
}
