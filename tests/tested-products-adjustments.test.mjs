import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const catalogSource=await readFile(new URL('../src/product-catalog.js',import.meta.url),'utf8');
const domainSource=await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8');
const panel=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const ctx=vm.createContext({window:{},structuredClone});vm.runInContext(catalogSource,ctx);vm.runInContext(domainSource,ctx);
const Catalog=ctx.window.ProductCatalog,Domain=ctx.window.TestedProductsDomain;
const plain=value=>JSON.parse(JSON.stringify(value));
function input(catalog=Catalog.create(),commission=100){return{
  source:[{id:'synthetic-id',nome_mcc:'Synthetic 01',nome_exibicao:'Synthetic',status:'ativa'}],activeCampaigns:[{nome_campanha_exato:'Synthetic 01'}],catalog,
  referenceDate:'2026-10-06',salesAdjustments:new Map(),dailyByCampaign:new Map([['synthetic-id',[{data:'2026-10-01',celulas:{F:{value:2},O:{value:50},P:{value:commission}}}]]]),
  getProductName:c=>c.nome_exibicao,getCampaignIdentity:()=>({dateSort:'2026-10-01'}),getCampaignSheet:name=>name
}}

test('manual presentation adjusts all data columns without changing campaigns, daily rows or shared aliases',()=>{
  const legacy=Catalog.rename(Catalog.create(),'other','Other alias'),original=structuredClone(legacy),patch={label:'Manual product',startDate:'2027-01-01',campaignCount:5,salesCount:8,totalBilled:250,totalProfit:-25,first:'2026-01-01',last:'2026-12-31',active:false,relatedCampaigns:['Manual display only']};
  const catalog=Catalog.setTestedAdjustments(legacy,'synthetic',patch),args=input(catalog),before=structuredClone(args.source),dailyBefore=structuredClone(args.dailyByCampaign);
  const product=Domain.buildProducts(args)[0];
  for(const[key,value]of Object.entries(patch))assert.deepEqual(plain(product[key]),value);
  assert.equal(product.key,'synthetic');assert.deepEqual(plain(product.campaigns),['Synthetic 01']);assert.equal(product.totalInvestment,50);
  assert.equal(product.calculated.totalBilled,100);assert.equal(product.calculated.totalProfit,50);assert.equal(product.calculated.salesCount,2);
  assert.deepEqual(args.source,before);assert.deepEqual(args.dailyByCampaign,dailyBefore);assert.deepEqual(plain(legacy),plain(original));assert.deepEqual(plain(catalog.aliases),plain(legacy.aliases));
});

test('MCC refresh updates calculated values without removing manual ones; clearing patches restores latest source',()=>{
  let catalog=Catalog.setTestedAdjustments(Catalog.create(),'synthetic',{totalBilled:900,salesCount:0});
  const product=Domain.buildProducts(input(catalog,300))[0];assert.equal(product.totalBilled,900);assert.equal(product.calculated.totalBilled,300);assert.equal(product.salesCount,0);
  // Other fields remain independently calculated; a manual revenue is not a fake source for profit.
  assert.equal(product.totalProfit,250);
  catalog=Catalog.setTestedAdjustments(catalog,'synthetic',{});
  const restored=Domain.buildProducts(input(catalog,300))[0];assert.equal(restored.totalBilled,300);assert.equal(restored.salesCount,2);assert.equal(restored.manualFields.length,0);
});

