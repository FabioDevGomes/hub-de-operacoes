import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const scheduler=require('../src/overview/projection-scheduler.js');
const cacheModule=require('../src/overview/table-preview-cache.js');

test('projeção cede entre blocos e respeita cancelamento',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(scheduler.map([1,2,3],value=>{calls++;if(value===2)controller.abort();return value},{signal:controller.signal,maxSliceMs:0}),{name:'AbortError'});
  assert.equal(calls,2);
  assert.deepEqual((await scheduler.map([1,2,3],value=>value*2,{maxSliceMs:0})).values,[2,4,6]);
});

test('prévia rejeita formato antigo e restaura estados resolvidos',()=>{
  const storage=new Map(),sessionStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const cache=cacheModule.create({sessionStorage,version:'synthetic'});
  storage.set(cache.key,JSON.stringify({schema:'overview_table_preview_v1',version:'synthetic',entries:{}}));
  assert.equal(cache.restore('consolidated','api'),null);
  const snapshot={previewOnly:true,rows:['ativa','pausada','historico'].map(filterStatus=>({displayOnlyPreview:true,filterStatus})),dates:{},referenceDate:'2026-11-21'};
  cache.scheduleSave({mode:'consolidated',sourceMode:'api',snapshot});
  assert.equal(cache.flush(),true);
  assert.deepEqual(cache.restore('consolidated','api').snapshot.rows.map(row=>row.filterStatus),['ativa','pausada','historico']);
  assert.equal(cache.restore('d1','api'),null);
  assert.equal(cache.restore('consolidated','manifest'),null);
});
