import test from 'node:test';
import assert from 'node:assert/strict';
import { planCpaExpansion } from '../src/google-ads/google-ads-cpa-expansion.mjs';
import { createCpaExpansion, readCpaExpansion, cpaExpansionBlocksSharedSteps } from '../src/google-ads/google-ads-cpa-expansion-store.mjs';
import { runCpaExpansion } from '../src/google-ads/google-ads-cpa-expansion-runner.mjs';
import { appendGoogleAdsCampaignToBatch, saveGoogleAdsCampaignBatch, loadGoogleAdsCampaignBatches } from '../src/google-ads/google-ads-campaign-batches-storage.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const ids = ['1111111111', '2222222222', '3333333333'];
const campaign = (account, id, percent) => ({ managerCustomerId: '4444444444', customerId: account,
  campaignId: id, adGroupId: '900', campaignName: 'CPA ' + percent, status: 'PAUSED', source: 'created', customResult: 'preserved' });

test('expands a three-account batch without recreating existing combinations and retains prior results', async () => {
  const storage = memoryStorage();
  saveGoogleAdsCampaignBatch({ id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    sitelinks: [], customSettings: 'retained', campaigns: ids.map((id, index) => campaign(id, String(index + 1), 40)) }, { storage });
  const accounts = ids.slice(0, 2).map(accountId => ({ accountId, finalUrl: 'https://example.test/' + accountId }));
  const parseCampaignName = name => ({ ok: /^CPA \d+$/.test(name), targetCpaPercent: Number(name.slice(4)) });
  const plan = planCpaExpansion({ accounts, percents: [40, 50], campaigns: loadGoogleAdsCampaignBatches({ storage }).batches[0].campaigns, parseCampaignName });
  assert.equal(plan.alreadyExists.length, 2);
  assert.equal(plan.toCreate.length, 2);
  const entries = plan.toCreate.map((row, index) => ({ id: 'entry' + index, percent: row.percent,
    payload: { customerId: row.account.accountId, managerCustomerId: '4444444444', campaignName: 'new ' + index, finalUrl: row.account.finalUrl } }));
  createCpaExpansion('batch', entries, storage);
  assert.equal(cpaExpansionBlocksSharedSteps(readCpaExpansion('batch', storage)), true);
  let creates = 0;
  await runCpaExpansion({ batchId: 'batch', storage, withLock: async (_, fn) => fn(),
    preview: async payload => ({ validated_only: true, will_create_paused: true, campaign_status: 'PAUSED', campaign_name: payload.campaignName }),
    create: async payload => ({ campaignId: String(10 + creates++), campaignName: payload.campaignName, adGroupId: '901', status: 'PAUSED' }),
    merge: async (result, entry) => {
      appendGoogleAdsCampaignToBatch('batch', { ...result, managerCustomerId: entry.payload.managerCustomerId,
        customerId: entry.payload.customerId, finalUrl: entry.payload.finalUrl, source: 'created' }, { storage });
      return true;
    },
  });
  const batch = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  assert.equal(creates, 2);
  assert.equal(batch.campaigns.length, 5);
  assert.equal(batch.customSettings, 'retained');
  assert.deepEqual(batch.campaigns.slice(0, 3).map(item => item.customResult), ['preserved', 'preserved', 'preserved']);
  assert.equal(cpaExpansionBlocksSharedSteps(readCpaExpansion('batch', storage)), false);
});
