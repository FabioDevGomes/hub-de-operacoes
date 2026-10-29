import {normalizeAccountDomain, normalizeCustomerId} from './account-domains-domain.mjs?v=1';

export const ACCOUNT_DOMAIN_ASSOCIATIONS_KEY = 'hub:account-domain-associations:v1';
export const ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT = 'hub:account-domain-associations-updated';

function storageOf(storage) {
  try { return storage || globalThis.localStorage; }
  catch { return null; }
}

function normalizeRecord(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.accounts)) return {schemaVersion: 1, updatedAtUtc: '', accounts: []};
  const accounts = [];
  const seen = new Set();
  for (const item of value.accounts) {
    const customerId = normalizeCustomerId(item?.customerId);
    if (!customerId || seen.has(customerId)) continue;
    seen.add(customerId);
    accounts.push({
      customerId,
      managerCustomerId: normalizeCustomerId(item.managerCustomerId) || null,
      accountName: String(item.accountName || '').slice(0, 180),
      managerName: String(item.managerName || '').slice(0, 180),
      domain: normalizeAccountDomain(item.domain) || null,
      updatedAtUtc: typeof item.updatedAtUtc === 'string' ? item.updatedAtUtc : '',
      history: Array.isArray(item.history) ? item.history.slice(-50).map(entry => ({
        domain: normalizeAccountDomain(entry?.domain),
        endedAtUtc: typeof entry?.endedAtUtc === 'string' ? entry.endedAtUtc : '',
        source: entry?.source === 'legacy-name' ? 'legacy-name' : 'association',
      })).filter(entry => entry.domain) : [],
    });
  }
  return {schemaVersion: 1, updatedAtUtc: typeof value.updatedAtUtc === 'string' ? value.updatedAtUtc : '', accounts};
}

export function readAccountDomainAssociations(storage) {
  const target = storageOf(storage);
  if (!target) return {schemaVersion: 1, updatedAtUtc: '', accounts: []};
  try { return normalizeRecord(JSON.parse(target.getItem(ACCOUNT_DOMAIN_ASSOCIATIONS_KEY) || 'null')); }
  catch { return {schemaVersion: 1, updatedAtUtc: '', accounts: []}; }
}

export function findAccountDomainAssociation(customerId, {storage} = {}) {
  const id = normalizeCustomerId(customerId);
  if (!id) return null;
  return readAccountDomainAssociations(storage).accounts.find(item => item.customerId === id) || null;
}

export function saveAccountDomainAssociation({customerId, managerCustomerId = null, accountName = '', managerName = '', domain, legacyDomain = ''}, {storage, now = new Date().toISOString()} = {}) {
  const id = normalizeCustomerId(customerId);
  if (!id) throw new Error('Selecione uma conta Google Ads válida, com ID de 10 dígitos.');
  const normalizedDomain = domain == null || String(domain).trim() === '' ? null : normalizeAccountDomain(domain);
  if (domain != null && String(domain).trim() !== '' && !normalizedDomain) throw new Error('Informe somente um domínio válido, como exemplo.com.');
  const target = storageOf(storage);
  if (!target) throw new Error('O armazenamento local deste navegador não está disponível.');
  const current = readAccountDomainAssociations(target);
  const collision = normalizedDomain && current.accounts.find(item => item.customerId !== id && item.domain === normalizedDomain);
  if (collision) throw new Error(`O domínio ${normalizedDomain} já está associado à conta ${collision.accountName || collision.customerId}.`);
  const existing = current.accounts.find(item => item.customerId === id);
  const previousDomain = existing?.domain || (!existing ? normalizeAccountDomain(legacyDomain) : null);
  const history = [...(existing?.history || [])];
  if (previousDomain && previousDomain !== normalizedDomain) {
    history.push({domain: previousDomain, endedAtUtc: now, source: existing?.domain ? 'association' : 'legacy-name'});
  }
  const updated = {
    customerId: id,
    managerCustomerId: normalizeCustomerId(managerCustomerId) || null,
    accountName: String(accountName || existing?.accountName || '').slice(0, 180),
    managerName: String(managerName || existing?.managerName || '').slice(0, 180),
    domain: normalizedDomain,
    updatedAtUtc: now,
    history: history.slice(-50),
  };
  const next = {...current, updatedAtUtc: now, accounts: [...current.accounts.filter(item => item.customerId !== id), updated]};
  try { target.setItem(ACCOUNT_DOMAIN_ASSOCIATIONS_KEY, JSON.stringify(next)); }
  catch { throw new Error('Não foi possível salvar a associação neste navegador.'); }
  try {
    globalThis.window?.dispatchEvent(new CustomEvent(ACCOUNT_DOMAIN_ASSOCIATIONS_UPDATED_EVENT, {detail: {customerId: id, updatedAtUtc: now}}));
  } catch { /* The saved association remains available after a refresh. */ }
  return updated;
}