test('missing values, zero and empty display lists survive backup round trip and sorting',()=>{
  const original=Catalog.setTestedAdjustments(Catalog.create(),'synthetic',{campaignCount:null,salesCount:0,totalBilled:null,totalProfit:0,startDate:null,relatedCampaigns:[]}),backup=JSON.stringify({catalogo_produtos:original});
  const restored=Catalog.normalize(JSON.parse(backup).catalogo_produtos),row=Domain.buildProducts(input(restored))[0];
  assert.equal(row.campaignCount,null);assert.equal(row.salesCount,0);assert.equal(row.totalBilled,null);assert.equal(row.totalProfit,0);assert.equal(row.startDate,null);assert.deepEqual(plain(row.relatedCampaigns),[]);
  assert.equal(Domain.sortProducts([row,{...row,key:'other',label:'Other',campaignCount:1}],'campaigns','asc').at(-1).key,'synthetic');
  assert.deepEqual(plain(restored.ajustes_testados),plain(original.ajustes_testados));
});

test('old catalog remains compatible and unrelated fields, hidden products and metadata are preserved',()=>{
  const legacy={schema:Catalog.SCHEMA,aliases:{a:'A'},datas_inicio:{a:'2026-01-01'},ocultos:['a'],extra:{keep:true}};
  const current=Catalog.setTestedAdjustments(legacy,'synthetic',{label:'Manual'});
  assert.deepEqual(plain(current.extra),{keep:true});assert.deepEqual(plain(current.aliases),{a:'A'});assert.deepEqual(plain(current.ocultos),['a']);assert.equal(legacy.ajustes_testados,undefined);
  assert.equal(Catalog.restoreAll(current).ajustes_testados.synthetic.values.label,'Manual');
});

test('legacy aliases remain visible and restoring the source name affects only this list',()=>{
  const legacy=Catalog.rename(Catalog.create(),'synthetic','Legacy manual name'),row=Domain.buildProducts(input(legacy))[0];
  assert.equal(row.label,'Legacy manual name');assert.equal(row.calculated.label,'Synthetic');assert.deepEqual(plain(row.manualFields),['label']);
  const restored=Catalog.setTestedAdjustments(legacy,'synthetic',{}),automatic=Domain.buildProducts(input(restored))[0];
  assert.equal(automatic.label,'Synthetic');assert.equal(automatic.manualFields.length,0);assert.equal(restored.aliases.synthetic,'Legacy manual name');assert.equal(legacy.aliases.synthetic,'Legacy manual name');
});

test('invalid backup/manual values are rejected without mutating the catalog',()=>{
  const value=Catalog.create(),before=structuredClone(value);
  for(const patch of [{label:''},{campaignCount:1.5},{salesCount:-1},{totalBilled:Infinity},{active:'active'},{startDate:'2026-02-30'},{first:'2026-02-01',last:'2026-01-01'},{relatedCampaigns:['']},{nome_mcc:'Unsafe source edit'}])assert.throws(()=>Catalog.setTestedAdjustments(value,'synthetic',patch));
  assert.throws(()=>Catalog.normalize({...value,ajustes_testados:{synthetic:{values:{salesCount:'12'}}}}));assert.deepEqual(plain(value),plain(before));
  assert.throws(()=>Catalog.validateTestedAdjustments([]));
});

test('editor parsing supports decimal comma, negative profit and blank as missing; partial periods validate against calculated data',()=>{
  const row=Domain.buildProducts(input())[0],draft={salesCount:{manual:true,value:'0'},totalProfit:{manual:true,value:'-1.234,56'},totalBilled:{manual:true,value:''},relatedCampaigns:{manual:true,value:' First\n\n Second '}};
  const parsed=Domain.prepareEdit(row,draft);assert.equal(parsed.valid,true);assert.deepEqual(plain(parsed.values),{salesCount:0,totalProfit:-1234.56,totalBilled:null,relatedCampaigns:['First','Second']});
  const invalid=Domain.prepareEdit(row,{last:{manual:true,value:'2026-09-01'}});assert.equal(invalid.valid,false);assert.match(invalid.errors.last,/anterior/);
  assert.equal(Domain.prepareEdit(row,{totalBilled:{manual:true,value:'banana'}}).valid,false);
});

