export function googleAdsAccountAssetsHref(customerId) {
  const accountId = String(customerId || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(accountId)) return '';

  const parameters = new URLSearchParams({
    ocid: accountId,
    workspaceId: '0',
    assetType: 'all',
    euid: '1595241083',
    __u: '7535994467',
    uscid: accountId,
    __c: '8442924178',
    authuser: '4',
  });

  return 'https://ads.google.com/aw/assetreport/associations?' + parameters.toString();
}
