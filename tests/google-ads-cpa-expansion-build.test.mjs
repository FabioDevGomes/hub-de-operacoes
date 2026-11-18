import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCpaExpansionEntries } from '../src/google-ads/google-ads-cpa-expansion-build.mjs';

test('campaign additions preserve the base payload and use each account URL and CPA', () => {
  const input = { plan: { toCreate: [{ account: { accountId: '1234567890', managerCustomerId: '0987654321', currencyCode: 'USD', finalUrl: 'https://example.test/1', account: { name: 'Conta' } }, percent: 50 }] }, basePayload: { campaignName: 'Base', biddingStrategy: 'TARGET_CPA', headlines: ['Preserved'] }, source: { product: 'Product', commission: 100, currency: 'USD' }, firstIteration: 2, makeName: (_, number, percent) => `${number}-${percent}`, calculateCpa: ({ percent }) => ({ targetAmount: String(percent) }) };
  const entries = buildCpaExpansionEntries(input);
  assert.equal(entries[0].payload.campaignName, '2-50');
  assert.equal(entries[0].payload.finalUrl, 'https://example.test/1');
  assert.equal(entries[0].payload.targetCpa, '50');
  assert.deepEqual(entries[0].payload.headlines, ['Preserved']);
  assert.equal(input.basePayload.campaignName, 'Base');
});
