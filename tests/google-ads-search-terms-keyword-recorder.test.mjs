import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordGoogleAdsSearchTermsKeywordAdditions,
  resolveSearchTermsDiaryCampaignId,
} from '../src/google-ads/google-ads-search-terms-keyword-recorder.mjs';

const managerCustomerId = '2231390435';
const result = {
  customer_id: '0000006497',
  campaign_id: '987654321',
  campaign_name: '13/11 - Power Heat Pro DE02 12 (GM-NBB-DE) 60% - US$ 107.00',
};

test('prefers the exact MCC, account and Google Ads campaign mapping', () => {
  const inventory = new Map([
    ['internal-1', { mappingStatus: 'mapped', managerCustomerId, customerId: result.customer_id, campaignId: result.campaign_id }],
    ['internal-2', { mappingStatus: 'mapped', managerCustomerId, customerId: result.customer_id, campaignId: '999' }],
  ]);
  assert.equal(resolveSearchTermsDiaryCampaignId({ database: { campanhas: [] }, inventory, managerCustomerId, result }), 'internal-1');
});

test('falls back to one exact local campaign name within the same MCC and account', () => {
  const database = { campanhas: [
    { id: 'internal-1', mcc_id: managerCustomerId, conta_id: '6497', nome_mcc: result.campaign_name },
    { id: 'other-account', mcc_id: managerCustomerId, conta_id: '0000007441', nome_mcc: result.campaign_name },
  ] };
  assert.equal(resolveSearchTermsDiaryCampaignId({ database, inventory: new Map(), managerCustomerId, result }), 'internal-1');
});

test('does not guess when the local campaign name is ambiguous', () => {
  const campaign = { mcc_id: managerCustomerId, conta_id: result.customer_id, nome_mcc: result.campaign_name };
  const database = { campanhas: [{ ...campaign, id: 'internal-1' }, { ...campaign, id: 'internal-2' }] };
  assert.equal(resolveSearchTermsDiaryCampaignId({ database, inventory: new Map(), managerCustomerId, result }), '');
});

test('reports local history as incomplete when a result cannot be linked safely', async () => {
  let appended = false;
  const saved = await recordGoogleAdsSearchTermsKeywordAdditions({
    database: { campanhas: [] }, inventory: new Map(), managerCustomerId, term: 'pesquisa teste',
    matchType: 'EXACT', occurredAtUtc: '2026-11-14T15:00:00.000Z', results: [result],
    openDatabase: async () => {}, domain: {}, storage: { appendCampaignKeywordAddedEvents: async () => { appended = true; } },
  });
  assert.equal(saved.recorded, false);
  assert.equal(saved.unresolvedCount, 1);
  assert.equal(appended, false);
});

test('records confirmed negatives against their resolved local campaigns', async () => {
  let savedInput;
  const saved = await recordGoogleAdsSearchTermsKeywordAdditions({
    database: { campanhas: [] },
    inventory: new Map([['internal-1', { mappingStatus: 'mapped', managerCustomerId, customerId: result.customer_id, campaignId: result.campaign_id }]]),
    managerCustomerId, term: 'pesquisa teste', matchType: 'PHRASE', occurredAtUtc: '2026-11-14T15:00:00.000Z', results: [result],
    openDatabase: async () => {}, domain: {},
    storage: { appendCampaignKeywordAddedEvents: async input => { savedInput = input; return { base: {}, changed: true }; } },
  });
  assert.equal(saved.recorded, true);
  assert.deepEqual(savedInput.inputs, [{ campaignId: 'internal-1', term: 'pesquisa teste', matchType: 'PHRASE', kind: 'negative', source: 'search_terms', occurredAtUtc: '2026-11-14T15:00:00.000Z' }]);
});
