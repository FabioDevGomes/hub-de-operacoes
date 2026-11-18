import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCpaExpansionTargets } from '../src/google-ads/google-ads-cpa-expansion-targets.mjs';

test('only published pages explicitly linked to the selected delivery supply targets', () => {
  const accounts = [{ customerId: '1234567890', managerCustomerId: '2345678901', currencyCode: 'USD' }];
  const target = { accountId: '1234567890', publicUrl: 'https://example.test/page', status: 'published' };
  const jobs = [{ id: 'job1', product: 'Product', campaignDeliveryId: 'delivery', targets: [target] },
    { id: 'job2', product: 'Product', campaignDeliveryId: 'other', targets: [{ ...target, publicUrl: 'https://other.test/' }] }];
  const args = { deliveryId: 'delivery', product: 'Product', jobs, accounts };
  assert.equal(resolveCpaExpansionTargets(args)[0].finalUrl, 'https://example.test/page');
  assert.equal(resolveCpaExpansionTargets({ ...args, jobs: [jobs[1]] }).length, 0);
  const legacy = { ...jobs[0], id: 'legacy', campaignDeliveryId: '' };
  assert.equal(resolveCpaExpansionTargets({ ...args, jobs: [legacy] }).length, 0);
  assert.equal(resolveCpaExpansionTargets({ ...args, jobs: [legacy], legacyJobIds: ['legacy'] }).length, 1);
  const conflict = resolveCpaExpansionTargets({ ...args, jobs: [...jobs, { ...jobs[0], id: 'job3', targets: [{ ...target, publicUrl: 'https://conflict.test/' }] }] })[0];
  assert.equal(conflict.finalUrl, '');
  assert.match(conflict.reason, /mais de uma URL/);
});
