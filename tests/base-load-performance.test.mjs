import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const reader = require('../src/storage/campaign-base-reader.js');
const notice = require('../src/overview/base-load-notice.js');
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const databaseSource = await readFile(new URL('../src/database.js', import.meta.url), 'utf8');
const catalogSource = await readFile(new URL('../src/product-catalog.js', import.meta.url), 'utf8');

function storage(records, {outcome = 'complete', failTransaction = false} = {}) {
  const calls = {opens:0, closes:0, transactions:[], reads:[]};
  let complete;
  return {calls, complete:() => complete(), openDatabase:async () => {
    calls.opens++;
    return {close(){calls.closes++;}, transaction(stores, mode){
      calls.transactions.push({stores, mode});
      if (failTransaction) throw new Error('transaction unavailable');
      const requests = [];
      const tx = {error:null, objectStore(store){return {
        get(key){calls.reads.push([store,key]); const request = {}; requests.push([request,records[store] ?? null]); return request;},
        getAll(){calls.reads.push([store,'all']); const request = {}; requests.push([request,records[store] ?? []]); return request;}
      };}};
      complete = () => {
        for (const [request,result] of requests) {request.result = result; request.onsuccess();}
        if (outcome === 'complete') tx.oncomplete();
        else {tx.error = new Error('read failed'); tx[outcome === 'abort' ? 'onabort' : 'onerror']();}
      };
      return tx;
    }};
  }};
}

test('startup reads base, events and catalog together; waits for completion and closes', async () => {
  const records = {bases:{schema:'synthetic'}, events:[{event_id:'one'}], catalogos:{schema:'catalog'}};
  const db = storage(records);
  let settled = false;
  const pending = reader.read({openDatabase:db.openDatabase, includeCatalog:true}).then(value => {settled = true; return value;});
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(db.calls.closes, 0);
  db.complete();
  assert.deepEqual(await pending, {base:records.bases, events:records.events, catalog:records.catalogos});
  assert.deepEqual(db.calls, {opens:1, closes:1,
    transactions:[{stores:['bases','events','catalogos'],mode:'readonly'}],
    reads:[['bases','atual'],['events','all'],['catalogos','atual']]});
});

test('later base refreshes retain full Event Log without rereading the catalog', async () => {
  const db = storage({events:[{event_id:'two'}]});
  const pending = reader.read({openDatabase:db.openDatabase});
  await Promise.resolve(); db.complete();
  assert.deepEqual(await pending, {base:null,events:[{event_id:'two'}],catalog:null});
  assert.deepEqual(db.calls.transactions, [{stores:['bases','events'],mode:'readonly'}]);
  assert.equal(db.calls.closes, 1);
});

for (const outcome of ['error','abort']) test(`read ${outcome} is not reported as an empty base and releases the connection`, async () => {
  const db = storage({bases:{schema:'synthetic'}}, {outcome});
  const pending = reader.read({openDatabase:db.openDatabase,includeCatalog:true});
  const rejection = assert.rejects(pending, /read failed/);
  await Promise.resolve(); db.complete(); await rejection;
  assert.equal(db.calls.closes, 1);
});

test('connection also closes when transaction creation fails', async () => {
  const db = storage({}, {failTransaction:true});
  await assert.rejects(reader.read({openDatabase:db.openDatabase}), /transaction unavailable/);
  assert.equal(db.calls.closes, 1);
});

function adapter(records) {
  let clones = 0;
  const context = vm.createContext({window:{}, structuredClone(value){if(value?.schema === 'base_campanhas_v1')clones++;return structuredClone(value);}});
  vm.runInContext(databaseSource, context);
  vm.runInContext(catalogSource, context);
  const CampaignDatabase = context.window.CampaignDatabase;
  const ProductCatalog = context.window.ProductCatalog;
  const state = {database:null,productCatalog:ProductCatalog.create(),controlMacroRows:[]};
  const db = storage(records);
  Object.assign(context, {CampaignDatabase,ProductCatalog,state,CampaignBaseReader:reader,
    openLocalDb:db.openDatabase,embeddedManifest:{campanhas:[]},renderLegacyMigrationNotice(){},render(){},
    persistLocalBase(){throw new Error('unexpected write');},persistProductCatalog(){throw new Error('unexpected write');}});
  const start = template.indexOf('    async function restoreLocalBase(');
  const end = template.indexOf('    function validateProductCatalogBackup(', start);
  vm.runInContext(`let derivedCache={old:true};\n${template.slice(start,end)}`,context);
  return {context,state,db,CampaignDatabase,ProductCatalog,cloneCount:() => clones};
}

