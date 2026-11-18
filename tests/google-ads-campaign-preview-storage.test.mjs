import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY,
  linkGoogleAdsCampaignPreviewToBatch,
  loadGoogleAdsCampaignPreview,
  listGoogleAdsCampaignPreviews,
  saveGoogleAdsCampaignCreationAttempt,
  saveGoogleAdsCampaignPreview,
} from '../src/google-ads/google-ads-campaign-preview-storage.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

const payloadFingerprint = 'a'.repeat(64);
const basePreview = {
  id: 'preview-current',
  draftId: 'draft-current',
  validatedAt: '2026-11-02T12:00:00.000Z',
  payloadFingerprint,
  batchId: '',
  invalidatedAt: '',
  creationAuditBaseline: true,
};

function campaignEntry(state, extra = {}) {
  return {
    managerCustomerId: '3533796641',
    customerId: '7957548119',
    campaignName: '31/10 - VenoPlus 8 25 (CB-NBB-US) 40% - US$ 88.00',
    accountName: '8119 - 2ª nutra zinvero.shop',
    percent: '40',
    state,
    errorMessage: state === 'preview_failed' ? 'Falha transitória da API.' : '',
    previewResult: null,
    ...extra,
  };
}

const validatedResult = {
  resultType: 'validated_new',
  campaignName: '31/10 - VenoPlus 8 25 (CB-NBB-US) 40% - US$ 88.00',
  accountCurrency: 'USD',
  dailyBudgetMicros: '100000000',
  targetCpaMicros: '35200000',
  positiveGeoTargetType: 'PRESENCE',
  goalConfigLevel: 'CAMPAIGN',
  customConversionGoalName: 'meta personalizada da ação compra',
  conversionActionName: 'Conversão compra off-line (upload)',
  conversionActionResourceName: 'customers/3533796641/conversionActions/78171752054',
};

test('partial preview checkpoints persist campaign states and replace the same draft preview', () => {
  const storage = memoryStorage();
  const partial = {
    ...basePreview,
    entries: [
      campaignEntry('previewed', { previewResult: validatedResult }),
      campaignEntry('previewing', {
        customerId: '7617569737', campaignName: 'Campanha 02', percent: '50',
        errorMessage: 'Revalidação em andamento.',
        previewResult: { ...validatedResult, campaignName: 'Campanha 02' },
      }),
      campaignEntry('pending', { customerId: '4404265713', campaignName: 'Campanha 03', percent: '60' }),
      campaignEntry('preview_failed', { customerId: '1748218568', campaignName: 'Campanha 04', percent: '70' }),
    ],
  };
  saveGoogleAdsCampaignPreview(partial, { storage });
  const saved = listGoogleAdsCampaignPreviews({ draftId: 'draft-current', storage });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].entries.map(entry => entry.state), ['previewed', 'previewing', 'pending', 'preview_failed']);
  assert.equal(saved[0].entries[0].previewResult.dailyBudgetMicros, '100000000');
  assert.equal(saved[0].entries[0].previewResult.positiveGeoTargetType, 'PRESENCE');
  assert.equal(saved[0].entries[0].previewResult.conversionActionResourceName, 'customers/3533796641/conversionActions/78171752054');
  assert.equal(saved[0].entries[1].previewResult.campaignName, 'Campanha 02');

  saveGoogleAdsCampaignPreview({
    ...partial,
    validatedAt: '2026-11-02T12:02:00.000Z',
    entries: [
      campaignEntry('previewed', { previewResult: validatedResult }),
      campaignEntry('existing', {
        customerId: '7617569737', campaignName: 'Campanha 02', percent: '50',
        previewResult: {
          resultType: 'existing', campaignName: 'Campanha 02', campaignId: '12345', campaignStatus: 'PAUSED',
          channelType: 'SEARCH', audienceGrouped: false, adGroupId: '54321', adGroupStatus: 'PAUSED', adGroupCount: 1,
        },
      }),
      campaignEntry('pending', { customerId: '4404265713', campaignName: 'Campanha 03', percent: '60' }),
      campaignEntry('preview_failed', { customerId: '1748218568', campaignName: 'Campanha 04', percent: '70' }),
    ],
  }, { storage });
  assert.equal(listGoogleAdsCampaignPreviews({ draftId: 'draft-current', storage }).length, 1);
  assert.deepEqual(listGoogleAdsCampaignPreviews({ draftId: 'draft-current', storage })[0].entries.map(entry => entry.state), ['previewed', 'existing', 'pending', 'preview_failed']);
});

