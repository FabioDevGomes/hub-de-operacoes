import {fetchGoogleAdsAccounts} from './google-ads-service.mjs?v=13';
import {normalizeGoogleAdsAccounts} from './google-ads-domain.mjs?v=6';
import {saveGoogleAdsAccountsCache} from './google-ads-accounts-cache.mjs?v=2';

export const GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT = 'hub:google-ads-account-directory-updated';

export async function refreshGoogleAdsAccountsDirectory({signal = null} = {}) {
  const accounts = normalizeGoogleAdsAccounts(await fetchGoogleAdsAccounts({signal}));
  const savedAtUtc = new Date().toISOString();
  let persisted = false;
  try {
    saveGoogleAdsAccountsCache(accounts, {savedAtUtc});
    persisted = true;
  } catch {
    // The current screen can use the fresh directory even when localStorage is unavailable.
  }

  const result = {accounts, savedAtUtc, persisted};
  if (globalThis.window?.dispatchEvent && typeof globalThis.CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new globalThis.CustomEvent(GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT, {detail: result}));
  }
  return result;
}
