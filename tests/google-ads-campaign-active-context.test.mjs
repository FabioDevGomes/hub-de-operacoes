import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY,
  loadGoogleAdsCampaignActiveContext,
  saveGoogleAdsCampaignActiveContext,
} from '../src/google-ads/google-ads-campaign-active-context-storage.mjs';
import { resolveInitialGoogleAdsCampaignContext } from '../src/google-ads/google-ads-campaign-context-domain.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

const drafts = [
  { id: 'draft-current', updatedAt: '2026-10-31T20:00:00.000Z' },
  { id: 'draft-other', updatedAt: '2026-10-31T19:00:00.000Z' },
  { id: 'draft-unlinked', updatedAt: '2026-10-31T18:00:00.000Z' },
];
const batches = [
  { id: 'batch-current', draftId: 'draft-current', updatedAt: '2026-10-31T20:05:00.000Z' },
  { id: 'batch-other', draftId: 'draft-other', updatedAt: '2026-10-31T19:05:00.000Z' },
];

test('last campaign context storage round-trips batch, draft, and new selections', () => {
  const storage = memoryStorage();
  assert.equal(loadGoogleAdsCampaignActiveContext({ storage }), null);
  assert.deepEqual(saveGoogleAdsCampaignActiveContext({ type: 'batch', id: 'batch-current' }, { storage }), {
    schemaVersion: 1, type: 'batch', id: 'batch-current',
  });
  assert.deepEqual(loadGoogleAdsCampaignActiveContext({ storage }), {
    schemaVersion: 1, type: 'batch', id: 'batch-current',
  });
  saveGoogleAdsCampaignActiveContext({ type: 'draft', id: 'draft-other' }, { storage });
  assert.deepEqual(loadGoogleAdsCampaignActiveContext({ storage }), {
    schemaVersion: 1, type: 'draft', id: 'draft-other',
  });
  saveGoogleAdsCampaignActiveContext({ type: 'new' }, { storage });
  assert.deepEqual(loadGoogleAdsCampaignActiveContext({ storage }), { schemaVersion: 1, type: 'new' });
});

test('active context storage rejects unknown records without clearing them', () => {
  const storage = memoryStorage({ [GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY]: '{"schemaVersion":1,"type":"unknown"}' });
  assert.throws(() => loadGoogleAdsCampaignActiveContext({ storage }), /não é reconhecido/);
  assert.equal(storage.getItem(GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY), '{"schemaVersion":1,"type":"unknown"}');
  assert.throws(() => saveGoogleAdsCampaignActiveContext({ type: 'batch' }, { storage }), /validação local/);
});

test('explicit saved selection takes precedence over legacy defaults', () => {
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({
    savedContext: { type: 'batch', id: 'batch-other' }, drafts, batches, activeDraftId: 'draft-current',
  }), { type: 'batch', id: 'batch-other', source: 'saved' });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({
    savedContext: { type: 'draft', id: 'draft-other' }, drafts, batches, activeDraftId: 'draft-current',
  }), { type: 'draft', id: 'draft-other', source: 'saved' });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({
    savedContext: { type: 'new' }, drafts, batches, activeDraftId: 'draft-current',
  }), { type: 'new', id: '', source: 'saved' });
});

test('explicit delivery and handoff contexts take precedence over saved local selections', () => {
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({
    savedContext: { type: 'draft', id: 'draft-other' }, drafts, batches,
    deliveryBatchId: 'batch-current', externalContext: true,
  }), { type: 'batch', id: 'batch-current', source: 'delivery' });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({
    savedContext: { type: 'batch', id: 'batch-current' }, drafts, batches, externalContext: true,
  }), { type: 'external', id: '', source: 'external' });
});

test('profiles without the new key restore the linked/latest batch or preserve an unlinked active draft', () => {
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({ drafts, batches, activeDraftId: 'draft-current' }), {
    type: 'batch', id: 'batch-current', source: 'legacy',
  });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({ drafts, batches, activeDraftId: 'draft-other' }), {
    type: 'batch', id: 'batch-other', source: 'legacy',
  });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({ drafts, batches, activeDraftId: 'draft-unlinked' }), {
    type: 'draft', id: 'draft-unlinked', source: 'legacy',
  });
  assert.deepEqual(resolveInitialGoogleAdsCampaignContext({ drafts, batches, activeDraftId: '' }), {
    type: 'batch', id: 'batch-current', source: 'legacy',
  });
});

test('campaign creation view loads and persists active batch context for refresh restoration', async () => {
  const source = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
  assert.match(source, /loadGoogleAdsCampaignActiveContext\(\)/);
  assert.match(source, /resolveInitialGoogleAdsCampaignContext\(/);
  assert.match(source, /rememberCampaignCreationContext\('batch', batch\.id\)/);
  assert.match(source, /openSavedCampaignBatch\(initialDeliveryBatchId \|\| initialSavedBatchId\)/);
  assert.match(source, /rememberCampaignCreationContext\('new'\)/);
});

