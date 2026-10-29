import { openDatabase } from '../storage/hub-database.mjs?v=1';
import { fetchGoogleAdsFinalUrlHosts } from './google-ads-service.mjs?v=13';

export const GOOGLE_ADS_FINAL_URL_HOST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const CACHE_PROPERTY = 'google_ads_api_final_url_hosts';
const inFlightAccounts = new Map();

function normalizeCustomerId(value) {
  const id = String(value ?? '').replace(/\D/g, '');
  return /^\d{10}$/.test(id) ? id : null;
}

function normalizeHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

function emptyCache() {
  return { schemaVersion: 1, updatedAtUtc: null, accounts: [] };
}

function normalizeCache(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.accounts)) return emptyCache();
  return {
    schemaVersion: 1,
    updatedAtUtc: typeof value.updatedAtUtc === 'string' ? value.updatedAtUtc : null,
    accounts: value.accounts.filter(item => normalizeCustomerId(item?.customerId)).map(item => ({
      managerCustomerId: normalizeCustomerId(item.managerCustomerId),
      customerId: normalizeCustomerId(item.customerId),
      refreshedAtUtc: typeof item.refreshedAtUtc === 'string' ? item.refreshedAtUtc : null,
      attemptedAtUtc: typeof item.attemptedAtUtc === 'string' ? item.attemptedAtUtc : null,
      lastErrorCode: typeof item.lastErrorCode === 'string' ? item.lastErrorCode.slice(0, 100) : null,
      rowCount: Number.isInteger(item.rowCount) && item.rowCount >= 0 ? item.rowCount : 0,
      rows: Array.isArray(item.rows) ? item.rows.flatMap(row => {
        const campaignId = String(row?.campaignId ?? '');
        if (!/^[1-9]\d{0,19}$/.test(campaignId)) return [];
        const hostnames = [...new Set((Array.isArray(row.hostnames) ? row.hostnames : []).map(normalizeHost).filter(Boolean))];
        return hostnames.length ? [{
          campaignId,
          campaignName: String(row.campaignName ?? '').slice(0, 300),
          campaignStatus: row.campaignStatus === 'ENABLED' ? 'ENABLED' : '',
          adStatus: row.adStatus === 'ENABLED' ? 'ENABLED' : '',
          hostnames,
        }] : [];
      }) : [],
    })),
  };
}

async function readBaseCache({ openDb = openDatabase, database = globalThis.CampaignDatabase } = {}) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['bases'], 'readonly');
      const request = tx.objectStore('bases').get('atual');
      let cache = emptyCache(), failure = null;
      request.onsuccess = () => {
        const base = request.result;
        if (!base || base.schema !== database?.SCHEMA) failure = new Error('A base atual não foi reconhecida; o cache de URLs não foi lido.');
        else cache = normalizeCache(base[CACHE_PROPERTY]);
      };
      request.onerror = () => { failure = request.error || new Error('Não foi possível ler o cache local de URLs finais.'); };
      tx.oncomplete = () => failure ? reject(failure) : resolve(cache);
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível ler o cache local de URLs finais.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A leitura do cache local de URLs finais foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function readGoogleAdsFinalUrlHostCache(options = {}) {
  return readBaseCache(options);
}

export async function readGoogleAdsFinalUrlHostRows(options = {}) {
  const cache = await readBaseCache(options);
  const nowMs = (options.now?.() || new Date()).getTime();
  return cache.accounts.filter(account => {
    const refreshedAt = Date.parse(account.refreshedAtUtc || '');
    return Number.isFinite(refreshedAt) && nowMs - refreshedAt >= 0 && nowMs - refreshedAt < GOOGLE_ADS_FINAL_URL_HOST_CACHE_TTL_MS;
  }).flatMap(account => account.rows.map(row => ({
    managerCustomerId: account.managerCustomerId,
    customerId: account.customerId,
    refreshedAtUtc: account.refreshedAtUtc,
    ...row,
  })));
}

