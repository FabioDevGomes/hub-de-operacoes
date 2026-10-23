import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTrackingConversionProfile,
  readTrackingConversionProfiles,
  saveTrackingConversionProfiles,
  TRACKING_CONVERSION_PROFILES_STORAGE_KEY,
} from '../src/tracking/tracking-conversion-profiles-storage.mjs';

function memoryStorage(initial = new Map()) {
  const values = initial;
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('persists separate MCC profiles and restores the selected action without storing credentials', () => {
  const storage = memoryStorage();
  const profiles = [
    { id: 'mcc-a', label: 'MCC Principal', conversionName: 'Compra - Principal' },
    { id: 'mcc-b', label: 'MCC Secundária', conversionName: 'Compra - Secundária' },
  ];
  assert.deepEqual(normalizeTrackingConversionProfile(profiles[0]), profiles[0]);
  assert.deepEqual(saveTrackingConversionProfiles(profiles, 'mcc-b', storage), { saved: true });
  assert.deepEqual(readTrackingConversionProfiles(storage), {
    available: true,
    profiles,
    selectedProfileId: 'mcc-b',
  });
  const serialized = storage.values.get(TRACKING_CONVERSION_PROFILES_STORAGE_KEY);
  assert.doesNotMatch(serialized, /token|password|secret/i);
  assert.doesNotMatch(serialized, /Bearer/);
});

test('permits an explicit unselected state and rejects malformed or oversized profile data', () => {
  const storage = memoryStorage();
  const profiles = [{ id: 'one', label: 'MCC 1', conversionName: 'Ação 1' }];
  assert.deepEqual(saveTrackingConversionProfiles(profiles, '', storage), { saved: true });
  assert.equal(readTrackingConversionProfiles(storage).selectedProfileId, '');
  assert.throws(() => normalizeTrackingConversionProfile({ id: 'bad id', label: 'MCC', conversionName: 'Ação' }));
  assert.throws(() => normalizeTrackingConversionProfile({ id: 'one', label: '', conversionName: 'Ação' }));
  assert.throws(() => normalizeTrackingConversionProfile({ id: 'one', label: 'MCC', conversionName: `Ação${'á'.repeat(130)}` }));
  assert.deepEqual(saveTrackingConversionProfiles(profiles, 'missing', storage), { saved: false });
});

test('flags an invalid browser snapshot instead of trusting it', () => {
  const storage = memoryStorage(new Map([[TRACKING_CONVERSION_PROFILES_STORAGE_KEY, '{bad json']]));
  assert.deepEqual(readTrackingConversionProfiles(storage), {
    available: true, invalid: true, profiles: [], selectedProfileId: '',
  });
});
