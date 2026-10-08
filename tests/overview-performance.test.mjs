import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const context=vm.createContext({window:{}});
for(const file of ['overview-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain,view=context.window.OverviewView;

test('report dates scan history once per derived context; base/manifest/rate/catalog changes invalidate',()=>{
  let scans=0;
  const base={campanhas:[{id:'synthetic',mcc_id:'111-111-1111'}],diario:[{campanha_id:'synthetic',data:'2026-10-08',fontes:['manifesto'],periodos:['d0']}]};
  const manifest={campanhas:[],separacao_temporal:{D_menos_1:{datas_detectadas:['2026-10-07']},D_zero:{estado:'nao_fornecido'}}};
  const sandbox=vm.createContext({state:{database:base,manifest,productCatalog:{},rate:5},Map,Set,
    OverviewDomain:{...domain,manifestPeriodDates(...args){scans++;return domain.manifestPeriodDates(...args)}},
    CampaignDatabase:{manifestOperationalStates:()=>new Map(),campaignNumberReuseIssues:()=>[],campaignTotalsMap:()=>new Map(),salesAdjustmentMap:()=>new Map(),operationalMap:()=>new Map()}});
  vm.runInContext('let derivedCache=null;\n'+source.split('\n').filter(line=>/function (manifestDates|derivedContext)\(/.test(line)).join('\n'),sandbox);
  const before=JSON.stringify(base);
  for(let i=0;i<100;i++)assert.equal(sandbox.manifestDates().d0,'2026-10-08');
  assert.equal(scans,1);
  sandbox.state.database={...base,diario:[]};assert.equal(sandbox.manifestDates().d0,'');assert.equal(scans,2);
  sandbox.state.manifest={...manifest,separacao_temporal:{D_zero:{datas_detectadas:['2026-10-09']}}};
  assert.equal(sandbox.manifestDates().d0,'2026-10-09');assert.equal(scans,3);
  sandbox.state.rate=6;sandbox.manifestDates();assert.equal(scans,4);
  sandbox.state.productCatalog={};sandbox.manifestDates();assert.equal(scans,5);
  vm.runInContext('derivedCache=null',sandbox);sandbox.manifestDates();assert.equal(scans,6);
  assert.equal(JSON.stringify(base),before,'cache does not persist or repair observations');
});

function setup({gateCards=false}={}){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  let reads=0,formats=0,kpiWrites=0,sorts=0,markup='';
  const countedFormat={...format,money(value){formats++;return format.money(value)}};
  Object.defineProperty(dom.get('#kpis'),'innerHTML',{get:()=>markup,set:value=>{kpiWrites++;markup=value}});
  const row=(id,investment)=>({c:{nome_campanha_exato:id,_status:'ativa'},identity:{name:id,dateLabel:'01/10',dateSort:'2026-10-01'},totals:{investment},d0Totals:{investment},testRemaining:{value:investment,text:String(investment)},campaignId:id,zeroDays:0});
  const snapshot={rows:[row('Alfa',10),row('Beta',0),row('Ausente',null)],d1Totals:[],dates:{d0:'2026-10-08',d1:'2026-10-07'},referenceDate:'2026-10-08',remainingAlertMinimum:5};
  const countedDomain={...domain,sortRows(...args){sorts++;return domain.sortRows(...args)}};
  const controller=view.mount({root:dom.root,state,getSnapshot:()=>{reads++;return snapshot},getCardRevision:gateCards?()=>state.overviewMccRevision||0:undefined,domain:countedDomain,format:countedFormat,actions:{}});
  dom.setList('.sort-btn',[{sort:'current'}]);controller.render();
  return{...dom,state,snapshot,controller,counts:()=>({reads,formats,kpiWrites,sorts})};
}

test('sorting/search/date/status reuse projection and one sort; cards stay mounted and rows preserve zero/missing',()=>{
  const s=setup(),before=JSON.stringify(s.snapshot),initial=s.counts();
  s.root.querySelectorAll('.sort-btn')[0].onclick();
  assert.equal(initial.sorts,1,'full render sorts the combined table once');
  assert.deepEqual(s.counts(),{...initial,formats:initial.formats+1,sorts:initial.sorts+1},'sort only formats the header alert tooltip; rows/cards/projection are reused');
  let body=s.get('#totalsBody').innerHTML;
  assert.ok(body.indexOf('data-campaign="Beta"')<body.indexOf('data-campaign="Alfa"'));
  assert.ok(body.indexOf('data-campaign="Alfa"')<body.indexOf('data-campaign="Ausente"'),'missing stays last');
  assert.match(body,/BRL 0\.00/);
  s.get('#search').value='alfa';s.get('#search').oninput();
  assert.doesNotMatch(s.get('#totalsBody').innerHTML,/data-campaign="Beta"/);
  s.get('#campaignStartDate').onchange({target:{value:'2026-10-01'}});
  s.get('#campaignStatusFilter').onchange({target:{value:'paused'}});
  assert.match(s.get('#totalsBody').innerHTML,/class=" hidden"/,'visibility changes invalidate row markup');
  assert.equal(s.counts().reads,initial.reads);assert.equal(s.counts().kpiWrites,initial.kpiWrites);
  assert.equal(JSON.stringify(s.snapshot),before);
});

test('explicit data refresh updates card content and cached rows; color updates survive a subsequent sort',()=>{
  const s=setup(),initial=s.counts();
  s.controller.refreshRemainingAlerts({minimum:20,yellowMinimum:30});
  s.root.querySelectorAll('.sort-btn')[0].onclick();
  assert.match(s.get('#totalsBody').innerHTML,/class="num negative"[^>]*data-remaining-value="10"/);
  s.snapshot.rows[0].totals.investment=999;
  s.controller.render();
  assert.match(s.get('#totalsBody').innerHTML,/BRL 999\.00/);
  assert.equal(s.counts().reads,initial.reads+1);assert.equal(s.counts().kpiWrites,initial.kpiWrites+1);
  s.get('#totalsD0').onclick();
  assert.equal(s.state.totalsMode,'d0');assert.equal(s.counts().reads,initial.reads+2,'period change obtains fresh projection');
});

test('cards wait for MCC revision while period/columns/navigation/manual refreshes update only the table',()=>{
  const s=setup({gateCards:true}),initial=s.counts(),cards=s.get('#kpis').innerHTML;
  s.snapshot.rows[0].totals.investment=999;
  s.snapshot.pendingSaleCount=7;
  s.snapshot.pausedTodayCampaigns=['New pause not loaded from MCC'];
  s.controller.render();
  assert.match(s.get('#totalsBody').innerHTML,/BRL 999\.00/,'table still receives current data');
  assert.equal(s.get('#kpis').innerHTML,cards);
  for(const period of ['#totalsD1','#totalsD0','#totalsConsolidated'])s.get(period).onclick();
  s.get('#overviewColumnsReset').onclick();
  s.controller.render(); // Navigation reuses the mounted controller.
  assert.equal(s.counts().kpiWrites,initial.kpiWrites);
  assert.equal(s.get('#kpis').innerHTML,cards);
  s.state.overviewMccRevision=1;
  s.controller.render();
  assert.equal(s.counts().kpiWrites,initial.kpiWrites+1);
  assert.notEqual(s.get('#kpis').innerHTML,cards,'new MCC data updates cards');
  const newCards=s.get('#kpis').innerHTML;
  s.controller.render();
  assert.equal(s.get('#kpis').innerHTML,newCards);
  assert.equal(s.counts().kpiWrites,initial.kpiWrites+1,'same revision is not rendered twice');
});

test('card revision comes from the saved MCC summary, never initial restoration or manual changes',()=>{
  assert.ok(source.includes('getCardSnapshot:()=>OverviewCardsDomain.read(state.database)'));
  assert.ok(source.includes('getCardRevision:()=>OverviewCardsDomain.read(state.database).revision'));
  assert.ok(!source.includes('overviewMccRevision'));
  assert.ok(source.includes('getSnapshot:overviewTableSnapshot'));
  assert.match(source,/postMessage\(\{type:'base-updated',source:'panel'/);
  assert.match(source,/const fromMcc=event\.data\?\.type==='base-updated'&&event\.data\?\.source!=='panel'/);
  const receiver=source.slice(source.indexOf('const fromMcc=event.data'),source.indexOf('const accountScrollMain='));
  assert.match(receiver,/restoreLocalBase\(\{persist:false,renderPage:false\}\)\.then\(async\(\)=>\{/);
  assert.ok(!receiver.includes('OverviewCardsDomain.create'), 'receiving notifications only reads the saved summary');
});
