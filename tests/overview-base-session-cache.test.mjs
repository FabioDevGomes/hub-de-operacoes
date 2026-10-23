import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const require=createRequire(import.meta.url);
const cacheApi=require('../src/overview/base-session-cache.js');
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const preparer=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
const recovery=await readFile(new URL('../src/overview/cards-recovery.js',import.meta.url),'utf8');

class MemoryStorage{
  #values=new Map();
  getItem(key){return this.#values.get(key)??null}
  setItem(key,value){this.#values.set(key,String(value))}
  removeItem(key){this.#values.delete(key)}
}

function fixture(){
  const sessionStorage=new MemoryStorage(),localStorage=new MemoryStorage();
  const cache=cacheApi.create({sessionStorage,localStorage,version:'test-version'});
  return{sessionStorage,localStorage,cache,snapshot:{database:{schema:'base_campanhas_v1',campanhas:[],diario:[],manifesto_atual:{campanhas:[]},atualizado_em:'2026-10-18T10:00:00.000Z'},productCatalog:{schema:'catalogo_produtos_v1',aliases:{},ocultos:[],datas_inicio:{},ajustes_testados:{}}}};
}

test('a clean, same-version snapshot round-trips from this tab session',()=>{
  const{cache,snapshot}=fixture();
  assert.equal(cache.restore(),null,'there is no usable snapshot before a full IndexedDB read');
  assert.equal(cache.markFresh(),true);
  assert.equal(cache.save(snapshot),true);
  assert.deepEqual(cache.restore(),snapshot);
});

test('every database write invalidates the old token until a fresh read replaces it',()=>{
  const{cache,snapshot}=fixture();
  cache.markFresh();cache.save(snapshot);
  cache.invalidate();
  assert.equal(cache.restore(),null,'dirty marker blocks a possibly stale snapshot');
  cache.markFresh();
  assert.equal(cache.restore(),null,'a new clean token also invalidates snapshots from the earlier revision');
  cache.save(snapshot);
  assert.deepEqual(cache.restore(),snapshot);
});

test('an in-flight database read cannot bless a cache after a concurrent write starts',()=>{
  const{cache,snapshot}=fixture();
  const readRevision=cache.marker();
  cache.invalidate();
  assert.equal(cache.markFresh(readRevision),false);
  assert.equal(cache.save(snapshot),false);
  assert.equal(cache.restore(),null);
});

test('version mismatch, malformed snapshots, and quota limits safely fall back to IndexedDB',()=>{
  const{sessionStorage,localStorage,cache,snapshot}=fixture();
  cache.markFresh();cache.save(snapshot);
  assert.equal(cacheApi.create({sessionStorage,localStorage,version:'new-version'}).restore(),null);
  const smallCache=cacheApi.create({sessionStorage,localStorage,version:'test-version',maxSerializedChars:64});
  smallCache.markFresh();
  assert.equal(smallCache.save(snapshot),false);
  assert.equal(smallCache.restore(),null);
  assert.equal(cache.restore(),null,'a quota failure cannot leave an older snapshot trusted');
});

test('storage failures disable the session shortcut without breaking normal database loading',()=>{
  const broken={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
  const cache=cacheApi.create({sessionStorage:broken,localStorage:broken,version:'test-version'});
  assert.equal(cache.restore(),null);
  assert.equal(cache.markFresh(),false);
  assert.equal(cache.save({database:{schema:'base_campanhas_v1',campanhas:[],diario:[]},productCatalog:{schema:'catalogo_produtos_v1'}}),false);
});

test('the Overview uses a valid base cache and reconciles legacy billing cancellations idempotently',()=>{
  assert.match(template,/const cachedOverviewBase=overviewBaseSessionCache\.restore\(\)/);
  assert.match(template,/if\(cachedOverviewBase\)\{baseLoadNotice\.ready\(\);reconcileCancelledManualSalesToBase\(\)\.then\(changed=>\{if\(changed\)render\(\)\}\)/);
  assert.match(template,/else restoreLocalBase\(\{includeCatalog:true,renderPage:false\}\)\.then\(async\(\)=>\{baseLoadNotice\.ready\(\);try\{await reconcileCancelledManualSalesToBase\(\)\}/);
  assert.match(template,/window\.addEventListener\('pagehide',\(\)=>overviewBaseSessionCache\.flush\(\)\)/);
  for(const functionName of ['editRemainingAlert','editTestLimitSettings','saveDiaryObservation','persistProductCatalog']){
    const start=template.indexOf(`function ${functionName}(`);
    assert.notEqual(start,-1,`${functionName} exists`);
    const snippet=template.slice(start,template.indexOf('\n',start));
    assert.match(snippet,/overviewBaseSessionCache\.invalidate\(\)/,`${functionName} invalidates the shortcut around its persistent write`);
  }
  const writerStart=template.indexOf('async function persistLocalBase(');
  const writerEnd=template.indexOf('\n    const MCC_DIARY_BACKFILL_KEY',writerStart);
  assert.match(template.slice(writerStart,writerEnd),/overviewBaseSessionCache\.invalidate\(\);[\s\S]*await new Promise[\s\S]*finally\{db\.close\(\)\}\s*overviewBaseSessionCache\.invalidate\(\)/,'the main base transaction invalidates the cache before and after commit');
  assert.match(template,/cacheReadMarker=includeCatalog\?overviewBaseSessionCache\.marker\(\):null/,'full reads capture a revision to avoid racing concurrent writes');
  assert.match(preparer,/OverviewBaseSessionCache\?\.invalidate\(\);\s*await writePanelBase\([\s\S]*?OverviewBaseSessionCache\?\.invalidate\(\)/);
  assert.match(recovery,/OverviewBaseSessionCache\?\.invalidate\(\)/,'compatibility repairs invalidate other tabs’ snapshots too');
});
