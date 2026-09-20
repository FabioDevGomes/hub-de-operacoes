import assert from 'node:assert/strict';
import {parseManagerEmail,groupProducts,baseProductName,compareProductLists,upsertObservation} from '../src/curadoria/gerentes/manager-list-domain.mjs';

const sample=`GuruMedia New Offers Approved - Personalized For Fabio
11 de set. de 2026, 14:00
33468 | GloveIt - CTC 29.99 GBP - Accepts Paypal - Direct Checkout Link - Including Checkout Event Tracking - (eCommerce / Product) - [UK]
Payout: $38.00
Traffic rules: None.
Tracking link: https://example.test/a
33467 | GloveIt - German Page - CTC 29.99 EUR - Accepts Paypal - (eCommerce / Product) - [DE, AT]
Payout: $38.00
Traffic rules: No fake news.
Tracking link: https://example.test/b`;
const parsed=parseManagerEmail(sample);
assert.equal(parsed.collectedAt,'2026-09-11');
assert.equal(parsed.offers.length,2);
assert.equal(parsed.offers[0].productName,'GloveIt');
assert.equal(parsed.offers[0].features.directCheckout,true);
assert.equal(parsed.offers[1].countries.length,2);
const groups=groupProducts(parsed.offers);
assert.equal(groups.length,1);assert.equal(groups[0].variantCount,2);assert.equal(groups[0].restrictedCount,1);
assert.equal(baseProductName('MedicGLP - Swedish Page - High CTC'),'MedicGLP');
assert.equal(upsertObservation([{date:'2026-09-11',value:1}],{date:'2026-09-11',value:2})[0].value,2);
const legacy=parseManagerEmail(`seg., 31 de ago., 21:26 (há 13 dias)
33100 | Example - (eCommerce / Product) - [US + 23 more]
Payout: $60.00
Traffic rules: None.
Tracking link: https://example.test/legacy`,new Date('2026-09-13T12:00:00'));
assert.equal(legacy.collectedAt,'2026-08-31');
assert.deepEqual(legacy.offers[0].countries,['US']);
assert.equal(legacy.offers[0].additionalCountries,23);
const comparison=compareProductLists(
  [{...parsed.offers[0],id:'current-a'},{...legacy.offers[0],id:'current-b'}],
  [{...parsed.offers[1],id:'previous-a'},{...parsed.offers[1],id:'previous-b',productName:'Old product',productKey:'old product'}]
);
assert.deepEqual(comparison.counts,{new:1,remained:1,notRepeated:1});
console.log('manager list domain ok');
