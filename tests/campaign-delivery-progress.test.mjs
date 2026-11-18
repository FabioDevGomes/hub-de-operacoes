import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { campaignSetSignature, campaignSitelinksSignature, deliveryProgress, sharedStepStatus, pendingDeliveryManualSteps } from '../src/campaign-delivery/progress-domain.mjs';
import { saveGoogleAdsCampaignBatch, confirmGoogleAdsCampaignBatchStep, appendGoogleAdsCampaignToBatch, loadGoogleAdsCampaignBatches } from '../src/google-ads/google-ads-campaign-batches-storage.mjs';
import { campaignDeliverySettingsVerified } from '../src/campaign-delivery/progress-domain.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const campaign = (id, account) => ({ managerCustomerId: '3333333333', customerId: account, campaignId: id, adGroupId: '100', campaignName: 'Campaign ' + id, status: 'PAUSED', source: 'created', verified: true, campaignChannelType: 'SEARCH', positiveGeoTargetType: 'PRESENCE', customConversionGoalName: 'meta personalizada da ação compra', conversionActionName: 'Conversão compra off-line (upload)' });
const delivery = { id: 'delivery', offerKey: 'offer', productName: 'Product', countries: ['US'], assetStudioWork: { status: 'completed' } };
const jobs = [{ id: 'job1', product: 'Product', campaignDeliveryId: 'delivery',
  targets: [{ accountId: '1111111111', publicUrl: 'https://example.test/', status: 'published' }] }];
const sitelinks = [{ title: 'Learn more', description1: 'Description one', description2: 'Description two', anchor: 1 }];
const creationView = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
const withVerifiedSitelinks = item => ({ ...item, sitelinksResult: {
  verified: true, submittedCount: 1, appliedCount: 1, alreadyPresentCount: 0, reactivatedCount: 0,
  verifiedAtUtc: '2026-01-01T00:00:00Z', signature: campaignSitelinksSignature(sitelinks),
} });

