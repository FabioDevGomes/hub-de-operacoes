export const GURUMEDIA_SALES_DB_NAME = 'hub-tracking-gurumedia-sales';
export const GURUMEDIA_SALES_DB_VERSION = 3;
export const GURUMEDIA_SALES_STORE = 'report_snapshots';
export const GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE = 'campaign_attributions';
export const GURUMEDIA_SALES_SNAPSHOT_KEY = 'latest_report';

const SALE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN_ID_PATTERN = /^[1-9]\d{0,19}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MASKED_GCLID_PATTERN = /^…[!-~]{6}$/u;

let snapshotChannel = null;

function notifySnapshotSaved(snapshot) {
  const detail = { type: 'snapshot-updated', savedAtUtc: snapshot?.savedAtUtc || '' };
  try { globalThis.dispatchEvent(new CustomEvent('hub:gurumedia-sales-snapshot-updated', { detail })); } catch {}
  try {
    if (typeof BroadcastChannel === 'function') {
      snapshotChannel ||= new BroadcastChannel('hub-tracking-gurumedia-sales');
      snapshotChannel.postMessage(detail);
    }
  } catch {}
}

function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('Este navegador não permite abrir o cache local GuruMedia.'));
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDBImpl.open(GURUMEDIA_SALES_DB_NAME, GURUMEDIA_SALES_DB_VERSION); }
    catch (error) { reject(error instanceof Error ? error : new Error('Não foi possível abrir o cache local GuruMedia.')); return; }
    request.onupgradeneeded = event => {
      const hadSnapshotStore = request.result.objectStoreNames.contains(GURUMEDIA_SALES_STORE);
      if (!hadSnapshotStore) {
        request.result.createObjectStore(GURUMEDIA_SALES_STORE, { keyPath: 'key' });
      }
      if (!request.result.objectStoreNames.contains(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE)) {
        request.result.createObjectStore(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE, { keyPath: 'saleKey' });
      }
      if (hadSnapshotStore && event?.oldVersion < GURUMEDIA_SALES_DB_VERSION) {
        const transaction = request.transaction;
        const snapshotRequest = transaction?.objectStore(GURUMEDIA_SALES_STORE).get(GURUMEDIA_SALES_SNAPSHOT_KEY);
        if (snapshotRequest) snapshotRequest.onsuccess = () => {
          const snapshot = snapshotRequest.result;
          if (!validTimestamp(snapshot?.savedAtUtc)) return;
          const attributionStore = transaction.objectStore(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE);
          for (const sale of Array.isArray(snapshot?.report?.saleDetails) ? snapshot.report.saleDetails : []) {
            const attribution = storedAttributionForSale(sale, snapshot.savedAtUtc);
            if (attribution) attributionStore.put(attribution);
          }
        };
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

function normalizedCampaignAttribution(record) {
  const attribution = record?.campaignAttribution;
  if (!record || typeof record !== 'object' || !SALE_KEY_PATTERN.test(String(record.saleKey || ''))
      || !validTimestamp(record.savedAtUtc) || !attribution || attribution.status !== 'matched'
      || typeof attribution.campaignId !== 'string' || !CAMPAIGN_ID_PATTERN.test(attribution.campaignId)
      || typeof attribution.campaignName !== 'string' || !attribution.campaignName.trim()
      || attribution.campaignName.length > 500 || /[\u0000-\u001f\u007f]/u.test(attribution.campaignName)) return null;
  const clickAtUtc = attribution.clickAtUtc == null ? null : attribution.clickAtUtc;
  const gclidMasked = attribution.gclidMasked == null ? null : attribution.gclidMasked;
  if (clickAtUtc !== null && (typeof clickAtUtc !== 'string' || !UTC_TIMESTAMP_PATTERN.test(clickAtUtc) || !Number.isFinite(Date.parse(clickAtUtc)))) return null;
  if (gclidMasked !== null && (typeof gclidMasked !== 'string' || !MASKED_GCLID_PATTERN.test(gclidMasked))) return null;
  const sale = record.sale && validTimestamp(record.sale.conversionAtUtc) && validTimestamp(record.sale.receivedAtUtc)
    ? { conversionAtUtc: record.sale.conversionAtUtc, receivedAtUtc: record.sale.receivedAtUtc }
    : null;
  return {
    saleKey: record.saleKey.toLowerCase(),
    campaignAttribution: {
      status: 'matched',
      campaignId: attribution.campaignId,
      campaignName: attribution.campaignName,
      errorCode: null,
      clickAtUtc,
      gclidMasked,
    },
    ...(sale ? { sale } : {}),
    savedAtUtc: record.savedAtUtc,
  };
}

function storedAttributionForSale(sale, savedAtUtc) {
  if (sale?.campaignAttribution?.status !== 'matched' || !SALE_KEY_PATTERN.test(String(sale.saleKey || ''))) return null;
  return normalizedCampaignAttribution({
    saleKey: sale.saleKey,
    savedAtUtc,
    campaignAttribution: sale.campaignAttribution,
    sale: {
      conversionAtUtc: sale.conversionAtUtc,
      receivedAtUtc: sale.receivedAtUtc,
    },
  });
}

export function mergeGuruMediaCampaignAttributions(report, attributions) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.saleDetails) || !(attributions instanceof Map)) return report;
  return {
    ...report,
    saleDetails: report.saleDetails.map(sale => {
      const saved = attributions.get(String(sale?.saleKey || '').toLowerCase());
      return saved ? { ...sale, campaignAttribution: saved } : sale;
    }),
  };
}

