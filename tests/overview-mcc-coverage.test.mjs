import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},Intl});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain,dates={d1:'2026-09-29',d0:'2026-09-30'},a='111-111-1111',b='222-222-2222';
const base=()=>({mccs:[{id:a},{id:b}],campanhas:[{id:'a',mcc_id:a},{id:'b',mcc_id:b}],diario:[]});
const manifest=()=>({identificacao_mcc:{id:a},separacao_temporal:{D_menos_1:{datas_detectadas:[dates.d1]},D_zero:{datas_detectadas:[dates.d0]}},campanhas:[]});
const row=(id,period,date)=>({campanha_id:id,data:date,fontes:['manifesto'],periodos:[period],celulas:{B:{value:0}}});

test('coverage is distinct per MCC/date/period, zero valid and read-only',()=>{
  const db=base(),m=manifest();db.diario=[row('b','d1',dates.d1),row('b','d0','2026-09-28')];
  const before=JSON.stringify({db,m}),result=domain.manifestMccCoverage(db,m,dates);
  assert.equal(result.d1.complete,true);assert.equal(result.d1.receivedCount,2);
  assert.equal(result.d0.complete,false);assert.equal(result.d0.receivedCount,1);
  db.diario.push(row('b','d0',dates.d0));assert.equal(domain.manifestMccCoverage(db,m,dates).d0.complete,true);
  db.diario.pop();assert.equal(JSON.stringify({db,m}),before);
});

test('retained D−1 stays green after D0-only upload, without counting D0 as closed D−1',()=>{
  const db=base(),m=manifest();m.separacao_temporal.D_menos_1.datas_detectadas=[];
  db.diario=[row('a','d1',dates.d1),row('b','d1',dates.d1)];
  assert.equal(domain.manifestMccCoverage(db,m,dates).d1.complete,true);
  db.diario[1].periodos=['d0'];assert.equal(domain.manifestMccCoverage(db,m,dates).d1.complete,false);
});

test('client accounts, duplicates, unknown managers, Excel and stale scoped dates cannot turn green',()=>{
  const db=base(),m=manifest();
  m.campanhas=[{mcc_id:a,metricas_D_zero:{presente:true,data:{valor:dates.d0},conta_id:{valor:'333-333-3333'}}},{mcc_id:a,metricas_D_zero:{presente:true,data:{valor:dates.d0},conta_id:{valor:'444-444-4444'}}},{metricas_D_zero:{presente:true,data:{valor:dates.d0}}},{mcc_id:b,datas_coleta:['2026-09-28'],metricas_D_zero:{presente:true,data:{valor:dates.d0}}}];
  m.escopo_contas={consolidado:true};db.diario=[{...row('b','d0',dates.d0),fontes:['excel']},row('missing','d0',dates.d0)];
  assert.equal(domain.manifestMccCoverage(db,m,dates).d0.receivedCount,1);
  assert.equal(domain.manifestMccCoverage(db,m,dates).d0.complete,false);
  assert.equal(domain.manifestMccCoverage({mccs:[{id:a}]},m,dates).d0.complete,false);
  assert.equal(domain.manifestMccCoverage(db,m,{}).d0.receivedCount,0);
  assert.equal(domain.manifestMccCoverage(null,null,dates).d1.complete,false);
});

test('capture metadata and persisted catalogue include an added third MCC automatically',()=>{
  const db=base(),m=manifest();m.cobertura_D_zero_por_mcc={[b.replaceAll('-','')]:{data:dates.d0,escopo:'active_only',completa:false}};
  assert.equal(domain.manifestMccCoverage(db,m,dates).d0.complete,true,'upload received is distinct from completeness of campaign filter');
  db.mccs.push({id:'333-333-3333'});assert.equal(domain.manifestMccCoverage(db,m,dates).d0.expectedCount,3);
  assert.equal(domain.manifestMccCoverage(db,m,dates).d0.complete,false);
  m.cobertura_D_zero_por_mcc['333-333-3333']={data:dates.d0};assert.equal(domain.manifestMccCoverage(db,m,dates).d0.complete,true);
});

