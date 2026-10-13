import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allCaptureOffers, captureOfferHistory} from '../src/curadoria/smartadv-offers/smartadv-offers-domain.mjs';

const offer = (id, name='Synthetic product', extra={}) => ({offerId:id,offerName:name,...extra});
const capture = (id, date, offers) => ({captureId:id,capturedAt:date,offers});

test('SmartAdv combines partial captures by ID, retaining missing offers and latest observed values without writes', () => {
  const old = capture('old','2026-01-01T12:00:00Z',[offer('1','Old title',{geoTargets:['US']}),offer('2')]);
  const other = capture('other','2026-01-02T12:00:00Z',[offer('3')]);
  const recent = capture('recent','2026-01-03T12:00:00Z',[offer(1,'Latest title',{geoTargets:[],brandBidding:'unknown'})]);
  const captures=[other,old,recent], before=JSON.stringify(captures), rows=allCaptureOffers(captures);
  assert.equal(rows.length,3);
  assert.equal(new Set(rows.map(row=>String(row.offerId))).size,3);
  assert.equal(rows[0].offerName,'Latest title');
  assert.deepEqual(rows[0].geoTargets,[]);
  assert.equal(rows[0].brandBidding,'unknown');
  assert.equal(rows[0].historyState,'known');
  assert.ok(rows.slice(1).every(row=>row.historyState==='first-seen'));
  assert.equal(JSON.stringify(captures),before);
  assert.deepEqual(captureOfferHistory(old,[]).map(row=>row.historyState),['first-seen','first-seen']);
  assert.deepEqual(allCaptureOffers(),[]);
});

test('SmartAdv keeps identical product names under different IDs and deduplicates repeated IDs in one capture', () => {
  const rows=allCaptureOffers([capture('same','2026-01-01T12:00:00Z',[offer('1'),offer('1','Duplicate'),offer('2')])]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].offerName,'Synthetic product');
  assert.ok(rows.every(row=>row.historyState==='first-seen'));
});

test('SmartAdv initial list with unknown original time never overrides a real capture, even after restoration', () => {
  const initial=capture('smartadv-user-provided-initial','2026-12-01T12:00:00Z',[offer('1','Initial'),offer('2')]);
  const recent=capture('real','2026-01-01T12:00:00Z',[offer('1','Observed')]);
  assert.equal(allCaptureOffers([initial,recent])[0].offerName,'Observed');
  assert.equal(allCaptureOffers([recent,initial])[0].offerName,'Observed');
  assert.equal(allCaptureOffers([initial])[0].historyState,'first-seen');
});

test('SmartAdv equal or unknown dates remain deterministic and do not invent a timestamp', () => {
  const captures=[capture('a','',[offer('1','First')]),capture('b',null,[offer('1','Second')])];
  assert.equal(allCaptureOffers(captures)[0].offerName,'First');
  assert.deepEqual(allCaptureOffers(captures),allCaptureOffers(captures));
});
