// This function is serialized by chrome.scripting.executeScript; keep it
// self-contained and operate only on the visible Google Ads account chooser.
export const GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID = '7617569737';
export const GOOGLE_ADS_RESOURCES_PILOT_URL = 'https://ads.google.com/aw/assetreport/associations?ocid=8567605878&workspaceId=0&assetType=all&euid=1595241083&__u=7535994467&uscid=8567605878&__c=5126180422&authuser=4';

export function googleAdsResourcesUrlForAccount(rawAccountId) {
  const accountId = String(rawAccountId || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(accountId)) return '';
  if (accountId === GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID) return GOOGLE_ADS_RESOURCES_PILOT_URL;

  const parameters = new URLSearchParams({
    ocid: accountId,
    workspaceId: '0',
    assetType: 'all',
    euid: '1595241083',
    __u: '7535994467',
    uscid: accountId,
    __c: '8442924178',
  });
  return 'https://ads.google.com/aw/assetreport/associations?' + parameters.toString();
}

export function selectGoogleAdsAccountFromChooser(rawAccountId) {
  const accountId = String(rawAccountId || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(accountId)) return { state: 'invalid-account' };

  const path = String(globalThis.location?.pathname || '').toLowerCase();
  const bodyText = String(document.body?.innerText || document.body?.textContent || '').toLocaleLowerCase();
  const isAccountChooser = /\/nav\/selectaccount\/?$/.test(path)
    || bodyText.includes('selecionar uma conta do google ads')
    || bodyText.includes('select a google ads account');
  if (!isAccountChooser) return { state: 'not-account-chooser' };

  const visible = element => Boolean(element?.getClientRects?.().length);
  const textOf = element => String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const includesAccountId = element => textOf(element).replace(/\D/g, '').includes(accountId);
  const clickables = [...document.querySelectorAll('a,button,[role="button"],[role="link"],[role="option"],[role="row"],[role="listitem"],[tabindex],tr')]
    .filter(element => visible(element) && includesAccountId(element))
    .sort((left, right) => textOf(left).length - textOf(right).length);

  let target = clickables[0] || null;
  if (!target) {
    const match = [...document.querySelectorAll('*')]
      .filter(element => visible(element) && includesAccountId(element))
      .sort((left, right) => textOf(left).length - textOf(right).length)[0] || null;
    for (let ancestor = match?.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const role = String(ancestor.getAttribute?.('role') || '').toLowerCase();
      if (ancestor.matches?.('a,button,[role="button"],[role="link"],[role="option"],[role="row"],[role="listitem"],[tabindex],tr')
          || ancestor.hasAttribute?.('onclick') || typeof ancestor.onclick === 'function'
          || ['button', 'link', 'option', 'row', 'listitem'].includes(role)) {
        target = ancestor;
        break;
      }
    }
    // Google Ads may delegate the row's click handler to a non-semantic wrapper;
    // clicking the exact visible CID text still bubbles to that row.
    if (!target) target = match;
  }

  if (!target || target === document.body || !includesAccountId(target)) {
    return { state: 'account-not-found', accountId };
  }
  target.click();
  return { state: 'selected', accountId };
}

export async function retryGoogleAdsAccountSelection(attemptSelection, {
  timeoutMs = 20000,
  intervalMs = 400,
  now = () => Date.now(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (typeof attemptSelection !== 'function') throw new TypeError('A seleção de conta precisa ser uma função.');
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  const interval = Math.max(1, Number(intervalMs) || 400);
  const deadline = now() + timeout;
  let result = await attemptSelection();

  while (result?.state === 'account-not-found') {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await wait(Math.min(interval, remaining));
    if (now() >= deadline) break;
    result = await attemptSelection();
  }
  return result;
}
