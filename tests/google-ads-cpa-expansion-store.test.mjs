import test from 'node:test';
import assert from 'node:assert/strict';
import { createCpaExpansion, readCpaExpansion, transitionCpaExpansion, markCpaExpansionIntegrated, cpaExpansionBlocksSharedSteps } from '../src/google-ads/google-ads-cpa-expansion-store.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) };
}
const items = () => [{ id: 'one', payload: { customerId: '1234567890', campaignName: 'example' } }];

test('a sending attempt survives reload and cannot be repeated silently', () => {
  const storage = memoryStorage();
  createCpaExpansion('batch', items(), storage);
  transitionCpaExpansion('batch', 'one', 'validated', {}, storage);
  transitionCpaExpansion('batch', 'one', 'sending', {}, storage);
  assert.equal(readCpaExpansion('batch', storage).entries[0].state, 'sending');
  assert.throws(() => transitionCpaExpansion('batch', 'one', 'validated', {}, storage), /inválida/);
  assert.throws(() => transitionCpaExpansion('batch', 'one', 'failed', {}, storage), /definitiva/);
  assert.throws(() => transitionCpaExpansion('batch', 'one', 'confirmed', { result: { campaignId: '123' } }, storage), /Confirme/);
  assert.equal(cpaExpansionBlocksSharedSteps(readCpaExpansion('batch', storage)), true);
  assert.throws(() => createCpaExpansion('batch', [{ ...items()[0], id: 'two' }], storage), /ainda precisa ser concluída/);
  assert.equal(readCpaExpansion('batch', storage).entries.length, 1);
});

test('only verified recovery can resolve an uncertain attempt', () => {
  const storage = memoryStorage();
  createCpaExpansion('batch', items(), storage);
  transitionCpaExpansion('batch', 'one', 'validated', {}, storage);
  transitionCpaExpansion('batch', 'one', 'sending', {}, storage);
  transitionCpaExpansion('batch', 'one', 'uncertain', {}, storage);
  assert.throws(() => transitionCpaExpansion('batch', 'one', 'confirmed', { result: { campaignId: '123' } }, storage), /Confirme/);
  const record = transitionCpaExpansion('batch', 'one', 'confirmed', { verified: true, result: { campaignId: '123' } }, storage);
  assert.equal(cpaExpansionBlocksSharedSteps(record), true);
  assert.equal(cpaExpansionBlocksSharedSteps(markCpaExpansionIntegrated('batch', 'one', storage)), false);
  assert.throws(() => createCpaExpansion('batch', items(), storage), /inválida/);
  const extended = createCpaExpansion('batch', [{ ...items()[0], id: 'two', payload: { ...items()[0].payload, campaignName: 'another' } }], storage);
  assert.equal(extended.entries.length, 2);
  assert.equal(extended.entries[0].integrated, true);
  assert.equal(cpaExpansionBlocksSharedSteps(extended), true);
});
