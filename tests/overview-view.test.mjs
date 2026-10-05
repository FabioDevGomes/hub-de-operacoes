import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain,view=context.window.OverviewView;
const row=(name,status,investment,extra={})=>({
  c:{nome_campanha_exato:name,_status:status,_pausedAt:'2026-09-29',_lastSeen:'2026-09-28'},
  identity:{name,dateLabel:'29/09',dateSort:'2026-09-29'},campaignId:'id-'+name,pausedAt:'2026-09-29',
  totals:{investment,impressions:0,clicks:0,conversions:0},d0Totals:{investment,impressions:0,clicks:0},
  roi:null,profit:null,zeroDays:0,...extra
});
function setup(rows){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  const calls=[],snapshot={rows,activeCount:rows.filter(r=>r.c._status!=='pausada').length,
    pausedCount:rows.filter(r=>r.c._status==='pausada').length,referenceDate:'2026-09-30',
    dates:{d0:'2026-09-30',d1:'2026-09-29'},d1Totals:[{investment:0,impressions:10,clicks:null},{investment:null,impressions:0,clicks:2}]};
  const controller=view.mount({root:dom.root,state,getSnapshot:()=>snapshot,domain,format,
    actions:{showProduct:(...args)=>calls.push(['product',...args]),editMinimumRoi:(...args)=>calls.push(['roi',...args])}});
  return {...dom,state,snapshot,calls,controller};
}
test('overview sorting keeps inputs, zero, missing-last and chronological/numeric identities',()=>{
  const rows=[row('Conta 10','ativa',0),row('Conta 2','ativa',50),row('Sem valor','pausada',null)],before=JSON.stringify(rows);
  assert.equal(domain.sortRows(rows,{sortKey:'current',sortDir:'desc'},c=>c?.value)[0].totals.investment,50);
  assert.equal(domain.sortRows(rows,{sortKey:'current',sortDir:'asc'},c=>c?.value).at(-1).totals.investment,null);
  assert.equal(domain.sortRows(rows,{sortKey:'campaign',sortDir:'asc'},c=>c?.value)[0].identity.name,'Conta 2');
  rows[0].identity.dateSort='2026-09-01';rows[1].identity.dateSort='2026-01-31';
  assert.equal(domain.sortRows(rows,{sortKey:'date',sortDir:'asc'},c=>c?.value)[0].identity.name,'Conta 2');
  rows[0].identity.dateSort=rows[1].identity.dateSort='2026-09-29';
  assert.equal(JSON.stringify(rows),before);
  const sorted=domain.sortRows([row('Lucro','ativa',0,{profit:20}),row('Prejuízo','ativa',0,{profit:-10})],{sortKey:'profit',sortDir:'asc'},c=>c?.value);
  assert.equal(sorted[0].profit,-10);
});
test('overview KPIs cover all rows in every period, filters affect only table',()=>{
  const s=setup([row('Ativa','ativa',10),row('Pausada','pausada',90)]),before=JSON.stringify(s.snapshot);
  for(const mode of ['consolidated','d1','d0']){
    s.state.totalsMode=mode;s.state.campaignStatusFilter='active';s.controller.render();
    const kpis=s.get('#kpis').innerHTML;
    assert.match(kpis,/Indicadores D0/);assert.match(kpis,/Indicadores D−1/);
    assert.match(kpis,/BRL 100.00/);assert.match(kpis,/BRL 0.00/);assert.match(kpis,/Cliques 1\/2/);
    assert.match(s.get('#totalsBody').innerHTML,/<tr class="paused-row hidden"/);
    assert.match(s.get('#totalsCount').textContent,/1 ativas · 1 pausada/);
    assert.equal((s.get('#totalsHead').innerHTML.match(/<th>/g)||[]).length,13);
    s.state.campaignStatusFilter='all';s.controller.render();assert.equal(s.get('#kpis').innerHTML,kpis);
  }
  assert.equal(JSON.stringify(s.snapshot),before);assert.deepEqual(s.calls,[]);
});
test('overview daily profit follows D0, marks polarity and exposes observed coverage',()=>{
  const s=setup([
    row('Lucro','ativa',10,{d0Totals:{investment:10,commission:25},d0ProfitTotals:{investment:10,commission:45}}),
    row('Prejuízo','pausada',80,{d0Totals:{investment:80,commission:5},d0ProfitTotals:{investment:80,commission:5}}),
    row('Comissão ausente','ativa',20,{d0Totals:{investment:20,commission:null},d0ProfitTotals:{investment:20,commission:null}})
  ]);
  s.controller.render();const kpis=s.get('#kpis').innerHTML,d0Position=kpis.indexOf('aria-label="Indicadores D0"'),profitPosition=kpis.indexOf('kpi-d0-profit');
  assert.ok(d0Position>=0&&profitPosition>d0Position,'quadro de lucro deve aparecer ao lado e após o grupo D0');
  assert.match(kpis,/<span class="kpi-label">Lucro do dia<\/span><strong class="kpi-value negative">BRL -40\.00<\/strong>/);
  assert.match(kpis,/Resultado negativo\. Cobertura: 2\/3 campanhas com investimento e comissão\/ajuste disponíveis\./);
  const positive=setup([row('Lucro positivo','ativa',10,{d0Totals:{investment:10,commission:25}})]);positive.controller.render();
  assert.match(positive.get('#kpis').innerHTML,/<strong class="kpi-value positive">\+BRL 15\.00<\/strong>/);
  const missing=setup([row('Sem comissão','ativa',10,{d0Totals:{investment:10,commission:null}})]);missing.controller.render();
  assert.match(missing.get('#kpis').innerHTML,/<span class="kpi-label">Lucro do dia<\/span><strong class="kpi-value ">—<\/strong>/);
});
test('overview D0 indicators exclude stale rows absent from the latest MCC capture',()=>{
  const captured=row('Capturada','ativa',20,{d0Totals:{investment:20,impressions:50,clicks:5,commission:30},d0ProfitTotals:{investment:20,commission:30}});
  const stale=row('Ausente da captura','pausada',113,{d0Totals:{investment:113,impressions:113,clicks:10,commission:85},d0ProfitTotals:{investment:113,commission:85}});
  stale.c.metricas_D_zero={presente:false};
  const s=setup([captured,stale]);s.controller.render();const kpis=s.get('#kpis').innerHTML;
  const d0Kpis=kpis.slice(kpis.indexOf('aria-label="Indicadores D0"'),kpis.indexOf('class="kpi kpi-d0-profit"'));
  assert.match(d0Kpis,/BRL 20\.00[\s\S]*Impressões[\s\S]*50[\s\S]*Cliques[\s\S]*5/);
  assert.match(d0Kpis,/Cliques 1\/1/);
  assert.match(kpis,/Resultado positivo\. Cobertura: 1\/1 campanhas com investimento e comissão\/ajuste disponíveis\./);
  assert.doesNotMatch(d0Kpis,/BRL 133\.00|Cliques 1\/2/);
});
test('overview alerts coexist, user text is escaped and absent metrics never become zero',()=>{
  const s=setup([row('<Oferta>','ativa',null,{rejected:true,policyLimitation:'Restrição "política"',adjustment:{manualSales:2},numberReuse:{group:'1'},profit:-30})]);
  s.controller.render();
  const html=s.get('#totalsBody').innerHTML;
  assert.match(html,/Ativa · Reprovada · Renumerar/);assert.match(html,/2 vendas provisórias/);assert.match(html,/Limitada pela política/);
  assert.match(html,/policy-limited-row/);assert.match(html,/&lt;Oferta&gt;/);assert.match(html,/&quot;política&quot;/);
  assert.doesNotMatch(html,/<Oferta>/);assert.match(html,/<td class="num">—<\/td>/);assert.match(html,/num negative">BRL -30.00/);
});
test('overview ROI dialog synchronizes budget and percentage; saves only after explicit confirmation',()=>{
  const s=setup([row('Oferta exata','ativa',10)]);s.setList('.sort-btn',[{sort:'campaign'}]);
  s.setList('#totalsBody tr',[{campaign:'Oferta exata',source:'manifest',campaignId:'stable-id'}]);
  s.setList('.test-budget-roi-link',[{campaignId:'stable-id',currentRoi:'20',currentLimit:'318.75',totalRevenue:'382.5'}]);
  s.controller.render();assert.deepEqual(s.calls,[]);
  s.root.querySelectorAll('.sort-btn')[0].onclick();assert.equal(s.state.sortKey,'campaign');assert.equal(s.state.sortDir,'asc');
  s.root.querySelectorAll('.sort-btn')[0].onclick();assert.equal(s.state.sortDir,'desc');
  s.get('#campaignStatusFilter').onchange({target:{value:'paused'}});assert.equal(s.state.campaignStatusFilter,'paused');
  s.get('#totalsD1').onclick();assert.equal(s.state.totalsMode,'d1');assert.match(s.get('#totalsCaption').textContent,/29\/09\/2026/);
  s.get('#totalsD0').onclick();assert.equal(s.state.totalsMode,'d0');
  s.get('#totalsConsolidated').onclick();assert.equal(s.state.totalsMode,'consolidated');
  s.root.querySelectorAll('#totalsBody tr')[0].ondblclick();
  let prevented=0,stopped=0;s.root.querySelectorAll('.test-budget-roi-link')[0].onclick({preventDefault(){prevented++},stopPropagation(){stopped++}});
  assert.deepEqual(s.calls,[['product','Oferta exata','manifest','stable-id']]);
  assert.equal(s.get('#minimumRoiDialog').open,true,'o link abre o diálogo');
  assert.equal(s.get('#minimumRoiLimit').value,'318,75');assert.equal(s.get('#minimumRoiPercent').value,'20');
  s.get('#minimumRoiPercent').value='-3';s.get('#minimumRoiPercent').oninput();
  assert.equal(s.get('#minimumRoiLimit').value,'394,33','alterar ROI recalcula o limite máximo');
  s.get('#minimumRoiLimit').value='510,00';s.get('#minimumRoiLimit').oninput();
  assert.equal(s.get('#minimumRoiPercent').value,'-25','alterar limite calcula ROI negativo');
  let submitted=0;s.get('#minimumRoiForm').onsubmit({preventDefault(){submitted++}});
  assert.deepEqual(s.calls,[['product','Oferta exata','manifest','stable-id'],['roi','stable-id',-25]]);
  assert.equal(s.get('#minimumRoiDialog').open,false,'OK fecha o diálogo depois da confirmação');assert.equal(submitted,1);
  assert.equal(prevented,1);assert.equal(stopped,1);
});
test('overview recent-paused filter retains inclusive seven-day boundary and excludes unknown date',()=>{
  const paused=date=>({c:{_status:'pausada'},pausedAt:date});
  assert.equal(domain.rowVisible(paused('2026-09-24'),'paused7','2026-09-30'),true);
  assert.equal(domain.rowVisible(paused('2026-09-23'),'paused7','2026-09-30'),false);
  assert.equal(domain.rowVisible(paused(''),'paused7','2026-09-30'),false);
  assert.equal(domain.rowVisible({c:{_status:'ativa'}},'paused7','2026-09-30'),false);
  assert.equal(domain.rowVisible(paused(''),'all','2026-09-30'),true);
});
