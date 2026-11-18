import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileGoogleAdsNegativeKeywordApplyResult } from '../src/google-ads/google-ads-negative-keyword-reconciliation.mjs';

const initialPreview = { campaigns: [
  { customerId: '1234567890', campaignId: '11', alreadyPresent: false },
  { customerId: '1234567890', campaignId: '12', alreadyPresent: true },
  { customerId: '1234567890', campaignId: '13', alreadyPresent: false },
] };
const applyResult = {
  results: [
    { customer_id: '1234567890', campaign_id: '11', result: 'write_unverified' },
    { customer_id: '1234567890', campaign_id: '12', result: 'already_present' },
    { customer_id: '1234567890', campaign_id: '13', result: 'failed' },
  ],
  createdCount: 0, alreadyPresentCount: 1, unverifiedCount: 1, failedCount: 1,
  complete: false, verified: false,
};

test('a fresh read confirms only previously absent criteria after an uncertain write', () => {
  const result = reconcileGoogleAdsNegativeKeywordApplyResult({
    applyResult,
    initialPreview,
    refreshedPreview: {
      previewAtUtc: '2026-11-14T14:00:00.000Z',
      campaigns: [
        { customerId: '1234567890', campaignId: '11', alreadyPresent: true },
        { customerId: '1234567890', campaignId: '12', alreadyPresent: true },
        { customerId: '1234567890', campaignId: '13', alreadyPresent: false },
      ],
    },
  });

  assert.deepEqual(result.results.map(item => item.result), ['created_verified', 'already_present', 'failed']);
  assert.deepEqual([result.createdCount, result.alreadyPresentCount, result.unverifiedCount, result.failedCount], [1, 1, 0, 1]);
  assert.equal(result.verified, false, 'uma falha remanescente mantém o lote incompleto');
  assert.equal(result.verifiedAtUtc, undefined, 'a falha restante impede tratar o lote todo como verificado');
});

test('does not infer successful writes for campaigns already present before apply or still absent after it', () => {
  const result = reconcileGoogleAdsNegativeKeywordApplyResult({
    applyResult: { ...applyResult, results: [
      { customer_id: '1234567890', campaign_id: '12', result: 'write_unverified' },
      { customer_id: '1234567890', campaign_id: '13', result: 'write_unverified' },
    ] },
    initialPreview,
    refreshedPreview: { campaigns: [
      { customerId: '1234567890', campaignId: '12', alreadyPresent: true },
      { customerId: '1234567890', campaignId: '13', alreadyPresent: false },
    ] },
  });

  assert.deepEqual(result.results.map(item => item.result), ['write_unverified', 'write_unverified']);
  assert.equal(reconcileGoogleAdsNegativeKeywordApplyResult({ applyResult, initialPreview, refreshedPreview: null }), null);
});

test('search terms view automatically retries only the read-only preview after an unverified response', () => {
  const view = readFileSync(new URL('../src/google-ads/google-ads-search-terms-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /if \(result\.unverifiedCount > 0\)[\s\S]*?await new Promise\(resolve => setTimeout\(resolve, 500\)\)[\s\S]*?previewGoogleAdsProductNegativeKeyword\(negativeDraft\)/);
  assert.match(view, /nenhuma gravação será repetida/);
  assert.match(view, /reconcileGoogleAdsNegativeKeywordApplyResult\(\{ applyResult: result, initialPreview: appliedPreview, refreshedPreview \}\)/);
});
