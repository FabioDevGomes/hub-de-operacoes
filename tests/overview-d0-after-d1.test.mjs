import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL(`../src/${file}`,import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase,domain=context.window.OverviewDomain,template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const adapter=template.split('\n').filter(line=>/function (manifestDates|d0Totals|d1Totals)\(/.test(line)).join('\n');
const ids=['111-111-1111','222-222-2222'],closed='2026-10-07',today='2026-10-08',field=valor=>({valor,estado:valor==null?'ausente':'confirmado'});
const capture=(index,period,date,cost=10)=>({identificacao_mcc:{id:ids[index],nome:index?'MCC Nutra':'MCC E-com'},separacao_temporal:{D_zero:{datas_detectadas:period==='d0'?[date]:[],estado:period==='d0'?'fornecido':'nao_fornecido'},D_menos_1:{datas_detectadas:period==='d1'?[date]:[],estado:period==='d1'?'fornecido':'nao_fornecido'}},[period==='d0'?'captura_D_zero':'captura_D_menos_1']:{escopo:'all_campaigns',capturada_em:'2026-10-08T15:00:00Z'},campanhas:[{nome_campanha_exato:`Synthetic ${index}`,mcc_id:ids[index],[period==='d0'?'metricas_D_zero':'metricas_D_menos_1']:{presente:true,data:field(date),moeda:field('BRL'),custo_total:field(cost),impressoes:field(cost*2),cliques_google:field(1),conversoes:field(0),valor_conversao:field(0),estado_campanha:field('Ativada')},[period==='d0'?'metricas_D_menos_1':'metricas_D_zero']:{presente:false,data:field(null)}}]});
const factory=source=>['d0','d1'].flatMap(period=>{const m=source[period==='d0'?'metricas_D_zero':'metricas_D_menos_1'];return m?.presente===true?[{date:m.data.valor,period,cells:{B:{value:m.impressoes.valor},C:{value:1},F:{value:0},O:{value:m.custo_total.valor},P:{value:0}}}]:[]});

function setup(db){
  const manifest=db.manifesto_atual,snapshots=domain.authoritativeMccSnapshots(manifest),byName=new Map(),dailyByCampaign=new Map();
  for(const item of snapshots.rows){const key=item.campaignName.toLowerCase();if(!byName.has(key))byName.set(key,[]);byName.get(key).push(item)}
  for(const row of db.diario){if(!dailyByCampaign.has(row.campanha_id))dailyByCampaign.set(row.campanha_id,[]);dailyByCampaign.get(row.campanha_id).push(row)}
  const sandbox=vm.createContext({OverviewDomain:domain,state:{database:db,manifest,rate:1},derivedContext:()=>({dailyByCampaign,snapshotsByCampaignName:byName,latestSnapshots:snapshots}),databaseCampaign:name=>db.campanhas.find(c=>c.nome_mcc===name),valueOf:value=>value?.valor??null,currentCost:()=>null});
  vm.runInContext(adapter,sandbox);return sandbox;
}

// Exercise real imports, Hub adapters and the mounted view, not just numeric sums.
// All fixtures stay in memory; no operational database or browser storage is opened.
function presentation(db){
  const dom=createRoot(),sandbox=setup(db),state={totalsMode:'d0',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  const getSnapshot=()=>{
    const rows=db.manifesto_atual.campanhas.map(c=>{
      const stored=db.campanhas.find(item=>item.nome_mcc===c.nome_campanha_exato),byDate={};
      for(const row of db.diario.filter(item=>item.campanha_id===stored.id)){
        const cells=row.celulas;
        byDate[row.data]={investment:cells.O?.value??null,impressions:cells.B?.value??null,clicks:cells.C?.value??null,conversions:cells.F?.value??null,commission:cells.P?.value??null};
      }
      const d0=sandbox.d0Totals(c),d1=sandbox.d1Totals(c,{byDate}),totals=state.totalsMode==='d1'?d1:d0;
      return {c:{...c,_status:'ativa'},campaignId:stored.id,identity:{name:c.nome_campanha_exato,dateLabel:'01/10',dateSort:'2026-10-01'},totals,d0Totals:d0,d0ProfitTotals:d0,d1Totals:d1,profit:domain.profitForTotals(totals),roi:null,zeroDays:0};
    });
    return {rows,d1Totals:rows.map(row=>row.d1Totals),dates:sandbox.manifestDates(),activeCount:rows.length,pausedCount:0,referenceDate:today,manifestMccCoverage:domain.manifestMccCoverage(db,db.manifesto_atual,{d0:today,d1:closed})};
  };
  const controller=context.window.OverviewView.mount({root:dom.root,state,getSnapshot,domain,format,actions:{}});
  controller.render();return {...dom,state,controller};
}
const card=(markup,className)=>markup.match(new RegExp('<section class="[^"]*'+className+'[^"]*"[^>]*>[\\s\\S]*?<\\/section>'))?.[0]??'';
const metricCell=(markup,key)=>markup.match(new RegExp('<td[^>]*data-column="'+key+'"[^>]*>[\\s\\S]*?<\\/td>'))?.[0]??'';

test('PRIORITY: rendered D0/D−1 cards and table survive alternating MCC imports, period switches and reload',()=>{
  let db=database.create();
  for(const index of [0,1])db=database.importManifest(db,capture(index,'d0',today,10+index),factory,{overwrite:true}).base;
  const assertD0=s=>{
    const markup=s.get('#kpis').innerHTML;
    assert.match(card(markup,'kpi-group-d0'),/BRL 21\.00/,'D0 investment must remain visible, not —');
    assert.match(card(markup,'kpi-group-d0'),/>42<\/strong>/,'D0 impressions stay visible');
    assert.match(card(markup,'kpi-group-d0'),/>2<\/strong>/,'D0 clicks stay visible');
    assert.match(card(markup,'kpi-d0-profit'),/BRL -21\.00/,'D0 profit stays visible');
    for(const index of [0,1]){
      const row=s.get('#totalsBody').innerHTML.match(new RegExp('<tr[^>]*data-campaign="Synthetic '+index+'"[\\s\\S]*?<\\/tr>'))?.[0]??'';
      assert.match(metricCell(row,'current'),new RegExp('BRL '+(10+index)+'\\.00'));
      assert.match(metricCell(row,'imp'),new RegExp('>'+(20+index*2)+'<'));
      assert.match(metricCell(row,'clicks'),/>1</);
      assert.match(metricCell(row,'conv'),/>0</,'observed zero must not disappear');
    }
  };
  assertD0(presentation(db));
  for(const index of [1,0]){
    db=database.importManifest(db,capture(index,'d1',closed,20+index),factory,{overwrite:true}).base;
    const before=JSON.stringify(db),s=presentation(db);assertD0(s);
    const kpis=s.get('#kpis').innerHTML;
    s.get('#totalsD1').onclick();
    assert.equal(s.get('#kpis').innerHTML,kpis,'period tabs cannot hide either card group');
    assert.match(s.get('#totalsBody').innerHTML,new RegExp('BRL '+(20+index)+'\\.00'));
    s.get('#totalsD0').onclick();assertD0(s);
    s.get('#search').value='not-a-campaign';s.get('#search').oninput();
    assert.match(s.get('#totalsBody').innerHTML,/Nenhuma campanha encontrada/);
    assert.equal(s.get('#kpis').innerHTML,kpis,'table-only filters cannot remove period indicators');
    assertD0(presentation(JSON.parse(JSON.stringify(db))));
    assert.equal(JSON.stringify(db),before,'rendering must not rewrite stored observations');
  }
  const s=presentation(db),markup=s.get('#kpis').innerHTML;
  assert.match(card(markup,'kpi-group-d1'),/BRL 41\.00/);
  assert.match(card(markup,'kpi-d1-profit'),/BRL -41\.00/);
  const coverage=card(markup,'overview-kpi-base');
  assert.match(coverage,/D−1: 2 de 2 MCCs com captura para 07\/10\/2026/);
  assert.match(coverage,/D0: 2 de 2 MCCs com captura para 08\/10\/2026/);
  assert.doesNotMatch(coverage,/overview-manifest-dot warn/,'both periods are independently complete');
});

test('PRIORITY: rendered stored D0 distinguishes observed zero, missing data and explicit capture absence',()=>{
  let db=database.importManifest(database.create(),capture(0,'d0',today,0),factory).base;
  db=database.importManifest(db,capture(0,'d1',closed,10),factory).base;
  let s=presentation(db);
  assert.match(card(s.get('#kpis').innerHTML,'kpi-group-d0'),/BRL 0\.00/,'zero remains an observation');
  assert.match(metricCell(s.get('#totalsBody').innerHTML,'current'),/BRL 0\.00/);
  db.diario=db.diario.filter(row=>row.data!==today);s=presentation(db);
  assert.doesNotMatch(card(s.get('#kpis').innerHTML,'kpi-group-d0'),/BRL/,'missing data cannot become a fabricated zero');
  assert.match(metricCell(s.get('#totalsBody').innerHTML,'current'),/—/);
  db=database.importManifest(database.create(),capture(0,'d0',today,99),factory).base;
  db=database.importManifest(db,capture(0,'d1',closed,10),factory).base;
  const campaign=db.manifesto_atual.campanhas[0];
  campaign.datas_coleta.push(today);campaign.metricas_D_zero={presente:false,data:field(today)};
  s=presentation(db);
  assert.doesNotMatch(card(s.get('#kpis').innerHTML,'kpi-group-d0'),/BRL/,'explicit absence cannot resurrect old diary values');
  assert.match(metricCell(s.get('#totalsBody').innerHTML,'current'),/—/);
});

test('adapter retains two D0 captures after D−1-only imports of both MCCs',()=>{
  let db=database.create();
  for(const index of [0,1])db=database.importManifest(db,capture(index,'d0',today,10+index),factory,{overwrite:true}).base;
  for(const index of [1,0]){
    db=database.importManifest(db,capture(index,'d1',closed,20+index),factory,{overwrite:true}).base;
    assert.equal(db.manifesto_atual.separacao_temporal.D_zero.datas_detectadas.length,0,'latest incoming manifest is really D−1 only');
    const sandbox=setup(db),before=JSON.stringify(db),dates=sandbox.manifestDates();
    assert.deepEqual(JSON.parse(JSON.stringify(dates)),{d0:today,d1:closed});
    const totals=db.manifesto_atual.campanhas.map(c=>sandbox.d0Totals(c));
    assert.equal(domain.sumObservedMetric(totals,'investment').value,21);
    assert.equal(domain.sumObservedMetric(totals,'impressions').value,42);
    assert.equal(domain.sumObservedMetric(totals,'clicks').value,2);
    assert.equal(domain.sumObservedMetric(totals,'conversions').value,0);
    assert.equal(domain.sumObservedMetric(totals,'commission').value,0);
    assert.ok(totals.every(t=>t.date===today));assert.equal(JSON.stringify(db),before,'presentation never repairs by writing metrics');
  }
});

test('explicit D0 absence/zero remains authoritative; fallback uses only exact-date observed diary',()=>{
  let db=database.importManifest(database.create(),capture(0,'d0',today,10),factory).base;
  db=database.importManifest(db,capture(0,'d1',closed),factory).base;
  let sandbox=setup(db),campaign=db.manifesto_atual.campanhas[0];
  assert.equal(sandbox.d0Totals(campaign).investment,10);
  campaign.datas_coleta.push(today);campaign.metricas_D_zero={presente:false,data:field(today)};
  sandbox=setup(db);assert.equal(sandbox.d0Totals(campaign).investment,null,'captured absence cannot revive old values');
  campaign.metricas_D_zero={presente:true,data:field(today),moeda:field('BRL'),custo_total:field(0),impressoes:field(0),cliques_google:field(0),conversoes:field(0),valor_conversao:field(0)};
  sandbox=setup(db);assert.equal(sandbox.d0Totals(campaign).investment,0,'zero is not missing');
  campaign.metricas_D_zero={presente:false,data:field(null)};campaign.datas_coleta=[closed];db.diario=db.diario.filter(row=>row.data!==today);
  sandbox=setup(db);assert.equal(sandbox.d0Totals(campaign).investment,null,'no borrowing from yesterday');
});

test('omitted D0 date is recovered only with period evidence for the day after D−1, not upload time or stale D0',()=>{
  const db={campanhas:[{id:'a',mcc_id:ids[0]}],diario:[{campanha_id:'a',data:today,fontes:['manifesto'],periodos:['d0']}]},manifest={separacao_temporal:{D_menos_1:{datas_detectadas:[closed]},D_zero:{datas_detectadas:[],estado:'nao_fornecido'}},campanhas:[]};
  assert.equal(domain.manifestPeriodDates(db,manifest).d0,today,'legacy diary recovers already stored D0');
  db.diario[0].data=closed;assert.equal(domain.manifestPeriodDates(db,manifest).d0,'');
  db.diario[0].data=today;db.diario[0].periodos=['d1'];assert.equal(domain.manifestPeriodDates(db,manifest).d0,'');
  db.diario[0].periodos=['d0'];db.diario[0].fontes=['excel'];assert.equal(domain.manifestPeriodDates(db,manifest).d0,'');
  assert.equal(domain.manifestPeriodDates(null,{...manifest,gerado_em_utc:'2026-10-08T19:00:00Z'}).d0,'','upload clock is not a report');
  const d0Only={separacao_temporal:{D_zero:{datas_detectadas:[today]},D_menos_1:{datas_detectadas:[],estado:'nao_fornecido'}},campanhas:[]};
  assert.equal(domain.manifestPeriodDates(null,d0Only).d1,closed,'D0-only keeps the previous-day D−1 financial fallback');
  const stale=database.importManifest(database.create(),capture(0,'d0',closed,99),factory).base;
  stale.manifesto_atual.separacao_temporal.D_zero={datas_detectadas:[],estado:'nao_fornecido'};
  stale.manifesto_atual.separacao_temporal.D_menos_1={datas_detectadas:[closed]};
  assert.equal(setup(stale).d0Totals(stale.manifesto_atual.campanhas[0]).investment,null,'an old unscoped snapshot cannot appear as D0');
});
