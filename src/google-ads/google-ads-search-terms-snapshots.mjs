const DATABASE_NAME = 'hub-google-ads-search-terms-snapshots';
const DATABASE_VERSION = 1;
const STORE_NAME = 'queries';
const MAX_SNAPSHOTS = 3;
const SNAPSHOT_ID = /^gsts-[a-z0-9-]{8,100}$/i;
let databasePromise = null;
const CONSULTATION_ID = /^gsc-[a-z0-9-]{8,100}$/i;

export function createGoogleAdsSearchTermsConsultationId() {
  const random = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
  return "gsc-" + random;
}

function legacyConsultationIdentity(query) {
  if (!query || !Array.isArray(query.reports) || !query.reports.length) return "";
  const reports = query.reports.map(report => ({
    customerId: String(report?.customerId || ""),
    queryCompletedAtUtc: String(report?.queryCompletedAtUtc || ""),
  })).sort((left, right) => left.customerId.localeCompare(right.customerId));
  if (reports.some(report => !/^\d{10}$/.test(report.customerId) || !Number.isFinite(Date.parse(report.queryCompletedAtUtc)))) return "";
  return JSON.stringify([
    String(query.managerKey || ""),
    (Array.isArray(query.selectedCustomerIds) ? query.selectedCustomerIds : []).map(String).sort(),
    String(query.dateFrom || ""),
    String(query.dateTo || ""),
    query.campaignId == null ? null : String(query.campaignId),
    reports,
  ]);
}

function duplicateLegacyConsultation(left, right) {
  if (!left || !right || left.consultationId || right.consultationId) return false;
  const rightKey = right.legacyConsultationIdentity || legacyConsultationIdentity(right);
  return Boolean(rightKey && (left.legacyConsultationIdentity || legacyConsultationIdentity(left)) === rightKey);
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('O armazenamento local de snapshots não está disponível neste navegador.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento local dos snapshots.'));
    request.onblocked = () => reject(new Error('O armazenamento local dos snapshots está bloqueado por outra aba.'));
  }).catch(error => { databasePromise = null; throw error; });
  return databasePromise;
}

function snapshotLabel(query) {
  if (query.campaignName) return String(query.campaignName).slice(0, 300);
  const accountCount = Array.isArray(query.selectedCustomerIds) ? query.selectedCustomerIds.length : 0;
  return query.campaignId ? 'Campanha selecionada' : String(accountCount) + ' conta(s) · todas as campanhas';
}

function snapshotSummary(snapshot) {
  return {
    id: snapshot.id,
    consultationId: snapshot.consultationId || null,
    campaignName: snapshot.campaignName,
    completedAtUtc: snapshot.completedAtUtc,
    savedAtUtc: snapshot.savedAtUtc,
    managerKey: snapshot.managerKey,
    selectedCustomerIds: [...snapshot.selectedCustomerIds],
    dateFrom: snapshot.dateFrom,
    dateTo: snapshot.dateTo,
    campaignId: snapshot.campaignId || null,
    reportCount: snapshot.reports.length,
    rowCount: snapshot.reports.reduce((count, report) => count + Number(report.rowCount || 0), 0),
    failureCount: snapshot.failures.length,
  };
}

function snapshotRetentionKey(snapshot) {
  if (!snapshot?.campaignId || !Array.isArray(snapshot.selectedCustomerIds) || snapshot.selectedCustomerIds.length !== 1) return 'all-campaigns';
  return JSON.stringify([String(snapshot.managerKey || ''), String(snapshot.selectedCustomerIds[0] || ''), String(snapshot.campaignId || '')]);
}

function matchesCampaignScope(snapshot, scope) {
  if (!scope || !/^\d{10}$/.test(scope.managerCustomerId) || !/^\d{10}$/.test(scope.customerId) || !/^[1-9]\d{0,19}$/.test(scope.campaignId)) return false;
  return String(snapshot.managerKey || '') === scope.managerCustomerId
    && Array.isArray(snapshot.selectedCustomerIds) && snapshot.selectedCustomerIds.length === 1
    && String(snapshot.selectedCustomerIds[0]) === scope.customerId
    && String(snapshot.campaignId || '') === scope.campaignId;
}

