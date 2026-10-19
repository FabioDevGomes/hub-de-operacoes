import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRACKING_TOKEN_STORAGE_KEY,
  clearTrackingHubToken,
  readTrackingHubToken,
  saveTrackingHubToken,
} from '../src/tracking/tracking-token-storage.mjs';

test('o token do Hub é salvo isolado, validado e apagado por sua chave local própria', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const token = 'c'.repeat(64);

  assert.deepEqual(readTrackingHubToken({ storage }), { token: '', available: true, invalid: false });
  assert.deepEqual(saveTrackingHubToken('não-é-token', { storage }), { saved: false, available: true, invalid: true });
  assert.equal(values.has(TRACKING_TOKEN_STORAGE_KEY), false);
  assert.deepEqual(saveTrackingHubToken(token, { storage }), { saved: true, available: true, invalid: false });
  assert.deepEqual(readTrackingHubToken({ storage }), { token, available: true, invalid: false });
  assert.deepEqual(clearTrackingHubToken({ storage }), { removed: true, available: true });
  assert.equal(values.has(TRACKING_TOKEN_STORAGE_KEY), false);
});

test('falha de storage não lança nem mascara o token em logs/URLs', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(readTrackingHubToken({ storage: blocked }), { token: '', available: false, invalid: false });
  assert.deepEqual(saveTrackingHubToken('d'.repeat(64), { storage: blocked }), { saved: false, available: false, invalid: false });
  assert.deepEqual(clearTrackingHubToken({ storage: blocked }), { removed: false, available: false });
  assert.deepEqual(readTrackingHubToken({ storage: null }), { token: '', available: false, invalid: false });
});
