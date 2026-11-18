import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGoogleAdsCampaignBatch, appendGoogleAdsCampaignToBatch, loadGoogleAdsCampaignBatches } from '../src/google-ads/google-ads-campaign-batches-storage.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const campaign = (id, name) => ({ managerCustomerId: '1234567890', customerId: '2345678901', campaignId: id, adGroupId: '42', campaignName: name, status: 'PAUSED', source: 'created' });

test('append preserves batch and campaign results and is idempotent', () => {
  const storage = memoryStorage();
  const old = { ...campaign('101', 'old'), customData: 'preserved' };
  saveGoogleAdsCampaignBatch({ id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', campaigns: [old], customBatchData: 'preserved', sitelinks: [], imageUploadConfirmed: true, imageUploadConfirmedAccountIds: ['2345678901'] }, { storage });
  appendGoogleAdsCampaignToBatch('batch', campaign('102', 'new'), { storage });
  appendGoogleAdsCampaignToBatch('batch', campaign('102', 'new'), { storage });
  const batch = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  assert.equal(batch.campaigns.length, 2);
  assert.equal(batch.campaigns[0].customData, 'preserved');
  assert.equal(batch.customBatchData, 'preserved');
  assert.equal(batch.imageUploadConfirmed, false);
  assert.deepEqual(batch.imageUploadConfirmationHistory[0].accountIds, ['2345678901']);
  assert.throws(() => appendGoogleAdsCampaignToBatch('batch', campaign('103', 'new'), { storage }), /outro ID/);
  assert.throws(() => appendGoogleAdsCampaignToBatch('batch', { ...campaign('104', 'bad'), status: 'ENABLED' }, { storage }), /pausado/);
  assert.equal(loadGoogleAdsCampaignBatches({ storage }).batches[0].campaigns.length, 2);
});
