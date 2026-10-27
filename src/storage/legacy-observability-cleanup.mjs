const LEGACY_DATABASE_NAME = 'radar-curadoria-observability';
const EVENTS_STORE_NAME = 'events';

function openHubDatabase() {
  const open = globalThis.HubDatabase?.openDatabase;
  if (typeof open !== 'function') throw new Error('A base local do Hub não está disponível nesta tela.');
  return open();
}

function databaseInventory(indexedDB) {
  if (typeof indexedDB?.databases !== 'function') {
    throw new Error('Este navegador não permite verificar com segurança se a base antiga de Observabilidade existe. Abra esta tela em Chrome ou Edge atualizado.');
  }
  return indexedDB.databases();
}

function openExistingDatabase(indexedDB, name) {
  return new Promise((resolve, reject) => {
    let upgradeAborted = false;
    let settled = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      upgradeAborted = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      if (upgradeAborted) {
        db.close();
        settled = true;
        resolve(null);
      } else {
        settled = true;
        resolve(db);
      }
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      if (upgradeAborted && request.error?.name === 'AbortError') resolve(null);
      else reject(request.error || new Error(`Não foi possível abrir a base local ${name}.`));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Feche outras abas antigas do Hub para verificar ${name}.`));
    };
  });
}

async function inspectLegacyDatabase(indexedDB) {
  const databases = await databaseInventory(indexedDB);
  if (!databases.some(database => database?.name === LEGACY_DATABASE_NAME)) {
    return { name: LEGACY_DATABASE_NAME, exists: false, stores: [], eventsCount: 0, hasEventsStore: false };
  }

  const db = await openExistingDatabase(indexedDB, LEGACY_DATABASE_NAME);
  if (!db) return { name: LEGACY_DATABASE_NAME, exists: false, stores: [], eventsCount: 0, hasEventsStore: false };
  try {
    const stores = [...db.objectStoreNames];
    const hasEventsStore = stores.includes(EVENTS_STORE_NAME);
    if (!hasEventsStore) return { name: LEGACY_DATABASE_NAME, exists: true, stores, eventsCount: 0, hasEventsStore: false };
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE_NAME, 'readonly');
      const request = tx.objectStore(EVENTS_STORE_NAME).count();
      let eventsCount = 0;
      request.onsuccess = () => { eventsCount = Number(request.result) || 0; };
      tx.oncomplete = () => resolve({ name: LEGACY_DATABASE_NAME, exists: true, stores, eventsCount, hasEventsStore });
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Não foi possível contar os registros antigos de Observabilidade.'));
    });
  } finally {
    db.close();
  }
}

async function inspectHubDatabase() {
  const db = await openHubDatabase();
  return new Promise((resolve, reject) => {
    try {
      const stores = ['bases'];
      if (db.objectStoreNames.contains(EVENTS_STORE_NAME)) stores.push(EVENTS_STORE_NAME);
      const tx = db.transaction(stores, 'readonly');
      const baseRequest = tx.objectStore('bases').get('atual');
      const eventRequest = stores.includes(EVENTS_STORE_NAME) ? tx.objectStore(EVENTS_STORE_NAME).count() : null;
      let base = null;
      let eventsCount = 0;
      baseRequest.onsuccess = () => { base = baseRequest.result || null; };
      if (eventRequest) eventRequest.onsuccess = () => { eventsCount = Number(eventRequest.result) || 0; };
      tx.oncomplete = () => {
        db.close();
        resolve({ eventsCount, hasEventsStore: Boolean(eventRequest), eventLogPresent: Boolean(base && Object.prototype.hasOwnProperty.call(base, 'event_log')) });
      };
      tx.onerror = tx.onabort = () => {
        const error = tx.error || new Error('Não foi possível verificar a base local do Hub.');
        db.close();
        reject(error);
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

function signatureOf(snapshot) {
  return JSON.stringify({
    hubEventsCount: snapshot.hub.eventsCount,
    hubHasEventsStore: snapshot.hub.hasEventsStore,
    eventLogPresent: snapshot.hub.eventLogPresent,
    legacyExists: snapshot.legacy.exists,
    legacyStores: [...snapshot.legacy.stores].sort(),
    legacyEventsCount: snapshot.legacy.eventsCount,
    legacyHasEventsStore: snapshot.legacy.hasEventsStore,
  });
}

export async function inspectLegacyObservability({ indexedDB = globalThis.indexedDB } = {}) {
  const [hub, legacy] = await Promise.all([
    inspectHubDatabase(),
    inspectLegacyDatabase(indexedDB),
  ]);
  return { hub, legacy };
}

async function clearHubRecords(preview) {
  const db = await openHubDatabase();
  return new Promise((resolve, reject) => {
    const stores = ['bases'];
    if (db.objectStoreNames.contains(EVENTS_STORE_NAME)) stores.push(EVENTS_STORE_NAME);
    let eventLogRemoved = false;
    let eventsRemoved = 0;
    let baseUpdatedAt = null;
    let stalePreviewError = null;
    try {
      const tx = db.transaction(stores, 'readwrite');
      const baseStore = tx.objectStore('bases');
      const baseRequest = baseStore.get('atual');
      let countRequest = null;
      if (stores.includes(EVENTS_STORE_NAME)) {
        const eventsStore = tx.objectStore(EVENTS_STORE_NAME);
        countRequest = eventsStore.count();
        countRequest.onsuccess = () => {
          eventsRemoved = Number(countRequest.result) || 0;
          if (eventsRemoved !== preview.hub.eventsCount) {
            stalePreviewError = new Error('A quantidade de eventos do Hub mudou desde a prévia. Verifique novamente antes de excluir.');
            tx.abort();
          }
        };
        eventsStore.clear();
      }
      baseRequest.onsuccess = () => {
        const base = baseRequest.result;
        const eventLogPresent = Boolean(base && Object.prototype.hasOwnProperty.call(base, 'event_log'));
        if (eventLogPresent !== preview.hub.eventLogPresent) {
          stalePreviewError = new Error('A base do Hub mudou desde a prévia. Verifique novamente antes de excluir.');
          tx.abort();
          return;
        }
        if (!base || typeof base !== 'object' || !Object.prototype.hasOwnProperty.call(base, 'event_log')) return;
        delete base.event_log;
        baseUpdatedAt = new Date().toISOString();
        base.atualizado_em = baseUpdatedAt;
        baseStore.put(base, 'atual');
        eventLogRemoved = true;
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ eventsRemoved, eventLogRemoved, baseUpdatedAt });
      };
      tx.onerror = tx.onabort = () => {
        const error = stalePreviewError || tx.error || new Error('A limpeza da base local do Hub foi interrompida.');
        db.close();
        reject(error);
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

async function clearLegacyEvents(indexedDB, preview) {
  if (!preview.exists || !preview.hasEventsStore || preview.eventsCount === 0) return { eventsRemoved: 0, skipped: false };
  const db = await openExistingDatabase(indexedDB, LEGACY_DATABASE_NAME);
  if (!db) return { eventsRemoved: 0, skipped: true, reason: 'A base antiga deixou de existir depois da prévia.' };
  try {
    if (!db.objectStoreNames.contains(EVENTS_STORE_NAME)) {
      return { eventsRemoved: 0, skipped: true, reason: 'A store events não está mais presente.' };
    }
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(EVENTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE_NAME);
      const countRequest = store.count();
      let eventsRemoved = 0;
      let stalePreviewError = null;
      countRequest.onsuccess = () => {
        eventsRemoved = Number(countRequest.result) || 0;
        if (eventsRemoved !== preview.eventsCount) {
          stalePreviewError = new Error('A quantidade de eventos da base antiga mudou desde a prévia. Verifique novamente antes de excluir.');
          tx.abort();
        }
      };
      store.clear();
      tx.oncomplete = () => resolve({ eventsRemoved, skipped: false });
      tx.onerror = tx.onabort = () => reject(stalePreviewError || tx.error || new Error('A limpeza da store legada events foi interrompida.'));
    });
  } finally {
    db.close();
  }
}

export async function clearLegacyObservability(preview, { indexedDB = globalThis.indexedDB, invalidateCache = () => {} } = {}) {
  if (!preview?.hub || !preview?.legacy) throw new Error('Faça uma prévia dos dados antes de confirmar a limpeza.');
  const latest = await inspectLegacyObservability({ indexedDB });
  if (signatureOf(latest) !== signatureOf(preview)) {
    throw new Error('Os dados mudaram desde a prévia. Verifique novamente antes de excluir.');
  }

  invalidateCache();
  const hub = await clearHubRecords(preview);
  let legacy;
  try {
    legacy = await clearLegacyEvents(indexedDB, preview.legacy);
  } catch (error) {
    legacy = { eventsRemoved: 0, skipped: true, reason: error instanceof Error ? error.message : 'Falha ao limpar a base antiga.' };
  }
  invalidateCache();
  return { hub, legacy, partial: Boolean(legacy.skipped && preview.legacy.eventsCount > 0) };
}
