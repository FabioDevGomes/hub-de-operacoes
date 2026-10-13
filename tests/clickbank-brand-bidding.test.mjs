import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {BRAND_BIDDING_TYPES,isBrandBidding,brandBiddingLabel,withBrandBidding} from '../src/curadoria/clickbank-top-offers/brand-bidding.mjs';
import * as Storage from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';

const identity={offerKey:'synthetic::product',productKey:'synthetic-product',offerName:'Synthetic Product',seller:'EXAMPLE'};
const metadata={...identity,manualCountries:['US','GB'],salesPageType:'tsl',customField:'preserved',dtcCountryCapture:{source:'clickbank-dtc-checkout',productName:'Synthetic Product',capturedAt:'2026-10-11T10:00:00Z',countries:['US']}};

test('brand bidding accepts only explicit choices and keeps legacy absence unknown',()=>{
  assert.deepEqual(BRAND_BIDDING_TYPES,['brand_bidding','no_brand_bidding']);
  for(const value of [...BRAND_BIDDING_TYPES,null,undefined])assert.equal(isBrandBidding(value),true);
  for(const value of ['',false,true,'allowed','No brand bidding',42])assert.equal(isBrandBidding(value),false);
  assert.deepEqual([...BRAND_BIDDING_TYPES,null,undefined].map(brandBiddingLabel),['Brand bidding','No brand bidding','Não definido','Não definido']);
});

test('changing and clearing brand bidding preserve all existing metadata without mutation',()=>{
  const original=structuredClone(metadata),classified=withBrandBidding(metadata,identity,'no_brand_bidding');
  assert.deepEqual(metadata,original);
  assert.deepEqual(classified,{...metadata,brandBidding:'no_brand_bidding'});
  assert.deepEqual(withBrandBidding(classified,identity,'brand_bidding'),{...metadata,brandBidding:'brand_bidding'});
  assert.deepEqual(withBrandBidding(classified,identity,null),{...metadata,brandBidding:null});
  assert.throws(()=>withBrandBidding(metadata,identity,'invalid'),/inválida/);
});

test('brand bidding patches only its own offer, preserves latest metadata and survives backup round-trip',async()=>{
  const previous=globalThis.indexedDB,idb=memoryIndexedDB();globalThis.indexedDB=idb;
  try {
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,metadata);
    const other={...metadata,offerKey:'synthetic::other',brandBidding:'brand_bidding'};
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,other);
    const stored=await Storage.saveBrandBidding(identity,'no_brand_bidding');
    assert.deepEqual(stored,{...metadata,brandBidding:'no_brand_bidding'});
    const backup=await Storage.exportBackup();
    assert.deepEqual(backup.offerMetadata.find(item=>item.offerKey===other.offerKey),other);
    assert.deepEqual(backup.offerMetadata.find(item=>item.offerKey===identity.offerKey),stored);
    globalThis.indexedDB=memoryIndexedDB();
    await Storage.mergeBackup(backup);
    assert.deepEqual((await Storage.getAll(Storage.STORES.offerMetadata)).find(item=>item.offerKey===identity.offerKey),stored);
    const cleared=await Storage.saveBrandBidding(identity,null);
    assert.deepEqual(cleared,{...metadata,brandBidding:null});
    const legacy={...backup,offerMetadata:[metadata]};
    globalThis.indexedDB=memoryIndexedDB();await Storage.mergeBackup(legacy);
    assert.equal((await Storage.getAll(Storage.STORES.offerMetadata))[0].brandBidding,undefined);
    assert.ok(idb.calls.every(([name,version])=>name==='radar-clickbank-top-offers'&&version===3));
  } finally {globalThis.indexedDB=previous;}
});

test('invalid brand bidding and failed writes preserve the stored classification',async()=>{
  const previous=globalThis.indexedDB,idb=memoryIndexedDB();globalThis.indexedDB=idb;
  try {
    const old={...metadata,brandBidding:'brand_bidding'};
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,old);
    await assert.rejects(Storage.saveBrandBidding(identity,'invalid'),/inválida/);
    idb.failNextWrite();await assert.rejects(Storage.saveBrandBidding(identity,'no_brand_bidding'),/synthetic write failure/);
    assert.deepEqual(await Storage.getAll(Storage.STORES.offerMetadata),[old]);
    await assert.rejects(Storage.putOfferRecord(Storage.STORES.offerMetadata,{...old,brandBidding:true}),/inválido/);
    const backup=await Storage.exportBackup();backup.offerMetadata[0].brandBidding='invalid';
    await assert.rejects(Storage.mergeBackup(backup),/inválidas|inválidos/);
  } finally {globalThis.indexedDB=previous;}
});

test('controller confirms only successful brand writes and preserves the previous record on failure',async()=>{
  const source=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function saveBrandBidding('),source.indexOf('async function saveImage('));
  const messages=[],writes=[];let fail=false,renders=0;
  const context=vm.createContext({saving:false,offerMetadata:[metadata],brandBiddingLabel,
    currentOffer:key=>key===identity.offerKey?identity:null,baseRecord:item=>item,
    replaceRecord:(records,record)=>[...records.filter(item=>item.offerKey!==record.offerKey),record],
    Storage:{saveBrandBidding:async(...args)=>{writes.push(args);if(fail)throw Error('synthetic');return {...metadata,brandBidding:args[1]};}},
    show:()=>renders++,view:{showMessage:(...args)=>messages.push(args)},console:{error(){}},
  });
  vm.runInContext(fn,context);
  assert.equal(await context.saveBrandBidding(identity.offerKey,'no_brand_bidding'),true);
  assert.equal(renders,1);assert.match(messages.at(-1)[0],/salva: No brand bidding/);
  assert.equal(messages.at(-1)[1].headerOnly,true,'brand success uses only the existing header confirmation');
  fail=true;assert.equal(await context.saveBrandBidding(identity.offerKey,'brand_bidding'),false);
  assert.equal(context.offerMetadata[0].brandBidding,'no_brand_bidding');
  assert.equal(renders,1);assert.equal(messages.at(-1)[1].error,true);assert.equal(context.saving,false);
  assert.equal(await context.saveBrandBidding('unknown','brand_bidding'),false);assert.equal(writes.length,2);
});
