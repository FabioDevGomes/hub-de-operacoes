import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureOfferVariations,countNewCapturedOffers,movementLabel} from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-domain.mjs';
const offer=(offerKey,rank)=>({offerKey,rank,offerName:'Oferta sintética '+offerKey,seller:'Vendedor sintético'});
const capture=(id,day,offers,listName='Top Offers')=>({captureId:id,capturedAt:`2026-10-${day}T12:00:00.000Z`,offers,listName,page:{total:1000,start:1,end:50}});

test('preview counts only distinct offers not detected in any saved page or list',()=>{
  const history=[capture('old','01',[offer('returned',20)],'Marketplace ClickBank'),capture('prior','02',[offer('known',1)])];
  const draft=[offer('returned',51),offer('known',52),offer('new',53),offer('new',54)];
  const before=JSON.stringify({history,draft});
  assert.equal(countNewCapturedOffers(draft,history),1);
  assert.equal(countNewCapturedOffers(draft,[]),3);
  assert.equal(countNewCapturedOffers([],history),0);
  assert.equal(countNewCapturedOffers(draft,[...history,capture('saved','03',draft)]),0);
  assert.equal(JSON.stringify({history,draft}),before,'counting cannot mutate draft or saved history');
});
test('first capture labels every observed offer Nova without fabricating a rank delta or changing source data',()=>{
  const first=capture('first','01',[offer('alpha',1),offer('beta',2)]),before=JSON.stringify(first);
  const rows=captureOfferVariations(first,[first]);
  assert.deepEqual(rows.map(movementLabel),['Nova','Nova']);assert.ok(rows.every(row=>row.rankDelta===null&&row.priorRank===null));assert.equal(JSON.stringify(first),before);
});
test('new arrivals compare against all earlier history; returns after a partial-page gap are not new',()=>{
  const oldest=capture('old','01',[offer('returned',20)]),prior=capture('prior','02',[offer('up',5),offer('down',2),offer('same',4)]),current=capture('current','03',[offer('up',1),offer('down',3),offer('same',4),offer('returned',5),offer('new',6)]);
  const history=[prior,current,oldest],before=JSON.stringify(history),rows=captureOfferVariations(current,history);
  assert.deepEqual(rows.map(movementLabel),['↑ 4','↓ 1','= 0','—','Nova']);
  assert.equal(rows[3].movement,'uncompared');assert.equal(rows[4].movement,'new');assert.equal(JSON.stringify(history),before);
});
test('selecting an old capture ignores later appearances and matches full historical identity, not display name or seller alone',()=>{
  const first=capture('first','01',[offer('a',1)]),second=capture('second','02',[offer('a',1),offer('b',2)]),third=capture('third','03',[offer('a',1),offer('b',2)]);
  assert.deepEqual(captureOfferVariations(first,[third,second,first]).map(movementLabel),['Nova']);
  assert.deepEqual(captureOfferVariations(second,[first,third,second]).map(movementLabel),['= 0','Nova']);
  assert.deepEqual(captureOfferVariations(third,[third,second,first]).map(movementLabel),['= 0','= 0']);
});
test('first-seen searches the screen history across list labels while rank comparison keeps the existing same-list scope',()=>{
  const earlier=capture('other','01',[offer('known',15)],'Marketplace ClickBank'),current=capture('current','02',[offer('known',1),offer('new',2)]);
  assert.deepEqual(captureOfferVariations(current,[current,earlier]).map(movementLabel),['—','Nova']);
});
test('empty or unavailable capture history cannot assert a first appearance',()=>{
  assert.deepEqual(captureOfferVariations(null,[]),[]);
  assert.deepEqual(captureOfferVariations(capture('unknown','01',[offer('a',1)]),[]).map(movementLabel),['—']);
});
