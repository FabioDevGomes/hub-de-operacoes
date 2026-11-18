import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExistingCampaignDeliverySettings } from '../src/google-ads/google-ads-campaign-creation-service.mjs';

const input = {
  managerCustomerId: '1234567890',
  customerId: '0987654321',
  campaignId: '1234567890123',
  campaignName: 'Campaign 01',
};

function response(payload) {
  return { ok: true, status: 200, headers: { get: () => '' }, json: async () => payload };
}

test('delivery settings action sends one explicit campaign confirmation and accepts verified PRESENCE + goal', async () => {
  let sent;
  const result = await applyExistingCampaignDeliverySettings(input, {
    token: 'synthetic-token',
    fetchImpl: async (url, options) => {
      sent = { url, options, payload: JSON.parse(options.body) };
      return response({
        ok: true, schema_version: 1, operation: 'apply_existing_campaign_delivery_settings',
        campaign_id: input.campaignId, campaign_name: input.campaignName, status: 'PAUSED', channel_type: 'SEARCH',
        positive_geo_target_type: 'PRESENCE', presence_verified: true, presence_changed: true,
        goal_name: 'meta personalizada da ação compra', conversion_action_name: 'Conversão compra off-line (upload)',
        goal_verified: true, goal_changed: true, verified: true, failure_code: '', verified_at_utc: '2026-11-03T15:00:00Z',
      });
    },
  });
  assert.equal(sent.payload.operation, 'apply_existing_campaign_delivery_settings');
  assert.equal(sent.payload.manager_customer_id, input.managerCustomerId);
  assert.equal(sent.payload.customer_id, input.customerId);
  assert.equal(sent.payload.campaign_id, input.campaignId);
  assert.equal(sent.payload.campaign_name, input.campaignName);
  assert.equal(sent.payload.confirm, true);
  assert.equal(result.verified, true);
  assert.equal(result.presenceVerified, true);
  assert.equal(result.goalVerified, true);
  assert.equal(result.status, 'PAUSED');
});

test('partial API confirmation is returned for local checkpointing instead of being discarded', async () => {
  const result = await applyExistingCampaignDeliverySettings(input, {
    token: 'synthetic-token',
    fetchImpl: async () => response({
      ok: true, schema_version: 1, operation: 'apply_existing_campaign_delivery_settings',
      campaign_id: input.campaignId, campaign_name: input.campaignName, status: 'PAUSED', channel_type: 'SEARCH',
      positive_geo_target_type: 'PRESENCE', presence_verified: true, presence_changed: true,
      goal_name: 'meta personalizada da ação compra', conversion_action_name: 'Conversão compra off-line (upload)',
      goal_verified: false, goal_changed: false, verified: false, failure_code: 'campaign_delivery_settings_unverified',
      verified_at_utc: '2026-11-03T15:00:00Z',
    }),
  });
  assert.equal(result.verified, false);
  assert.equal(result.presenceVerified, true);
  assert.equal(result.goalVerified, false);
  assert.match(result.errorMessage, /não confirmou/);
});

test('delivery settings action rejects mismatched campaign identity or an unpaused success', async () => {
  for (const payload of [
    { ok: true, schema_version: 1, operation: 'apply_existing_campaign_delivery_settings', campaign_id: '9', campaign_name: input.campaignName, status: 'PAUSED', channel_type: 'SEARCH', positive_geo_target_type: 'PRESENCE', presence_verified: true, presence_changed: false, goal_name: 'meta personalizada da ação compra', conversion_action_name: 'Conversão compra off-line (upload)', goal_verified: true, goal_changed: false, verified: true, failure_code: '', verified_at_utc: '' },
    { ok: true, schema_version: 1, operation: 'apply_existing_campaign_delivery_settings', campaign_id: input.campaignId, campaign_name: input.campaignName, status: 'ENABLED', channel_type: 'SEARCH', positive_geo_target_type: 'PRESENCE', presence_verified: true, presence_changed: false, goal_name: 'meta personalizada da ação compra', conversion_action_name: 'Conversão compra off-line (upload)', goal_verified: true, goal_changed: false, verified: true, failure_code: '', verified_at_utc: '' },
  ]) {
    await assert.rejects(applyExistingCampaignDeliverySettings(input, {
      token: 'synthetic-token', fetchImpl: async () => response(payload),
    }), /não confirmou/);
  }
});
