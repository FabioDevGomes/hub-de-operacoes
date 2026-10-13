import assert from 'node:assert/strict';
import {test} from 'node:test';
import {matchDtcCheckoutOffer, mergeDtcCountries} from '../src/curadoria/clickbank-top-offers/dtc-country-capture.mjs';
import {mountExtensionCapture} from '../src/curadoria/clickbank-top-offers/extension-capture.mjs';

const offer = Object.freeze({offerKey:'synthetic-arcticblast', seller:'SYNTHETIC',
  offerName:'ArcticBlast - #1 OTC topical pain relief drops has arrived!!'});

test('DTC recognizes trailing bottle quantities without a separator, preserving original titles', () => {
  for (const name of ['ArcticBlast 6 Bottles', 'ArcticBlast 1 Bottle', ' ARCTICBLAST   3 bottles ']) {
    assert.deepEqual(matchDtcCheckoutOffer(name, [offer]), {status:'unique', matches:[offer]});
  }
  const multiword = {...offer, offerName:'NEW : Memory Song - Offer'};
  assert.deepEqual(matchDtcCheckoutOffer('Memory Song 6 Bottles', [multiword]), {status:'unique', matches:[multiword]});
});

test('DTC bottle fallback requires the complete leading product name and retains variants and doses', () => {
  for (const offerName of ['ArcticBlast Max - Offer', 'ArcticBlast Plus - Offer',
    'ArcticBlast 50 mg - Offer', 'ArcticBlast (Adult Formula) - Offer',
    'Other Product - ArcticBlast', 'ArcticBlast drops - Offer']) {
    assert.equal(matchDtcCheckoutOffer('ArcticBlast 6 Bottles', [{...offer, offerName}]).status, 'none', offerName);
  }
  for (const name of ['ArcticBlast 6 Bottles Max', 'ArcticBlast 50 mg',
    'ArcticBlast 0 Bottles', 'ArcticBlast 1000 Bottles', 'Core 6 Bottles']) {
    assert.equal(matchDtcCheckoutOffer(name, [offer, {...offer, offerName:'Core - Offer'}]).status, 'none', name);
  }
  assert.equal(matchDtcCheckoutOffer('ArcticBlast Max 6 Bottles', [offer]).status, 'none');
  const variant = {...offer, offerName:'ArcticBlast Max - Offer'};
  assert.equal(matchDtcCheckoutOffer('ArcticBlast Max 6 Bottles', [variant]).status, 'unique');
});

test('DTC preserves legacy matches before considering bottle fallback and never chooses between keys', () => {
  const packageOffer = {...offer, offerKey:'package', offerName:'ArcticBlast 6 Bottles - Offer'};
  assert.deepEqual(matchDtcCheckoutOffer('ArcticBlast 6 Bottles', [offer, packageOffer]),
    {status:'unique', matches:[packageOffer]});
  const anotherPackage = {...packageOffer, offerKey:'other-package'};
  assert.deepEqual(matchDtcCheckoutOffer('ArcticBlast 6 Bottles', [offer, packageOffer, anotherPackage]),
    {status:'ambiguous', matches:[packageOffer, anotherPackage]});
  assert.deepEqual(matchDtcCheckoutOffer('ArcticBlast 6 Bottles', [offer, offer]), {status:'unique', matches:[offer]});
  const other = {...offer, offerKey:'other'};
  assert.deepEqual(matchDtcCheckoutOffer('ArcticBlast 6 Bottles', [offer, other]), {status:'ambiguous', matches:[offer, other]});
});

test('DTC bottle receiver saves only a unique match and preserves countries, metadata and provenance in memory', async () => {
  const target = {}, offers = [offer], writes = [];
  const existing = Object.freeze({manualCountries:Object.freeze(['BR']), otherField:'preserved'});
  const payload = Object.freeze({schema:'clickbank-dtc-country-capture-v1', source:'clickbank_dtc_checkout',
    productName:'ArcticBlast 6 Bottles', countries:Object.freeze(['US','CA']), capturedAt:'2026-10-11T12:00:00Z'});
  mountExtensionCapture({target, ready:Promise.resolve(), getBusy:()=>false, getDraft:()=>'', preparePreview:()=>{},
    getOffers:()=>offers, saveDtcCountries:async (matched, capture)=>{
      const merged = mergeDtcCountries(existing, matched, capture);
      writes.push(merged.record);
      return {ok:merged.ok, saved:merged.ok};
    }});
  assert.equal((await target.__hubReceiveDtcCommonCountries(payload)).saved, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].offerKey, offer.offerKey);
  assert.equal(writes[0].offerName, offer.offerName);
  assert.equal(writes[0].dtcCountryCapture.productName, payload.productName);
  assert.equal(writes[0].dtcCountryCapture.capturedAt, payload.capturedAt);
  assert.deepEqual(writes[0].manualCountries, ['BR','US','CA']);
  assert.equal(writes[0].otherField, 'preserved');
  assert.deepEqual(existing.manualCountries, ['BR']);
  offers.push({...offer, offerKey:'other'});
  const ambiguous = await target.__hubReceiveDtcCommonCountries(payload);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.message, /corresponde a 2 ofertas/);
  assert.equal(writes.length, 1);
  offers.splice(0);
  assert.equal((await target.__hubReceiveDtcCommonCountries(payload)).ok, false);
  assert.equal(writes.length, 1);
});