test('adapter normalizes valid base once, retains/deduplicates events and leaves stored input unchanged', async () => {
  const setup = adapter({});
  const base = setup.CampaignDatabase.create();
  base.campanhas = [{id:'synthetic',nome_mcc:'Synthetic campaign'}];
  base.diario = [{campanha_id:'synthetic',data:'2026-10-08',celulas:{O:{value:0}}}];
  const first = {event_id:'old',tipo:'synthetic',ocorrido_em:'2026-10-08T10:00:00Z'};
  const second = {event_id:'new',tipo:'synthetic',ocorrido_em:'2026-10-08T11:00:00Z'};
  base.event_log = [first];
  const original = structuredClone(base);
  const fixture = adapter({bases:base,events:[first,second]});
  const initialClones = fixture.cloneCount();
  const pending = fixture.context.restoreLocalBase({persist:false,renderPage:false});
  await Promise.resolve(); fixture.db.complete();
  assert.equal(await pending, true);
  assert.equal(fixture.cloneCount() - initialClones, 1, 'mergeEventLogs owns normalization; no redundant full-base clone');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.state.database.event_log)), [first,second]);
  assert.deepEqual(JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(original)));
  assert.notEqual(fixture.state.database, base);
  assert.equal(fixture.state.database.diario[0].celulas.O.value, 0);
  assert.equal(fixture.state.controlMacroRows, null);
  assert.equal(vm.runInContext('derivedCache', fixture.context), null);
});

test('startup restores catalog even without a base; incompatible catalog is ignored', async () => {
  const fixture = adapter({});
  const catalog = fixture.ProductCatalog.create();
  catalog.aliases = {'synthetic':'Synthetic alias'};
  const valid = adapter({catalogos:catalog});
  const pending = valid.context.restoreLocalBase({persist:false,renderPage:false,includeCatalog:true});
  await Promise.resolve(); valid.db.complete();
  assert.equal(await pending, false);
  assert.equal(valid.state.productCatalog.aliases.synthetic, 'Synthetic alias');
  assert.equal(valid.state.database, null);
  const invalid = adapter({catalogos:{schema:'unsupported',aliases:{private:'ignored'}}});
  const ignored = invalid.context.restoreLocalBase({persist:false,renderPage:false,includeCatalog:true});
  await Promise.resolve(); invalid.db.complete(); await ignored;
  assert.equal(invalid.state.productCatalog.aliases.private, undefined);
});

function noticeElement() {
  const attributes = {}, classes = new Set();
  return {attributes,classes,textContent:'',setAttribute(key,value){attributes[key]=value;},
    classList:{toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}}};
}
test('notice distinguishes loading, confirmed empty, loaded base and read failure across navigation', () => {
  let loaded = false;
  const element = noticeElement();
  const controller = notice.create({element,hasBase:() => loaded});
  assert.equal(element.textContent,'Carregando base local…');
  assert.equal(element.attributes['aria-busy'],'true');
  controller.refresh();
  assert.equal(element.textContent,'Carregando base local…');
  controller.ready();
  assert.match(element.textContent,/Nenhuma base local carregada/);
  assert.equal(element.attributes['aria-busy'],'false');
  loaded = true; controller.refresh();
  assert.equal(element.classes.has('hidden'),true);
  loaded = false; controller.fail(); controller.refresh();
  assert.match(element.textContent,/Não foi possível recuperar/);
  assert.doesNotMatch(element.textContent,/Nenhuma base/);
  assert.equal(element.classes.has('hidden'),false);
});

test('built startup wires the unified read and settles notice only after restoration', async () => {
  const built = await readFile(new URL('../dist/index.html', import.meta.url),'utf8');
  for (const source of [template,built]) {
    assert.match(source, /id="notice"[^>]*aria-busy="true">Carregando base local…/);
    assert.match(source, /storage\/campaign-base-reader\.js\?v=1/);
    assert.match(source, /overview\/base-load-notice\.js\?v=1/);
    assert.match(source, /restoreLocalBase\(\{includeCatalog:true,renderPage:false\}\)\.then\(\(\)=>\{baseLoadNotice\.ready\(\);render\(\)\}\)\.catch\(\(\)=>\{baseLoadNotice\.fail\(\)/);
    assert.doesNotMatch(source, /restoreProductCatalog\(\)\.then\(restoreLocalBase\)/);
  }
});