export async function readGuruMediaCampaignAttributions({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível ler as atribuições ClickView salvas.'));
    };
    try {
      const transaction = db.transaction(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE, 'readonly');
      const request = transaction.objectStore(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE).getAll();
      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        close();
        const attributions = new Map();
        for (const item of Array.isArray(request.result) ? request.result : []) {
          const normalized = normalizedCampaignAttribution(item);
          if (normalized) attributions.set(normalized.saleKey, normalized.campaignAttribution);
        }
        resolve(attributions);
      };
      request.onerror = () => fail(request.error);
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A leitura das atribuições ClickView foi cancelada.'));
    } catch (error) { fail(error); }
  });
}

export async function readGuruMediaSalesSnapshot({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => {
      if (settled) return;
      settled = true;
      close();
      reject(error instanceof Error ? error : new Error('Não foi possível ler o cache local GuruMedia.'));
    };
    try {
      const transaction = db.transaction([GURUMEDIA_SALES_STORE, GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE], 'readonly');
      let snapshot = null;
      let attributions = [];
      const snapshotRequest = transaction.objectStore(GURUMEDIA_SALES_STORE).get(GURUMEDIA_SALES_SNAPSHOT_KEY);
      const attributionsRequest = transaction.objectStore(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE).getAll();
      snapshotRequest.onsuccess = () => { snapshot = snapshotRequest.result || null; };
      attributionsRequest.onsuccess = () => { attributions = Array.isArray(attributionsRequest.result) ? attributionsRequest.result : []; };
      snapshotRequest.onerror = () => fail(snapshotRequest.error);
      attributionsRequest.onerror = () => fail(attributionsRequest.error);
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A leitura do cache GuruMedia foi cancelada.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        if (snapshot !== null && (snapshot.schemaVersion !== 1 || !validTimestamp(snapshot.savedAtUtc)
            || !snapshot.report || typeof snapshot.report !== 'object'
            || typeof snapshot.report.startDate !== 'string' || typeof snapshot.report.endDate !== 'string')) {
          reject(new Error('O cache local GuruMedia contém uma consulta inválida.'));
          return;
        }
        if (snapshot?.report?.saleDetails && Array.isArray(snapshot.report.saleDetails)) {
          const bySaleKey = new Map();
          const firstSaleSales = [];
          for (const item of attributions) {
            const normalized = normalizedCampaignAttribution(item);
            if (!normalized) continue;
            bySaleKey.set(normalized.saleKey, normalized.campaignAttribution);
            if (normalized.sale) firstSaleSales.push({
              saleKey: normalized.saleKey,
              conversionAtUtc: normalized.sale.conversionAtUtc,
              receivedAtUtc: normalized.sale.receivedAtUtc,
              campaignAttribution: normalized.campaignAttribution,
            });
          }
          snapshot.report = mergeGuruMediaCampaignAttributions(snapshot.report, bySaleKey);
          snapshot.firstSaleSales = firstSaleSales;
        } else if (snapshot !== null) {
          snapshot.firstSaleSales = [];
        }
        resolve(snapshot);
      };
    } catch (error) { fail(error); }
  });
}

export async function saveGuruMediaSalesSnapshot(report, { indexedDBImpl = globalThis.indexedDB, now = () => new Date() } = {}) {
  if (!report || typeof report !== 'object' || typeof report.startDate !== 'string' || typeof report.endDate !== 'string') {
    throw new Error('Não foi possível validar o relatório para o cache GuruMedia.');
  }
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('O horário do cache GuruMedia é inválido.');
  const savedAtUtc = date.toISOString();
  const snapshot = { key: GURUMEDIA_SALES_SNAPSHOT_KEY, schemaVersion: 1, savedAtUtc, report };
  const db = await openDatabase(indexedDBImpl);
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { db.close(); } catch {} };
    const fail = error => { if (settled) return; settled = true; close(); reject(error instanceof Error ? error : new Error('Não foi possível salvar o cache GuruMedia.')); };
    try {
      const transaction = db.transaction([GURUMEDIA_SALES_STORE, GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE], 'readwrite');
      transaction.objectStore(GURUMEDIA_SALES_STORE).put(snapshot);
      const attributionStore = transaction.objectStore(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE);
      for (const sale of Array.isArray(report.saleDetails) ? report.saleDetails : []) {
        const attribution = storedAttributionForSale(sale, savedAtUtc);
        if (attribution) attributionStore.put(attribution);
      }
      transaction.oncomplete = () => { if (!settled) { settled = true; close(); notifySnapshotSaved(snapshot); resolve(snapshot); } };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error || new Error('A gravação do cache GuruMedia foi cancelada.'));
    } catch (error) { fail(error); }
  });
}
