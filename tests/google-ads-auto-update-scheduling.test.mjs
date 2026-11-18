import assert from 'node:assert/strict';
import {
  createGoogleAdsAutoUpdater,
  GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY,
  GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY,
  GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY,
} from '../src/google-ads/google-ads-auto-update.mjs';

const previousDocument = globalThis.document;
const previousBroadcastChannel = globalThis.BroadcastChannel;

function memoryStorage(entries) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

try {
  globalThis.document = { addEventListener() {}, dispatchEvent() {} };

  const intervalChangeStorage = memoryStorage({
    [GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY]: 'true',
    [GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY]: '120',
    [GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY]: JSON.stringify({
      schemaVersion: 1,
      state: 'waiting',
      lastD0: { completedAtUtc: '2026-11-05T08:00:00.000Z' },
      nextD0AttemptAtUtc: '2026-11-05T10:00:00.000Z',
      nextD0ScheduleType: 'interval',
    }),
  });
  const intervalUpdater = createGoogleAdsAutoUpdater({
    storage: intervalChangeStorage,
    now: () => new Date('2026-11-05T09:00:00.000Z'),
  });
  const changedInterval = intervalUpdater.setIntervalMinutes(180);
  assert.equal(changedInterval.nextD0AttemptAtUtc, '2026-11-05T11:00:00.000Z');
  assert.equal(changedInterval.nextD0ScheduleType, 'interval');

  const retryStorage = memoryStorage({
    [GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY]: 'true',
    [GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY]: '120',
    [GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY]: JSON.stringify({
      schemaVersion: 1,
      state: 'waiting',
      lastD0: { completedAtUtc: '2026-11-05T08:00:00.000Z' },
      lastAttemptAtUtc: '2026-11-05T08:45:00.000Z',
      nextD0AttemptAtUtc: '2026-11-05T10:00:00.000Z',
      nextD0ScheduleType: 'retry',
    }),
  });
  const retryUpdater = createGoogleAdsAutoUpdater({
    storage: retryStorage,
    now: () => new Date('2026-11-05T09:00:00.000Z'),
  });
  const changedDuringRetry = retryUpdater.setIntervalMinutes(180);
  assert.equal(changedDuringRetry.nextD0AttemptAtUtc, '2026-11-05T10:00:00.000Z');
  assert.equal(changedDuringRetry.nextD0ScheduleType, 'retry');

  const firstRunStorage = memoryStorage({
    [GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY]: 'true',
    [GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY]: '120',
  });
  const firstRunUpdater = createGoogleAdsAutoUpdater({
    storage: firstRunStorage,
    now: () => new Date('2026-11-05T09:00:00.000Z'),
  });
  const firstInterval = firstRunUpdater.setIntervalMinutes(180);
  assert.equal(firstInterval.nextD0AttemptAtUtc, '2026-11-05T12:00:00.000Z');

  globalThis.BroadcastChannel = undefined;
  const legacyStorage = memoryStorage({
    [GOOGLE_ADS_AUTO_UPDATE_ENABLED_KEY]: 'false',
    [GOOGLE_ADS_AUTO_UPDATE_INTERVAL_KEY]: '180',
    [GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY]: JSON.stringify({
      schemaVersion: 1,
      state: 'disabled',
      lastD0: { completedAtUtc: '2026-11-05T08:00:00.000Z' },
      nextD0AttemptAtUtc: '2026-11-05T12:00:00.000Z',
    }),
  });
  const legacyUpdater = createGoogleAdsAutoUpdater({
    storage: legacyStorage,
    now: () => new Date('2026-11-05T09:00:00.000Z'),
  });
  legacyUpdater.start();
  const migratedStatus = JSON.parse(legacyStorage.getItem(GOOGLE_ADS_AUTO_UPDATE_STATUS_KEY));
  assert.equal(migratedStatus.nextD0AttemptAtUtc, '2026-11-05T11:00:00.000Z');
  assert.equal(migratedStatus.nextD0ScheduleType, 'interval');
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousBroadcastChannel === undefined) delete globalThis.BroadcastChannel;
  else globalThis.BroadcastChannel = previousBroadcastChannel;
}

console.log('Google Ads D0 interval changes anchor to the last snapshot and preserve pending retries.');
