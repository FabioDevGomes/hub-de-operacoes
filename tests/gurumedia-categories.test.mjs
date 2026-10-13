import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import * as Domain from '../src/curadoria/top-performance/top-performance-domain.mjs';
import * as Guru from '../src/curadoria/top-performance/gurumedia-collections-domain.mjs';
import {collectionScope} from '../src/curadoria/top-performance/gurumedia-scopes.mjs';
import * as Storage from '../src/curadoria/top-performance/top-performance-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';

const raw=await readFile(new URL('./fixtures/gurumedia-nutra-diet.txt',import.meta.url),'utf8');
function paste(label,ids){return `${label}\n${ids.length} offers\nNewest First\n`+ids.map(id=>`TopBrand OK\nExample ${id}#${id}\nExample ${id}\nUS$45`).join('\n')}
function world(){return{offers:[],collections:[],snapshots:[]}}
function plan(w,label,ids){return Guru.prepareGuruMediaCollection({...w,parsed:Domain.parseTopPerformers(paste(label,ids)),collectionId:`c${w.collections.length}`,capturedAt:`2026-10-10T${String(10+w.collections.length).padStart(2,'0')}:00:00Z`})}
function apply(w,plan){const offers=new Map(w.offers.map(offer=>[offer.offerId,offer]));for(const offer of plan.updated)offers.set(offer.offerId,offer);w.offers=[...offers.values()];w.collections.push(plan.collection);w.snapshots.push(...plan.current);return plan}
function rows(w,scope=''){return Guru.offersForGuruMediaScope(Guru.projectGuruMediaCollections(w.offers,w.collections,w.snapshots),scope)}

test('a coleta Nutra / Diet enviada lê 13 IDs e ignora contagens de navegação e markup',()=>{
  const parsed=Domain.parseTopPerformers(raw);assert.equal(parsed.valid,true);assert.equal(parsed.declaredCount,13);assert.equal(parsed.parsedCount,13);assert.equal(parsed.captureScope,'nutra-diet');assert.deepEqual(parsed.issues,[]);
  assert.equal(new Set(parsed.offers.map(offer=>offer.offerId)).size,13);
  assert.ok(parsed.offers.every(offer=>offer.category==='Nutra / Diet'&&offer.payout.currency==='USD'));
  const byId=new Map(parsed.offers.map(offer=>[offer.offerId,offer]));
  assert.deepEqual(byId.get('33227').countriesVisible,['FR','BE','CH']);assert.equal(byId.get('33227').payout.value,60);assert.equal(byId.get('33227').flags.lowCtc,true);
  assert.equal(byId.get('33112').ctcCurrency,'AUD');assert.equal(byId.get('33111').rawDetails,'CTC 29.99 GBP');
  assert.equal(byId.get('31482').flags.directCheckout,true);assert.equal(byId.get('24502').additionalCountryCount,11);
  assert.equal(byId.get('24318').payout.value,84);assert.equal(byId.get('24318').badges.top,false);
  assert.ok(byId.get('33227').thumbnailUrl.endsWith('/33227-thumb.jpg'));
});

