import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeGoogleAdsCampaignCreationAudit } from '../src/google-ads/google-ads-campaign-creation-audit.mjs';

const campaignName = '02/11 - Nutrova ClearVue 18 (GM-NBB-US/CA/GB/IE/AU/NZ) 40% - US$ 110.00';
const campaign = {
  managerCustomerId: '3533796641', customerId: '7957548119', campaignName, accountName: '8119 - nutra zinvero.shop', percent: '40',
  state: 'previewed',
  previewResult: { resultType: 'validated_new' }, creationAttempts: [],
};

test('audit distinguishes a campaign absent from the saved batch because no request started', () => {
  const audit = summarizeGoogleAdsCampaignCreationAudit({
    preview: { creationAuditVersion: 2, creationAuditStartedAtUtc: '2026-11-04T12:00:00.000Z', creationAuditLegacyHistory: false, entries: [campaign] },
    batchCampaigns: [],
  });
  assert.equal(audit.candidateCount, 1);
  assert.equal(audit.inBatchCount, 0);
  assert.equal(audit.rows[0].outcome, 'not_started');
  assert.equal(audit.rows[0].inBatch, false);
});

test('audit distinguishes saved roster status from write-ahead creation evidence', () => {
  const row = {
    ...campaign,
    creationAttempts: [{
      attemptId: 'attempt-18', state: 'created', startedAtUtc: '2026-11-04T12:00:01.000Z',
      completedAtUtc: '2026-11-04T12:00:03.000Z', campaignId: '1234567890', campaignStatus: 'PAUSED', errorMessage: '', diagnostic: null,
    }],
  };
  const audit = summarizeGoogleAdsCampaignCreationAudit({
    preview: { creationAuditVersion: 2, creationAuditStartedAtUtc: '2026-11-04T12:00:00.000Z', entries: [row] },
    batchCampaigns: [{ customerId: '795-754-8119', campaignName, campaignId: '1234567890', status: 'PAUSED' }],
  });
  assert.equal(audit.rows[0].outcome, 'created');
  assert.equal(audit.rows[0].inBatch, true);
  assert.equal(audit.rows[0].batchCampaigns[0].campaignId, '1234567890');
});

test('legacy preview history remains inconclusive instead of claiming no request was sent', () => {
  const audit = summarizeGoogleAdsCampaignCreationAudit({
    preview: { creationAuditVersion: 2, creationAuditStartedAtUtc: '2026-11-04T12:00:00.000Z', creationAuditLegacyHistory: true, entries: [campaign] },
    batchCampaigns: [],
  });
  assert.equal(audit.rows[0].outcome, 'legacy_unknown');
});

test('an interrupted in-flight request is treated as uncertain across refreshes', () => {
  const audit = summarizeGoogleAdsCampaignCreationAudit({
    preview: {
      creationAuditVersion: 2, creationAuditStartedAtUtc: '2026-11-04T12:00:00.000Z', entries: [{
        ...campaign,
        creationAttempts: [{
          attemptId: 'attempt-18', state: 'in_flight', startedAtUtc: '2026-11-04T12:00:01.000Z',
          completedAtUtc: '', campaignId: '', campaignStatus: '', errorMessage: '', diagnostic: null,
        }],
      }],
    },
    batchCampaigns: [],
  });
  assert.equal(audit.rows[0].outcome, 'uncertain');
  assert.equal(audit.rows[0].lastAttempt.state, 'in_flight');
});

test('audit includes existing, failed, stale and not-yet-validated preview lines', () => {
  const existing = {
    ...campaign,
    campaignName: 'Already there',
    previewResult: { resultType: 'existing', campaignId: '1234567890', campaignStatus: 'PAUSED' },
  };
  const failed = { ...campaign, campaignName: 'Failed check', state: 'preview_failed', previewResult: null, errorMessage: 'HTTP 500.' };
  const stale = { ...campaign, campaignName: 'Stale check', state: 'preview_stale', previewResult: { resultType: 'validated_new' }, errorMessage: 'Payload changed.' };
  const pending = { ...campaign, campaignName: 'Pending check', state: 'pending', previewResult: null };
  const audit = summarizeGoogleAdsCampaignCreationAudit({
    preview: {
      creationAuditVersion: 2,
      creationAuditStartedAtUtc: '2026-11-04T12:00:00.000Z',
      creationAuditLegacyHistory: false,
      entries: [existing, failed, stale, pending],
    },
    batchCampaigns: [],
  });
  assert.equal(audit.candidateCount, 4);
  assert.equal(audit.eligibleCount, 0);
  assert.deepEqual(audit.rows.map(row => row.outcome), ['already_existed', 'validation_failed', 'stale', 'not_validated']);
  assert.equal(audit.rows[0].previewResult.campaignId, '1234567890');
  assert.equal(audit.rows[1].previewErrorMessage, 'HTTP 500.');
});
