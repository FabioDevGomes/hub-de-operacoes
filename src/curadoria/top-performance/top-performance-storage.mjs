import { curationBridges } from '../central-bridge-slot.mjs';

export const DB_NAME = 'radar-top-performance';
export const DB_VERSION = 2;
export const STORES = Object.freeze({
  offers: 'offers',
  collections: 'collections',
  snapshots: 'collection_offer_snapshots',
  decisions: 'decisions',
  trends: 'trends',
  images: 'images',
});

export function configureGuruCentral(bridge) {
  if (bridge !== null && (!bridge || ['getGuruRecord', 'listGuruRecords', 'putGuruRecord', 'updateGuruRecord', 'saveGuruCollection'].some(name => typeof bridge[name] !== 'function'))) throw new Error('Ponte central incompleta');
  curationBridges.guru = bridge;
}

export function openTopPerformanceDB() {
  if (curationBridges.guru) return Promise.reject(new Error('Acesso IndexedDB direto não está integrado ao modo central.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.offers)) db.createObjectStore(STORES.offers, { keyPath: 'offerId' });
      if (!db.objectStoreNames.contains(STORES.collections)) db.createObjectStore(STORES.collections, { keyPath: 'collectionId' });
      const snapshots = db.objectStoreNames.contains(STORES.snapshots)
        ? request.transaction.objectStore(STORES.snapshots)
        : db.createObjectStore(STORES.snapshots, { keyPath: 'snapshotId' });
      if (!snapshots.indexNames.contains('collectionId')) snapshots.createIndex('collectionId', 'collectionId');
      if (!snapshots.indexNames.contains('offerId')) snapshots.createIndex('offerId', 'offerId');
      if (!db.objectStoreNames.contains(STORES.decisions)) db.createObjectStore(STORES.decisions, { keyPath: 'offerId' });
      if (!db.objectStoreNames.contains(STORES.trends)) db.createObjectStore(STORES.trends, { keyPath: 'offerId' });
      if (!db.objectStoreNames.contains(STORES.images)) db.createObjectStore(STORES.images, { keyPath: 'offerId' });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Feche ou atualize outras abas antigas do Hub para concluir a migração do banco Guru Media.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

function withTransaction(storeNames, mode, configure) {
  return openTopPerformanceDB().then(db => new Promise((resolve, reject) => {
    let transaction;
    let result;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      db.close();
      callback(value);
    };
    try {
      transaction = db.transaction(storeNames, mode);
      transaction.oncomplete = () => finish(resolve, result);
      transaction.onerror = () => finish(reject, transaction.error || new Error('A transação do banco Guru Media falhou.'));
      transaction.onabort = () => finish(reject, transaction.error || new Error('A transação do banco Guru Media foi interrompida.'));
      configure(transaction, value => { result = value; });
    } catch (error) {
      try { transaction?.abort(); } catch {}
      finish(reject, error);
    }
  }));
}

export function getAll(store) {
  if (curationBridges.guru) return curationBridges.guru.listGuruRecords(store);
  return withTransaction(store, 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => setResult(request.result);
  });
}

export function getByKey(store, key) {
  if (curationBridges.guru) return curationBridges.guru.getGuruRecord(store, key);
  return withTransaction(store, 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => setResult(request.result || null);
  });
}

export function put(store, value, { notifyCuration = true } = {}) {
  const write = curationBridges.guru ? curationBridges.guru.putGuruRecord(store, value) : withTransaction(store, 'readwrite', (transaction, setResult) => {
    transaction.objectStore(store).put(value);
    setResult(value);
  });
  return write.then(saved => {
    if (notifyCuration && ['decisions', 'trends', 'images'].includes(store) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('curation-record-written', {
        detail: { origin: 'guru-media-ecommerce-gm', store, record: value },
      }));
    }
    return saved;
  });
}
export function trendSearchHistory(entry){const history=(Array.isArray(entry?.searchHistory)?entry.searchHistory:[]).filter(search=>search&&typeof search.searchedAt==='string'&&Number.isFinite(new Date(search.searchedAt).getTime())).map(search=>({term:String(search.term||'').trim(),searchedAt:search.searchedAt}));if(typeof entry?.lastSearchedAt==='string'&&Number.isFinite(new Date(entry.lastSearchedAt).getTime())&&!history.some(search=>search.searchedAt===entry.lastSearchedAt))history.push({term:'',searchedAt:entry.lastSearchedAt});return history.sort((a,b)=>new Date(b.searchedAt)-new Date(a.searchedAt))}
export function appendTrendSearch(entry,searchedAt,term){const normalizedTerm=String(term||'').trim();if(!normalizedTerm||!Number.isFinite(new Date(searchedAt).getTime()))return trendSearchHistory(entry);return[{term:normalizedTerm,searchedAt},...trendSearchHistory(entry)]}
export function setTrendSearchTimestamp(offerId, productName, searchedAt, searchedTerm) {
  if (curationBridges.guru) return curationBridges.guru.updateGuruRecord(STORES.trends, offerId, previous => {
    const current = previous || { offerId, productName, assessments: [] };
    return { ...current, offerId, productName, lastSearchedAt: searchedAt, searchHistory: appendTrendSearch(current, searchedAt, searchedTerm) };
  });
  return withTransaction(STORES.trends, 'readwrite', (transaction, setResult) => {
    const store = transaction.objectStore(STORES.trends);
    const request = store.get(offerId);
    request.onsuccess = () => {
      const current = request.result || { offerId, productName, assessments: [] };
      const saved = {
        ...current,
        offerId,
        productName,
        lastSearchedAt: searchedAt,
        searchHistory: appendTrendSearch(current, searchedAt, searchedTerm),
      };
      store.put(saved);
      setResult(saved);
    };
  });
}

export function saveCollection({ offers, collection, snapshots }) {
  if (curationBridges.guru) return curationBridges.guru.saveGuruCollection({ offers, collection, snapshots }).then(() => undefined);
  return withTransaction([STORES.offers, STORES.collections, STORES.snapshots], 'readwrite', transaction => {
    for (const item of offers) transaction.objectStore(STORES.offers).put(item);
    transaction.objectStore(STORES.collections).put(collection);
    for (const item of snapshots) transaction.objectStore(STORES.snapshots).put(item);
  });
}
