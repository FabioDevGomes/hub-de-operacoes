import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const registrySource=await readFile(new URL('../src/view-registry.js',import.meta.url),'utf8');
const source=await readFile(new URL('../src/navigation-controller.js',import.meta.url),'utf8');
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const context=vm.createContext({window:{},URLSearchParams,encodeURIComponent});
vm.runInContext(registrySource,context);
vm.runInContext(source,context);
const registry=context.window.PanelViews;
const routes=registry.enabledViews().filter(view=>view.id!=='presell');
const groups={totals:'operation',tested:'products',macro:'finance',billing:'finance',cpa:'analysis',accounts:'analysis',observability:'analysis','curation-observability':'analysis',time:'personal','personal-finance':'personal',copy:'creation'};
function element(group){
  const classes=new Set(['hidden']);
  return {textContent:'',dataset:{sidebarGroup:group},onclick:null,
    closest:()=>group?{dataset:{sidebarGroup:group}}:null,
    classList:{contains:name=>classes.has(name),toggle:(name,enabled)=>{if(enabled)classes.add(name);else classes.delete(name)},add:name=>classes.add(name),remove:name=>classes.delete(name)}};
}
function harness(overrides={}){
  const nodes=new Map(),renders=[],frames=[],errors=[],openedGroups=[],historyWrites=[],handlers=new Map();
  for(const view of routes){nodes.set(view.sectionId,element());nodes.set(view.navId,element(groups[view.id]))}
  for(const id of ['productView','presellView','presellNav','pageTitle','pageSubtitle','registerSale','correctCampaignDate'])nodes.set(id,element());
  const body=element(),document={body,title:'',getElementById:id=>nodes.get(id)||null,defaultView:{HubSidebar:{setOpenGroup:group=>openedGroups.push(group)}}};
  const location={pathname:'/',search:''};
  const history={replaceState:(_state,_title,url)=>{historyWrites.push(url);const parsed=new URL(url,'http://example.test');location.pathname=parsed.pathname;location.search=parsed.search}};
  const eventTarget={addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener:name=>handlers.delete(name)};
  const state={activeView:'totals',activeCampaign:null,activeCampaignId:null,activeSource:'manifest',database:{diario:[{id:'synthetic-record',zero:0,missing:null}]}};
  const entries=Object.fromEntries(routes.map(view=>[view.id,{render:()=>renders.push(view.id)}]));
  entries.time.bodyClass='time-mode';entries.billing.bodyClass='billing-page';
  entries.product={sectionId:'productView',title:'Diário de campanha',group:'products',preserveCampaign:true,contextualTitle:true,render:()=>{nodes.get('pageTitle').textContent='Campanha sintética';renders.push('product')}};
  Object.assign(entries,overrides);
  const controller=context.window.PanelNavigation.create({registry,document,history,location,eventTarget,state,entries,extraSectionIds:['presellView'],extraNavIds:['presellNav'],clearBodyClasses:['billing-mode'],onFrame:view=>frames.push(view.id),onError:error=>errors.push(error.message)});
  return {controller,document,location,nodes,state,entries,renders,frames,errors,openedGroups,historyWrites,handlers};
}
function assertFrame(h,id){
  const view=id==='product'?{sectionId:'productView',navId:null,activeView:'product'}:registry.definition(id);
  assert.equal(h.state.activeView,view.activeView);
  for(const registered of routes)assert.equal(h.nodes.get(registered.sectionId).classList.contains('hidden'),registered.sectionId!==view.sectionId,`${id}: seção ${registered.id}`);
  assert.equal(h.nodes.get('productView').classList.contains('hidden'),id!=='product');
  assert.ok(h.nodes.get('presellView').classList.contains('hidden'));
  assert.equal(h.nodes.get('presellNav').classList.contains('active'),false);
  for(const registered of routes)assert.equal(h.nodes.get(registered.navId).classList.contains('active'),registered.navId===view.navId,`${id}: menu ${registered.id}`);
  assert.equal(h.document.body.classList.contains('time-mode'),id==='time');
  assert.equal(h.document.body.classList.contains('billing-page'),id==='billing');
  assert.equal(h.document.body.classList.contains('billing-mode'),false);
  assert.equal(h.nodes.get('registerSale').classList.contains('hidden'),id!=='totals');
  const group=id==='product'?'products':groups[id];
  assert.equal(h.nodes.get('correctCampaignDate').classList.contains('hidden'),group!=='operation'&&group!=='products');
  assert.equal(h.historyWrites.at(-1),registry.urlFor(id,'/'));
}

test('all 144 transitions leave exactly one section, one menu and the correct body mode',()=>{
  const ids=[...routes.map(view=>view.id),'product'],h=harness(),database=h.state.database;
  for(const from of ids)for(const to of ids){
    h.controller.open(from);h.controller.open(to);assertFrame(h,to);
    assert.equal(h.openedGroups.at(-1),groups[to]||'products');
    assert.equal(h.document.title,to==='product'?'Campanha sintética':registry.definition(to).title);
  }
  assert.equal(h.state.database,database);
  assert.deepEqual(database.diario,[{id:'synthetic-record',zero:0,missing:null}]);
});