test('direct editor preserves existing exact overrides and leaves untouched automatic fields calculated',()=>{
  const base=Domain.buildProducts(input())[0],row=Domain.applyManualAdjustments(base,{totalProfit:59.210000000000001,label:'Manual'});
  const result=Domain.prepareDirectEdit(row,{totalProfit:{value:'59,21',changed:false},label:{value:'Manual',changed:false}});
  assert.equal(result.valid,true);assert.deepEqual(plain(result.values),{label:'Manual',totalProfit:59.210000000000001});
  assert.deepEqual(plain(Domain.prepareDirectEdit(base,{}).values),{});
});

test('direct editor restores individually or by entering calculated value, and permits editing after restore',()=>{
  const base=Domain.buildProducts(input())[0],row=Domain.applyManualAdjustments(base,{salesCount:7,label:'Manual'});
  const restored=Domain.prepareDirectEdit(row,{salesCount:{value:'2',restored:true,changed:false},label:{value:'Manual',changed:false}});
  assert.deepEqual(plain(restored.values),{label:'Manual'});
  const typed=Domain.prepareDirectEdit(row,{salesCount:{value:'2,0',changed:true},label:{value:'Manual',changed:false}});
  assert.deepEqual(plain(typed.values),{label:'Manual'});
  const edited=Domain.prepareDirectEdit(row,{salesCount:{value:'3',restored:true,changed:true},label:{value:'Manual',changed:false}});
  assert.deepEqual(plain(edited.values),{label:'Manual',salesCount:3});
});

test('adapter persists only catalog store and assigns state only after successful commit',async()=>{
  const persist=panel.split(/\r?\n/).find(line=>line.includes('async function persistProductCatalog('));
  const state={productCatalog:Catalog.create(),database:{campanhas:[{id:'keep'}],diario:[{id:'daily-keep'}]},localSavedAt:'unchanged'};
  const baseBefore=structuredClone(state.database),stored=[],transactions=[];let fail=false,closed=0;
  const db={transaction(store,mode){transactions.push([store,mode]);const tx={objectStore(name){assert.equal(name,'catalogos');return{put(payload,key){stored.push([payload,key]);queueMicrotask(()=>fail?tx.onerror():tx.oncomplete())}}},error:new Error('Synthetic transaction failed')};return tx},close(){closed++}};
  const runtime=vm.createContext({state,ProductCatalog:Catalog,derivedCache:'cached',openLocalDb:async()=>db});vm.runInContext(persist,runtime);
  const next=Catalog.setTestedAdjustments(state.productCatalog,'synthetic',{salesCount:3});await runtime.persistProductCatalog(next);
  assert.deepEqual(transactions,[['catalogos','readwrite']]);assert.equal(stored[0][1],'atual');assert.equal(state.productCatalog.ajustes_testados.synthetic.values.salesCount,3);assert.deepEqual(state.database,baseBefore);assert.equal(state.localSavedAt,'unchanged');assert.equal(runtime.derivedCache,null);
  fail=true;const previous=state.productCatalog;await assert.rejects(runtime.persistProductCatalog(Catalog.setTestedAdjustments(previous,'synthetic',{salesCount:7})));assert.equal(state.productCatalog,previous);assert.equal(closed,2);
});

test('backup validation and catalog replacement recognize presentation adjustments, not a new base/schema',()=>{
  assert.match(panel,/payload\.catalogo_produtos=ProductCatalog\.normalize\(state\.productCatalog\)/);
  assert.match(panel,/Object\.keys\(currentCatalog\.ajustes_testados\)\.length>0/);
  assert.match(panel,/validateProductCatalogBackup\(JSON\.parse\(await file\.text\(\)\)\)/);
  const render=panel.split(/\r?\n/).find(line=>line.includes('function renderTestedProducts()'));
  assert.match(render,/saveAdjustments:async\(key,values\)/);assert.doesNotMatch(render,/persistLocalBase|announceBaseUpdated|ProductCatalog\.rename/);
});
