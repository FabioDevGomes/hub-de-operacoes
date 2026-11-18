import test from 'node:test';
import assert from 'node:assert/strict';
import { planCpaExpansion } from '../src/google-ads/google-ads-cpa-expansion.mjs';

const accounts = ['1234567890', '2345678901'].map(accountId => ({ accountId, finalUrl: 'https://example.test/' + accountId }));
const parseCampaignName = name => /^CPA (\d+)$/.test(name) ? { ok: true, targetCpaPercent: Number(name.slice(4)) } : { ok: false };

test('expansion skips only existing account and CPA combinations', () => {
  const result = planCpaExpansion({ accounts, percents: [40, 50, 50], campaigns: [{ customerId: accounts[0].accountId, campaignName: 'CPA 40' }], parseCampaignName });
  assert.deepEqual(result.toCreate.map(x => [x.account.accountId, x.percent]), [['1234567890', 50], ['2345678901', 40], ['2345678901', 50]]);
  assert.deepEqual(result.alreadyExists.map(x => [x.account.accountId, x.percent]), [['1234567890', 40]]);
});

test('unknown existing CPA and invalid URL block planning', () => {
  assert.throws(() => planCpaExpansion({ accounts, percents: [50], campaigns: [{ customerId: accounts[0].accountId, campaignName: 'unknown' }], parseCampaignName }), /identificar a faixa/);
  assert.throws(() => planCpaExpansion({ accounts: [{ ...accounts[0], finalUrl: 'http://example.test' }], percents: [50], campaigns: [], parseCampaignName }), /HTTPS/);
});
