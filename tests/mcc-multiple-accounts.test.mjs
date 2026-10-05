import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{},structuredClone});
vm.runInContext(await readFile(new URL('../src/database.js',import.meta.url),'utf8'),context);
const db=context.window.CampaignDatabase;
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
const overview=context.window.OverviewDomain;
const metric=valor=>({valor,estado:valor===0?'zero_confirmado':valor==null?'ausente':'confirmado'});
const capture=(date,id,names,cost=10)=>({separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:names.map(name=>({nome_campanha_exato:name,metricas_D_zero:{presente:true,data:metric(date),conta:metric('Conta sintética'),conta_id:metric(id),estado_campanha:metric('Ativada'),status_qualificacao:metric('Pendente'),moeda:metric('USD'),impressoes:metric(cost),cliques_google:metric(0),conversoes:metric(1),valor_conversao:metric(50),custo_total:metric(cost)}}))});
const factory=source=>{const m=source.metricas_D_zero;return{date:m.data.valor,period:'d0',cells:{B:{value:m.impressoes.valor},C:{value:0},F:{value:m.conversoes.valor},O:{value:m.custo_total.valor},P:{value:m.valor_conversao.valor}}}};

test('alternating MCC accounts preserves campaigns, Diary, snapshots and Billing outside the capture',()=>{
  const first=db.importManifest(db.create(),capture('2026-10-04','111-222-3333',['Produto A 01','Produto A 02']),factory).base;
  const firstBefore=JSON.stringify(first),oldCampaign=first.campanhas[0],oldDiary=first.diario.filter(r=>r.campanha_id===oldCampaign.id);
  const second=db.importManifest(first,capture('2026-10-04','444-555-6666',['Produto B 01'],0),factory);
  assert.equal(second.base.campanhas.length,3);
  assert.equal(second.base.manifesto_atual.campanhas.length,3);
  assert.equal(JSON.stringify(second.base.campanhas.find(c=>c.id===oldCampaign.id)),JSON.stringify(oldCampaign));
  assert.equal(JSON.stringify(second.base.diario.filter(r=>r.campanha_id===oldCampaign.id)),JSON.stringify(oldDiary));
  assert.ok(second.mccBillingSales.every(s=>s.account==='444-555-6666'));
  assert.equal(second.movimentos.pausadas.length,0);
  assert.ok(!second.events.some(e=>e.event_type==='campaign_pause_detected'));
  assert.equal(JSON.stringify(first),firstBefore,'importing only changes its returned copy');

  const third=db.importManifest(second.base,capture('2026-10-04','111-222-3333',['Produto A 01'],2),factory,{overwrite:true});
  assert.equal(third.base.campanhas.find(c=>c.nome_mcc==='Produto B 01').status,'ativa');
  assert.equal(third.base.campanhas.find(c=>c.nome_mcc==='Produto A 02').status,'pausada','absence remains scoped to the received account');
  assert.deepEqual(Array.from(third.movimentos.pausadas),['Produto A 02']);
  assert.ok(third.mccBillingSales.every(s=>s.account==='111-222-3333'));
  assert.equal(third.base.manifesto_atual.campanhas.find(c=>c.nome_campanha_exato==='Produto B 01').metricas_D_zero.custo_total.valor,0);
  const reapplied=db.importManifest(third.base,capture('2026-10-04','444-555-6666',['Produto B 01'],0),factory);
  assert.equal(reapplied.base.diario.length,third.base.diario.length,'same-day reimport is idempotent');
  assert.equal(reapplied.base.campanhas.find(c=>c.nome_mcc==='Produto A 02').status,'pausada');
});

test('different MCC capture dates do not remove historical totals from the other account',()=>{
  let base=db.importManifest(db.create(),capture('2026-10-03','111-222-3333',['Produto A'],10),factory).base;
  base=db.importManifest(base,capture('2026-10-04','444-555-6666',['Produto B'],20),factory).base;
  const snapshots=overview.authoritativeMccSnapshots(base.manifesto_atual);
  const a=snapshots.rows.filter(r=>r.campaignName==='Produto A');
  assert.equal(a[0].date,'2026-10-03');
  const history={investment:15,observed:{investment:2},byDate:{'2026-10-03':{investment:10},'2026-10-04':{investment:5}}};
  const totals=overview.replaceAuthoritativeDates(history,a,snapshots.dates);
  assert.equal(totals.investment,15,'only the authoritative dates of this account replace Diary rows');
  assert.equal(base.campanhas.find(c=>c.nome_mcc==='Produto A').ultima_aparicao,'2026-10-03');
});

test('legacy manifests without complete account IDs retain their original import behavior',()=>{
  const legacy=capture('2026-10-04','111-222-3333',['Legado A']);
  delete legacy.campanhas[0].metricas_D_zero.conta_id;
  let base=db.importManifest(db.create(),legacy,factory).base;
  const next=structuredClone(legacy);next.campanhas[0].nome_campanha_exato='Legado B';
  base=db.importManifest(base,next,factory).base;
  assert.equal(base.campanhas.find(c=>c.nome_mcc==='Legado A').status,'pausada');
});

