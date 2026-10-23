import { normalizeTrackingSale } from './tracking-sales-domain.mjs?v=1';

export const TRACKING_SALES_DB_NAME = 'hub-tracking-sales';
export const TRACKING_SALES_DB_VERSION = 1;
export const TRACKING_SALES_STORE = 'sale_records';
export const TRACKING_SALES_META_STORE = 'sync_metadata';
export const TRACKING_SALES_META_KEY = 'last_successful_sync';

function isUtcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isServerTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(/\.\d{3}Z$/, 'Z') === value;
}

function compareIds(left, right) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('Este navegador não permite abrir o cache local das vendas.'));
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDBImpl.open(TRACKING_SALES_DB_NAME, TRACKING_SALES_DB_VERSION); }
    catch (error) { reject(error instanceof Error ? error : new Error('Não foi possível abrir o cache local das vendas.')); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACKING_SALES_STORE)) db.createObjectStore(TRACKING_SALES_STORE, { keyPath: 'transactionId' });
      if (!db.objectStoreNames.contains(TRACKING_SALES_META_STORE)) db.createObjectStore(TRACKING_SALES_META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache local das vendas.'));
    request.onblocked = () => reject(new Error('O cache local das vendas está ocupado em outra aba. Feche-a e tente novamente.'));
  });
}

export async function readTrackingSalesSnapshot({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let sales = [];
    let metadata = null;
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível ler o cache local das vendas.'));
    };
    try {
      const transaction = db.transaction([TRACKING_SALES_STORE, TRACKING_SALES_META_STORE], 'readonly');
      const saleRequest = transaction.objectStore(TRACKING_SALES_STORE).getAll();
      const metaRequest = transaction.objectStore(TRACKING_SALES_META_STORE).get(TRACKING_SALES_META_KEY);
      saleRequest.onsuccess = () => { sales = Array.isArray(saleRequest.result) ? saleRequest.result : []; };
      metaRequest.onsuccess = () => { metadata = metaRequest.result || null; };
      saleRequest.onerror = () => fail(saleRequest.error);
      metaRequest.onerror = () => fail(metaRequest.error);
      transaction.oncomplete = () => {
        if (settled) return;
        try {
          sales = sales.map((sale, index) => normalizeTrackingSale({
            transaction_id: sale.transactionId,
            transaction_time_utc: sale.transactionTimeUtc,
            attribution_status: sale.attributionStatus,
            presell_host: sale.presellHost,
            product_key: sale.productKey,
          }, `Venda local ${index + 1}`));
          if (metadata !== null && (metadata.schemaVersion !== 1
              || !isUtcTimestamp(metadata.lastSyncedAtUtc)
              || typeof metadata.snapshotMaxId !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(metadata.snapshotMaxId)
              || compareIds(metadata.snapshotMaxId, '18446744073709551615') > 0
              || !(metadata.generatedAtUtc === '' || isServerTimestamp(metadata.generatedAtUtc))
              || !Number.isSafeInteger(metadata.totalCount) || metadata.totalCount < 0
              || metadata.totalCount !== sales.length)) {
            throw new Error('Metadados inválidos no cache local das vendas.');
          }
          settled = true;
          close();
          resolve({ sales, metadata });
        } catch (error) { fail(error); }
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A leitura do cache local das vendas foi cancelada.'));
    } catch (error) { fail(error); }
  });
}

export async function replaceTrackingSalesSnapshot(salesInput, metadataInput, {
  indexedDBImpl = globalThis.indexedDB,
  now = () => new Date(),
} = {}) {
  if (!Array.isArray(salesInput) || salesInput.length > 50000) throw new Error('A quantidade de vendas ultrapassa o limite seguro do cache local.');
  const snapshotMaxId = metadataInput?.snapshotMaxId;
  if (typeof snapshotMaxId !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(snapshotMaxId)
      || compareIds(snapshotMaxId, '18446744073709551615') > 0) throw new Error('O cursor do snapshot local é inválido.');
  const generatedAtUtc = metadataInput?.generatedAtUtc;
  if (generatedAtUtc !== undefined && !isServerTimestamp(generatedAtUtc)) throw new Error('O horário UTC do servidor é inválido.');
  const seenIds = new Set();
  const sales = salesInput.map((sale, index) => {
    const normalized = sale?.transactionId !== undefined
      ? normalizeTrackingSale({
        transaction_id: sale.transactionId,
        transaction_time_utc: sale.transactionTimeUtc,
        attribution_status: sale.attributionStatus,
        presell_host: sale.presellHost,
        product_key: sale.productKey,
      }, `Venda ${index + 1}`)
      : normalizeTrackingSale(sale, `Venda ${index + 1}`);
    if (seenIds.has(normalized.transactionId)) throw new Error('A sincronização contém uma venda duplicada.');
    seenIds.add(normalized.transactionId);
    if (compareIds(normalized.transactionId, snapshotMaxId) > 0) {
      throw new Error('Uma venda local ultrapassa o snapshot do servidor.');
    }
    return {
      transactionId: normalized.transactionId,
      transactionTimeUtc: normalized.transactionTimeUtc,
      attributionStatus: normalized.attributionStatus,
      presellHost: normalized.presellHost,
      productKey: normalized.productKey,
    };
  });
  const syncedAt = typeof now === 'function' ? now() : now;
  if (!(syncedAt instanceof Date) || !Number.isFinite(syncedAt.getTime())) throw new Error('O horário local da sincronização é inválido.');
  const metadata = {
    key: TRACKING_SALES_META_KEY,
    schemaVersion: 1,
    lastSyncedAtUtc: syncedAt.toISOString(),
    generatedAtUtc: generatedAtUtc || '',
    snapshotMaxId,
    totalCount: sales.length,
  };
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível salvar o cache local das vendas.'));
    };
    try {
      const transaction = db.transaction([TRACKING_SALES_STORE, TRACKING_SALES_META_STORE], 'readwrite');
      const saleStore = transaction.objectStore(TRACKING_SALES_STORE);
      const clearRequest = saleStore.clear();
      clearRequest.onerror = () => fail(clearRequest.error);
      for (const sale of sales) saleStore.put(sale);
      transaction.objectStore(TRACKING_SALES_META_STORE).put(metadata);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        resolve({ sales, metadata });
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A gravação do cache local das vendas foi cancelada.'));
    } catch (error) { fail(error); }
  });
}