test('legacy complete previews without per-entry states remain reusable', () => {
  const { positiveGeoTargetType: _legacyGeoTarget, ...legacyValidatedResult } = validatedResult;
  const storage = memoryStorage({
    [GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      previews: [{
        ...basePreview,
        entries: [campaignEntry(undefined, { previewResult: legacyValidatedResult })],
      }],
    }),
  });
  const [saved] = listGoogleAdsCampaignPreviews({ storage });
  assert.equal(saved.entries[0].state, 'previewed');
  assert.equal(saved.entries[0].previewResult.resultType, 'validated_new');
  assert.equal(saved.entries[0].previewResult.positiveGeoTargetType, '');
});

test('invalid partial checkpoint is rejected without overwriting local data', () => {
  const original = JSON.stringify({ schemaVersion: 1, previews: 'keep-this-record' });
  const storage = memoryStorage({ [GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY]: original });
  assert.throws(() => saveGoogleAdsCampaignPreview({ ...basePreview, entries: [campaignEntry('pending')] }, { storage }), /não é reconhecido/);
  assert.equal(storage.getItem(GOOGLE_ADS_CAMPAIGN_PREVIEWS_STORAGE_KEY), original);
});

test('creation attempts are written ahead, completed in place, and remain linked to the batch', () => {
  const storage = memoryStorage();
  saveGoogleAdsCampaignPreview({
    ...basePreview,
    entries: [campaignEntry('previewed', { previewResult: validatedResult })],
  }, { storage });
  linkGoogleAdsCampaignPreviewToBatch(basePreview.id, 'batch-created', { at: '2026-11-04T12:00:00.000Z', storage });
  const started = {
    attemptId: 'attempt-campaign-18', state: 'in_flight', startedAtUtc: '2026-11-04T12:00:01.000Z',
    completedAtUtc: '', campaignId: '', campaignStatus: '', errorMessage: '', diagnostic: null,
  };
  saveGoogleAdsCampaignCreationAttempt(basePreview.id, {
    managerCustomerId: '3533796641', customerId: '7957548119', campaignName: validatedResult.campaignName, attempt: started,
  }, { storage });
  const completed = {
    ...started, state: 'created', completedAtUtc: '2026-11-04T12:00:03.000Z', campaignId: '9876543210', campaignStatus: 'PAUSED',
  };
  saveGoogleAdsCampaignCreationAttempt(basePreview.id, {
    managerCustomerId: '3533796641', customerId: '7957548119', campaignName: validatedResult.campaignName, attempt: completed,
  }, { storage });
  const saved = loadGoogleAdsCampaignPreview(basePreview.id, { storage });
  assert.equal(saved.batchId, 'batch-created');
  assert.equal(saved.creationAuditVersion, 2);
  assert.equal(saved.creationAuditStartedAtUtc, '2026-11-04T12:00:00.000Z');
  assert.equal(saved.entries[0].creationAttempts.length, 1, 'a atualização final substitui o marcador in_flight da mesma tentativa');
  assert.equal(saved.entries[0].creationAttempts[0].state, 'created');
  assert.equal(saved.entries[0].creationAttempts[0].campaignId, '9876543210');
});

test('linking an older tracked preview flags its unlogged creation history', () => {
  const storage = memoryStorage();
  saveGoogleAdsCampaignPreview({
    ...basePreview,
    creationAuditBaseline: false,
    creationAuditVersion: 1,
    entries: [campaignEntry('previewed', { previewResult: validatedResult })],
  }, { storage });
  linkGoogleAdsCampaignPreviewToBatch(basePreview.id, 'batch-legacy', { at: '2026-11-04T12:05:00.000Z', storage });
  const saved = loadGoogleAdsCampaignPreview(basePreview.id, { storage });
  assert.equal(saved.creationAuditVersion, 2);
  assert.equal(saved.creationAuditLegacyHistory, true);
  assert.equal(saved.creationAuditStartedAtUtc, '2026-11-04T12:05:00.000Z');
});

test('linking a fresh preview does not flag its history as legacy', () => {
  const storage = memoryStorage();
  saveGoogleAdsCampaignPreview({
    ...basePreview,
    entries: [campaignEntry('previewed', { previewResult: validatedResult })],
  }, { storage });
  linkGoogleAdsCampaignPreviewToBatch(basePreview.id, 'batch-fresh', { at: '2026-11-04T12:10:00.000Z', storage });
  const saved = loadGoogleAdsCampaignPreview(basePreview.id, { storage });
  assert.equal(saved.creationAuditBaseline, true);
  assert.equal(saved.creationAuditLegacyHistory, false);
});
