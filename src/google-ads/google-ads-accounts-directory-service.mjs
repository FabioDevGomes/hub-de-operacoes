import {fetchGoogleAdsAccounts} from './google-ads-service.mjs?v=16';
import {normalizeGoogleAdsAccounts} from './google-ads-domain.mjs?v=7';
import {saveGoogleAdsAccountsCache} from './google-ads-accounts-cache.mjs?v=4';

export const GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT = 'hub:google-ads-account-directory-updated';

export async function refreshGoogleAdsAccountsDirectory({signal = null} = {}) {
  const accounts = normalizeGoogleAdsAccounts(await fetchGoogleAdsAccounts({signal}));
  const refreshedAtUtc = new Date().toISOString();
  let savedAtUtc = refreshedAtUtc;
  let persisted = false;
  try {
    const saved = saveGoogleAdsAccountsCache(accounts, {savedAtUtc: refreshedAtUtc, refreshedAtUtc});
    savedAtUtc = saved.savedAtUtc;
    persisted = true;
  } catch {
    // The current screen can use the fresh directory even when localStorage is unavailable.
  }

  const result = {accounts, savedAtUtc, refreshedAtUtc, persisted};
  if (globalThis.window?.dispatchEvent && typeof globalThis.CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new globalThis.CustomEvent(GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT, {detail: result}));
  }
  return result;
}
