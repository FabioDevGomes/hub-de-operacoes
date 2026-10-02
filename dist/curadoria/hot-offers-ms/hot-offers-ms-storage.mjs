export const DB_NAME = 'radar-hot-offers-ms';
export const DB_VERSION = 1;
export const STORES = Object.freeze({
  offers: 'offers',
  collections: 'collections',
  snapshots: 'collection_offer_snapshots',
  decisions: 'decisions',
  trends: 'trends',
  images: 'images',
});

export function openHotOffersMsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.offers)) db.createObjectStore(STORES.offers, {keyPath: 'offerKey'});
      if (!db.objectStoreNames.contains(STORES.collections)) db.createObjectStore(STORES.collections, {keyPath: 'collectionId'});
      if (!db.objectStoreNames.contains(STORES.snapshots)) {
        const store = db.createObjectStore(STORES.snapshots, {keyPath: 'snapshotId'});
        store.createIndex('collectionId', 'collectionId');
        store.createIndex('offerKey', 'offerKey');
      }
      for (const name of [STORES.decisions, STORES.trends, STORES.images]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, {keyPath: 'offerKey'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openHotOffersMsDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getByKey(storeName, key) {
  const db = await openHotOffersMsDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  const db = await openHotOffersMsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveCollection({offers, collection, snapshots}) {
  const db = await openHotOffersMsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.offers, STORES.collections, STORES.snapshots], 'readwrite');
    for (const offer of offers) tx.objectStore(STORES.offers).put(offer);
    tx.objectStore(STORES.collections).put(collection);
    for (const snapshot of snapshots) tx.objectStore(STORES.snapshots).put(snapshot);
    tx.oncomplete = () => resolve(collection);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