test('D−1/D0 dates under provisional sales render independent dots, accessible counts and centered separator without changing filters',()=>{
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'},db=base(),m=manifest();db.diario=[row('b','d1',dates.d1)];
  const snapshot={rows:[],dates,d1Totals:[],manifestMccCoverage:domain.manifestMccCoverage(db,m,dates)},before=JSON.stringify(snapshot);
  const controller=context.window.OverviewView.mount({root:dom.root,state,getSnapshot:()=>snapshot,domain,format,actions:{}});
  controller.render();const card=()=>dom.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-base"[\s\S]*?<\/section>/)[0],initial=card();
  assert.match(initial,/class="dot overview-manifest-dot" role="img" aria-label="D−1: 2 de 2 MCCs/);
  assert.match(initial,/class="dot overview-manifest-dot warn" role="img" aria-label="D0: 1 de 2 MCCs/);
  assert.match(initial,/overview-manifest-separator" aria-hidden="true">·<\/span>/);
  for(const mode of ['d1','d0','consolidated'])for(const filter of ['all','paused','active']){state.totalsMode=mode;state.campaignStatusFilter=filter;controller.render();assert.equal(card(),initial)}
  assert.equal(JSON.stringify(snapshot),before);
  db.diario.push(row('b','d0',dates.d0));snapshot.manifestMccCoverage=domain.manifestMccCoverage(db,m,dates);controller.render();assert.doesNotMatch(card(),/overview-manifest-dot warn/);
});

test('adapter supplies only persisted coverage evidence and scoped stylesheet aligns date groups',async()=>{
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8'),css=await readFile(new URL('../src/overview/overview.css',import.meta.url),'utf8');
  assert.ok(template.includes('snapshot.manifestMccCoverage=OverviewDomain.manifestMccCoverage(state.database,state.database?.manifesto_atual||state.manifest,{d1:OverviewDomain.previousIsoDate(today),d0:today})'));
  assert.match(css,/#totalsView \.overview-kpi-dates\{display:flex;align-items:center;justify-content:center/);
  assert.match(css,/#totalsView \.overview-manifest-dot\.warn\{background:var\(--amber\)/);
});

test('D−1-only last import cannot hide today D0 coverage; operational dates use Brasília, not UTC',async()=>{
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8'),adapter=template.split('\n').find(line=>line.startsWith('function overviewDisplaySnapshot()'));
  const db=base(),m=manifest();db.manifesto_atual=m;m.separacao_temporal.D_zero={datas_detectadas:[],estado:'nao_fornecido'};
  m.cobertura_D_zero_por_mcc={[a]:{data:dates.d0},[b]:{data:dates.d0}};
  db.diario=[row('a','d1',dates.d1),row('b','d1',dates.d1)];
  let instant='2026-10-01T01:30:00Z';
  class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]))}}
  const sandbox=vm.createContext({Intl,Date:Clock,OverviewDomain:domain,state:{database:db},overviewSnapshot:()=>({dates:{d1:dates.d1,d0:''}})});
  vm.runInContext(adapter,sandbox);const before=JSON.stringify(db),snapshot=sandbox.overviewDisplaySnapshot();
  assert.equal(snapshot.manifestMccCoverage.d0.date,dates.d0);assert.equal(snapshot.manifestMccCoverage.d0.complete,true);
  assert.equal(snapshot.manifestMccCoverage.d1.complete,true);assert.equal(snapshot.dates.d0,'','financial dates are not rewritten by presentation');
  instant='2026-10-01T04:00:00Z';const tomorrow=sandbox.overviewDisplaySnapshot();
  assert.equal(tomorrow.manifestMccCoverage.d0.date,'2026-10-01');assert.equal(tomorrow.manifestMccCoverage.d0.complete,false);
  assert.equal(tomorrow.manifestMccCoverage.d1.receivedCount,0,'yesterday D0 does not prove today D−1');
  assert.equal(JSON.stringify(db),before);
});