test('delivery completes only with confirmed steps for the current campaign set', () => {
  assert.match(creationView, /if \(!campaignDeliverySource\?\.deliveryId \|\| !activeCampaignBatchId\) return \[\]/, 'sem entrega vinculada, a confirmação não deve ser exigida');
  assert.match(creationView, /button\.disabled = [^;]*pendingDeliverySteps\.length > 0/, 'a ativação deve permanecer desabilitada enquanto houver confirmação pendente');
  assert.match(creationView, /if \(pendingDeliverySteps\.length\) \{[\s\S]*?setStatus\('A ativação está bloqueada/, 'a ativação deve revalidar as confirmações antes do envio');
  const storage = memoryStorage();
  const batch = { id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    formSnapshot: { __hub_campaign_delivery_source: { deliveryId: 'delivery' } }, sitelinks, campaigns: [withVerifiedSitelinks(campaign('1', '1111111111'))] };
  saveGoogleAdsCampaignBatch(batch, { storage });
  const signature = campaignSetSignature(batch.campaigns);
  assert.deepEqual(pendingDeliveryManualSteps(batch), ['targeting', 'exclusions', 'images']);
  let saved;
  for (const step of ['targeting', 'exclusions', 'images']) {
    saved = confirmGoogleAdsCampaignBatchStep('batch', step, signature, { storage }).batches[0];
  }
  assert.equal(deliveryProgress({ delivery, jobs, batches: [saved] }).complete, true);
  assert.deepEqual(pendingDeliveryManualSteps(saved), []);
  assert.deepEqual(pendingDeliveryManualSteps(batch, []), [], 'remover os itens manuais remove a dependência');
  assert.equal(deliveryProgress({ delivery, jobs, batches: [saved] }).curadoria, true);
  assert.equal(sharedStepStatus({ ...saved, sitelinks: [{ title: 'alterado' }] }).sitelinks, false);
  assert.equal(deliveryProgress({ delivery, jobs, batches: [saved], expansionBlocked: true }).complete, false);
  assert.equal(deliveryProgress({ delivery, jobs, batches: [saved, { ...saved, id: 'other' }] }).ambiguous, true);
  appendGoogleAdsCampaignToBatch('batch', campaign('2', '1111111111'), { storage });
  saved = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  assert.equal(Object.values(sharedStepStatus(saved)).every(value => value === false), true);
  assert.equal(saved.workflowConfirmationHistory.length, 3);
  assert.throws(() => confirmGoogleAdsCampaignBatchStep('batch', 'targeting', signature, { storage }), /mudaram/);
  assert.equal(deliveryProgress({ delivery, jobs, batches: [saved] }).complete, false);
});

test('Pre-Sell vinculada pelo ID da entrega continua concluída quando o nome inclui uma variante', () => {
  const variantDelivery={...delivery,productName:'Power Heat Pro DE02'};
  const linkedJob={id:'job-variant',product:'Power Heat Pro',campaignDeliveryId:'delivery',targets:[
    {accountId:'1111111111',publicUrl:'https://example.test/',status:'published'},
  ]};
  const progress=deliveryProgress({delivery:variantDelivery,jobs:[linkedJob]});
  assert.equal(progress.presell,true);
  assert.equal(progress.pages,1);
});

test('sitelinks complete automatically only after server verification for every campaign and current copy', () => {
  const storage = memoryStorage();
  const first = campaign('1', '1111111111');
  const second = campaign('2', '1111111111');
  const batch = { id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    formSnapshot: { __hub_campaign_delivery_source: { deliveryId: 'delivery' } }, sitelinks, campaigns: [first, second] };
  saveGoogleAdsCampaignBatch(batch, { storage });
  const signature = campaignSetSignature(batch.campaigns);
  const manuallyConfirmed = confirmGoogleAdsCampaignBatchStep('batch', 'sitelinks', signature, { storage }).batches[0];
  assert.equal(sharedStepStatus(manuallyConfirmed).sitelinks, false, 'the old manual confirmation is not proof of Google Ads state');
  assert.equal(sharedStepStatus({ ...batch, campaigns: [withVerifiedSitelinks(first), second] }).sitelinks, false);
  assert.equal(sharedStepStatus({ ...batch, campaigns: [withVerifiedSitelinks(first), withVerifiedSitelinks(second)] }).sitelinks, true);
  assert.equal(sharedStepStatus({ ...batch, sitelinks: [{ ...sitelinks[0], title: 'Changed' }],
    campaigns: [withVerifiedSitelinks(first), withVerifiedSitelinks(second)] }).sitelinks, false);
});

test('a delivery without a linked offer and valid destination GEO is not complete', () => {
  const storage = memoryStorage();
  const batch = { id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    formSnapshot: { __hub_campaign_delivery_source: { deliveryId: 'delivery' } }, sitelinks: [], campaigns: [campaign('1', '1111111111')] };
  saveGoogleAdsCampaignBatch(batch, { storage });
  const signature = campaignSetSignature(batch.campaigns);
  let saved;
  for (const step of ['targeting', 'exclusions', 'images']) {
    saved = confirmGoogleAdsCampaignBatchStep('batch', step, signature, { storage }).batches[0];
  }
  for (const incomplete of [{ ...delivery, countries: [] }, { ...delivery, offerKey: '' }]) {
    const progress = deliveryProgress({ delivery: incomplete, jobs, batches: [saved] });
    assert.equal(progress.curadoria, false);
    assert.equal(progress.complete, false);
  }
});

test('a saved existing campaign keeps the delivery incomplete until PRESENCE and custom goal are verified', () => {
  const storage = memoryStorage();
  const imported = { ...campaign('1', '1111111111'), source: 'existing', verified: false,
    positiveGeoTargetType: '', customConversionGoalName: '', conversionActionName: '' };
  const batch = { id: 'batch', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    formSnapshot: { __hub_campaign_delivery_source: { deliveryId: 'delivery' } }, sitelinks, campaigns: [imported] };
  saveGoogleAdsCampaignBatch(batch, { storage });
  const before = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  const progressBefore = deliveryProgress({ delivery, jobs, batches: [before] });
  assert.equal(progressBefore.campaignSettings, false);
  assert.equal(progressBefore.campaign, false);
  assert.equal(progressBefore.complete, false);

  const result = { verified: true, presenceVerified: true, presenceChanged: true, positiveGeoTargetType: 'PRESENCE',
    goalVerified: true, goalChanged: true, goalName: 'meta personalizada da ação compra',
    conversionActionName: 'Conversão compra off-line (upload)', status: 'PAUSED', verifiedAtUtc: '2026-11-03T15:00:00Z', failureCode: '' };
  saveGoogleAdsCampaignBatch({ ...before, campaigns: [{ ...before.campaigns[0], deliverySettingsResult: result }] }, { storage });
  const after = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  const progressAfter = deliveryProgress({ delivery, jobs, batches: [after] });
  assert.equal(campaignDeliverySettingsVerified(after.campaigns[0]), true);
  assert.equal(progressAfter.campaignSettings, true);
  assert.equal(progressAfter.campaign, true);
  assert.equal(after.campaigns[0].deliverySettingsResult.verifiedAtUtc, result.verifiedAtUtc);
});

test('non-Search campaigns are not blocked by a Search-only delivery setting', () => {
  assert.equal(campaignDeliverySettingsVerified({ campaignChannelType: 'DISPLAY' }), true);
});
