import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/cards-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase,domain=context.window.OverviewDomain,cards=context.window.OverviewCardsDomain,view=context.window.OverviewView;
const json=value=>JSON.parse(JSON.stringify(value)),timestamp='2026-10-08T15:30:00Z',field=valor=>({valor,estado:valor==null?'ausente':'confirmado'});
function capture(index,period,cost){
  const date=period==='d0'?'2026-10-08':'2026-10-07',key=period==='d0'?'metricas_D_zero':'metricas_D_menos_1';
  return {identificacao_mcc:{id:index?'222-222-2222':'111-111-1111',nome:index?'MCC Nutra':'MCC E-com'},gerado_em_utc:timestamp,separacao_temporal:{D_zero:{estado:period==='d0'?'fornecido':'nao_fornecido',datas_detectadas:period==='d0'?[date]:[]},D_menos_1:{estado:period==='d1'?'fornecido':'nao_fornecido',datas_detectadas:period==='d1'?[date]:[]}},[period==='d0'?'captura_D_zero':'captura_D_menos_1']:{escopo:'all_campaigns',capturada_em:timestamp},campanhas:[{nome_campanha_exato:'Synthetic '+index,mcc_id:index?'222-222-2222':'111-111-1111',[key]:{presente:true,data:field(date),moeda:field('BRL'),custo_total:field(cost),impressoes:field(cost==null?null:2*cost),cliques_google:field(cost==null?null:1),conversoes:field(0),valor_conversao:field(0),estado_campanha:field('Ativada')}}]};
}
const rowFactory=c=>['d0','d1'].flatMap(period=>{const m=c[period==='d0'?'metricas_D_zero':'metricas_D_menos_1'];return m?.presente?[{date:m.data.valor,period,cells:{B:{value:m.impressoes.valor},C:{value:m.cliques_google.valor},F:{value:m.conversoes.valor},O:{value:m.custo_total.valor},P:{value:m.valor_conversao.valor}}}]:[]});
function apply(base,manifest,computedAt=timestamp){const next=database.importManifest(base,manifest,rowFactory,{overwrite:true}).base;next.overview_cards=cards.create(next,{computedAt});return next}
function fixture(){let base=database.create();for(const index of [0,1])base=apply(base,capture(index,'d0',10+index));for(const index of [1,0])base=apply(base,capture(index,'d1',20+index));return base}
const card=(markup,name)=>markup.match(new RegExp('<section class="[^"]*'+name+'[^"]*"[^>]*>[\\s\\S]*?<\\/section>'))?.[0]||'';
function mount(base){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  const forbidden=()=>{throw new Error('Card aggregation must not run on page load or navigation')};
  const controller=view.mount({root:dom.root,state,getSnapshot:()=>({rows:[],dates:{},d1Totals:[],referenceDate:'2026-10-08'}),getCardSnapshot:()=>cards.read(base),getCardRevision:()=>cards.read(base).revision,domain:{...domain,sumObservedMetric:forbidden,sumObservedProfit:forbidden},format,actions:{}});
  controller.render();return {...dom,state,controller};
}

test('saved summaries preserve D0 after alternating D−1 MCCs, coverage and reload without any card sums',()=>{
  const base=fixture(),saved=json(cards.read(base));
  assert.equal(saved.summary.d0.investment.value,21);
  assert.equal(saved.summary.d0.profit.value,-21);
  assert.equal(saved.summary.d1.investment.value,41);
  assert.equal(saved.summary.d1.profit.value,-41);
  assert.equal(saved.manifestMccCoverage.d0.complete,true);
  assert.equal(saved.manifestMccCoverage.d1.complete,true);
  const before=JSON.stringify(base),ui=mount(base);
  assert.match(card(ui.get('#kpis').innerHTML,'kpi-group-d0'),/BRL 21\.00/);
  assert.match(card(ui.get('#kpis').innerHTML,'kpi-d1-profit'),/BRL -41\.00/);
  const markup=ui.get('#kpis').innerHTML;
  for(const period of ['#totalsD1','#totalsD0','#totalsConsolidated'])ui.get(period).onclick();
  ui.get('#search').value='nothing';ui.get('#search').oninput();ui.controller.render();
  assert.equal(ui.get('#kpis').innerHTML,markup);
  assert.equal(mount(json(database.normalize(base))).get('#kpis').innerHTML,markup,'F5/round-trip shows the saved results unchanged');
  assert.equal(JSON.stringify(base),before,'display never writes or normalizes the source in place');
});

test('manual changes retain the saved summary; next MCC recomputes even without an overview mounted',()=>{
  const base=fixture(),saved=JSON.stringify(base.overview_cards);
  const changed=database.normalize(base);changed.diario[0].celulas.O.value=999;changed.atualizado_em='2026-10-08T16:00:00Z';
  assert.equal(JSON.stringify(cards.read(changed)),saved);
  const next=apply(changed,capture(0,'d0',30),'2026-10-08T16:30:00Z');
  assert.equal(next.overview_cards.summary.d0.investment.value,41);
  assert.notEqual(next.overview_cards.revision,base.overview_cards.revision);
  assert.match(card(mount(next).get('#kpis').innerHTML,'kpi-group-d0'),/BRL 41\.00/);
});

