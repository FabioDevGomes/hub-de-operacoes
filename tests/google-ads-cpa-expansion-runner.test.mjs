import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpaExpansion, readCpaExpansion, cpaExpansionBlocksSharedSteps } from '../src/google-ads/google-ads-cpa-expansion-store.mjs';
import { runCpaExpansion } from '../src/google-ads/google-ads-cpa-expansion-runner.mjs';

function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }
const items = [{ id: 'one', payload: { customerId: '1234567890', campaignName: 'example' } }];

test('a failed merge resumes locally without recreating a confirmed campaign', async () => {
  const s = storage(); let sends = 0, merges = 0;
  createCpaExpansion('batch', items, s);
  const options = { batchId: 'batch', storage: s, withLock: async (_, fn) => fn(), preview: async () => ({ validated_only: true, will_create_paused: true, campaign_status: 'PAUSED', campaign_name: 'example' }), create: async () => { sends++; return { campaignId: '123', campaignName: 'example', status: 'PAUSED' }; }, merge: async () => { if (++merges === 1) throw Error('save failed'); return true; } };
  await assert.rejects(runCpaExpansion(options), /save failed/);
  assert.equal(cpaExpansionBlocksSharedSteps(readCpaExpansion('batch', s)), true);
  const result = await runCpaExpansion(options);
  assert.equal(sends, 1); assert.equal(merges, 2);
  assert.equal(cpaExpansionBlocksSharedSteps(result), false);
});

test('an uncertain response blocks additional attempts', async () => {
  const s = storage(); let sends = 0;
  createCpaExpansion('batch', items, s);
  const options = { batchId: 'batch', storage: s, withLock: async (_, fn) => fn(), preview: async () => ({ validated_only: true, will_create_paused: true, campaign_status: 'PAUSED', campaign_name: 'example' }), create: async () => { sends++; throw Error('timeout'); }, merge: async () => true };
  assert.equal((await runCpaExpansion(options)).entries[0].state, 'uncertain');
  assert.equal((await runCpaExpansion(options)).entries[0].state, 'uncertain');
  assert.equal(sends, 1);
});

test('an incomplete preview cannot trigger campaign creation', async () => {
  const s = storage(); let sends = 0;
  createCpaExpansion('batch', items, s);
  const options = { batchId: 'batch', storage: s, withLock: async (_, fn) => fn(), preview: async () => ({}), create: async () => { sends++; }, merge: async () => true };
  await assert.rejects(runCpaExpansion(options), /não confirmou/);
  assert.equal(sends, 0);
});

test('a changed page or a newly existing combination stops creation after preview', async () => {
  const s = storage(); let sends = 0;
  createCpaExpansion('batch', items, s);
  const options = { batchId: 'batch', storage: s, withLock: async (_, fn) => fn(),
    preview: async () => ({ validated_only: true, will_create_paused: true, campaign_status: 'PAUSED', campaign_name: 'example' }),
    beforeSend: async () => { throw Error('page changed'); }, create: async () => { sends++; }, merge: async () => true };
  await assert.rejects(runCpaExpansion(options), /page changed/);
  assert.equal(sends, 0);
  assert.equal(readCpaExpansion('batch', s).entries[0].state, 'validated');
});

test('an existing campaign found by preview is never created and can be checked', async () => {
  const s = storage(); let sends = 0;
  createCpaExpansion('batch', items, s);
  const result = await runCpaExpansion({ batchId: 'batch', storage: s, withLock: async (_, fn) => fn(),
    preview: async () => ({ existing_campaign: true, campaign_name: 'example', campaign_id: '123' }),
    create: async () => { sends++; }, merge: async () => true });
  assert.equal(sends, 0);
  assert.equal(result.entries[0].state, 'uncertain');
  assert.equal(cpaExpansionBlocksSharedSteps(result), true);
});
