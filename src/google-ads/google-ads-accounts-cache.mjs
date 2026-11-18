export const GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY = 'hub.google-ads-account-directory:v1';
const CUSTOMER_ID = /^\d{10}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ACCOUNT_METADATA_CONTEXT_TOKEN = /^[A-Za-z0-9_-]{1,1800}\.[A-Za-z0-9_-]{43}$/;

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
  const validTimestamp = timestamp => typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp));
  return validTimestamp(value.savedAtUtc)
    && (value.refreshedAtUtc == null || validTimestamp(value.refreshedAtUtc));
}

function directoryContent(value) {
  const managers = (Array.isArray(value?.managers) ? value.managers : []).map(manager => ({
    customerId: manager?.customerId == null ? null : String(manager.customerId),
    name: String(manager?.name || ''),
    currencyCode: String(manager?.currencyCode || ''),
    timeZone: String(manager?.timeZone || ''),
  })).sort((left, right) => String(left.customerId ?? '').localeCompare(String(right.customerId ?? '')));
  const accounts = (Array.isArray(value?.accounts) ? value.accounts : []).map(account => ({
    customerId: String(account?.customerId || ''),
    managerCustomerId: account?.managerCustomerId == null ? null : String(account.managerCustomerId),
    managerName: String(account?.managerName || ''),
    name: String(account?.name || ''),
    currencyCode: String(account?.currencyCode || ''),
    timeZone: String(account?.timeZone || ''),
    status: String(account?.status || ''),
    creationDate: String(account?.creationDate || ''),
  })).sort((left, right) => left.customerId.localeCompare(right.customerId));
  return JSON.stringify({managers, accounts});
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
      refreshedAtUtc: value.refreshedAtUtc || value.savedAtUtc,
    };
  } catch {
    return null;
  }
}

export function saveGoogleAdsAccountsCache(accounts, {
  storage = null,
  savedAtUtc = new Date().toISOString(),
  refreshedAtUtc = new Date().toISOString(),
} = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  let previous = null;
  try {
    const candidate = JSON.parse(target.getItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY) || 'null');
    if (validDirectory(candidate)) previous = candidate;
  } catch { /* A cache inválida será substituída somente após a nova lista passar pela validação. */ }
  const incomingAccounts = Array.isArray(accounts?.accounts) ? accounts.accounts : [];
  const accountsForCache = incomingAccounts.map(account => {
    const previousAccount = previous?.accounts.find(item => String(item.customerId) === String(account?.customerId)
      && (item.managerCustomerId ?? null) === (account?.managerCustomerId ?? null)
      && item.currencyCode === account?.currencyCode
      && item.timeZone === account?.timeZone);
    const reusableToken = previousAccount?.accountMetadataContextToken;
    return !account?.accountMetadataContextToken && typeof reusableToken === 'string' && reusableToken.length <= 2048
      && ACCOUNT_METADATA_CONTEXT_TOKEN.test(reusableToken)
      ? { ...account, accountMetadataContextToken: reusableToken }
      : account;
  });
  const nextDirectory = { managers: Array.isArray(accounts?.managers) ? accounts.managers : [], accounts: accountsForCache };
  const unchanged = Boolean(previous && directoryContent(previous) === directoryContent(nextDirectory));
  let directorySavedAtUtc = unchanged ? previous.savedAtUtc : savedAtUtc;
  if (!unchanged && previous && directorySavedAtUtc === previous.savedAtUtc) {
    directorySavedAtUtc = new Date(Date.parse(previous.savedAtUtc) + 1).toISOString();
  }
  const value = {
    schemaVersion: 1,
    savedAtUtc: directorySavedAtUtc,
    refreshedAtUtc,
    generatedAtUtc: String(accounts?.generatedAtUtc || ''),
    warningCount: Math.max(0, Math.min(1000, Math.trunc(Number(accounts?.warningCount) || 0))),
    managers: nextDirectory.managers,
    accounts: accountsForCache,
  };
  if (!validDirectory(value)) throw new Error('A lista de MCCs e contas não passou pela validação local.');
  try {
    target.setItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error('Não foi possível guardar a lista localmente neste perfil do navegador.');
  }
  return { savedAtUtc: value.savedAtUtc, refreshedAtUtc: value.refreshedAtUtc, contentChanged: !unchanged };
}

export function saveGoogleAdsAccountMetadataContextToken({ customerId, managerCustomerId = null, accountMetadataContextToken }, { storage = null } = {}) {
  const customer = String(customerId ?? '');
  const manager = managerCustomerId == null ? null : String(managerCustomerId);
  const token = String(accountMetadataContextToken ?? '');
  if (!CUSTOMER_ID.test(customer) || (manager !== null && !CUSTOMER_ID.test(manager))
      || token.length > 2048 || !ACCOUNT_METADATA_CONTEXT_TOKEN.test(token)) return false;
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { return false; }
  if (!target) return false;
  try {
    const value = JSON.parse(target.getItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY) || 'null');
    if (!validDirectory(value)) return false;
    const account = value.accounts.find(item => String(item.customerId) === customer
      && (item.managerCustomerId ?? null) === manager);
    if (!account) return false;
    if (account.accountMetadataContextToken === token) return true;
    account.accountMetadataContextToken = token;
    target.setItem(GOOGLE_ADS_ACCOUNTS_CACHE_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
