export const GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID = '7617569737';

// Keep the complete URL exactly as supplied by the user. Existing account links
// continue to use googleAdsAccountAssetsHref() and are intentionally untouched.
export const GOOGLE_ADS_RESOURCES_PILOT_URL = 'https://ads.google.com/aw/assetreport/associations?ocid=8567605878&workspaceId=0&assetType=all&euid=1595241083&__u=7535994467&uscid=8567605878&__c=5126180422&authuser=4';

export function googleAdsResourcesPilotHref(customerId) {
  const accountId = String(customerId || '').replace(/\D/g, '');
  return accountId === GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID
    ? GOOGLE_ADS_RESOURCES_PILOT_URL
    : '';
}
