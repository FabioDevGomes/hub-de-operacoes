export const GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY = 'hub.google-ads-account-directory:v1';
const CUSTOMER_ID = /^\d{10}$/;
const CURRENCY = /^[A-Z]{3}$/;

function validDirectory(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.managers) || !Array.isArray(value.accounts)) return false;
  const managerKeys = new Set();
  for (const manager of value.managers) {
    if (!manager || !(manager.customerId == null || CUSTOMER_ID.test(String(manager.customerId))) || typeof manager.name !== 'string') return false;
    managerKeys.add(manager.customerId == null ? 'direct' : String(manager.customerId));
  }
  const seenAccounts = new Set();
  for (const account of value.accounts) {
    if (!account || !CUSTOMER_ID.test(String(account.customerId)) || !(account.managerCustomerId == null || CUSTOMER_ID.test(String(account.managerCustomerId)))) return false;
    if (!CURRENCY.test(String(account.currencyCode || ''))) return false;
    const managerKey = account.managerCustomerId == null ? 'direct' : String(account.managerCustomerId);
    if (!managerKeys.has(managerKey)) return false;
    if (seenAccounts.has(String(account.customerId))) return false;
    seenAccounts.add(String(account.customerId));
  }
  return typeof value.savedAtUtc === 'string' && !Number.isNaN(Date.parse(value.savedAtUtc));
}

export function loadGoogleAdsAccountsCache({ storage = null } = {}) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return null;
    const value = JSON.parse(target.getItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY) || 'null');
    if (!validDirectory(value)) return null;
    return {
      accounts: {
        managers: value.managers,
        accounts: value.accounts,
        generatedAtUtc: value.generatedAtUtc || '',
        warningCount: Math.max(0, Math.min(1000, Math.trunc(Number(value.warningCount) || 0))),
      },
      savedAtUtc: value.savedAtUtc,
    };
  } catch {
    return null;
  }
}

export function saveGoogleAdsAccountsCache(accounts, { storage = null, savedAtUtc = new Date().toISOString() } = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  const value = {
    schemaVersion: 1,
    savedAtUtc,
    generatedAtUtc: String(accounts?.generatedAtUtc || ''),
    warningCount: Math.max(0, Math.min(1000, Math.trunc(Number(accounts?.warningCount) || 0))),
    managers: Array.isArray(accounts?.managers) ? accounts.managers : [],
    accounts: Array.isArray(accounts?.accounts) ? accounts.accounts : [],
  };
  if (!validDirectory(value)) throw new Error('A lista de MCCs e contas não passou pela validação local.');
  try {
    target.setItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error('Não foi possível guardar a lista localmente neste perfil do navegador.');
  }
  return { savedAtUtc };
}
