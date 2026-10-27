export const GURUMEDIA_SALES_DB_NAME = 'hub-tracking-gurumedia-sales';
export const GURUMEDIA_SALES_DB_VERSION = 1;
export const GURUMEDIA_SALES_STORE = 'report_snapshots';
export const GURUMEDIA_SALES_SNAPSHOT_KEY = 'latest_report';

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('Este navegador não permite abrir o cache local GuruMedia.'));
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDBImpl.open(GURUMEDIA_SALES_DB_NAME, GURUMEDIA_SALES_DB_VERSION); }
    catch (error) { reject(error instanceof Error ? error : new Error('Não foi possível abrir o cache local GuruMedia.')); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GURUMEDIA_SALES_STORE)) {
        request.result.createObjectStore(GURUMEDIA_SALES_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache local GuruMedia.'));
    request.onblocked = () => reject(new Error('O cache local GuruMedia está ocupado em outra aba. Feche-a e tente novamente.'));
  });
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export async function readGuruMediaSalesSnapshot({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    const close = () => { try { db.close(); } catch {} };
    try {
      const request = db.transaction(GURUMEDIA_SALES_STORE, 'readonly').objectStore(GURUMEDIA_SALES_STORE).get(GURUMEDIA_SALES_SNAPSHOT_KEY);
      request.onsuccess = () => {
        close();
        const snapshot = request.result || null;
        if (snapshot !== null && (snapshot.schemaVersion !== 1 || !validTimestamp(snapshot.savedAtUtc)
            || !snapshot.report || typeof snapshot.report !== 'object'
            || typeof snapshot.report.startDate !== 'string' || typeof snapshot.report.endDate !== 'string')) {
          reject(new Error('O cache local GuruMedia contém uma consulta inválida.'));
          return;
        }
        resolve(snapshot);
      };
      request.onerror = () => { close(); reject(request.error || new Error('Não foi possível ler o cache local GuruMedia.')); };
    } catch (error) { close(); reject(error); }
  });
}

export async function saveGuruMediaSalesSnapshot(report, { indexedDBImpl = globalThis.indexedDB, now = () => new Date() } = {}) {
  if (!report || typeof report !== 'object' || typeof report.startDate !== 'string' || typeof report.endDate !== 'string') {
    throw new Error('Não foi possível validar o relatório para o cache GuruMedia.');
  }
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('O horário do cache GuruMedia é inválido.');
  const snapshot = { key: GURUMEDIA_SALES_SNAPSHOT_KEY, schemaVersion: 1, savedAtUtc: date.toISOString(), report };
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => { if (settled) return; settled = true; close(); reject(error instanceof Error ? error : new Error('Não foi possível salvar o cache GuruMedia.')); };
    try {
      const transaction = db.transaction(GURUMEDIA_SALES_STORE, 'readwrite');
      transaction.objectStore(GURUMEDIA_SALES_STORE).put(snapshot);
      transaction.oncomplete = () => { if (!settled) { settled = true; close(); resolve(snapshot); } };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A gravação do cache GuruMedia foi cancelada.'));
    } catch (error) { fail(error); }
  });
}
