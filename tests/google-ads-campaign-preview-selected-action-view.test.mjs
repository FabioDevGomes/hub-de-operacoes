import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const viewSource = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');

test('campaign preview rows validate against the selected MCC conversion action', () => {
  assert.match(viewSource, /validateHubCampaignConversionGoal\(result,\s*\{\s*input:\s*entry\.payload\s*\}\)/);
  assert.match(viewSource, /storedPreviewGoalMatchesSelection\(saved\.previewResult,\s*currentEntries\[index\]\?\.payload,\s*\{\s*allowLegacyResourceOmission:\s*true\s*\}\)/);
  assert.match(viewSource, /conversionActionResourceName:\s*String\(result\.conversion_action_resource_name\s*\|\|\s*''\)/);
});