function newSnapshotId() {
  const random = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  return 'gsts-' + random;
}

export async function saveGoogleAdsSearchTermsSnapshot(query, { completedAtUtc = new Date().toISOString(), consultationId = query?.consultationId || "" } = {}) {
  if (!query || !Array.isArray(query.reports) || !query.reports.length || !Array.isArray(query.selectedCustomerIds) || !query.selectedCustomerIds.length) {
    throw new Error("A consulta não contém resultados completos para criar um snapshot.");
  }
  if (consultationId && !CONSULTATION_ID.test(String(consultationId))) {
    throw new Error("O identificador desta consulta é inválido; o snapshot não foi salvo.");
  }
  const legacyIdentity = consultationId ? "" : legacyConsultationIdentity(query);
  const snapshot = {
    ...query,
    ...(consultationId ? { consultationId: String(consultationId) } : {}),
    ...(legacyIdentity ? { legacyConsultationIdentity: legacyIdentity } : {}),
    id: newSnapshotId(),
    schemaVersion: 1,
    completedAtUtc,
    savedAtUtc: completedAtUtc,
    campaignName: snapshotLabel(query),
  };
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let summaries = [];
    let persistedSnapshot = snapshot;
    let alreadySaved = false;
    let transactionError = "";
    request.onsuccess = () => {
      const records = request.result;
      const bucket = records.filter(item => snapshotRetentionKey(item) === snapshotRetentionKey(snapshot));
      const duplicate = consultationId
        ? records.find(item => item.consultationId === consultationId)
        : bucket.find(item => duplicateLegacyConsultation(item, snapshot));
      if (duplicate && snapshotRetentionKey(duplicate) !== snapshotRetentionKey(snapshot)) {
        transactionError = "Este identificador de consulta já pertence a outro escopo.";
        try { transaction.abort(); } catch {}
        return;
      }
      if (duplicate) {
        persistedSnapshot = duplicate;
        alreadySaved = true;
      }
      const retained = [...bucket.filter(item => item?.id !== persistedSnapshot.id), persistedSnapshot]
        .sort((left, right) => String(right.completedAtUtc || "").localeCompare(String(left.completedAtUtc || "")))
        .slice(0, MAX_SNAPSHOTS);
      const retainedIds = new Set(retained.map(item => item.id));
      for (const item of bucket) if (!retainedIds.has(item.id)) store.delete(item.id);
      if (!alreadySaved) store.put(snapshot);
      summaries = retained.map(snapshotSummary);
    };
    request.onerror = () => { try { transaction.abort(); } catch {} };
    transaction.oncomplete = () => resolve({ snapshot: snapshotSummary(persistedSnapshot), snapshots: summaries, alreadySaved });
    transaction.onerror = () => reject(new Error(transactionError || "Não foi possível salvar o snapshot local da consulta."));
    transaction.onabort = () => reject(new Error(transactionError || "Não foi possível salvar o snapshot local da consulta."));
  });
}
export async function listGoogleAdsSearchTermsSnapshots(scope = null) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const ordered = request.result.sort((left, right) => String(right.completedAtUtc || '').localeCompare(String(left.completedAtUtc || '')));
      const seenConsultations = new Set();
      const unique = ordered.filter(snapshot => {
        const identity = snapshot.consultationId
          ? "run:" + snapshot.consultationId
          : snapshot.legacyConsultationIdentity || legacyConsultationIdentity(snapshot);
        const key = identity ? (snapshot.consultationId ? identity : "legacy:" + identity) : "snapshot:" + snapshot.id;
        if (seenConsultations.has(key)) return false;
        seenConsultations.add(key);
        return true;
      });
      const scoped = scope ? unique.filter(snapshot => matchesCampaignScope(snapshot, scope)) : unique;
      resolve(scoped.slice(0, MAX_SNAPSHOTS).map(snapshotSummary));

    };
    request.onerror = () => reject(new Error('Não foi possível ler os snapshots locais.'));
  });
}

export async function loadGoogleAdsSearchTermsSnapshot(id) {
  if (typeof id !== 'string' || !SNAPSHOT_ID.test(id)) return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Não foi possível abrir o snapshot local.'));
  });
}
