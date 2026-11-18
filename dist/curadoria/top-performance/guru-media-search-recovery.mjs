import * as Storage from './top-performance-storage.mjs?v=2';

function recoveredOfferFromSnapshot(snapshot, group, collectionsById) {
  const collection = collectionsById.get(String(snapshot.collectionId || '')) || null;
  const movement = (collection?.movements || []).find(item => String(item?.offerId || '') === String(snapshot.offerId));
  return {
    ...snapshot,
    offerId: snapshot.offerId,
    firstSeenAt: group.firstSeenAt || snapshot.capturedAt || collection?.capturedAt || '',
    lastSeenAt: snapshot.capturedAt || collection?.capturedAt || '',
    presentInLatestCollection: (collection?.offerIds || []).some(id => String(id) === String(snapshot.offerId)),
    latestCollectionId: snapshot.collectionId || '',
    latestSourceOrder: snapshot.sourceOrder ?? null,
    latestMovement: movement?.movement || 'same',
    positionDelta: movement?.positionDelta ?? null,
  };
}

function offerFromSearchRecord(record, fallback = {}) {
  const offerId = String(record?.offerId || '').trim();
  const productName = String(record?.productName || fallback.productName || '').trim();
  if (!offerId || !productName) return null;
  return {
    offerId,
    productName,
    productKey: productName.toLocaleLowerCase('pt-BR'),
    thumbnailUrl: null,
    badges: { new: false, top: false, brandOk: false },
    countriesVisible: [],
    additionalCountryCount: 0,
    fullCountries: null,
    payout: { value: null, currency: 'USD', raw: '' },
    rawDetails: '',
    pageLanguage: null,
    variant: null,
    ctcValue: null,
    ctcCurrency: null,
    flags: { acceptsPaypal: false, presellPage: false, directCheckout: false, higherCpa: false, lowCtc: false },
    category: null,
    sourceFormat: 'search-history-recovery',
    availableFields: { payout: false, rawDetails: false, thumbnailUrl: false, countries: false, badges: false, category: false },
    recoveredFromSearchHistory: true,
  };
}

export async function recoverMissingGuruMediaOffersFromRecords({ existingOffers = [], snapshots = [], collections = [], trends = [], images = [] } = {}) {
  const existingIds = new Set(existingOffers.map(item => String(item.offerId)));
  const collectionsById = new Map(collections.map(item => [String(item.collectionId), item]));
  const snapshotsByOffer = new Map();
  for (const snapshot of snapshots) {
    const id = String(snapshot?.offerId || '').trim();
    if (!id) continue;
    const group = snapshotsByOffer.get(id) || { firstSeenAt: '', latest: null, latestTime: -Infinity };
    const capturedAt = snapshot.capturedAt || collectionsById.get(String(snapshot.collectionId || ''))?.capturedAt || '';
    const time = Date.parse(capturedAt) || 0;
    if (!group.firstSeenAt || time < (Date.parse(group.firstSeenAt) || 0)) group.firstSeenAt = capturedAt;
    if (!group.latest || time >= group.latestTime) {
      group.latest = snapshot;
      group.latestTime = time;
    }
    snapshotsByOffer.set(id, group);
  }

  const candidates = [];
  for (const [id, group] of snapshotsByOffer) {
    if (existingIds.has(id) || !group.latest) continue;
    candidates.push(recoveredOfferFromSnapshot(group.latest, group, collectionsById));
    existingIds.add(id);
  }
  const searchRecords = new Map();
  for (const record of [...trends, ...images]) {
    const id = String(record?.offerId || '').trim();
    if (!id || existingIds.has(id)) continue;
    const previous = searchRecords.get(id) || {};
    searchRecords.set(id, { ...previous, ...record, offerId: id, productName: record.productName || previous.productName });
  }
  for (const record of searchRecords.values()) {
    const offer = offerFromSearchRecord(record);
    if (offer) {
      candidates.push(offer);
      existingIds.add(String(offer.offerId));
    }
  }
  if (!candidates.length) return { recovered: [], candidateCount: 0 };

  const database = await Storage.openTopPerformanceDB();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(Storage.STORES.offers, 'readwrite');
      const store = transaction.objectStore(Storage.STORES.offers);
      const recovered = [];
      for (const candidate of candidates) {
        const request = store.get(candidate.offerId);
        request.onsuccess = () => {
          if (request.result) return;
          store.put(candidate);
          recovered.push(candidate);
        };
      }
      transaction.oncomplete = () => resolve({ recovered, candidateCount: candidates.length });
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível recuperar as ofertas do histórico local.'));
      transaction.onabort = () => reject(transaction.error || new Error('A recuperação do histórico local foi interrompida.'));
    });
  } finally {
    database.close();
  }
}

export async function recoverMissingGuruMediaOffers() {
  try {
    const [existingOffers, snapshots, collections, trends, images] = await Promise.all([
      Storage.getAll(Storage.STORES.offers),
      Storage.getAll(Storage.STORES.snapshots),
      Storage.getAll(Storage.STORES.collections),
      Storage.getAll(Storage.STORES.trends),
      Storage.getAll(Storage.STORES.images),
    ]);
    return (await recoverMissingGuruMediaOffersFromRecords({ existingOffers, snapshots, collections, trends, images })).recovered;
  } catch (error) {
    // Recovery is a best-effort repair. A failure must not prevent the main
    // Guru Media list from loading records already present in IndexedDB.
    console.error('A recuperação do histórico Guru Media falhou; a lista continuará usando as ofertas já salvas.', error);
    return [];
  }
}
