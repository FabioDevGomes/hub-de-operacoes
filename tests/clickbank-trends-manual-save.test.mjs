import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as Storage from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';
const identity={offerKey:'synthetic::one',productKey:'synthetic-one',offerName:'Synthetic One',seller:'EXAMPLE'};
const oldMetadata={...identity,manualCountries:['US','GB'],customField:'preserved',salesPageType:'tsl',brandBidding:'brand_bidding',dtcCountryCapture:{source:'clickbank-dtc-checkout',productName:'Synthetic One',capturedAt:'2026-10-11T10:00:00Z',countries:['US']}};
const oldTrend={...identity,keywordCandidates:['existing candidate'],assessments:[]};
const newTrend={...oldTrend,pageDraft:{term:'Edited',status:'',countries:['US'],productAge:'new'}};
test('explicit Save commits a draft and both classifications while preserving metadata, candidates and other offers',async t=>{
 const original=globalThis.indexedDB;globalThis.indexedDB=memoryIndexedDB();t.after(()=>globalThis.indexedDB=original);
 await Storage.putOfferRecord(Storage.STORES.offerMetadata,oldMetadata);
 await Storage.putOfferRecord(Storage.STORES.trends,oldTrend);
 const other={...oldMetadata,offerKey:'synthetic::two'};
 await Storage.putOfferRecord(Storage.STORES.offerMetadata,other);
 const saved=await Storage.saveTrendPage(newTrend,{salesPageType:'quiz',brandBidding:'no_brand_bidding'});
 assert.deepEqual(saved.metadata,{...oldMetadata,salesPageType:'quiz',brandBidding:'no_brand_bidding'});
 assert.deepEqual(await Storage.getAll(Storage.STORES.trends),[newTrend]);
 assert.deepEqual((await Storage.getAll(Storage.STORES.offerMetadata)).find(row=>row.offerKey===other.offerKey),other);
 assert.equal(saved.record.assessments.length,0,'no invented classification/history');
 const backup=await Storage.exportBackup();assert.deepEqual(backup.trends,[newTrend]);
 assert.deepEqual(backup.offerMetadata.find(row=>row.offerKey===identity.offerKey),saved.metadata);
});
test('failed explicit Save preserves both stores and permits retry',async t=>{
 const original=globalThis.indexedDB,idb=memoryIndexedDB();globalThis.indexedDB=idb;t.after(()=>globalThis.indexedDB=original);
 await Storage.putOfferRecord(Storage.STORES.offerMetadata,oldMetadata);
 await Storage.putOfferRecord(Storage.STORES.trends,oldTrend);
 idb.failNextWrite();await assert.rejects(Storage.saveTrendPage(newTrend,{brandBidding:null}),/synthetic write failure/);
 assert.deepEqual(await Storage.getAll(Storage.STORES.trends),[oldTrend]);
 assert.deepEqual(await Storage.getAll(Storage.STORES.offerMetadata),[oldMetadata]);
 await Storage.saveTrendPage(newTrend,{brandBidding:null});
 assert.equal((await Storage.getAll(Storage.STORES.offerMetadata))[0].brandBidding,null);
});
test('invalid or out-of-scope metadata cannot be committed with Trends',async t=>{
 const original=globalThis.indexedDB;globalThis.indexedDB=memoryIndexedDB();t.after(()=>globalThis.indexedDB=original);
 for(const patch of [{brandBidding:'invalid'},{salesPageType:'invalid'},{customField:'changed'}])await assert.rejects(Storage.saveTrendPage(newTrend,patch),/inválida/);
 assert.deepEqual(await Storage.getAll(Storage.STORES.trends),[]);
});