test('mesma estrutura funciona com Ctrl+A sem Markdown, Top Performers e outras categorias',()=>{
  const plain=raw.replace(/\*\*/g,'').replace(/^## /gm,'');assert.equal(Domain.parseTopPerformers(plain).valid,true);
  for(const label of ['eCommerce','Top Performers','Nutra / Male','Nutra / Skin','Health','Biz Opp']){
    const parsed=Domain.parseTopPerformers(paste(label,['10001']));assert.equal(parsed.valid,true,label);assert.equal(parsed.declaredCount,1);
    assert.equal(parsed.scopeLabel,label);assert.deepEqual(parsed.offers[0].countriesVisible,['US']);assert.equal(parsed.offers[0].payout.value,45);
  }
  const unknown=Domain.parseTopPerformers(paste('Título desconhecido',['10001']));assert.equal(unknown.valid,false);assert.equal(unknown.captureScope,null);
});

test('e-commerce, Nutra e Top coexistem e a mesma oferta não duplica cadastro/análises',()=>{
  const w=world();apply(w,plan(w,'eCommerce',['10001','10002']));w.offers[0].manualCountries=['BR'];w.offers[0].privateExtension={preserve:true};
  const diet=apply(w,plan(w,'Nutra / Diet',['10001','10003']));assert.equal(diet.comparison.summary.exited,0);assert.equal(diet.comparison.summary.new,2,'primeira aparição na lista não é um falso retorno de outra categoria');assert.equal(w.offers.length,3);
  apply(w,plan(w,'Top Performers',['10003','10001']));assert.equal(w.offers.length,3);
  assert.deepEqual(rows(w,'ecommerce').map(offer=>offer.offerId),['10001','10002']);assert.deepEqual(rows(w,'nutra-diet').map(offer=>offer.offerId),['10001','10003']);
  assert.ok(rows(w).every(offer=>offer.presentInLatestCollection));assert.deepEqual(w.offers[0].manualCountries,['BR']);assert.deepEqual(w.offers[0].privateExtension,{preserve:true});
  assert.equal(rows(w,'ecommerce')[0].latestSourceOrder,1);assert.equal(rows(w,'top-performers').find(offer=>offer.offerId==='10001').latestSourceOrder,2);
});

test('movimentos e saídas comparam somente a coleta anterior da mesma lista',()=>{
  const w=world();apply(w,plan(w,'Nutra / Diet',['10001','10002']));apply(w,plan(w,'eCommerce',['10001','10003']));
  const next=apply(w,plan(w,'Nutra / Diet',['10002']));assert.equal(next.comparison.summary.up,1);assert.equal(next.comparison.summary.exited,1);
  const diet=rows(w,'nutra-diet'),all=rows(w);assert.equal(diet.find(offer=>offer.offerId==='10001').latestMovement,'exited');assert.equal(diet.find(offer=>offer.offerId==='10002').positionDelta,1);
  assert.equal(all.find(offer=>offer.offerId==='10001').presentInLatestCollection,true,'a oferta continua presente em e-commerce');assert.notEqual(all.find(offer=>offer.offerId==='10001').latestMovement,'exited');assert.equal(all.find(offer=>offer.offerId==='10003').presentInLatestCollection,true);
});

test('divergência de contagem é bloqueada na prévia e seu override nunca comprova saída',()=>{
  const w=world();apply(w,plan(w,'Nutra / Diet',['10001','10002']));
  const parsed=Domain.parseTopPerformers(paste('Nutra / Diet',['10002']).replace('1 offers','2 offers'));assert.equal(parsed.valid,false);
  const partial=Guru.prepareGuruMediaCollection({...w,parsed,collectionId:'partial',capturedAt:'2026-10-10T12:00:00Z'});assert.equal(partial.comparison.summary.exited,0);apply(w,partial);
  assert.equal(rows(w,'nutra-diet').find(offer=>offer.offerId==='10001').presentInLatestCollection,true);
  const next=plan(w,'Nutra / Diet',['10001','10002']);assert.equal(next.previous.length,2,'captura parcial não substitui a referência completa');
});

test('coletas antigas mantêm fonte, IDs, schema e histórico sem migração/gravação de abertura',()=>{
  const w=world();apply(w,plan(w,'eCommerce',['10001']));apply(w,plan(w,'Top Performers',['10002']));
  for(const collection of w.collections){delete collection.captureScope;delete collection.scopeLabel;delete collection.category}
  const original=structuredClone(w),index=Guru.projectGuruMediaCollections(w.offers,w.collections,w.snapshots);
  assert.equal(collectionScope(w.collections[0]).key,'ecommerce');assert.equal(collectionScope(w.collections[1]).key,'top-performers');
  assert.equal(Guru.offersForGuruMediaScope(index,'ecommerce').length,1);assert.equal(Guru.offersForGuruMediaScope(index,'top-performers').length,1);assert.deepEqual(w,original);
  assert.equal(Storage.DB_VERSION,1);assert.equal(Storage.DB_NAME,'radar-top-performance');
  assert.ok(Guru.guruMediaFilterScopes(index).some(scope=>scope.key==='nutra-diet'));
});

test('persistência sintética faz round-trip de categoria sem apagar decisões e rollback preserva a coleta',async()=>{
  const previous=globalThis.indexedDB;globalThis.indexedDB=memoryIndexedDB();
  try{
    await Storage.put(Storage.STORES.decisions,{offerId:'10001',currentStatus:'Revisar',history:[{status:'Revisar'}]});
    const w=world(),first=plan(w,'eCommerce',['10001']);await Storage.saveCollection({offers:first.updated,collection:first.collection,snapshots:first.current});apply(w,first);
    const diet=plan(w,'Nutra / Diet',['10001','10002']);await Storage.saveCollection({offers:diet.updated,collection:diet.collection,snapshots:diet.current});
    const saved={offers:await Storage.getAll(Storage.STORES.offers),collections:await Storage.getAll(Storage.STORES.collections),snapshots:await Storage.getAll(Storage.STORES.snapshots)};
    assert.equal(saved.offers.length,2);assert.equal(rows(saved,'ecommerce').length,1);assert.equal(rows(saved,'nutra-diet').length,2);
    assert.equal((await Storage.getByKey(Storage.STORES.decisions,'10001')).history.length,1);
    const next=plan(saved,'Nutra / Diet',['10002']);globalThis.indexedDB.failNextWrite();await assert.rejects(Storage.saveCollection({offers:next.updated,collection:next.collection,snapshots:next.current}));
    assert.equal((await Storage.getAll(Storage.STORES.collections)).length,2);assert.deepEqual(await Storage.getAll(Storage.STORES.offers),saved.offers);
  }finally{globalThis.indexedDB=previous}
});
