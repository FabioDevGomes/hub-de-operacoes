import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHubCampaignConversionGoal, validateHubCampaignPositiveGeoTarget } from '../src/google-ads/google-ads-campaign-creation-service.mjs';

const validGoal = {
  goal_config_level: 'CAMPAIGN',
  custom_conversion_goal_name: 'meta personalizada da ação compra',
  conversion_action_name: 'Conversão compra off-line (upload)',
};

test('campaign preview accepts only the approved offline purchase custom goal', () => {
  assert.deepEqual(validateHubCampaignConversionGoal(validGoal), {
    customConversionGoalName: 'meta personalizada da ação compra',
    conversionActionName: 'Conversão compra off-line (upload)',
  });
});

test('campaign preview rejects account-default goals and other conversion actions', () => {
  assert.throws(() => validateHubCampaignConversionGoal({ ...validGoal, goal_config_level: 'CUSTOMER' }));
  assert.throws(() => validateHubCampaignConversionGoal({ ...validGoal, conversion_action_name: 'Flow Tracking' }));
});

test('campaign preview accepts the custom conversion action selected for its MCC', () => {
  const input = {
    managerCustomerId: '2231390435',
    conversionActionName: 'pixel MCC com meta',
    conversionActionResourceName: 'customers/2231390435/conversionActions/7817152054',
  };
  const result = {
    goal_config_level: 'CAMPAIGN',
    custom_conversion_goal_name: 'meta pixel MCC com meta',
    conversion_action_name: input.conversionActionName,
    conversion_action_resource_name: input.conversionActionResourceName,
  };
  assert.deepEqual(validateHubCampaignConversionGoal(result, { input }), {
    customConversionGoalName: 'meta pixel MCC com meta',
    conversionActionName: 'pixel MCC com meta',
    conversionActionResourceName: 'customers/2231390435/conversionActions/7817152054',
  });
});

test('campaign creation requires server read-back confirmation of the custom goal', () => {
  assert.throws(() => validateHubCampaignConversionGoal(validGoal, { requireVerified: true }));
  assert.deepEqual(validateHubCampaignConversionGoal({ ...validGoal, conversion_goal_verified: true }, { requireVerified: true }), {
    customConversionGoalName: 'meta personalizada da ação compra',
    conversionActionName: 'Conversão compra off-line (upload)',
  });
});

test('new campaign preview requires physical presence targeting for included locations', () => {
  assert.deepEqual(validateHubCampaignPositiveGeoTarget({ positive_geo_target_type: 'PRESENCE' }), {
    positiveGeoTargetType: 'PRESENCE',
    description: 'Pessoas que estão nos locais incluídos ou que frequentam essas áreas',
  });
  assert.throws(() => validateHubCampaignPositiveGeoTarget({ positive_geo_target_type: 'PRESENCE_OR_INTEREST' }), /segmentação por presença/);
  assert.throws(() => validateHubCampaignPositiveGeoTarget({}), /serviço privado/);
});
