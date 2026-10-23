import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRACKING_PRODUCT_LABELS_STORAGE_KEY,
  readTrackingProductLabels,
  saveTrackingProductLabel,
} from '../src/tracking/tracking-domain-label-storage.mjs';

function createStorage(initial = new Map()) {
  return {
    values: initial,
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, String(value)); },
  };
}

test('salva e restaura o rótulo digitado separado da chave técnica', () => {
  const storage = createStorage();
  assert.deepEqual(saveTrackingProductLabel('metabo-drops-zinvero', 'Metabo Drops - Zinvero', storage), { saved: true });
  assert.equal(storage.values.get(TRACKING_PRODUCT_LABELS_STORAGE_KEY), '{"metabo-drops-zinvero":"Metabo Drops - Zinvero"}');
  const restored = readTrackingProductLabels(storage);
  assert.equal(restored.available, true);
  assert.equal(restored.labels.get('metabo-drops-zinvero'), 'Metabo Drops - Zinvero');
});

test('mantém a lista local limitada e não propaga armazenamento inválido', () => {
  const storage = createStorage(new Map([[TRACKING_PRODUCT_LABELS_STORAGE_KEY, 'not json']]));
  const invalid = readTrackingProductLabels(storage);
  assert.equal(invalid.invalid, true);
  assert.equal(invalid.labels.size, 0);
  assert.deepEqual(saveTrackingProductLabel('product-a', 'Product A', {
    getItem() { return null; },
    setItem() { throw new Error('blocked'); },
  }), { saved: false });
});
