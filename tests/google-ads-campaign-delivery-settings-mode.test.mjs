import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const viewSource = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');

test('presence and custom-goal repair panel is shown only in CSV mode and updates when the mode changes', () => {
  assert.match(viewSource, /function renderCampaignDeliverySettingsPanel\(\)\s*\{\s*if \(campaignCreationMode\(\) !== 'csv' \|\| !activeCampaignBatchId \|\| !createdCampaigns\.length\) return;/);
  assert.match(viewSource, /if \(input\.checked\) \{\s*setCampaignCreationMode\(input\.value\);\s*renderCampaignResult\(\);/);
});

test('EU political declaration repair panel is limited to CSV-created batches', () => {
  assert.match(viewSource, /function renderCampaignEuPoliticalDeclarationPanel\(\)\s*\{\s*if \(!activeCampaignBatchUsesCsvWorkflow\(\) \|\| !activeCampaignBatchId \|\| !createdCampaigns\.length\) return;/);
  assert.match(viewSource, /if \(activeCampaignBatchUsesCsvWorkflow\(\)\) renderCampaignEuPoliticalDeclarationPanel\(\);/);
  assert.match(viewSource, /title\.textContent = 'Declaração de publicidade política da UE · lote CSV'/);
});
