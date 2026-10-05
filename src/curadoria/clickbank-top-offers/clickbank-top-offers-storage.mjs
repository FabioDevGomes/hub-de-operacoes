export const DB_NAME = 'radar-clickbank-top-offers';
export const DB_VERSION = 3;
export const STORES = Object.freeze({captures: 'captures', offerMetadata: 'offerMetadata', trends: 'trends', images: 'images', decisions: 'decisions'});
export const BACKUP_FORMAT = 'radar-clickbank-top-offers-backup-v3';
export const LEGACY_BACKUP_V2_FORMAT = 'radar-clickbank-top-offers-backup-v2';
export const LEGACY_BACKUP_FORMAT = 'radar-clickbank-top-offers-backup-v1';

const DECISION_VALUES = new Set(['Não definido', 'Subir campanha', 'Campanha no ar', 'Revisar', 'Ocultar']);

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.captures)) db.createObjectStore(STORES.captures, {keyPath: 'captureId'});
      for (const name of [STORES.offerMetadata, STORES.trends, STORES.images]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, {keyPath: 'offerKey'});
      }
      if (!db.objectStoreNames.contains(STORES.decisions)) db.createObjectStore(STORES.decisions, {keyPath: 'offerKey'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName = STORES.captures) {
  if (!Object.values(STORES).includes(storeName)) throw new Error('Store ClickBank desconhecida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCapture(capture) {
  if (!isCapture(capture)) throw new Error('Captura ClickBank inválida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.captures, 'readwrite');
    tx.objectStore(STORES.captures).add(capture);
    tx.oncomplete = () => resolve(capture);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validOfferRecord(storeName, record) {
  if (!record || typeof record.offerKey !== 'string' || !record.offerKey || record.offerKey.length > 1400 ||
    typeof record.productKey !== 'string' || record.productKey.length > 1400 ||
    typeof record.offerName !== 'string' || record.offerName.length > 1000 ||
    typeof record.seller !== 'string' || record.seller.length > 250) return false;
  if (storeName === STORES.offerMetadata) {
    return Array.isArray(record.manualCountries) && record.manualCountries.length <= 250 &&
      record.manualCountries.every(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code));
  }
  if (storeName === STORES.trends) {
    return Array.isArray(record.assessments) && record.assessments.length <= 10000 &&
      Array.isArray(record.keywordCandidates) && record.keywordCandidates.length <= 1000 &&
      record.keywordCandidates.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500) &&
      record.assessments.every(item => item && typeof item.assessmentId === 'string' && item.assessmentId.length <= 160 &&
        ['up','stable','down','point_peak','low_volume','no_data','inconclusive'].includes(item.status) &&
        Array.isArray(item.countries) && item.countries.length <= 250 && item.countries.every(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code)) &&
        (item.productAge === null || item.productAge === 'new' || item.productAge === 'old') &&
        typeof item.searchTerm === 'string' && item.searchTerm.length <= 1000 &&
        typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt)));
  }
  if (storeName === STORES.images) {
    return typeof record.searchTerm === 'string' && record.searchTerm.length <= 1000 &&
      Array.isArray(record.assessments) && record.assessments.length <= 10000 && record.assessments.every(item =>
        item && typeof item.assessmentId === 'string' && item.assessmentId.length <= 160 &&
        typeof item.country === 'string' && /^[A-Z]{2}$/.test(item.country) &&
        ['dominant','mixed','scarce','absent','ambiguous','inconclusive'].includes(item.status) &&
        Array.isArray(item.negativeKeywordCandidates) && item.negativeKeywordCandidates.length <= 1000 &&
        item.negativeKeywordCandidates.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500) &&
        typeof item.searchTerm === 'string' && item.searchTerm.length <= 1000 &&
        typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt)));
  }
  return false;
}

export async function putOfferRecord(storeName, record) {
  if (![STORES.offerMetadata, STORES.trends, STORES.images].includes(storeName) || !validOfferRecord(storeName, record)) {
    throw new Error('Registro de análise ClickBank inválido.');
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validDecisionRecord(record) {
  return Boolean(record && typeof record.offerKey === 'string' && record.offerKey.length > 0 && record.offerKey.length <= 1400 &&
    DECISION_VALUES.has(record.currentStatus) && typeof (record.notes ?? '') === 'string' && (record.notes ?? '').length <= 5000 &&
    (record.updatedAt == null || Number.isFinite(Date.parse(record.updatedAt))) && Array.isArray(record.history) && record.history.length <= 10000 &&
    record.history.every(item => item && DECISION_VALUES.has(item.status) && typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt)) &&
      typeof (item.notes ?? '') === 'string' && (item.notes ?? '').length <= 5000));
}

export async function putDecision(record) {
  if (!validDecisionRecord(record)) throw new Error('Decisão Top Offers CB inválida.');
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.decisions, 'readwrite');
    tx.objectStore(STORES.decisions).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function exportBackup() {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    captures: await getAll(),
    offerMetadata: await getAll(STORES.offerMetadata),
    trends: await getAll(STORES.trends),
    images: await getAll(STORES.images),
    decisions: await getAll(STORES.decisions),
  };
}

function metricIsValid(metric) {
  return metric && (metric.value === null || Number.isFinite(metric.value)) && typeof metric.raw === 'string' && metric.raw.length <= 300 && (metric.symbol === '' || metric.symbol === '$');
}

function optionalCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function isCapture(capture) {
  if (!(capture && typeof capture.captureId === 'string' && capture.captureId.length > 0 && capture.captureId.length <= 160 &&
    typeof capture.capturedAt === 'string' && Number.isFinite(Date.parse(capture.capturedAt)) &&
    capture.sourceFormat === 'clickbank-top-offers-v1' && typeof capture.listName === 'string' && capture.listName.length <= 160 &&
    capture.page && ['start','end','total','pageSize'].every(field => optionalCount(capture.page[field])) && typeof capture.page.completeUniverse === 'boolean' &&
    Array.isArray(capture.offers) && capture.offers.length <= 10000 && capture.offers.every(offer =>
      offer && Number.isSafeInteger(offer.rank) && offer.rank > 0 &&
      typeof offer.offerKey === 'string' && offer.offerKey.length > 0 && offer.offerKey.length <= 1400 &&
      offer.identitySource === 'seller+normalized-title' && typeof offer.offerName === 'string' && offer.offerName.length <= 1000 &&
      typeof offer.seller === 'string' && offer.seller.length <= 250 &&
      ['average', 'initial', 'future', 'epc', 'cvr', 'gravity'].every(field => metricIsValid(offer[field]))))) return false;
  return new Set(capture.offers.map(offer => offer.rank)).size === capture.offers.length &&
    new Set(capture.offers.map(offer => offer.offerKey)).size === capture.offers.length;
}

function validateBackup(payload) {
  if (payload?.format === LEGACY_BACKUP_FORMAT && payload?.schemaVersion === 1 && Array.isArray(payload?.captures)) {
    if (payload.captures.length > 10000 || !payload.captures.every(isCapture) ||
      new Set(payload.captures.map(capture => capture.captureId)).size !== payload.captures.length) {
      throw new Error('O backup antigo contém capturas inválidas ou excede o limite aceito.');
    }
    return {captures: payload.captures, offerMetadata: [], trends: [], images: [], decisions: []};
  }
  if (payload?.format === LEGACY_BACKUP_V2_FORMAT && payload?.schemaVersion === 2 && Array.isArray(payload?.captures) &&
    Array.isArray(payload?.offerMetadata) && Array.isArray(payload?.trends) && Array.isArray(payload?.images)) {
    const recordsAreValid = [STORES.offerMetadata, STORES.trends, STORES.images].every(name => {
      const records = payload[name];
      return records.length <= 10000 && records.every(record => validOfferRecord(name, record)) && new Set(records.map(record => record.offerKey)).size === records.length;
    });
    if (payload.captures.length > 10000 || !payload.captures.every(isCapture) || new Set(payload.captures.map(capture => capture.captureId)).size !== payload.captures.length || !recordsAreValid) {
      throw new Error('O backup v2 contém registros inválidos ou excede o limite aceito.');
    }
    return {captures: payload.captures, offerMetadata: payload.offerMetadata, trends: payload.trends, images: payload.images, decisions: []};
  }
  if (payload?.format !== BACKUP_FORMAT || payload?.schemaVersion !== DB_VERSION || !Array.isArray(payload?.captures) ||
    !Array.isArray(payload?.offerMetadata) || !Array.isArray(payload?.trends) || !Array.isArray(payload?.images) || !Array.isArray(payload?.decisions)) {
    throw new Error('O arquivo não é um backup Top Offers CB compatível.');
  }
  const validCaptures = payload.captures.length <= 10000 && payload.captures.every(isCapture) &&
    new Set(payload.captures.map(capture => capture.captureId)).size === payload.captures.length;
  const validRecords = [STORES.offerMetadata, STORES.trends, STORES.images].every(name => {
    const records = payload[name];
    return records.length <= 10000 && records.every(record => validOfferRecord(name, record)) &&
      new Set(records.map(record => record.offerKey)).size === records.length;
  });
  const validDecisions = payload.decisions.length <= 10000 && payload.decisions.every(validDecisionRecord) && new Set(payload.decisions.map(record => record.offerKey)).size === payload.decisions.length;
  if (!validCaptures || !validRecords || !validDecisions) {
    throw new Error('O backup contém capturas inválidas ou excede o limite aceito.');
  }
  return {captures: payload.captures, offerMetadata: payload.offerMetadata, trends: payload.trends, images: payload.images, decisions: payload.decisions};
}

function mergeDecisionRecord(existing, incoming) {
  const history = [...new Map([...existing.history, ...incoming.history].map(item => [`${item.capturedAt}\u0000${item.status}\u0000${item.notes || ''}`, item])).values()]
    .sort((a,b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  const latest = [existing, incoming].sort((a,b) => String(a.updatedAt || a.history.at(-1)?.capturedAt || '').localeCompare(String(b.updatedAt || b.history.at(-1)?.capturedAt || ''))).at(-1);
  return {...existing, ...latest, history};
}

export async function mergeBackup(payload) {
  const backup = validateBackup(payload);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    const result = {added: 0, merged: 0, unchanged: 0, conflicts: 0};
    for (const storeName of Object.values(STORES)) {
      const store = tx.objectStore(storeName);
      const key = storeName === STORES.captures ? 'captureId' : 'offerKey';
      for (const record of backup[storeName]) {
        const request = store.get(record[key]);
        request.onsuccess = () => {
          if (!request.result) {
            store.add(record);
            result.added++;
          } else if (JSON.stringify(request.result) === JSON.stringify(record)) result.unchanged++;
          else if (storeName === STORES.decisions) {
            const merged = mergeDecisionRecord(request.result, record);
            if (JSON.stringify(request.result) === JSON.stringify(merged)) result.unchanged++;
            else { store.put(merged); result.merged++; }
          } else result.conflicts++;
        };
      }
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