function normalizePayload(payload, account) {
  if (!payload || payload.ok !== true || (payload.queryComplete ?? payload.query_complete) !== true
      || (payload.customerId ?? payload.customer_id) !== account.customerId
      || ((payload.managerCustomerId ?? payload.manager_customer_id) || null) !== (account.managerCustomerId || null)
      || !Array.isArray(payload.rows)) {
    throw new Error('O serviço não confirmou uma consulta completa de destinos para esta conta.');
  }
  if (payload.rows.length > 5000) throw new Error('A lista de destinos excedeu o limite seguro; nenhum cache parcial foi aplicado.');
  const byCampaign = new Map();
  for (const row of payload.rows) {
    const campaignId = String(row?.campaignId ?? row?.campaign_id ?? '');
    if (!/^[1-9]\d{0,19}$/.test(campaignId) || (row?.campaignStatus ?? row?.campaign_status) !== 'ENABLED'
        || (row?.adStatus ?? row?.ad_status) !== 'ENABLED') {
      throw new Error('A consulta retornou um anúncio ou campanha fora do status ENABLED; cache preservado.');
    }
    const hostnames = [...new Set((Array.isArray(row.hostnames) ? row.hostnames : []).map(normalizeHost).filter(Boolean))];
    if (!hostnames.length) continue;
    const previous = byCampaign.get(campaignId) || {
      campaignId,
      campaignName: String(row.campaignName ?? row.campaign_name ?? '').slice(0, 300),
      campaignStatus: 'ENABLED',
      adStatus: 'ENABLED',
      hostnames: new Set(),
    };
    hostnames.forEach(hostname => previous.hostnames.add(hostname));
    byCampaign.set(campaignId, previous);
  }
  return [...byCampaign.values()].map(row => ({ ...row, hostnames: [...row.hostnames] }));
}

async function updateAccountCache(account, updater, options = {}) {
  const managerCustomerId = normalizeCustomerId(account.managerCustomerId);
  const customerId = normalizeCustomerId(account.customerId);
  if (!customerId || (account.managerCustomerId != null && !managerCustomerId)) {
    throw new Error('O diretório contém um ID de conta ou MCC inválido.');
  }
  const key = `${managerCustomerId || 'direct'}:${customerId}`;
  const existing = inFlightAccounts.get(key);
  if (existing) return existing;
  const promise = updater({ ...account, managerCustomerId, customerId }, options).finally(() => inFlightAccounts.delete(key));
  inFlightAccounts.set(key, promise);
  return promise;
}

