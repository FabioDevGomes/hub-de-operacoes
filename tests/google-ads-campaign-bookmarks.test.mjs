import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GOOGLE_ADS_CAMPAIGN_BOOKMARKS_STORAGE_KEY, loadGoogleAdsCampaignBookmarks, matchGoogleAdsCampaignBookmark, normalizeGoogleAdsCampaignBookmarks, saveGoogleAdsCampaignBookmarks } from '../src/google-ads/google-ads-campaign-bookmarks.mjs';
import { matchOverviewCampaignBookmark } from '../src/google-ads/google-ads-campaign-bookmark-service.mjs';
import { readGoogleAdsResourceBookmarkFolder } from '../extensions/hub-2.0/google-ads-resource-bookmarks.mjs';

const campaignUrl = 'https://ads.google.com/aw/campaigns?ocid=3533796641&workspaceId=0';
const tree = [{ title: 'contas', children: [{ title: 'pag recursos', children: [
  { title: 'Campanhas - MCC nutra - Google Ads', url: campaignUrl },
  { title: 'MCC nutra - Recursos', url: 'https://ads.google.com/aw/assetreport/associations?ocid=3533796641' },
  { title: 'External', url: 'https://example.com/aw/campaigns?ocid=3533796641' },
] }] }];

test('extension reads campaign and resource links separately from the authorized folder', () => {
  const result = readGoogleAdsResourceBookmarkFolder(tree);
  assert.equal(result.folderFound, true);
  assert.deepEqual(result.campaignBookmarks, [{ title: 'Campanhas - MCC nutra - Google Ads', url: campaignUrl }]);
  assert.deepEqual(result.bookmarks, [{ title: 'MCC nutra - Recursos', url: 'https://ads.google.com/aw/assetreport/associations?ocid=3533796641' }]);
});

test('campaign bookmarks are matched by CID or account name and reject ambiguous and unsafe links', () => {
  const bookmarks = normalizeGoogleAdsCampaignBookmarks([
    { title: 'Campanhas - MCC nutra - Google Ads', url: campaignUrl },
    { title: 'unsafe', url: 'https://example.com/aw/campaigns' },
    { title: 'wrong page', url: 'https://ads.google.com/aw/assetreport/associations?ocid=3533796641' },
  ]);
  assert.equal(bookmarks.length, 1);
  assert.equal(matchGoogleAdsCampaignBookmark(bookmarks, { accountId: '3533796641' }).status, 'not-found', 'não infere o CID do ocid/uscid da URL');
  assert.equal(matchGoogleAdsCampaignBookmark([...bookmarks, { title: 'Campanhas MCC nutra 353-379-6641', url: campaignUrl }], { accountId: '3533796641' }).status, 'matched');
  assert.equal(matchGoogleAdsCampaignBookmark(bookmarks, { accountName: 'MCC nutra' }).bookmark.url, campaignUrl);
  assert.equal(matchGoogleAdsCampaignBookmark([...bookmarks, { title: 'Campanhas MCC nutra alternativa', url: 'https://ads.google.com/aw/campaigns?ocid=3533796641&workspaceId=1' }], { accountName: 'MCC nutra' }).status, 'ambiguous');
  assert.equal(matchGoogleAdsCampaignBookmark(bookmarks, { accountId: '9999999999' }).status, 'not-found');
});

test('overview resolves a unique campaign bookmark by the captured account name when its title omits the CID', async () => {
  const bookmark = { title: 'Campanhas - 1ª da MCC nutra .voltreva.shop - Google Ads', url: 'https://ads.google.com/aw/campaigns?ocid=8567605878&authuser=4' };
  const result = matchOverviewCampaignBookmark([bookmark], '761-756-9737', '1ª da MCC nutra .voltreva.shop');
  assert.equal(result.status, 'matched');
  assert.equal(result.bookmark.url, bookmark.url);

  const ambiguous = matchOverviewCampaignBookmark([
    bookmark,
    { title: 'Campanhas - 1ª da MCC nutra .voltreva.shop - alternativa - Google Ads', url: 'https://ads.google.com/aw/campaigns?ocid=8567605878&authuser=5' },
  ], '761-756-9737', '1ª da MCC nutra .voltreva.shop');
  assert.equal(ambiguous.status, 'ambiguous');

  const view = await readFile(new URL('../src/overview/view.js', import.meta.url), 'utf8');
  assert.match(view, /matchGoogleAdsCampaignBookmark\?\.\(accountId,googleAdsCampaignAction\?\.accountName\|\|'',campaignBookmarks\)/);
});

test('campaign bookmark storage uses an isolated key and preserves normalized records', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(saveGoogleAdsCampaignBookmarks([{ title: 'MCC nutra 3533796641', url: campaignUrl }], storage), { ok: true, bookmarks: [{ title: 'MCC nutra 3533796641', url: campaignUrl }] });
  assert.equal(data.has(GOOGLE_ADS_CAMPAIGN_BOOKMARKS_STORAGE_KEY), true);
  assert.deepEqual(loadGoogleAdsCampaignBookmarks(storage), [{ title: 'MCC nutra 3533796641', url: campaignUrl }]);
});

test('campaign bookmark synchronization refreshes saved batch actions', async () => {
  const source = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function applyGoogleAdsResourceBookmarksSnapshot(');
  const end = source.indexOf('function onGoogleAdsResourceBookmarksUpdate(', start);
  assert.ok(start >= 0 && end > start, 'the view owns bookmark snapshot application');
  const handler = source.slice(start, end);
  assert.match(handler, /saveGoogleAdsCampaignBookmarks\(snapshot\.campaignBookmarks/);
  assert.match(handler, /renderCampaignResult\(\)/, 'saved CSV/Excel rows refresh when favorites are synchronized');
});