test('campaign selection preserves exact name, stable ID, source and underlying data',()=>{
  const h=harness();h.state.activeCampaign='Campanha sintética 01';h.state.activeCampaignId='synthetic-id';h.state.activeSource='legacy';
  h.controller.open('product');h.controller.refresh();
  assert.equal(h.state.activeCampaign,'Campanha sintética 01');assert.equal(h.state.activeCampaignId,'synthetic-id');assert.equal(h.state.activeSource,'legacy');
  h.controller.open('accounts');assert.equal(h.state.activeCampaign,null);
});

test('direct routes, unknown routes and legacy Presell alias use the same entry',()=>{
  const h=harness();
  for(const view of routes){h.location.search=view.query?`?view=${view.query}`:'';h.controller.openRoute();assertFrame(h,view.id)}
  h.location.search='?view=presell';h.controller.openRoute();assertFrame(h,'copy');
  h.controller.open('presell');assertFrame(h,'copy');
  h.location.search='?view=unknown';h.controller.openRoute();assertFrame(h,'totals');
});

test('refresh resolves activeView without resetting menu-specific state',()=>{
  let resets=0;
  const h=harness({macro:{onMenu:()=>resets++,render:()=>{}}});
  h.controller.bind();h.nodes.get('controlMacroNav').onclick();assert.equal(resets,1);
  h.controller.refresh();assert.equal(resets,1);assertFrame(h,'macro');
  h.controller.open('totals');h.nodes.get('controlMacroNav').onclick();assert.equal(resets,2);
});

test('menu binding is idempotent and popstate reopens the canonical route',()=>{
  const h=harness();h.controller.bind();const click=h.nodes.get('copyFichaNav').onclick;h.controller.bind();
  assert.equal(h.nodes.get('copyFichaNav').onclick,click);assert.equal(h.handlers.size,1);
  h.location.search='?view=accounts';h.handlers.get('popstate')();assertFrame(h,'accounts');
  h.location.search='?view=presell';h.handlers.get('popstate')();assertFrame(h,'copy');
  h.controller.dispose();assert.equal(h.handlers.size,0);assert.equal(h.nodes.get('copyFichaNav').onclick,null);
});

test('a delayed renderer cannot take back title or UI after navigating away',async()=>{
  let release;
  const ready=new Promise(resolve=>{release=resolve});
  const h=harness({time:{bodyClass:'time-mode',render:async({isCurrent})=>{await ready;if(isCurrent())h.document.title='Meu Tempo · Histórico'}}});
  const pending=h.controller.open('time');h.controller.open('accounts');const frames=h.frames.length;release();await pending;
  assertFrame(h,'accounts');assert.equal(h.document.title,registry.definition('accounts').title);assert.equal(h.frames.length,frames);
});

test('returning to an async view invalidates its previous opening',async()=>{
  const completions=[];
  const h=harness({time:{bodyClass:'time-mode',render:({isCurrent})=>new Promise(resolve=>completions.push(()=>{if(isCurrent())h.document.title='Meu Tempo · Diário';resolve()}))}});
  const first=h.controller.open('time');h.controller.open('totals');const latest=h.controller.open('time');
  completions[0]();await first;assert.equal(h.document.title,registry.definition('time').title);
  completions[1]();await latest;assert.equal(h.document.title,'Meu Tempo · Diário');assertFrame(h,'time');
});

test('menu render errors are handled, without changing the selected route',async()=>{
  const h=harness({copy:{render:async()=>{throw new Error('synthetic failure')}}});h.controller.bind();h.nodes.get('copyFichaNav').onclick();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(h.errors,['synthetic failure']);assertFrame(h,'copy');
});

test('Meu Tempo adapter keeps contextual titles guarded during async mounting',async()=>{
  const line=template.split(/\r?\n/).find(line=>line.includes('async function renderTime('));
  assert.ok(line);let callback,current=true;
  const document={title:''},module={mount:async options=>{callback=options.setBrowserTitle}};
  const ctx=vm.createContext({timeModulePromise:Promise.resolve(module),document,toast:()=>{},$:()=>({}),esc:value=>value});
  vm.runInContext(line,ctx);await ctx.renderTime({isCurrent:()=>current});callback('Meu Tempo · Diário');assert.equal(document.title,'Meu Tempo · Diário');
  document.title='Mapa de Produtos por Conta';current=false;callback('Meu Tempo · Histórico');assert.equal(document.title,'Mapa de Produtos por Conta');
});

test('render adapters keep their existing storage and mounting contracts',()=>{
  assert.ok(template.includes('await restoreLocalBase({persist:false,renderPage:false});await syncMccDiaryRowsToBilling()'));
  assert.ok(template.includes('personalFinanceController.refresh()')&&template.includes('personalFinanceMountPromise=personalFinanceMountPromise||module.mount('));
  assert.ok(template.includes("render:()=>renderProduct(state.activeCampaign,state.activeSource,state.activeCampaignId)"));
  assert.ok(template.includes("totals:{render:()=>{state.sortKey='current';state.sortDir='desc';renderTotals()}}"));
  assert.doesNotMatch(source,/indexedDB|localStorage|fetch\(|import\(/);
  assert.doesNotMatch(template,/viewsBefore|beforeObservabilityShow|timeBaseShow|withRegisterSaleVisibility/);
});
