import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allCaptureOfferVariations,movementLabel} from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-domain.mjs';

const offer=(offerKey,rank,extra={})=>({offerKey,rank,offerName:'Synthetic product',seller:'SELLER',...extra});
const capture=(id,day,start,offers)=>({captureId:id,capturedAt:`2026-10-${day}T12:00:00.000Z`,listName:'Top Offers',page:{start,end:start+49,total:1000},offers});
const byKey=rows=>new Map(rows.map(row=>[row.offerKey,row]));

test('union preserves 1–50, 51–100 and future 101–150, with one row per full identity',()=>{
  const captures=[capture('p1','01',1,[offer('a',1),offer('b',2)]),capture('p2','02',51,[offer('c',51)]),capture('p3','03',101,[offer('d',101)])];
  const before=JSON.stringify(captures),rows=allCaptureOfferVariations(captures);
  assert.equal(rows.length,4);assert.equal(new Set(rows.map(row=>row.offerKey)).size,4);
  assert.deepEqual([...byKey(rows).keys()].sort(),['a','b','c','d']);
  assert.ok(rows.every(row=>movementLabel(row)==='Nova'&&row.rankDelta===null));
  assert.equal(JSON.stringify(captures),before);
  assert.deepEqual(allCaptureOfferVariations(),[]);
});

test('compare two latest appearances across skipped pages, never first to last or missing as zero',()=>{
  const captures=[
    capture('first','01',1,[offer('up',40),offer('down',2),offer('same',3)]),
    capture('middle','02',1,[offer('up',10),offer('down',5),offer('same',3)]),
    capture('otherpage','03',51,[offer('new',51)]),
    capture('last','04',1,[offer('up',7),offer('down',9),offer('same',3)]),
    capture('futurepage','05',101,[offer('future',101)]),
  ];
  const rows=byKey(allCaptureOfferVariations([captures[2],captures[0],captures[4],captures[1],captures[3]]));
  assert.deepEqual(['up','down','same','new','future'].map(key=>movementLabel(rows.get(key))),['↑ 3','↓ 4','= 0','Nova','Nova']);
  assert.equal(rows.get('up').priorRank,10);
  assert.equal(rows.get('up').observedCaptureId,'last');
  assert.equal(rows.get('up').priorObservedCaptureId,'middle');
  assert.equal(rows.get('up').observedAt,captures[3].capturedAt);
  assert.equal(rows.get('up').priorObservedAt,captures[1].capturedAt);
  assert.equal(rows.get('new').observedCaptureId,'otherpage');
});

test('latest metrics replace older ones exactly: zero remains zero and absence remains absence',()=>{
  const old=offer('a',8,{offerId:'LINK',average:{raw:'$20.00',value:20},epc:{raw:'$1.00',value:1}});
  const latest=offer('a',5,{offerId:'LINK',average:{raw:'$0.00',value:0},epc:null});
  const captures=[capture('old','01',1,[old]),capture('latest','02',1,[latest])],before=JSON.stringify(captures);
  const row=allCaptureOfferVariations(captures)[0];
  assert.equal(row.rank,5);assert.equal(row.offerId,'LINK');
  assert.deepEqual(row.average,{raw:'$0.00',value:0});assert.equal(row.epc,null);
  assert.equal(JSON.stringify(captures),before);
  assert.notEqual(row,latest);
});

test('different stable offer keys stay separate even with same display title/vendor; list labels do not lose appearances',()=>{
  const old=capture('old','01',1,[offer('seller::full-title',20),offer('seller::different-title',21),offer('other::full-title',22)]);
  old.listName='Marketplace ClickBank';
  const recent=capture('recent','02',51,[offer('seller::full-title',51)]);
  const rows=byKey(allCaptureOfferVariations([recent,old]));
  assert.equal(rows.size,3);assert.equal(movementLabel(rows.get('seller::full-title')),'↓ 31');
  assert.equal(rows.get('seller::different-title').movement,'new');
});

test('same timestamp is deterministic in saved order and duplicates inside one capture are not extra appearances',()=>{
  const a=capture('a','01',1,[offer('x',1),offer('x',2)]),b=capture('b','01',1,[offer('x',3)]);
  const once=allCaptureOfferVariations([a]);
  assert.equal(once.length,1);assert.equal(once[0].movement,'new');
  const rows=allCaptureOfferVariations([a,b]);
  assert.equal(rows.length,1);assert.equal(rows[0].rank,1);assert.equal(rows[0].priorRank,3);
  assert.deepEqual(allCaptureOfferVariations([a,b]),rows);
});