export async function syncGoogleAdsFinalUrlHostCache(accounts, { fetchHosts = fetchGoogleAdsFinalUrlHosts, openDb = openDatabase, database = globalThis.CampaignDatabase, now = () => new Date(), signal } = {}) {
  if (!Array.isArray(accounts) || !accounts.length) return { refreshedAccounts: [], skippedAccounts: [], failures: [] };
  const cache = await readBaseCache({ openDb, database });
  const cachedByKey = new Map(cache.accounts.map(item => [`${item.managerCustomerId || 'direct'}:${item.customerId}`, item]));
  const pending = [];
  const skippedAccounts = [];
  for (const account of accounts) {
    const customerId = normalizeCustomerId(account?.customerId);
    const managerCustomerId = normalizeCustomerId(account?.managerCustomerId);
    if (!customerId || (account?.managerCustomerId != null && !managerCustomerId)) {
      pending.push({ ...account, customerId: account?.customerId || '', invalid: true });
      continue;
    }
    const previous = cachedByKey.get(`${managerCustomerId || 'direct'}:${customerId}`);
    const lastSuccess = Date.parse(previous?.refreshedAtUtc || '');
    const lastAttempt = Date.parse(previous?.attemptedAtUtc || '');
    const timestamp = now().getTime();
    const fresh = Number.isFinite(lastSuccess) && timestamp - lastSuccess < GOOGLE_ADS_FINAL_URL_HOST_CACHE_TTL_MS;
    const backoff = Number.isFinite(lastAttempt) && timestamp - lastAttempt < FAILURE_RETRY_DELAY_MS;
    if (fresh || backoff) skippedAccounts.push(customerId);
    else pending.push({ ...account, customerId, managerCustomerId });
  }
  if (!pending.length) return { refreshedAccounts: [], skippedAccounts, failures: [] };

  const refreshedAccounts = [];
  const failures = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pending.length) {
      if (signal?.aborted) throw new DOMException('Atualização do cache de URLs interrompida.', 'AbortError');
      const account = pending[nextIndex++];
      const label = String(account.name || account.customerId || 'Conta Google Ads').slice(0, 120);
      try {
        if (account.invalid) throw new Error('O ID de conta ou MCC é inválido.');
        await updateAccountCache(account, async (validAccount, callOptions) => {
          try {
            const payload = await fetchHosts(validAccount, callOptions);
            const rows = normalizePayload(payload, validAccount);
            const generatedAtUtc = String(payload.generatedAtUtc || payload.generated_at_utc || now().toISOString());
            await storeAccount(validAccount, { rows, rowCount: Number(payload.rowCount ?? payload.row_count) || rows.length, refreshedAtUtc: generatedAtUtc, attemptedAtUtc: now().toISOString(), lastErrorCode: null }, { openDb, database, now });
            refreshedAccounts.push(validAccount.customerId);
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            await storeAccount(validAccount, { attemptedAtUtc: now().toISOString(), lastErrorCode: String(error?.code || 'final_url_hosts_refresh_failed').slice(0, 100) }, { openDb, database, now });
            failures.push(`${label}: ${String(error?.message || 'Falha ao atualizar destinos.').slice(0, 240)}`);
          }
        }, { signal });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        failures.push(`${label}: ${String(error?.message || 'Falha ao atualizar destinos.').slice(0, 240)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, () => worker()));
  return { refreshedAccounts, skippedAccounts, failures };
}

async function storeAccount(account, update, { openDb = openDatabase, database = globalThis.CampaignDatabase, now = () => new Date() } = {}) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['bases'], 'readwrite');
      const store = tx.objectStore('bases');
      const request = store.get('atual');
      let failure = null;
      request.onsuccess = () => {
        try {
          const base = request.result;
          if (!base || base.schema !== database?.SCHEMA) throw new Error('A base atual não foi reconhecida; o cache de URLs não foi salvo.');
          const cache = normalizeCache(base[CACHE_PROPERTY]);
          const key = `${account.managerCustomerId || 'direct'}:${account.customerId}`;
          const index = cache.accounts.findIndex(item => `${item.managerCustomerId || 'direct'}:${item.customerId}` === key);
          const previous = index >= 0 ? cache.accounts[index] : { managerCustomerId: account.managerCustomerId, customerId: account.customerId, refreshedAtUtc: null, attemptedAtUtc: null, lastErrorCode: null, rowCount: 0, rows: [] };
          const next = {
            ...previous,
            ...update,
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            rows: Array.isArray(update.rows) ? update.rows : previous.rows,
            rowCount: Number.isInteger(update.rowCount) ? update.rowCount : previous.rowCount,
          };
          if (index >= 0) cache.accounts[index] = next;
          else cache.accounts.push(next);
          cache.updatedAtUtc = now().toISOString();
          base[CACHE_PROPERTY] = cache;
          store.put(base, 'atual');
        } catch (error) { failure = error; tx.abort(); }
      };
      request.onerror = () => { failure = request.error || new Error('Não foi possível abrir a base local para salvar URLs.'); tx.abort(); };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível salvar o cache local de URLs.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A gravação do cache local de URLs foi cancelada.'));
    });
  } finally { db.close(); }
  const rows = await readGoogleAdsFinalUrlHostRows({ openDb, database });
  if (typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent?.(new globalThis.CustomEvent('google-ads-final-url-host-cache-updated', { detail: { rows } }));
  }
}