test('Overview, Macro, CPA and Tested Products retain per-account dates after the other MCC advances',async()=>{
  let base=db.importManifest(db.create(),capture('2026-10-03','111-222-3333',['Produto A'],10),factory).base;
  const a=base.campanhas[0];
  base.diario.push({campanha_id:a.id,data:'2026-10-04',celulas:{B:{value:7},C:{value:0},O:{value:7},F:{value:0},P:{value:0}},fontes:['excel']});
  base=db.importManifest(base,capture('2026-10-04','444-555-6666',['Produto B'],20),factory).base;
  const manifest=base.manifesto_atual,snapshots=overview.authoritativeMccSnapshots(manifest),sources=manifest.campanhas;
  const snapshotsByCampaignName=new Map(sources.map(c=>[c.nome_campanha_exato.toLowerCase(),snapshots.rows.filter(s=>s.campaignName===c.nome_campanha_exato)]));
  const dailyByCampaign=new Map(base.campanhas.map(c=>[c.id,base.diario.filter(r=>r.campanha_id===c.id)]));
  const cache={latestSnapshots:snapshots,snapshotsByCampaignName,dailyByCampaign,salesAdjustments:new Map()};
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const adapter=name=>template.split('\n').find(line=>line.trimStart().startsWith('function '+name+'('));
  const productName=c=>c.nome_mcc||c.nome_campanha_exato;
  const sandbox=vm.createContext({window:{},state:{database:base,manifest,rate:1,productCatalog:{},controlMacroRows:null},derivedContext:()=>cache,
    OverviewDomain:overview,databaseCampaign:name=>base.campanhas.find(c=>c.nome_mcc===name),manifestDates:()=>({d0:'2026-10-04',d1:'2026-10-03'}),valueOf:field=>field?.valor??null,currentCost:()=>{throw Error('stale D0 must not be used')},
    ProductCatalog:{normalize:()=>({aliases:{}})},CampaignDatabase:db,accountProductIdentity:c=>({label:productName(c)}),macroHistory:()=>[]});
  vm.runInContext(await readFile(new URL('../src/control-macro/domain.js',import.meta.url),'utf8'),sandbox);
  vm.runInContext(['d0Totals','d1Totals','cpaPeriodTotals','refreshControlMacroCache'].map(adapter).join('\n'),sandbox);
  const sourceA=sources.find(c=>c.nome_campanha_exato==='Produto A');
  assert.equal(sandbox.d0Totals(sourceA).investment,null,'yesterday capture is not relabelled as today D0');
  assert.equal(sandbox.d0Totals(sourceA).date,'2026-10-04');
  assert.equal(sandbox.d1Totals(sourceA,db.campaignTotalsMap(base).get('mcc:produto a')).investment,10);
  assert.equal(sandbox.cpaPeriodTotals(sourceA,cache,null,null,'history').investment,17);
  sandbox.refreshControlMacroCache();
  assert.equal(sandbox.state.controlMacroRows.find(r=>r.date==='2026-10-04').investment,27,'Macro keeps seven from account A and twenty from B');
  const productsContext=vm.createContext({window:{}});
  vm.runInContext(await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8'),productsContext);
  const products=productsContext.window.TestedProductsDomain.buildProducts({source:base.campanhas,activeCampaigns:sources,metricSnapshots:snapshots.rows,authoritativeDates:snapshots.dates,metricDates:{d0:'2026-10-04',d1:'2026-10-03'},dailyByCampaign,salesAdjustments:new Map(),catalog:{ocultos:[],aliases:{},datas_inicio:{}},referenceDate:'2026-10-04',getProductName:productName,getCampaignSheet:name=>name,getCampaignIdentity:()=>({dateSort:null})});
  assert.equal(products.find(p=>p.name==='Produto A').totalInvestment,17);
  assert.equal(products.find(p=>p.name==='Produto A').totalBilled,50);
});

test('D−1 and D0 from disjoint account sets cannot be combined in the preparer',async()=>{
  const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
  const start=html.indexOf('    function sourcesHaveDisjointAccounts('),end=html.indexOf('    function installParsedSource(',start);
  const parser=vm.createContext({canonicalAccountId:id=>/^\d{3}-\d{3}-\d{4}$/.test(id||'')?id:null});
  vm.runInContext(html.slice(start,end),parser);
  const source=id=>({records:[{conta_id:id}]});
  assert.equal(parser.sourcesHaveDisjointAccounts(source('111-222-3333'),source('444-555-6666')),true);
  assert.equal(parser.sourcesHaveDisjointAccounts(source('111-222-3333'),source('111-222-3333')),false);
  assert.equal(parser.sourcesHaveDisjointAccounts(source('111-222-3333'),null),false);
});
