import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');

test('atualiza a checagem de vínculos após a gravação local de cada campanha criada', () => {
  const callbackStart = source.indexOf('if (onCampaignCreated) {', source.indexOf('async function runBatchCreation'));
  const callbackEnd = source.indexOf('const confirmedCampaigns =', callbackStart);
  assert.notEqual(callbackStart, -1, 'a criação confirmada deve chamar o adaptador de vínculo local');
  assert.notEqual(callbackEnd, -1, 'a conclusão deve continuar salvando a campanha no lote');

  const callback = source.slice(callbackStart, callbackEnd);
  assert.match(callback, /await onCampaignCreated\(entry\.result\)/);
  assert.match(callback, /finally\s*\{\s*refreshHubCampaignRecovery\(\);\s*\}/);
  assert.ok(callback.indexOf('refreshHubCampaignRecovery();') > callback.indexOf('await onCampaignCreated(entry.result)'));
});

test('confere o estado persistido antes de exibir o botão de vínculo e atualiza após renderizar outra aba', () => {
  const refreshStart = source.indexOf('async function refreshHubCampaignRecovery()');
  const refreshEnd = source.indexOf('async function registerSavedHubCampaigns()', refreshStart);
  assert.notEqual(refreshStart, -1);
  assert.notEqual(refreshEnd, -1);
  const refresh = source.slice(refreshStart, refreshEnd);
  assert.match(refresh, /hubCampaignRecovery\.hidden\s*=\s*true/);
  assert.match(refresh, /await savedHubCampaignRecoveryPlan\(\)/);
  assert.match(refresh, /if\s*\(plan\.error\)/);
  assert.match(refresh, /if\s*\(!plan\.pendingCampaigns\.length\)\s*return/);
  assert.match(source, /existing\.refreshHubCampaignRecovery\?\.\(\)/);
  assert.match(appSource, /async function readSavedGoogleAdsHubCampaignRecoveryStatus\(campaigns\)\{const stored=await CampaignBaseReader\.read\(\{openDatabase:openLocalDb\}\)/);
  assert.match(appSource, /getSavedHubCampaignRecoveryStatus:readSavedGoogleAdsHubCampaignRecoveryStatus/);
});
