export const DB_NAME = 'radar-smartadv-offers';
export const DB_VERSION = 3;
export const STORES = Object.freeze({captures: 'captures', trends: 'trends', images: 'images', decisions: 'decisions'});
export const BACKUP_FORMAT = 'radar-smartadv-offers-backup-v3';
export const LEGACY_BACKUP_V2_FORMAT = 'radar-smartadv-offers-backup-v2';
const LEGACY_BACKUP_FORMAT = 'radar-smartadv-offers-backup-v1';

const DECISION_VALUES = new Set(['Não definido', 'Subir campanha', 'Campanha no ar', 'Revisar', 'Ocultar']);

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.captures)) db.createObjectStore(STORES.captures, {keyPath: 'captureId'});
      if (!db.objectStoreNames.contains(STORES.trends)) db.createObjectStore(STORES.trends, {keyPath: 'offerKey'});
      if (!db.objectStoreNames.contains(STORES.images)) db.createObjectStore(STORES.images, {keyPath: 'offerKey'});
      if (!db.objectStoreNames.contains(STORES.decisions)) db.createObjectStore(STORES.decisions, {keyPath: 'offerKey'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName = STORES.captures) {
  if (!Object.values(STORES).includes(storeName)) throw new Error('Armazenamento SmartAdv desconhecido.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  if (![STORES.trends, STORES.images].includes(storeName) || !validAnalyticRecord(value, storeName)) {
    throw new Error('Registro analítico SmartAdv inválido.');
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validDecisionRecord(record) {
  return Boolean(record && /^smartadv:\d{1,12}$/.test(String(record.offerKey || '')) && DECISION_VALUES.has(record.currentStatus) &&
    typeof (record.notes ?? '') === 'string' && (record.notes ?? '').length <= 5000 &&
    (record.updatedAt == null || Number.isFinite(Date.parse(record.updatedAt))) && Array.isArray(record.history) && record.history.length <= 10000 &&
    record.history.every(item => item && DECISION_VALUES.has(item.status) && typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt)) &&
      typeof (item.notes ?? '') === 'string' && (item.notes ?? '').length <= 5000));
}

export async function putDecision(record) {
  if (!validDecisionRecord(record)) throw new Error('Decisão SmartAdv inválida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.decisions, 'readwrite');
    tx.objectStore(STORES.decisions).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validOffer(offer) {
  if (!offer || !/^\d{1,12}$/.test(String(offer.offerId)) || !String(offer.offerName || '').trim() || !String(offer.vertical || '').trim()) return false;
  let url;
  try { url = new URL(offer.offerUrl); } catch { return false; }
  return url.protocol === 'https:' && url.hostname === 'portal.smartadv.com' && url.pathname.replace(/\/$/, '') === `/offers/${offer.offerId}` &&
    Array.isArray(offer.geoTargets) && offer.geoTargets.every(value => typeof value === 'string') &&
    Array.isArray(offer.allowedChannels) && offer.allowedChannels.every(value => typeof value === 'string') &&
    ['yes', 'no', 'unknown'].includes(offer.brandBidding);
}

function validCapture(capture) {
  return Boolean(capture && typeof capture.captureId === 'string' && capture.captureId.length > 0 &&
    typeof capture.capturedAt === 'string' && Number.isFinite(Date.parse(capture.capturedAt)) &&
    capture.sourceFormat === 'smartadv-offers-v1' && capture.coverage === 'unknown' && Array.isArray(capture.offers) &&
    capture.offers.length > 0 && capture.offers.length <= 10000 && capture.offers.every(validOffer) &&
    new Set(capture.offers.map(offer => offer.offerId)).size === capture.offers.length);
}

function validAnalyticRecord(record, storeName) {
  if (!record || !/^smartadv:\d{1,12}$/.test(String(record.offerKey || '')) || !Array.isArray(record.assessments) || record.assessments.length > 10000) return false;
  if (storeName === STORES.trends) {
    return (record.keywordCandidates == null || Array.isArray(record.keywordCandidates) && record.keywordCandidates.every(value => typeof value === 'string')) &&
      (record.manualCountries == null || Array.isArray(record.manualCountries) && record.manualCountries.every(value => /^[A-Z]{2}$/.test(value))) &&
      record.assessments.every(item => item && typeof item.assessmentId === 'string' && typeof item.status === 'string' && Array.isArray(item.countries));
  }
  return (record.searchTerm == null || typeof record.searchTerm === 'string') && record.assessments.every(item =>
    item && typeof item.assessmentId === 'string' && typeof item.country === 'string' && typeof item.status === 'string' && Array.isArray(item.negativeKeywordCandidates));
}

export async function saveCapture(capture) {
  if (!validCapture(capture)) throw new Error('Captura SmartAdv inválida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.captures, 'readwrite');
    tx.objectStore(STORES.captures).add(capture);
    tx.oncomplete = () => resolve(capture);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function seedInitialCaptureIfEmpty(capture) {
  if (!validCapture(capture)) throw new Error('Captura inicial SmartAdv inválida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let seeded = false;
    const tx = db.transaction(STORES.captures, 'readwrite');
    const store = tx.objectStore(STORES.captures);
    const count = store.count();
    count.onsuccess = () => {
      if (count.result === 0) {
        store.add(capture);
        seeded = true;
      }
    };
    tx.oncomplete = () => resolve(seeded);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function exportBackup() {
  const [captures, trends, images, decisions] = await Promise.all([getAll(STORES.captures), getAll(STORES.trends), getAll(STORES.images), getAll(STORES.decisions)]);
  return {format: BACKUP_FORMAT, schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), captures, trends, images, decisions};
}

function validateBackup(payload) {
  const legacy = payload?.format === LEGACY_BACKUP_FORMAT && payload?.schemaVersion === 1;
  const legacyV2 = payload?.format === LEGACY_BACKUP_V2_FORMAT && payload?.schemaVersion === 2;
  const current = payload?.format === BACKUP_FORMAT && payload?.schemaVersion === DB_VERSION;
  if ((!legacy && !legacyV2 && !current) || !Array.isArray(payload?.captures)) throw new Error('O arquivo não é um backup SmartAdv compatível.');
  const trends = legacy ? [] : payload.trends, images = legacy ? [] : payload.images, decisions = current ? payload.decisions : [];
  if (!Array.isArray(trends) || !Array.isArray(images) || payload.captures.length > 10000 || trends.length > 10000 || images.length > 10000 ||
      !Array.isArray(decisions) || decisions.length > 10000 || !payload.captures.every(validCapture) || !trends.every(item => validAnalyticRecord(item, STORES.trends)) || !images.every(item => validAnalyticRecord(item, STORES.images)) ||
      !decisions.every(validDecisionRecord) || new Set(decisions.map(item => item.offerKey)).size !== decisions.length) {
    throw new Error('O backup contém registros inválidos ou excede o limite aceito.');
  }
  return {captures: payload.captures, trends, images, decisions};
}

function mergeAssessmentList(existing = [], incoming = []) {
  const merged = [...existing], ids = new Set(existing.map(item => item.assessmentId));
  for (const item of incoming) if (!ids.has(item.assessmentId)) { merged.push(item); ids.add(item.assessmentId); }
  return merged;
}

function mergeAnalyticRecord(existing, incoming, storeName) {
  if (storeName === STORES.trends) {
    const candidates = [...new Set([...(existing.keywordCandidates || []), ...(incoming.keywordCandidates || [])])];
    const manualCountries = [...new Set([...(existing.manualCountries || []), ...(incoming.manualCountries || [])])];
    return {...existing, ...incoming, manualCountries, keywordCandidates:candidates, assessments:mergeAssessmentList(existing.assessments, incoming.assessments)};
  }
  return {...existing, ...incoming, searchTerm:incoming.searchTerm || existing.searchTerm || '', assessments:mergeAssessmentList(existing.assessments, incoming.assessments)};
}

function mergeDecisionRecord(existing, incoming) {
  const history = [...new Map([...existing.history, ...incoming.history].map(item => [`${item.capturedAt}\u0000${item.status}\u0000${item.notes || ''}`, item])).values()]
    .sort((a,b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  const latest = [existing, incoming].sort((a,b) => String(a.updatedAt || a.history.at(-1)?.capturedAt || '').localeCompare(String(b.updatedAt || b.history.at(-1)?.capturedAt || ''))).at(-1);
  return {...existing, ...latest, history};
}

export async function mergeBackup(payload) {
  const {captures, trends, images, decisions} = validateBackup(payload);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    const result = {added: 0, merged: 0, unchanged: 0, conflicts: 0};
    const mergeRows = (storeName, rows, keyField, analytic = false) => {
      const store = tx.objectStore(storeName);
      for (const row of rows) {
        const request = store.get(row[keyField]);
        request.onsuccess = () => {
          if (!request.result) { store.add(row); result.added++; return; }
          const current = request.result;
          if (JSON.stringify(current) === JSON.stringify(row)) { result.unchanged++; return; }
          if (!analytic) { result.conflicts++; return; }
          const merged = mergeAnalyticRecord(current, row, storeName);
          if (JSON.stringify(current) === JSON.stringify(merged)) result.unchanged++;
          else { store.put(merged); result.merged++; }
        };
      }
    };
    mergeRows(STORES.captures, captures, 'captureId');
    mergeRows(STORES.trends, trends, 'offerKey', true);
    mergeRows(STORES.images, images, 'offerKey', true);
    const decisionStore = tx.objectStore(STORES.decisions);
    for (const row of decisions) {
      const request = decisionStore.get(row.offerKey);
      request.onsuccess = () => {
        if (!request.result) { decisionStore.add(row); result.added++; return; }
        const merged = mergeDecisionRecord(request.result, row);
        if (JSON.stringify(request.result) === JSON.stringify(merged)) result.unchanged++;
        else { decisionStore.put(merged); result.merged++; }
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
