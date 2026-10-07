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
function setup(rows,preferences){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  const calls=[],snapshot={rows,activeCount:rows.filter(r=>r.c._status!=='pausada').length,
    pausedCount:rows.filter(r=>r.c._status==='pausada').length,pausedTodayCampaigns:[],pausedTodayDate:'2026-09-30',referenceDate:'2026-09-30',
    manifestCampaignCount:54,manifestCaptureInfo:{timestamp:'2026-09-30T13:25:00Z',source:'capture'},baseRecordCount:4427,baseUpdatedLabel:'05/10/2026, 14:57',mccImportUpdates:{ecom:{timestamp:'2026-10-05T17:57:00Z',source:'import'},nutra:{timestamp:'2026-10-05T18:40:00Z',source:'import'}},pendingSaleCount:1,fractionalSaleCount:0,fractionalValuePendingItems:[],
    dates:{d0:'2026-09-30',d1:'2026-09-29'},d1Totals:[{investment:0,impressions:10,clicks:null},{investment:null,impressions:0,clicks:2}]};
  const controller=view.mount({root:dom.root,state,getSnapshot:()=>snapshot,domain,format,preferences,
    actions:{showProduct:(...args)=>calls.push(['product',...args]),editMinimumRoi:(...args)=>calls.push(['roi',...args]),confirmFractionalValue:(...args)=>calls.push(['fractional',...args])}});
  return {...dom,state,snapshot,calls,controller};
}
test('campaign search filters table in all periods without changing KPIs, sorting or source data',()=>{
  const s=setup([row('Produto Alfa 01','ativa',10),row('Produto Beta 02','pausada',90)]),before=JSON.stringify(s.snapshot);
  s.controller.render();const kpis=s.get('#kpis').innerHTML;
  for(const period of ['#totalsConsolidated','#totalsD1','#totalsD0']){
    s.get('#search').value='  aLFA  ';s.get('#search').oninput();
    s.get(period).onclick();
    assert.match(s.get('#totalsBody').innerHTML,/Produto Alfa 01/);
    assert.doesNotMatch(s.get('#totalsBody').innerHTML,/Produto Beta 02/);
    assert.equal(s.get('#search').value,'  aLFA  ');
    assert.equal(s.get('#kpis').innerHTML,kpis);
  }
  s.get('#search').value='BETA';s.get('#search').oninput();
  assert.match(s.get('#totalsBody').innerHTML,/paused-row hidden/,'a busca não deve ignorar o filtro de situação');
  s.get('#campaignStatusFilter').onchange({target:{value:'paused'}});
  assert.match(s.get('#totalsBody').innerHTML,/<tr class="paused-row"/);
  s.get('#search').value='inexistente';s.get('#search').oninput();
  assert.match(s.get('#totalsBody').innerHTML,/Nenhuma campanha encontrada/);
  s.get('#search').value='';s.get('#search').oninput();
  assert.match(s.get('#totalsBody').innerHTML,/Produto Alfa 01/);
  assert.match(s.get('#totalsBody').innerHTML,/Produto Beta 02/);
  assert.equal(JSON.stringify(s.snapshot),before);assert.deepEqual(s.calls,[]);
});
test('campaign search matches exact MCC identity and display name without mutating rows',()=>{
  const rows=[row('Nome MCC completo 01','ativa',10,{identity:{name:'Apelido apresentado',dateLabel:'',dateSort:''}})];
  assert.equal(domain.searchRows(rows,'mcc completo').length,1);
  assert.equal(domain.searchRows(rows,'APELIDO').length,1);
  assert.equal(domain.searchRows(rows,'   ').length,1);
  assert.equal(domain.searchRows(rows,'não existe').length,0);
  assert.notEqual(domain.searchRows(rows,''),rows);
});
test('overview history preserves old navigation entries, native IDs, separate legacy summaries and KPI coverage',()=>{
  const s=setup([row('Ativa','ativa',10),row('Pausada','pausada',90)]);
  s.snapshot.historyEntries=[
    {id:'id-Pausada',name:'Pausada',source:'workbook'},
    {id:'legado',name:'Nome antigo',label:'Nome antigo · resumo Totais',source:'legacy'},
    {id:'outra',name:'Mesmo nome',source:'workbook'},
    {id:'id-Ativa',name:'Ativa',label:'Ativa · resumo Totais',source:'legacy'}
  ];
  const before=JSON.stringify(s.snapshot);s.controller.render();const kpis=s.get('#kpis').innerHTML;
  s.get('#campaignStatusFilter').onchange({target:{value:'history'}});
  const markup=s.get('#totalsBody').innerHTML;
  assert.equal((markup.match(/data-campaign="Pausada"/g)||[]).length,1,'não duplicar campanha operacional já acessível');
  assert.match(markup,/data-campaign="Nome antigo" data-source="legacy" data-campaign-id="legado"/);
  assert.match(markup,/data-campaign="Mesmo nome" data-source="workbook" data-campaign-id="outra"/);
  assert.match(markup,/Nome antigo · resumo Totais/);
  assert.match(markup,/Resumo Totais/);
  assert.equal(s.get('#kpis').innerHTML,kpis);
  const rows=domain.historyNavigationRows(s.snapshot.historyEntries,s.snapshot.rows);
  assert.equal(rows.length,3);assert.equal(rows[0].totals,null,'atalho histórico não inventa métricas MCC');
  assert.equal(domain.rowVisible(rows[0],'active','2026-09-30'),false);
  assert.equal(domain.rowVisible(rows[0],'history','2026-09-30'),true);
  assert.equal(domain.rowVisible(rows[0],'all','2026-09-30'),true);
  s.setList('#totalsBody tr',[{campaign:'Nome antigo',source:'legacy',campaignId:'legado'}]);
  s.controller.render();s.root.querySelectorAll('#totalsBody tr')[0].ondblclick();
  assert.deepEqual(s.calls,[['product','Nome antigo','legacy','legado']]);
  assert.equal(JSON.stringify(s.snapshot),before);
});
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
    assert.match(kpis,/BRL 100.00/);assert.match(kpis,/BRL 0.00/);assert.doesNotMatch(kpis,/class="kpi-info"|kpi-info-icon|Cliques 1\/2/);
    assert.equal((kpis.match(/class="kpi overview-kpi/g)||[]).length,6,'os seis cartões devem manter a mesma composição');
    const manifestCard=kpis.match(/<section class="kpi overview-kpi overview-kpi-manifest"[\s\S]*?<\/section>/)?.[0],provisionalCard=kpis.match(/<section class="kpi overview-kpi overview-kpi-base"[\s\S]*?<\/section>/)?.[0];
    assert.match(manifestCard,/Manifesto MCC[\s\S]*kpi-value">10:25<\/strong>[\s\S]*Última captura[\s\S]*Ecom: 05\/10, 14:57[\s\S]*Nutra: 05\/10, 15:40/);
    assert.doesNotMatch(manifestCard,/D−1|D0/,'datas dos períodos não ficam mais no cartão Manifesto MCC');
    assert.match(provisionalCard,/D−1[\s\S]*29\/09\/2026[\s\S]*D0[\s\S]*30\/09\/2026/,'datas D−1 e D0 ficam no cartão de Vendas provisórias');
    assert.doesNotMatch(provisionalCard,/MCC Ecom|MCC Nutra/,'horários individuais das MCCs ficam no cartão Manifesto MCC');
    assert.match(kpis,/Venda provisória[\s\S]*overview-info-icon/);
    assert.match(kpis,/overview-kpi-main-label">Investimento/);assert.match(kpis,/overview-kpi-detail-value">10/);
    assert.match(s.get('#totalsBody').innerHTML,/<tr class="paused-row hidden"/);
    assert.equal((s.get('#totalsHead').innerHTML.match(/<th /g)||[]).length,15);
    s.state.campaignStatusFilter='all';s.controller.render();assert.equal(s.get('#kpis').innerHTML,kpis);
  }
  assert.equal(JSON.stringify(s.snapshot),before);assert.deepEqual(s.calls,[]);
});
test('overview removes the campaign-count badge from the table header while keeping counts in the KPI',async()=>{
  const template=await readFile(new URL('../src/overview/template.html',import.meta.url),'utf8');
  const viewSource=await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8');
  assert.doesNotMatch(template,/id="totalsCount"/);
  assert.doesNotMatch(viewSource,/totalsCount/);
  const s=setup([row('Ativa','ativa',10),row('Pausada','pausada',90)]);s.controller.render();
  assert.match(s.get('#kpis').innerHTML,/Ativas<\/span><strong class="overview-kpi-detail-value">1/);
  assert.match(s.get('#kpis').innerHTML,/Pausaram hoje<\/span><strong class="overview-kpi-detail-value">0/);
});
test('overview puts D−1/D0 dates with provisional sales and compact MCC timestamps in the manifest card',async()=>{
  const s=setup([]);s.controller.render();
  const html=s.get('#kpis').innerHTML,manifest=html.match(/<section class="kpi overview-kpi overview-kpi-manifest"[\s\S]*?<\/section>/)?.[0],provisional=html.match(/<section class="kpi overview-kpi overview-kpi-base"[\s\S]*?<\/section>/)?.[0];
  assert.match(manifest,/class="overview-kpi-mcc-updates" aria-label="Últimas atualizações das MCCs"><span aria-label="MCC Ecom: 05\/10, 14:57" title="Horário da última importação desta MCC\.">Ecom: 05\/10, 14:57<\/span><span aria-label="MCC Nutra: 05\/10, 15:40" title="Horário da última importação desta MCC\.">Nutra: 05\/10, 15:40<\/span>/);
  assert.doesNotMatch(manifest,/MCC (?:Ecom|Nutra): [^<]*2026|MCC (?:Ecom|Nutra): [^<]*captura/,'linha visível não inclui ano nem o sufixo captura');
  assert.match(provisional,/overview-kpi-dates" aria-label="Datas D−1 e D0">[\s\S]*D−1[\s\S]*29\/09\/2026[\s\S]*D0[\s\S]*30\/09\/2026/);
  const css=await readFile(new URL('../src/overview/overview.css',import.meta.url),'utf8');
  const rule=css.match(/#totalsView \.overview-kpi-mcc-updates\{([^}]+)\}/)?.[1];
  assert.match(rule,/display:flex/);
  assert.match(rule,/flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center/);
  assert.match(rule,/white-space:nowrap/);
  assert.match(rule,/font-size:\.65rem/,'rótulos Ecom e Nutra compactos liberam espaço para os horários sem reduzir a legibilidade');
  assert.match(css, /overview-kpi-mcc-updates span\{flex:0 0 auto;white-space:nowrap\}/);
  assert.match(css,/overview-kpi-mcc-updates span\+span::before\{[^}]*content:"·"/,'Ecom e Nutra ficam na mesma linha e separados visualmente');
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\) minmax\(235px,1fr\)/,'o cartão da base reserva espaço para exibir a linha sem cortar texto');
  s.snapshot.baseRecordCount=0;s.controller.render();
  assert.doesNotMatch(s.get('#kpis').innerHTML,/Base: 0 registros/);
  assert.deepEqual(s.calls,[]);
});
test('overview secondary KPI metrics stay grouped with compact spacing',async()=>{
  const css=await readFile(new URL('../src/overview/overview.css',import.meta.url),'utf8');
  assert.match(css,/#totalsView \.overview-kpi-details\{display:flex;align-items:baseline;justify-content:center;gap:10px/,'métricas secundárias devem ficar agrupadas no centro, sem ocupar colunas largas');
  assert.match(css,/#totalsView \.overview-kpi-detail\{display:flex;align-items:baseline;justify-content:flex-start;gap:4px/,'rótulo e valor devem ficar próximos dentro de cada métrica');
});
test('overview omits consolidated caption but retains daily period context',()=>{
  const s=setup([row('Campanha','ativa',0)]);s.controller.render();
  assert.equal(s.get('#totalsCaption').textContent,'','a descrição do histórico não deve aparecer no cabeçalho consolidado');
  s.get('#totalsD1').onclick();assert.match(s.get('#totalsCaption').textContent,/Retrato fechado de D−1 · 29\/09\/2026/);
  s.get('#totalsD0').onclick();assert.match(s.get('#totalsCaption').textContent,/Total do dia por campanha/);
});
test('overview puts D−1 investment and profit first and keeps D0 profit with campaign counts',()=>{
  const s=setup([row('Ativa','ativa',10,{d0Totals:{investment:10,commission:20}}),row('Pausada','pausada',5,{d0Totals:{investment:5,commission:0}})]);
  s.snapshot.pausedTodayCampaigns=['Pausada'];
  s.snapshot.d1Totals=[{investment:30,commission:50},{investment:20,commission:15}];
  const before=JSON.stringify(s.snapshot);
  for(const mode of ['consolidated','d1','d0']){
    s.state.totalsMode=mode;s.controller.render();
    const kpis=s.get('#kpis').innerHTML;
    const d1Position=kpis.indexOf('aria-label="Indicadores D−1"'),d1ProfitPosition=kpis.indexOf('kpi-d1-profit'),d0Position=kpis.indexOf('aria-label="Indicadores D0"'),d0ProfitPosition=kpis.indexOf('kpi-d0-profit');
    assert.ok(d1Position>=0&&d1ProfitPosition>d1Position&&d0Position>d1ProfitPosition&&d0ProfitPosition>d0Position,'a sequência deve ser investimento D−1, lucro D−1, investimento D0 e lucro D0');
    assert.match(kpis,/aria-label="Lucro de D−1 positivo: \+BRL 15\.00"/);
    assert.doesNotMatch(kpis,/class="kpi overview-kpi overview-kpi-active"/,'não duplica campanhas num cartão separado');
    const profit=kpis.match(/<section class="kpi overview-kpi overview-kpi-profit kpi-d0-profit[\s\S]*?<\/section>/)?.[0];
    assert.match(profit,/Lucro do dia[\s\S]*\+BRL 5\.00[\s\S]*overview-kpi-details[\s\S]*Ativas[\s\S]*overview-kpi-detail-value">1[\s\S]*Pausaram hoje[\s\S]*overview-kpi-detail-value">1/);
    assert.equal((kpis.match(/class="kpi overview-kpi/g)||[]).length,6);
    s.state.campaignStatusFilter='paused';s.controller.render();assert.equal(s.get('#kpis').innerHTML,kpis,'filtro da tabela não altera cartão combinado');
  }
  s.snapshot.activeCount=0;s.snapshot.pausedCount=0;s.snapshot.pausedTodayCampaigns=[];s.controller.render();
  assert.match(s.get('#kpis').innerHTML,/Ativas[\s\S]*overview-kpi-detail-value">0[\s\S]*Pausaram hoje[\s\S]*overview-kpi-detail-value">0/,'zeros continuam explícitos');
  s.snapshot.activeCount=1;s.snapshot.pausedCount=1;s.snapshot.pausedTodayCampaigns=['Pausada'];
  assert.equal(JSON.stringify(s.snapshot),before);assert.deepEqual(s.calls,[]);
});
test('D0 pause detail opens an escaped, read-only list for today',()=>{
  const s=setup([]);
  s.snapshot.pausedTodayCampaigns=['Campanha Alfa','<img src=x onerror=alert(1)>'];
  s.snapshot.pausedTodayDate='2026-09-30';s.controller.render();
  assert.match(s.get('#kpis').innerHTML,/Pausaram hoje<\/span><strong class="overview-kpi-detail-value">2/);
  s.get('#overviewPausedToday').onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(s.get('#pausedTodayDialog').open,true);
  assert.equal(s.get('#pausedTodaySummary').textContent,'2 campanha(s) com pausa registrada em 30/09/2026.');
  assert.match(s.get('#pausedTodayList').innerHTML,/Campanha Alfa/);
  assert.match(s.get('#pausedTodayList').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(s.get('#pausedTodayList').innerHTML,/<img/);
  s.get('#pausedTodayClose').onclick();assert.equal(s.get('#pausedTodayDialog').open,false);
  s.snapshot.pausedTodayCampaigns=[];s.controller.render();s.get('#overviewPausedToday').onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(s.get('#pausedTodaySummary').textContent,'Nenhuma campanha pausou hoje.');
  assert.equal(s.get('#pausedTodayList').hidden,true);
  assert.equal(s.get('#pausedTodayList').innerHTML,'');
});
test('D−1 profit uses observed metrics, colors by sign and preserves missing versus zero',()=>{
  const s=setup([]);
  s.snapshot.d1Totals=[{investment:125.25,commission:100},{investment:20,commission:50},{investment:10,commission:null}];
  s.controller.render();let profit=s.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-profit kpi-group-d1 kpi-d1-profit[\s\S]*?<\/section>/)?.[0];
  assert.match(profit,/<strong class="kpi-value positive">\+BRL 4\.75<\/strong>/);
  assert.match(profit,/Lucro de D−1 = comissão observada − investimento observado[\s\S]*Cobertura: 2\/3 campanhas/);
  assert.match(profit,/overview-kpi-context">D−1/);
  s.snapshot.d1Totals=[{investment:10,commission:0}];s.controller.render();profit=s.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-profit kpi-group-d1 kpi-d1-profit[\s\S]*?<\/section>/)?.[0];
  assert.match(profit,/<strong class="kpi-value negative">BRL -10\.00<\/strong>/);
  s.snapshot.d1Totals=[{investment:0,commission:0}];s.controller.render();profit=s.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-profit kpi-group-d1 kpi-d1-profit[\s\S]*?<\/section>/)?.[0];
  assert.match(profit,/<strong class="kpi-value ">BRL 0\.00<\/strong>/,'zero observado continua sendo lucro zero, sem cor de positivo/negativo');
  s.snapshot.d1Totals=[{investment:10,commission:null}];s.controller.render();profit=s.get('#kpis').innerHTML.match(/<section class="kpi overview-kpi overview-kpi-profit kpi-group-d1 kpi-d1-profit[\s\S]*?<\/section>/)?.[0];
  assert.match(profit,/<strong class="kpi-value ">—<\/strong>/,'comissão ausente não vira lucro negativo ou zero');
});
test('overview keeps a permanent information icon and distinguishes fractional sales awaiting real value',()=>{
  const s=setup([row('Campanha','ativa',0)]);
  s.controller.render();let kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/class="kpi-label">Venda provisória,?<\/span>[\s\S]*<strong class="kpi-value">1<\/strong>[\s\S]*pendente de confirmação/);
  assert.match(kpis,/overview-info-icon[^>]+aria-label="Informações sobre vendas provisórias e fracionárias"/);
  assert.match(kpis,/class="dot warn overview-kpi-pending-dot"/,'pendências devem manter o ponto âmbar');
  s.snapshot.pendingSaleCount=3;s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/class="kpi-label">Vendas provisórias,?<\/span>[\s\S]*<strong class="kpi-value">3<\/strong>[\s\S]*pendentes de confirmação/);
  s.snapshot.pendingSaleCount=1;s.snapshot.fractionalSaleCount=1;s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/class="kpi-label">Venda fracionária,?<\/span>[\s\S]*<strong class="kpi-value">2<\/strong>[\s\S]*1 com valor real a confirmar · 1 pendente\(s\) de MCC/);
  assert.match(kpis,/Clique no link para informar e confirmar o valor real/,'o cartão explica o novo fluxo de confirmação');
  assert.match(kpis,/class="overview-kpi-main-label overview-kpi-fractional-link" href="#" aria-haspopup="dialog"/,'o valor pendente vira um link acessível');
  s.snapshot.pendingSaleCount=0;s.snapshot.fractionalSaleCount=1;s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/class="kpi-label">Venda fracionária,?<\/span>[\s\S]*<strong class="kpi-value">1<\/strong>[\s\S]*1 com valor real a confirmar/);
  s.snapshot.fractionalSaleCount=0;s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/class="kpi-label">Vendas provisórias,?<\/span>[\s\S]*<strong class="kpi-value">0<\/strong>/);assert.match(kpis,/class="dot overview-kpi-pending-dot"/,'sem pendências o ponto deve ficar verde');assert.match(kpis,/overview-info-icon/);
  s.snapshot.baseRecordCount=null;s.snapshot.baseUpdatedLabel='';s.snapshot.mccImportUpdates={};s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.match(kpis,/MCC Ecom: Sem registro[\s\S]*MCC Nutra: Sem registro/);
  assert.doesNotMatch(kpis,/Histórico não carregado|Atualização indisponível/);
});
test('fractional value link opens a compact per-product confirmation dialog and submits only the selected row',async()=>{
  const s=setup([row('Campanha','ativa',0)]),item={confirmationKey:'campaign|2026-09-30|d1|0.98000000|observed|75.00',campaignId:'campaign',date:'2026-09-30',period:'d1',conversions:.98,productName:'Produto fracionário',currentValueBrl:75,saleId:null};
  s.snapshot.fractionalSaleCount=1;s.snapshot.fractionalValuePendingItems=[item];
  s.setList('.overview-kpi-fractional-link',[{}]);
  s.setList('.overview-fractional-value-input',[{confirmationKey:item.confirmationKey}]);s.root.querySelectorAll('.overview-fractional-value-input')[0].value='240,00';s.setList('.overview-fractional-confirm-button',[{confirmationKey:item.confirmationKey}]);s.setList('.overview-fractional-row-error',[{fractionalRowError:item.confirmationKey}]);
  const link=s.root.querySelectorAll('.overview-kpi-fractional-link')[0],button=s.root.querySelectorAll('.overview-fractional-confirm-button')[0];
  s.controller.render();link.onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(s.get('#fractionalValueDialog').open,true);
  const list=s.get('#fractionalValueList').innerHTML;
  assert.match(list,/Produto fracionário/);assert.match(list,/Atual \(MCC\)[\s\S]*BRL 75\.00/);assert.match(list,/Novo valor \(R\$\)/);assert.match(list,/Confirmar/);
  await button.onclick({preventDefault(){}});
  assert.deepEqual(s.calls,[['fractional',item.confirmationKey,240]]);
});
test('overview daily profit follows D0, marks polarity and exposes observed coverage',()=>{
  const s=setup([
    row('Lucro','ativa',10,{d0Totals:{investment:10,commission:25},d0ProfitTotals:{investment:10,commission:45}}),
    row('Prejuízo','pausada',80,{d0Totals:{investment:80,commission:5},d0ProfitTotals:{investment:80,commission:5}}),
    row('Comissão ausente','ativa',20,{d0Totals:{investment:20,commission:null},d0ProfitTotals:{investment:20,commission:null}})
  ]);
  s.controller.render();const kpis=s.get('#kpis').innerHTML,d0Position=kpis.indexOf('aria-label="Indicadores D0"'),profitPosition=kpis.indexOf('kpi-d0-profit');
  assert.ok(d0Position>=0&&profitPosition>d0Position,'quadro de lucro deve aparecer ao lado e após o grupo D0');
  assert.match(kpis,/<span class="kpi-label">Lucro do dia<\/span>[\s\S]*?<strong class="kpi-value negative">BRL -40\.00<\/strong>/);
  assert.match(kpis,/Resultado negativo\. Cobertura: 2\/3 campanhas com investimento e comissão\/ajuste disponíveis\./);
  const positive=setup([row('Lucro positivo','ativa',10,{d0Totals:{investment:10,commission:25}})]);positive.controller.render();
  assert.match(positive.get('#kpis').innerHTML,/<strong class="kpi-value positive">\+BRL 15\.00<\/strong>/);
  const missing=setup([row('Sem comissão','ativa',10,{d0Totals:{investment:10,commission:null}})]);missing.controller.render();
  assert.match(missing.get('#kpis').innerHTML,/<span class="kpi-label">Lucro do dia<\/span>[\s\S]*?<strong class="kpi-value ">—<\/strong>/);
});
test('overview D0 total includes same-day retained campaigns without a partial label',()=>{
  const active=row('Ativa','ativa',10,{d0Totals:{investment:10,impressions:10,clicks:2}});
  active.c.metricas_D_zero={presente:true};active.c.captura_D_zero_escopo='active_only';active.c.captura_D_zero_completa=false;
  const paused=row('Pausada','pausada',20,{d0Totals:{investment:20,impressions:20,clicks:4}});
  paused.c.metricas_D_zero={presente:false,retida_no_dia:true};paused.c.captura_D_zero_escopo='active_only';paused.c.captura_D_zero_completa=false;
  const s=setup([active,paused]);s.controller.render();
  let kpis=s.get('#kpis').innerHTML;
  assert.doesNotMatch(kpis,/parcial|captura “Todas as campanhas”/i);
  assert.match(kpis,/BRL 30\.00/,'investimento D0 inclui ativa e ausente retida mesmo com o filtro da tabela em ativas');
  assert.match(kpis,/overview-kpi-detail-value">30/,'impressões e cliques dos registros retidos somam no cartão D0');
  active.c.captura_D_zero_completa=true;paused.c.captura_D_zero_completa=true;s.controller.render();kpis=s.get('#kpis').innerHTML;
  assert.doesNotMatch(kpis,/parcial|últimos valores D0 conhecidos/i,'a cobertura técnica não altera o rótulo visual do total');
});
test('overview D0 indicators exclude stale rows absent from the latest MCC capture',()=>{
  const captured=row('Capturada','ativa',20,{d0Totals:{investment:20,impressions:50,clicks:5,commission:30},d0ProfitTotals:{investment:20,commission:30}});
  const stale=row('Ausente da captura','pausada',113,{d0Totals:{investment:113,impressions:113,clicks:10,commission:85},d0ProfitTotals:{investment:113,commission:85}});
  stale.c.metricas_D_zero={presente:false};
  const s=setup([captured,stale]);s.controller.render();const kpis=s.get('#kpis').innerHTML;
  const d0Kpis=kpis.slice(kpis.indexOf('aria-label="Indicadores D0"'),kpis.indexOf('kpi-d0-profit'));
  assert.match(d0Kpis,/BRL 20\.00[\s\S]*Impressões[\s\S]*50[\s\S]*Cliques[\s\S]*5/);
  assert.doesNotMatch(d0Kpis,/class="kpi-info"|kpi-info-icon|Cliques 1\/1/);
  assert.match(kpis,/Resultado positivo\. Cobertura: 1\/1 campanhas com investimento e comissão\/ajuste disponíveis\./);
  assert.doesNotMatch(d0Kpis,/BRL 133\.00|Cliques 1\/2/);
});
test('overview alerts coexist, user text is escaped and absent metrics never become zero',()=>{
  const s=setup([row('<Oferta>','ativa',null,{rejected:true,policyLimitation:'Restrição "política"',adjustment:{manualSales:2},numberReuse:{group:'1'},profit:-30})]);
  s.controller.render();
  const html=s.get('#totalsBody').innerHTML;
  assert.match(html,/Ativa · Reprovada · Renumerar/);assert.match(html,/2 vendas provisórias/);assert.match(html,/Limitada pela política/);
  assert.match(html,/policy-limited-row/);assert.match(html,/&lt;Oferta&gt;/);assert.match(html,/&quot;política&quot;/);
  assert.doesNotMatch(html,/<Oferta>/);assert.match(html,/<td data-column="current" class="num">—<\/td>/);assert.match(html,/num negative">BRL -30.00/);
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
test('overview sale ROI photographs stay independent of period, sort numerically and keep unavailable last',()=>{
  const rows=[row('First','ativa',100,{saleHistory:[{snapshot:{roi_percent:0,sale_date:'2026-09-30',investment_brl:100,revenue_brl:100}},{snapshot:{roi_percent:50}}]}),row('Missing','ativa',50),row('Loss','ativa',10,{saleHistory:[{snapshot:{roi_percent:-50}}]})],s=setup(rows);
  for(const mode of ['consolidated','d1','d0']){s.state.totalsMode=mode;s.controller.render();assert.match(s.get('#totalsHead').innerHTML,/ROI 1ª venda/);assert.match(s.get('#totalsHead').innerHTML,/ROI 2ª venda/);assert.doesNotMatch(s.get('#totalsHead').innerHTML,/ROI na [12]ª venda/);assert.match(s.get('#totalsBody').innerHTML,/data-column="saleRoiFirst" class="num "[^>]*>0%/);assert.match(s.get('#totalsBody').innerHTML,/data-column="saleRoiSecond" class="num positive"[^>]*>50%/)}
  for(const sortDir of ['asc','desc'])assert.equal(domain.sortRows(rows,{sortKey:'saleRoiFirst',sortDir},()=>null).at(-1).identity.name,'Missing');
});
test('column resizing saves once on release, survives periods, filters, hidden columns and remount without touching data',()=>{
  const values=new Map(),writes=[],preferences={getItem:key=>values.get(key),setItem:(key,value)=>{writes.push(key);values.set(key,value)},removeItem:key=>values.delete(key)},s=setup([row('Oferta','ativa',10)],preferences),before=JSON.stringify(s.snapshot);
  s.setList('.overview-column-resizer',[{resizeColumn:'campaign'}]);s.setList('#totalsHead th[data-column]',[{column:'campaign'},{column:'current'}]);
  s.root.classList=s.get('#rootClassFixture').classList;
  const handle=s.root.querySelectorAll('.overview-column-resizer')[0],cells=s.root.querySelectorAll('#totalsHead th[data-column]');
  let captured=null;handle.setPointerCapture=id=>captured=id;handle.hasPointerCapture=id=>captured===id;handle.releasePointerCapture=()=>captured=null;
  cells[0].getBoundingClientRect=()=>({width:350});cells[1].getBoundingClientRect=()=>({width:110});
  const event=x=>({button:0,pointerId:1,clientX:x,preventDefault(){},stopPropagation(){}});
  s.controller.render();assert.equal(writes.length,0);
  const sort=s.state.sortKey,direction=s.state.sortDir;
  handle.onpointerdown(event(100));handle.onpointermove(event(180));
  assert.equal(cells[0].getAttribute('style'),'width:430px');assert.equal(cells[1].getAttribute('style'),'width:110px');assert.equal(writes.length,0);
  handle.onpointerup(event(180));assert.equal(captured,null);assert.equal(writes.length,1);
  assert.equal(JSON.parse(values.get('hub:overview:column-widths:v1')).campaign,430);
  handle.onclick(event(180));assert.equal(s.state.sortKey,sort);assert.equal(s.state.sortDir,direction);
  s.get('#totalsD1').onclick();s.get('#totalsD0').onclick();s.get('#totalsConsolidated').onclick();s.get('#campaignStatusFilter').onchange({target:{value:'all'}});
  assert.match(s.get('#totalsHead').innerHTML,/data-column="campaign" style="width:430px"/);
  s.setList('[data-column-choice]',[{columnChoice:'current'}]);s.controller.render();const choice=s.root.querySelectorAll('[data-column-choice]')[0];choice.checked=false;choice.onchange();choice.checked=true;choice.onchange();
  assert.match(s.get('#totalsHead').innerHTML,/data-column="current" style="width:110px"/);
  s.get('#overviewColumnsReset').onclick();assert.equal(JSON.parse(values.get('hub:overview:column-widths:v1')).campaign,430,'restaurar visibilidade não restaura larguras');
  const next=setup([],preferences);next.controller.render();assert.match(next.get('#totalsHead').innerHTML,/data-column="campaign" style="width:430px"/);
  assert.equal(JSON.stringify(s.snapshot),before);assert.deepEqual(s.calls,[]);
});

test('column resizing handles cancellation, clamps widths, supports keyboard and degrades safely when storage is blocked',()=>{
  const values=new Map([['hub:overview:column-widths:v1',JSON.stringify({campaign:400,date:1,current:99999,roi:'bad',alien:999})]]),writes=[];
  const preferences={getItem:key=>values.get(key),setItem:(key,value)=>{writes.push(key);values.set(key,value)}};
  const s=setup([],preferences);s.setList('.overview-column-resizer',[{resizeColumn:'campaign'}]);const handle=s.root.querySelectorAll('.overview-column-resizer')[0];
  s.root.classList=s.get('#rootClassFixture').classList;
  let captured=null;handle.setPointerCapture=id=>captured=id;handle.hasPointerCapture=id=>captured===id;handle.releasePointerCapture=()=>captured=null;
  const event=x=>({button:0,pointerId:1,clientX:x,preventDefault(){},stopPropagation(){}});
  s.controller.render();assert.match(s.get('#totalsHead').innerHTML,/data-column="date" style="width:52px"/);assert.match(s.get('#totalsHead').innerHTML,/data-column="current" style="width:1200px"/);
  handle.onpointerdown(event(100));handle.onpointermove(event(-900));assert.equal(handle.getAttribute('aria-valuenow'),'160');handle.onpointercancel();assert.equal(handle.getAttribute('aria-valuenow'),'400');assert.equal(writes.length,0);
  handle.onpointerdown(event(100));handle.onpointermove(event(130));s.controller.render();assert.equal(handle.getAttribute('aria-valuenow'),'400');assert.equal(writes.length,0,'rerender cancels a gesture safely');
  handle.onpointerdown(event(100));handle.onpointerup(event(100));assert.equal(writes.length,0,'a click without movement never writes');
  handle.onkeydown({...event(),key:'ArrowRight'});assert.equal(handle.getAttribute('aria-valuenow'),'410');assert.equal(writes.length,1);
  handle.onpointerdown(event(100));handle.onpointermove(event(10000));handle.onpointerup(event(10000));assert.equal(handle.getAttribute('aria-valuenow'),'1200');
  const broken=setup([],{getItem:()=>'{invalid',setItem(){throw Error('blocked')}});broken.setList('.overview-column-resizer',[{resizeColumn:'campaign'}]);broken.controller.render();broken.root.querySelectorAll('.overview-column-resizer')[0].onkeydown({...event(),key:'ArrowLeft'});
  assert.match(broken.get('#overviewWidthsMessage').textContent,/nesta sessão/);broken.controller.render();assert.match(broken.get('#totalsHead').innerHTML,/data-column="campaign" style="width:320px"/);
  assert.deepEqual(broken.calls,[]);
});

test('column choices persist locally, keep campaign identifiable and maintain visible sort across periods and remount',()=>{
  const values=new Map(),preferences={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},s=setup([row('Oferta','ativa',10)],preferences);
  s.setList('[data-column-choice]',[{columnChoice:'current'},{columnChoice:'saleRoiSecond'}]);s.controller.render();
  for(const input of s.root.querySelectorAll('[data-column-choice]')){input.checked=false;input.onchange()}
  assert.equal(s.state.sortKey,'campaign');assert.doesNotMatch(s.get('#totalsHead').innerHTML,/data-column="current"|data-column="saleRoiSecond"/);
  assert.match(s.get('#totalsBody').innerHTML,/data-column="campaign"[^>]*title="Oferta"/);assert.match(s.get('#totalsBody').innerHTML,/data-column="saleRoiFirst"/);
  s.get('#totalsD0').onclick();assert.doesNotMatch(s.get('#totalsHead').innerHTML,/data-column="current"/);
  const next=setup([row('Oferta','ativa',10)],preferences);next.controller.render();assert.doesNotMatch(next.get('#totalsHead').innerHTML,/data-column="current"/);
  next.get('#overviewColumnsReset').onclick();assert.match(next.get('#totalsHead').innerHTML,/data-column="current"/);assert.equal(values.size,0);
  const broken=setup([], {getItem:()=>'{invalid',setItem(){throw Error('blocked')}});broken.controller.render();assert.equal((broken.get('#totalsHead').innerHTML.match(/<th /g)||[]).length,15);
});
