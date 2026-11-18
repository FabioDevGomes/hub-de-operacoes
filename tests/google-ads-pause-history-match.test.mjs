import assert from 'node:assert/strict';
import test from 'node:test';
import { captureHistoryChangeIndicatesPause, findGoogleAdsAutomaticPauseForChange, findGoogleAdsObservedPauseForChange, googleAdsObservedPauseIntervalForChange } from '../src/google-ads/google-ads-pause-history-match.mjs';

const change = overrides => ({
  managerCustomerId: '3533796641', customerId: '4404265713', campaignId: '24408705974',
  campaignInternalId: 'cmp_gads_3533796641_4404265713_24408705974', date: '2026-11-02',
  fields: [{ key: 'campaignStatus', before: 'ENABLED', after: 'PAUSED' }],
  ...overrides,
});

const pauseEntry = (overrides = {}) => ({
  id: 'auto-pause:test:1', eventType: 'automatic_pause', status: 'completed',
  completedAtUtc: '2026-11-02T14:00:00.000Z',
  changes: [{ managerCustomerId: '3533796641', customerId: '4404265713', campaignId: '24408705974', campaignInternalId: 'cmp_gads_3533796641_4404265713_24408705974', date: '2026-11-01', rule: 'negative_remaining' }],
  ...overrides,
});

test('recognizes an actual transition to PAUSED, not an unchanged paused status', () => {
  assert.equal(captureHistoryChangeIndicatesPause(change()), true);
  assert.equal(captureHistoryChangeIndicatesPause(change({ fields: [
    { key: 'campaignStatus', before: 'PAUSED', after: 'PAUSED' },
    { key: 'primaryStatusReasons', before: ['CAMPAIGN_PAUSED', 'UNKNOWN'], after: ['CAMPAIGN_PAUSED'] },
  ] })), false);
  assert.equal(captureHistoryChangeIndicatesPause(change({ fields: [{ key: 'primaryStatusReasons', before: ['CAMPAIGN_PAUSED'], after: ['UNKNOWN'] }] })), false);
});

test('recognizes a newly added pause reason only when status fields are absent', () => {
  assert.equal(captureHistoryChangeIndicatesPause(change({ fields: [{ key: 'primaryStatusReasons', before: ['UNKNOWN'], after: ['CAMPAIGN_PAUSED', 'UNKNOWN'] }] })), true);
  assert.equal(captureHistoryChangeIndicatesPause(change({ fields: [
    { key: 'campaignStatus', before: 'PAUSED', after: 'PAUSED' },
    { key: 'primaryStatusReasons', before: ['UNKNOWN'], after: ['CAMPAIGN_PAUSED'] },
  ] })), false);
});

test('matches the exact account and campaign within the snapshot baseline interval, across local-date labels', () => {
  const record = {
    completedAtUtc: '2026-11-02T15:15:04.386Z',
    comparisonBaselines: [{ managerCustomerId: '3533796641', customerId: '4404265713', currentDate: '2026-11-02', capturedAtUtc: '2026-11-02T13:14:08.107Z' }],
  };
  const match = findGoogleAdsAutomaticPauseForChange(change(), record, [pauseEntry()]);
  assert.equal(match?.entry.id, 'auto-pause:test:1');
  assert.equal(match?.pause.rule, 'negative_remaining');
});

test('does not match an automatic pause before the baseline or from another MCC/account/campaign', () => {
  const record = {
    completedAtUtc: '2026-11-02T15:15:04.386Z',
    comparisonBaselines: [{ managerCustomerId: '3533796641', customerId: '4404265713', currentDate: '2026-11-02', capturedAtUtc: '2026-11-02T13:14:08.107Z' }],
  };
  assert.equal(findGoogleAdsAutomaticPauseForChange(change(), record, [pauseEntry({ completedAtUtc: '2026-11-02T12:00:00.000Z' })]), null);
  assert.equal(findGoogleAdsAutomaticPauseForChange(change(), record, [pauseEntry({ changes: [{ ...pauseEntry().changes[0], managerCustomerId: '2231390435' }] })]), null);
  assert.equal(findGoogleAdsAutomaticPauseForChange(change(), record, [pauseEntry({ changes: [{ ...pauseEntry().changes[0], campaignId: '99999999999' }] })]), null);
});

test('uses same-date matching only for legacy captures without a baseline timestamp', () => {
  const record = { completedAtUtc: '2026-11-02T15:15:04.386Z' };
  const sameDatePause = pauseEntry({ changes: [{ ...pauseEntry().changes[0], date: '2026-11-02' }] });
  assert.equal(findGoogleAdsAutomaticPauseForChange(change(), record, [sameDatePause])?.entry.id, 'auto-pause:test:1');
  assert.equal(findGoogleAdsAutomaticPauseForChange(change(), record, [pauseEntry()]), null);
});

test('observed pause registration is tied to the exact snapshot interval and campaign', () => {
  const record = {
    id: 'capture:current', completedAtUtc: '2026-11-02T15:15:04.386Z',
    comparisonBaselines: [{ managerCustomerId: '3533796641', customerId: '4404265713', currentDate: '2026-11-02', capturedAtUtc: '2026-11-02T13:14:08.107Z' }],
  };
  const interval = googleAdsObservedPauseIntervalForChange(change(), record);
  assert.deepEqual(interval, { observedFromUtc: '2026-11-02T13:14:08.107Z', observedToUtc: '2026-11-02T15:15:04.386Z' });
  const observed = {
    id: 'google-ads-auto-pause-observed:campaign:1', eventType: 'automatic_pause_observed', status: 'observed',
    observedFromUtc: interval.observedFromUtc, observedToUtc: interval.observedToUtc, recordedAtUtc: '2026-11-02T16:00:00.000Z',
    changes: [{ managerCustomerId: '3533796641', customerId: '4404265713', campaignId: '24408705974', campaignInternalId: 'cmp_gads_3533796641_4404265713_24408705974' }],
  };
  assert.equal(findGoogleAdsObservedPauseForChange(change(), record, [observed])?.entry.id, observed.id);
  assert.equal(findGoogleAdsObservedPauseForChange(change({ campaignId: '99999999999' }), record, [observed]), null);
  assert.equal(findGoogleAdsObservedPauseForChange(change(), { ...record, id: 'later', completedAtUtc: '2026-11-02T15:16:00.000Z' }, [observed]), null);
});
