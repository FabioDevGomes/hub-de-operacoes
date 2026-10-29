import assert from 'node:assert/strict';
import { googleAdsAccountAssetsHref } from '../src/google-ads/google-ads-account-assets-link.mjs';

const accountId = '1234567890';
const href = googleAdsAccountAssetsHref(accountId);
const url = new URL(href);

assert.equal(href, `https://ads.google.com/aw/assetreport/associations?ocid=${accountId}&workspaceId=0&assetType=all&euid=1595241083&__u=7535994467&uscid=${accountId}&__c=8442924178&authuser=4`);
assert.equal(url.origin, 'https://ads.google.com');
assert.equal(url.pathname, '/aw/assetreport/associations');
assert.deepEqual([...url.searchParams.entries()], [
  ['ocid', accountId],
  ['workspaceId', '0'],
  ['assetType', 'all'],
  ['euid', '1595241083'],
  ['__u', '7535994467'],
  ['uscid', accountId],
  ['__c', '8442924178'],
  ['authuser', '4'],
]);
assert.equal(googleAdsAccountAssetsHref('123-456-7890'), href, 'IDs formatados são normalizados');
assert.equal(googleAdsAccountAssetsHref('123456789'), '', 'IDs incompletos não geram link');
assert.equal(googleAdsAccountAssetsHref(''), '', 'conta ausente não gera link');

console.log('Google Ads account links open the asset associations page with the supplied URL pattern.');
