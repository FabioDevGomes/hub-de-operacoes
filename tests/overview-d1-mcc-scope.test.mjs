import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const domainSource=await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8');
const panelSource=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const adapter=panelSource.slice(panelSource.indexOf('    function d1Totals('),panelSource.indexOf('    function campaignZeroImpressionDays('));
const field=valor=>({valor,estado:valor==null?'ausente':'confirmado'});
const closed='2026-09-20',today='2026-09-21';

function setup(){
  const campaigns=[
    {nome_campanha_exato:'Campaign A',mcc_id:'111-111-1111',datas_coleta:[today],metricas_D_menos_1:{presente:false,data:field(null)},metricas_D_zero:{presente:true,data:field(today),moeda:field('BRL'),custo_total:field(10)}},
    {nome_campanha_exato:'Campaign B',mcc_id:'111-111-1111',datas_coleta:[today],metricas_D_menos_1:{presente:false},metricas_D_zero:{presente:false,data:field(today)}},
    {nome_campanha_exato:'Campaign C',mcc_id:'222-222-2222',datas_coleta:[closed,today],metricas_D_menos_1:{presente:true,data:field(closed),moeda:field('BRL'),custo_total:field(0),impressoes:field(0),cliques_google:field(0),conversoes:field(0),valor_conversao:field(0)}},
    {nome_campanha_exato:'Campaign D',mcc_id:'222-222-2222',datas_coleta:[closed,today],metricas_D_menos_1:{presente:false,data:field(closed)}},
  ];
  const manifest={separacao_temporal:{D_menos_1:{datas_detectadas:[closed]},D_zero:{datas_detectadas:[today]}},campanhas:campaigns};
  const sandbox=vm.createContext({window:{}});vm.runInContext(domainSource,sandbox);
  const domain=sandbox.window.OverviewDomain,snapshots=domain.authoritativeMccSnapshots(manifest),byName=new Map();
  for(const snapshot of snapshots.rows){const key=snapshot.campaignName.toLowerCase(),rows=byName.get(key)||[];rows.push(snapshot);byName.set(key,rows)}
  Object.assign(sandbox,{OverviewDomain:domain,derivedContext:()=>({latestSnapshots:snapshots,snapshotsByCampaignName:byName}),manifestDates:()=>({d1:closed,d0:today}),valueOf:value=>value?.estado==='ausente'||value?.estado==='invalido'?null:value&&typeof value==='object'?value.valor:value,state:{rate:5.1}});
  vm.runInContext(adapter,sandbox);
  return{campaigns,manifest,domain,snapshots,sandbox};
}

test('D−1 of one MCC does not hide the same-date diary of another MCC updated only with D0',()=>{
  const {campaigns,manifest,domain,snapshots,sandbox}=setup(),before=JSON.stringify(manifest);
  assert.equal(snapshots.rows.filter(row=>row.period==='d1').length,2,'only the MCC with the closed period supplies authoritative D−1 rows');
  const recorded={investment:40,impressions:80,clicks:8,conversions:1,commission:70},history={byDate:{[closed]:recorded,'2026-09-19':{investment:999}}};
  const result=sandbox.d1Totals(campaigns[0],history);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{...recorded,date:closed},'restore all financial and delivery fields from the exact date');
  assert.equal(sandbox.d1Totals(campaigns[1],history).investment,40,'placeholder without a date must not borrow the other MCC date either');
  assert.equal(domain.sumObservedMetric([result,sandbox.d1Totals(campaigns[2],history)],'investment').value,40,'D−1 KPI includes historical values and confirmed zero');
  assert.equal(domain.profitForTotals(result),30);
  assert.equal(sandbox.d1Totals(campaigns[0],{byDate:{'2026-09-19':recorded}}).investment,null,'never borrow older diary data');
  assert.equal(JSON.stringify(manifest),before,'reading snapshots does not modify the base');
});

test('an explicitly captured D−1 still overrides stale diary, including zero and absence',()=>{
  const {campaigns,sandbox}=setup(),history={byDate:{[closed]:{investment:80,impressions:100,clicks:10,conversions:2,commission:120}}};
  assert.equal(sandbox.d1Totals(campaigns[2],history).investment,0,'observed zero remains authoritative');
  assert.equal(sandbox.d1Totals(campaigns[3],history).investment,null,'explicit absence within the captured scope cannot revive stale values');
});