test('alternating imports retain independent period receipts, including no diary rows, repeat uploads and late hours',async()=>{
  const sandbox=vm.createContext({window:{},structuredClone});vm.runInContext(await readFile(new URL('../src/database.js',import.meta.url),'utf8'),sandbox);
  const database=sandbox.window.CampaignDatabase;
  const capture=(id,period,time)=>({identificacao_mcc:{id,nome:id===a?'MCC E-com':'MCC Nutra'},gerado_em_utc:time,separacao_temporal:{D_menos_1:{datas_detectadas:period==='d1'?[dates.d1]:[],estado:period==='d1'?'fornecido':'nao_fornecido'},D_zero:{datas_detectadas:period==='d0'?[dates.d0]:[],estado:period==='d0'?'fornecido':'nao_fornecido'}},[period==='d1'?'captura_D_menos_1':'captura_D_zero']:{capturada_em:time,escopo:'active_only'},campanhas:[]});
  let db=database.create();db.mccs=[{id:a,nome:'MCC E-com'},{id:b,nome:'MCC Nutra'}];
  const apply=(id,period,time)=>{db=database.importManifest(db,capture(id,period,time),()=>null,{overwrite:true}).base;return domain.manifestMccCoverage(db,db.manifesto_atual,dates)};
  let result=apply(a,'d1','2026-09-30T11:00:00Z');assert.equal(result.d1.receivedCount,1);assert.equal(result.d1.complete,false);assert.equal(result.d0.receivedCount,0);
  result=apply(a,'d1','2026-09-30T12:00:00Z');assert.equal(result.d1.receivedCount,1,'same MCC never counts twice');
  result=apply(b,'d1','2026-10-01T02:50:00Z');assert.equal(result.d1.complete,true,'23:50 Brasília is still the same operational day');
  result=apply(a,'d0','2026-10-01T02:51:00Z');assert.equal(result.d1.complete,true);assert.equal(result.d0.receivedCount,1);assert.equal(result.d0.complete,false);
  result=apply(b,'d0','2026-10-01T02:52:00Z');assert.equal(result.d0.complete,true);assert.equal(result.d1.complete,true);
  result=apply(a,'d1','2026-10-01T02:53:00Z');assert.equal(result.d0.complete,true,'D−1-only update retains previous D0 evidence');
  assert.equal(db.diario.length,0,'receipts must not depend on metrics, pause cutoff or fabricated diary rows');
  const restored=database.normalize(JSON.parse(JSON.stringify(db)));
  assert.equal(domain.manifestMccCoverage(restored,restored.manifesto_atual,dates).d1.complete,true,'backup round-trip preserves additive receipts');
});

test('period label/count and tooltip show the coverage date, independent of last manifest dates and sales',()=>{
  const db=base(),m=manifest();db.mccs[0].nome='MCC E-com';db.mccs[1].nome='MCC Nutra';db.diario=[row('b','d1',dates.d1)];
  const dom=createRoot(),snapshot={rows:[],dates:{d0:'',d1:'2026-09-28'},d1Totals:[],pendingSaleCount:3,manifestMccCoverage:domain.manifestMccCoverage(db,m,dates)};
  context.window.OverviewView.mount({root:dom.root,state:{totalsMode:'d0'},getSnapshot:()=>snapshot,domain,format,actions:{}}).render();
  const html=dom.get('#kpis').innerHTML;
  assert.match(html,/D0: 1 de 2 MCCs com captura para 30\/09\/2026/);assert.match(html,/MCC E-com: recebida; MCC Nutra: aguardando/);
  assert.match(html,/<span>D0<\/span><strong>30\/09\/2026<\/strong><span>1\/2<\/span>/);
  assert.match(html,/class="dot warn overview-kpi-pending-dot"/,'pending sales status keeps its own meaning');
});

test('a period marked not supplied cannot count its top-level stale date',()=>{
  const db=base(),m=manifest();m.separacao_temporal.D_menos_1.estado='nao_fornecido';
  assert.equal(domain.manifestMccCoverage(db,m,dates).d1.receivedCount,0);
});