test('legacy/invalid cache never triggers a fallback computation; zero is observed and absence is not zero',()=>{
  const legacy=database.create(),before=JSON.stringify(legacy);mount(legacy);assert.equal(JSON.stringify(legacy),before);
  assert.match(mount(legacy).get('#kpis').title,/próxima carga MCC/);
  const zero=apply(legacy,capture(0,'d0',0));assert.equal(zero.overview_cards.summary.d0.investment.value,0);
  assert.match(card(mount(zero).get('#kpis').innerHTML,'kpi-group-d0'),/BRL 0\.00/);
  const missing=apply(legacy,capture(0,'d0',null));assert.equal(missing.overview_cards.summary.d0.investment.value,null);
  assert.doesNotMatch(card(mount(missing).get('#kpis').innerHTML,'kpi-group-d0'),/BRL/);
  for(const mutation of [saved=>saved.version=99,saved=>saved.summary.d0.investment.value='untrusted',saved=>saved.summary.d1.profit.totalCount=-1]){
    const invalid=json(zero);mutation(invalid.overview_cards);assert.equal(cards.read(invalid).revision,'unavailable');mount(invalid);
  }
});

test('table-only adapter skips card projections and the MCC apply saves summary before its success notification',async()=>{
  const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const line=source.split('\n').find(line=>line.startsWith('function overviewSnapshot('));
  const forbidden=()=>{throw new Error('card-only projection called')};
  const sandbox=vm.createContext({OverviewDomain:{manifestCaptureInfo:forbidden},state:{database:{}},campaignRows:()=>[],derivedContext:()=>({salesAdjustments:new Map()}),manifestDates:()=>({}),activeCampaignRows:forbidden,currentCampaignRows:()=>[],localBaseUpdateLabel:()=>'',overviewRowsForMode:()=>[]});
  vm.runInContext(line,sandbox);assert.equal(sandbox.overviewSnapshot({includeCards:false}).pendingSaleCount,null);
  const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8'),start=html.indexOf('    async function applyManifestToPanel('),end=html.indexOf('\n    }',start)+6;
  let persisted=fixture(),writes=0,notifications=0,closed=0,fail=false;
  const applyContext=vm.createContext({window:{CampaignDatabase:{...database,importManifest(...args){const result=database.importManifest(...args);result.mccBillingSales=[];result.reconciledSales=[];return result}},OverviewCardsDomain:cards},location:{hostname:'127.0.0.1',port:'8765'},openPanelDatabase:async()=>({close(){closed++}}),readPanelBase:async()=>persisted,panelManifestRow:rowFactory,writePanelBase:async(_db,base)=>{writes++;assert.equal(cards.read(base).version,1);assert.equal(base.overview_cards.computedAt,base.atualizado_em);if(fail)throw new Error('write failed');persisted=json(base)},BroadcastChannel:class{postMessage(){notifications++}close(){}}});
  vm.runInContext(html.slice(start,end),applyContext);
  await applyContext.applyManifestToPanel(capture(0,'d0',50));
  assert.equal(persisted.overview_cards.summary.d0.investment.value,61);assert.equal(writes,1);assert.equal(notifications,1);
  const before=JSON.stringify(persisted);fail=true;
  await assert.rejects(applyContext.applyManifestToPanel(capture(0,'d0',90)),/write failed/);
  assert.equal(JSON.stringify(persisted),before);assert.equal(notifications,1);assert.equal(closed,2);
});

test('the real MCC write includes base and summary in one transaction, no separate cache store or write',async()=>{
  const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8'),start=html.indexOf('    function writePanelBase('),end=html.indexOf('\n    }',start)+6;
  const sandbox=vm.createContext({PANEL_BASE_STORE:'bases',PANEL_EVENT_STORE:'events',PANEL_BASE_KEY:'atual',panelClone:structuredClone});
  vm.runInContext(html.slice(start,end),sandbox);
  let count=0,written;
  const db={transaction(names,mode){count++;assert.deepEqual([...names],['bases','events']);assert.equal(mode,'readwrite');const request={result:[]},tx={objectStore(name){return name==='bases'?{put(base,key){written=base;assert.equal(key,'atual')}}:{getAllKeys(){return request},add(){}}}};queueMicrotask(()=>{request.onsuccess();tx.oncomplete()});return tx}};
  const base=fixture();await sandbox.writePanelBase(db,base);
  assert.equal(count,1);assert.deepEqual(json(written.overview_cards),json(base.overview_cards));assert.equal(written.event_log,undefined);
});
