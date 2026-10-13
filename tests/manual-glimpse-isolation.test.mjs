import test from 'node:test';
import assert from 'node:assert/strict';
import * as GlimpseStorage from '../src/curadoria/glimpse-storage.mjs';
import * as GlimpseDomain from '../src/curadoria/glimpse-domain.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';
test('Glimpse real adapter: duas origens com mesmo nome nunca leem ou escrevem no banco da outra',async()=>{
  const previous=globalThis.indexedDB,factory=memoryIndexedDB();globalThis.indexedDB=factory;
  try{
    const {manualStorage:s}=await import('../src/curadoria/manual/manual-storage.mjs?v=2');
    const a=await s.saveProduct({name:'Mesmo produto'}),b=await s.saveProduct({name:'Mesmo produto'});
    const legacy=GlimpseDomain.createAnalysis('8K searches past month',{productName:'Mesmo produto'});
    await GlimpseStorage.saveAnalysis(legacy);const options={origin:'manual',productId:a.productId};
    assert.deepEqual(await GlimpseStorage.getHistoryByProduct(a.productId,options),[]);
    const manual={...GlimpseDomain.createAnalysis('4K searches past month',{productName:'Mesmo produto'}),productId:a.productId,productKey:a.productId};
    await GlimpseStorage.saveAnalysis(manual,options);
    assert.equal((await GlimpseStorage.getHistoryByProduct(a.productId,options))[0].analysisId,manual.analysisId);
    assert.deepEqual(await GlimpseStorage.getHistoryByProduct(b.productId,{origin:'manual',productId:b.productId}),[]);
    assert.equal((await GlimpseStorage.getHistoryByProduct(legacy.productKey))[0].analysisId,legacy.analysisId);
    assert.equal((await GlimpseStorage.getAllAnalyses()).length,1);
    await assert.rejects(GlimpseStorage.getHistoryByProduct('Mesmo produto',{origin:'manual'}),/identidade/);
    assert.deepEqual(new Set(factory.calls.map(([name])=>name)),new Set(['radar-curadoria-manual','radar-glimpse']));
  }finally{globalThis.indexedDB=previous;}
});
