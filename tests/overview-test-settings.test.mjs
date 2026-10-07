import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const panel=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const overviewCss=await readFile(new URL('../src/overview/overview.css',import.meta.url),'utf8');
const tableEditCss=await readFile(new URL('../src/table-edit-actions.css',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone});
for(const path of ['database.js','overview-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+path,import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain,database=context.window.CampaignDatabase;
const input={commission:60,commissionCurrency:'USD',exchangeRate:5,conversions:0,sales:0,investment:100};
const budget=(extra={})=>domain.deriveTestBudget({...input,...extra});
const json=value=>JSON.parse(JSON.stringify(value));

test('Editar usa a cor do ROI mínimo no canto superior direito sem remover foco ou cabeçalho fixo',()=>{
  assert.match(overviewCss,/\.test-budget-roi-link\{[^}]*color:#88a5c2/);
  assert.match(overviewCss,/\.test-budget-detail\{[^}]*color:#88a5c2/);
  assert.match(tableEditCss,/\.hub-corner-edit\{[^}]*position:absolute;top:var\(--hub-corner-edit-top,1px\);right:var\(--hub-corner-edit-right,2px\);[^}]*margin:0;/);
  assert.match(overviewCss,/th\[data-column="limit"\] \.overview-test-rules-edit\{right:12px\}/,'Editar precisa ficar afastado da alça de redimensionamento no canto do cabeçalho');
  assert.match(overviewCss,/th \.sort-btn\{position:relative;min-height:50px;padding-block:6px;/);
  assert.doesNotMatch(overviewCss,/th\[data-column="remaining"\] \.sort-btn\{/,'Valor restante deve herdar o mesmo alinhamento vertical dos outros títulos');
  assert.match(overviewCss,/\.test-budget-roi-link:focus-visible\{outline:2px solid var\(--cyan\)/);
  assert.match(overviewCss,/\.test-budget-roi-link:hover\{[^}]*color:#b6d4f2/);
  assert.match(panel,/th\{position:sticky;top:0;/);
});

test('CPA do nome >=90 aplica metade da comissão apenas com zero vendas confirmado',()=>{
  const titleSource=panel.match(/    function cpaTitleInfo\(name\)\{[^\n]+/)[0];
  vm.runInContext(`const ISO_COUNTRY_CODES=[];${titleSource}\nglobalThis.title=cpaTitleInfo;`,context);
  for(const percent of [90,91,99.5,100]){
    const cpa=context.title(`Produto exemplo 01 (GM-BB-US) ${String(percent).replace('.',',')}% - U$ 60`);
    const result=budget({cpaPercent:cpa.range});
    assert.equal(result.cpaPercent,percent);assert.equal(result.limit,150);assert.equal(result.remaining,50);assert.equal(result.commissionTestPercent,50);
  }
  for(const percent of [89.99,70,null,undefined])assert.equal(budget({cpaPercent:percent}).limit,300);
  assert.equal(budget({cpaPercent:90,conversions:null}),null,'ausência de vendas não é zero confirmado');
  assert.equal(budget({cpaPercent:90,commission:null}),null);
  assert.equal(budget({cpaPercent:90,commissionCurrency:'EUR'}),null);
  assert.equal(budget({cpaPercent:91,investment:null}).remaining,null);
  for(const sale of [{conversions:1},{sales:1},{conversions:0.98}]){
    const actual=budget({...sale,cpaPercent:91,commissionTestPercentOverride:30,revenue:300});
    const previous=budget({...sale,revenue:300});
    assert.deepEqual(json(actual),json(previous),'venda oficial, fracionária ou provisória retorna à regra anterior de ROI');
    assert.equal(actual.commissionTestPercent,undefined);
  }
  const custom={cpaMinimumPercent:85,commissionPercent:40,roiBySales:{1:5,2:15,3:25,4:35}};
  assert.equal(budget({cpaPercent:84.99,testLimitSettings:custom}).limit,300);
  const threshold=budget({cpaPercent:85,testLimitSettings:custom});assert.equal(threshold.limit,120);assert.equal(threshold.commissionTestPercent,40);assert.equal(threshold.cpaMinimumPercent,85);
  for(const [sales,minimumRoi] of [[1,5],[2,15],[3,25],[4,35],[7,35]])assert.equal(budget({sales,conversions:sales,revenue:300,testLimitSettings:custom}).minimumRoi,minimumRoi);
  assert.equal(budget({sales:2,conversions:2,revenue:300,minimumRoiOverride:45,testLimitSettings:custom}).minimumRoi,45,'ajuste específico da campanha prevalece');
  assert.deepEqual(json(domain.testLimitSettings()),json({cpaMinimumPercent:90,commissionPercent:50,roiBySales:{1:10,2:20,3:30,4:30}}));
});

test('percentual e valor inicial sincronizam em BRL sem conversão dupla',()=>{
  assert.equal(budget({cpaPercent:90,commissionTestPercentOverride:25}).limit,75);
  assert.equal(domain.testLimitForCommission(300,'40,5'),121.5);
  assert.equal(domain.percentForCommissionLimit(300,'R$ 120,00'),40);
  const percent=domain.percentForCommissionLimit(234.6,'100,00');
  assert.equal(domain.testLimitForCommission(234.6,percent),100,'sincronização conserva os centavos');
  assert.equal(domain.parseCommissionTestPercent(125),125,'percentual personalizado não tem teto artificial');
  for(const invalid of ['', '50%', '-1','0','Infinity'])assert.throws(()=>domain.parseCommissionTestPercent(invalid));
  assert.throws(()=>domain.testLimitForCommission(null,50));
});

test('configurações são aditivas, por ID exato, preservadas no backup e sem mutação',()=>{
  const original=database.create();original.campanhas=[{id:'a',nome_mcc:'Produto A 90%'},{id:'b',nome_mcc:'Produto B 91%'}];
  original.diario=[{campanha_id:'a',data:'2026-10-01',celulas:{O:{value:100}}}];original.outra_configuracao={preservar:true};
  original.regras_limite_teste={cpaMinimumPercent:85,commissionPercent:45,roiBySales:{1:5,2:15,3:25,4:35}};
  const before=JSON.stringify(original);
  const percentBase=database.setCampaignCommissionTestPercent(original,'a',35);
  const alertBase=database.setRemainingAlertThreshold(percentBase,80);
  assert.equal(JSON.stringify(original),before);
  assert.equal(alertBase.campanhas[0].limite_teste_comissao_pct,35);assert.equal(alertBase.campanhas[1].limite_teste_comissao_pct,undefined);
  assert.deepEqual(json(alertBase.diario),json(original.diario));assert.deepEqual(json(alertBase.outra_configuracao),{preservar:true});
  const restored=database.normalize(JSON.parse(JSON.stringify(alertBase)));
  assert.equal(restored.valor_restante_alerta_minimo,80);assert.equal(restored.campanhas[0].limite_teste_comissao_pct,35);assert.deepEqual(json(restored.regras_limite_teste),json(original.regras_limite_teste));
  assert.equal(database.setRemainingAlertThreshold(alertBase,0).valor_restante_alerta_minimo,0);
  assert.throws(()=>database.setCampaignCommissionTestPercent(original,'ausente',35),/não encontrada/);
  for(const invalid of [NaN,Infinity,-1,'30',null])assert.throws(()=>database.setRemainingAlertThreshold(original,invalid));
  for(const invalid of [NaN,Infinity,0,-1,'30',null])assert.throws(()=>database.setCampaignCommissionTestPercent(original,'a',invalid));
});

function setup({sales=0,cpa=91,minimum=undefined,yellowMinimum=undefined,remaining=50,actionOverrides={}}={}){
  const dom=createRoot(),calls=[],state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'all'};
  const b=budget({cpaPercent:cpa,sales,revenue:sales?300:0});
  const snapshot={remainingAlertMinimum:minimum,remainingAlertYellowMinimum:yellowMinimum,activeCount:1,pausedCount:0,dates:{d0:'2026-10-06'},d1Totals:[],referenceDate:'2026-10-06',rows:[{
    c:{nome_campanha_exato:'Produto exemplo 91%',_status:'ativa'},campaignId:'a',identity:{name:'Produto exemplo 91%',dateLabel:'01/10',dateSort:'2026-10-01'},
    totals:{investment:100},d0Totals:{investment:100},budget:{...b,remaining},testLimit:{value:b.limit},testRemaining:{value:remaining},zeroDays:0,roi:null,profit:null
  }]};
  dom.setList('.test-budget-roi-link',[{campaignId:'a',currentPercent:'50',currentLimit:'150',commissionBrl:'300'},{}]);
  const link=dom.root.querySelectorAll('.test-budget-roi-link')[0],rulesLink=dom.root.querySelectorAll('.test-budget-roi-link')[1];link.classList.add('test-budget-commission-link');rulesLink.classList.add('overview-test-rules-edit');
  const controller=context.window.OverviewView.mount({root:dom.root,state,getSnapshot:()=>snapshot,domain,format,actions:{
    editCommissionTestPercent:async(...args)=>calls.push(['commission',...args]),editRemainingAlert:async(...args)=>calls.push(['remaining',...args]),editTestLimitSettings:async(...args)=>calls.push(['test-rules',...args]),...actionOverrides
  }});
  controller.render();return{...dom,calls,snapshot,state,controller,link,rulesLink};
}

test('link CPA aparece só sem vendas e mantém ROI mínimo após venda nos três períodos',()=>{
  const ui=setup();
  for(const mode of ['consolidated','d1','d0']){ui.state.totalsMode=mode;ui.controller.render();assert.match(ui.get('#totalsBody').innerHTML,/CPA 91% · até 50% \/ comissão/)}
  const sold=setup({sales:1});assert.match(sold.get('#totalsBody').innerHTML,/ROI mínimo 10% · 1 venda/);assert.doesNotMatch(sold.get('#totalsBody').innerHTML,/teste até .* da comissão/);
  assert.doesNotMatch(setup({cpa:85}).get('#totalsBody').innerHTML,/test-budget-commission-link/);
  assert.deepEqual(ui.calls,[],'renderizar não salva');
  assert.match(ui.get('#totalsHead').innerHTML,/data-column="limit"[^]*overview-test-rules-edit hub-corner-edit[^]*Editar/);
});

test('Editar no cabeçalho configura CPA, percentual padrão e quatro faixas de ROI sem alterar campanha até confirmar',async()=>{
  const ui=setup(),event={preventDefault(){},stopPropagation(){}};ui.rulesLink.onclick(event);
  assert.equal(ui.get('#overviewTestRulesDialog').open,true);
  assert.equal(ui.get('#overviewTestCpaThreshold').value,'90,00');assert.equal(ui.get('#overviewTestCommissionPercent').value,'50,00');
  assert.deepEqual([1,2,3,4].map(sales=>ui.get(`#overviewTestRoi${['','One','Two','Three','Four'][sales]}`).value),['10,00','20,00','30,00','30,00']);
  ui.get('#overviewTestCpaThreshold').value='85';ui.get('#overviewTestCommissionPercent').value='45';
  ui.get('#overviewTestRoiOne').value='5';ui.get('#overviewTestRoiTwo').value='15';ui.get('#overviewTestRoiThree').value='25';ui.get('#overviewTestRoiFour').value='35';
  ui.get('#overviewTestRulesCancel').onclick();assert.deepEqual(ui.calls,[],'cancelar não salva');
  ui.rulesLink.onclick(event);ui.get('#overviewTestCpaThreshold').value='85';ui.get('#overviewTestCommissionPercent').value='45';
  ui.get('#overviewTestRoiOne').value='5';ui.get('#overviewTestRoiTwo').value='15';ui.get('#overviewTestRoiThree').value='25';ui.get('#overviewTestRoiFour').value='35';
  await ui.get('#overviewTestRulesForm').onsubmit(event);
  assert.deepEqual(json(ui.calls),[['test-rules',{cpaMinimumPercent:85,commissionPercent:45,roiBySales:{1:5,2:15,3:25,4:35}}]]);assert.equal(ui.get('#overviewTestRulesDialog').open,false);
  ui.rulesLink.onclick(event);ui.get('#overviewTestRoiFour').value='-100';await ui.get('#overviewTestRulesForm').onsubmit(event);
  assert.equal(ui.calls.length,1);assert.equal(ui.get('#overviewTestRulesDialog').open,true);assert.notEqual(ui.get('#overviewTestRulesError').textContent,'');
});

test('editor da comissão sincroniza valor/percentual e salva somente em OK',async()=>{
  const ui=setup(),event={preventDefault(){},stopPropagation(){}};ui.link.onclick(event);
  assert.equal(ui.get('#commissionTestDialog').open,true);assert.equal(ui.get('#commissionTestLimit').value,'150,00');assert.equal(ui.get('#commissionTestPercent').value,'50');
  ui.get('#commissionTestPercent').value='25';ui.get('#commissionTestPercent').oninput();assert.equal(ui.get('#commissionTestLimit').value,'75,00');
  ui.get('#commissionTestLimit').value='90,00';ui.get('#commissionTestLimit').oninput();assert.equal(ui.get('#commissionTestPercent').value,'30');assert.deepEqual(ui.calls,[]);
  await ui.get('#commissionTestForm').onsubmit(event);assert.deepEqual(ui.calls,[['commission','a',30]]);assert.equal(ui.get('#commissionTestDialog').open,false);
  ui.link.onclick(event);ui.get('#commissionTestPercent').value='-1';ui.get('#commissionTestPercent').oninput();await ui.get('#commissionTestForm').onsubmit(event);
  assert.equal(ui.calls.length,1);assert.equal(ui.get('#commissionTestDialog').open,true);assert.notEqual(ui.get('#commissionTestError').textContent,'');
  ui.get('#commissionTestCancel').onclick();assert.equal(ui.get('#commissionTestDialog').open,false);
});

test('Editar no cabeçalho configura alerta estrito por todos os períodos e aceita zero',async()=>{
  assert.equal(domain.remainingAlertThreshold(undefined),140);assert.equal(domain.remainingAlertThreshold(null),140);assert.equal(domain.remainingAlertThreshold(-1),140);assert.equal(domain.remainingAlertThreshold(0),0);
  assert.equal(domain.parseRemainingAlert('R$ 120,50'),120.5);assert.equal(domain.parseRemainingAlert('0'),0);
  for(const invalid of ['', '-1', 'abc','Infinity'])assert.throws(()=>domain.parseRemainingAlert(invalid));
  const ui=setup({minimum:50});
  assert.match(ui.get('#totalsHead').innerHTML,/Editar valor mínimo de alerta.*Editar/);
  ui.link.classList.remove('test-budget-commission-link');ui.link.classList.add('overview-remaining-edit');ui.link.onclick({preventDefault(){},stopPropagation(){}});
  assert.equal(ui.get('#remainingAlertMinimum').value,'50,00');ui.get('#remainingAlertMinimum').value='0';
  await ui.get('#remainingAlertForm').onsubmit({preventDefault(){}});assert.deepEqual(ui.calls,[['remaining',0,null]]);
  for(const mode of ['consolidated','d1','d0']){ui.state.totalsMode=mode;ui.controller.render();assert.doesNotMatch(ui.get('#totalsBody').innerHTML,/data-column="remaining" class="num negative"/);ui.snapshot.remainingAlertMinimum=51;ui.controller.render();assert.match(ui.get('#totalsBody').innerHTML,/data-column="remaining" class="num negative"/);ui.snapshot.remainingAlertMinimum=50}
});

test('falha ao salvar mantém editor aberto, mostra erro e permite tentar novamente',async()=>{
  const ui=setup({actionOverrides:{editCommissionTestPercent:async()=>{throw Error('Falha sintética');},editRemainingAlert:async()=>{throw Error('Falha sintética');}}});
  const event={preventDefault(){},stopPropagation(){}};ui.link.onclick(event);await ui.get('#commissionTestForm').onsubmit(event);
  assert.equal(ui.get('#commissionTestDialog').open,true);assert.equal(ui.get('#commissionTestError').textContent,'Falha sintética');assert.equal(ui.get('#commissionTestForm').querySelector('[type="submit"]').disabled,false);
  ui.link.classList.remove('test-budget-commission-link');ui.link.classList.add('overview-remaining-edit');ui.link.onclick(event);await ui.get('#remainingAlertForm').onsubmit(event);
  assert.equal(ui.get('#remainingAlertDialog').open,true);assert.equal(ui.get('#remainingAlertError').textContent,'Falha sintética');
});

test('amarelo opcional respeita limites estritos e vermelho prevalece em qualquer ordem',()=>{
  for(const [value,tone] of [[250,''],[200,''],[199.99,'remaining-warning'],[150,'remaining-warning'],[100,'remaining-warning'],[99.99,'negative'],[0,'negative'],[-1,'negative'],[null,''],[undefined,''],['',''],[NaN,''],[Infinity,'']]){
    assert.equal(domain.remainingAlertTone(value,100,200),tone,String(value));
  }
  assert.equal(domain.remainingAlertTone(150,100,undefined),'');
  assert.equal(domain.remainingAlertTone(50,100,50),'negative','limites invertidos não retiram prioridade do vermelho');
  assert.equal(domain.remainingAlertTone(50,100,100),'negative');
  assert.equal(domain.remainingAlertTone(-1,0,0),'negative');assert.equal(domain.remainingAlertTone(0,0,0),'');
  for(const value of [undefined,null,'',-1,NaN,Infinity])assert.equal(domain.remainingWarningThreshold(value),null);
  assert.equal(domain.remainingWarningThreshold(0),0);
  const ui=setup({minimum:100,yellowMinimum:200,remaining:150});
  for(const mode of ['consolidated','d1','d0']){
    ui.state.totalsMode=mode;ui.controller.render();assert.match(ui.get('#totalsBody').innerHTML,/data-column="remaining" class="num remaining-warning"/);
    ui.snapshot.rows[0].budget.remaining=99;ui.snapshot.rows[0].testRemaining.value=99;ui.controller.render();
    assert.match(ui.get('#totalsBody').innerHTML,/data-column="remaining" class="num negative"/);assert.doesNotMatch(ui.get('#totalsBody').innerHTML,/remaining-warning/);
    ui.snapshot.rows[0].budget.remaining=150;ui.snapshot.rows[0].testRemaining.value=150;
  }
  ui.snapshot.rows[0].budget=null;ui.snapshot.rows[0].testRemaining={value:null};ui.controller.render();
  assert.match(ui.get('#totalsBody').innerHTML,/data-column="remaining" class="num " title="" data-remaining-value="">—/);assert.deepEqual(ui.calls,[]);
});

test('Todas, Pausadas e Histórico conservam alertas do saldo nas linhas antigas em cada período',()=>{
  const ui=setup({minimum:100,yellowMinimum:200,remaining:50});
  ui.snapshot.rows[0].c._status='pausada';
  const before=JSON.stringify(ui.snapshot);
  for(const filter of ['all','paused','history']){
    ui.state.campaignStatusFilter=filter;
    for(const mode of ['consolidated','d1','d0']){
      ui.state.totalsMode=mode;
      for(const [remaining,tone] of [[50,'negative'],[-10,'negative'],[100,'remaining-warning'],[150,'remaining-warning'],[200,'']]){
        ui.snapshot.rows[0].budget.remaining=remaining;ui.snapshot.rows[0].testRemaining.value=remaining;
        ui.controller.render();
        const html=ui.get('#totalsBody').innerHTML;
        assert.match(html,/<tr class="paused-row"/);
        assert.ok(html.includes(`data-column="remaining" class="num ${tone}"`),`${filter}/${mode}/${remaining}`);
      }
    }
  }
  ui.snapshot.rows[0].budget.remaining=50;ui.snapshot.rows[0].testRemaining.value=50;
  assert.equal(JSON.stringify(ui.snapshot),before);assert.deepEqual(ui.calls,[]);
  assert.match(overviewCss,/#totalsView \.totals-table tbody tr td\[data-column="remaining"\]\.negative\{color:var\(--overview-alert-red\)\}/,'o vermelho precisa superar a especificidade da cor de linhas pausadas/alerta');
});

test('os dois alertas são gravados juntos, preservam backups antigos e rejeitam amarelo inválido',()=>{
  const original=database.create(),before=JSON.stringify(original);
  const saved=database.setRemainingAlertThreshold(original,100,200);
  assert.equal(JSON.stringify(original),before);
  const restored=database.normalize(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.valor_restante_alerta_minimo,100);assert.equal(restored.valor_restante_alerta_amarelo_minimo,200);
  assert.equal(database.setRemainingAlertThreshold(saved,80).valor_restante_alerta_amarelo_minimo,200,'chamadas antigas preservam amarelo existente');
  assert.equal(database.setRemainingAlertThreshold(saved,80,null).valor_restante_alerta_amarelo_minimo,null);
  assert.equal(database.setRemainingAlertThreshold(saved,0,0).valor_restante_alerta_amarelo_minimo,0);
  for(const invalid of [NaN,Infinity,-1,'200'])assert.throws(()=>database.setRemainingAlertThreshold(saved,100,invalid));
  assert.equal(JSON.stringify(original),before);
});

test('editor restaura as duas faixas, cancela sem salvar, valida e permite desativar amarelo',async()=>{
  const ui=setup({minimum:100,yellowMinimum:200}),event={preventDefault(){},stopPropagation(){}};
  ui.link.classList.remove('test-budget-commission-link');ui.link.classList.add('overview-remaining-edit');ui.link.onclick(event);
  assert.equal(ui.get('#remainingAlertMinimum').value,'100,00');assert.equal(ui.get('#remainingAlertYellowMinimum').value,'200,00');
  ui.get('#remainingAlertYellowMinimum').value='250,50';ui.get('#remainingAlertCancel').onclick();assert.deepEqual(ui.calls,[]);
  ui.link.onclick(event);assert.equal(ui.get('#remainingAlertYellowMinimum').value,'200,00');
  ui.get('#remainingAlertYellowMinimum').value='-1';await ui.get('#remainingAlertForm').onsubmit(event);
  assert.deepEqual(ui.calls,[]);assert.equal(ui.get('#remainingAlertDialog').open,true);assert.notEqual(ui.get('#remainingAlertError').textContent,'');
  ui.get('#remainingAlertYellowMinimum').value='250,50';await ui.get('#remainingAlertForm').onsubmit(event);
  assert.deepEqual(ui.calls,[['remaining',100,250.5]]);
  ui.link.onclick(event);ui.get('#remainingAlertYellowMinimum').value='';await ui.get('#remainingAlertForm').onsubmit(event);
  assert.deepEqual(ui.calls[1],['remaining',100,null]);
});

test('editor mostra amostras das mesmas cores da tabela e prioridade acessível',async()=>{
  const template=await readFile(new URL('../src/overview/template.html',import.meta.url),'utf8');
  assert.match(template,/overview-alert-swatch-red" aria-hidden="true"/);assert.match(template,/overview-alert-swatch-yellow" aria-hidden="true"/);
  assert.match(template,/id="remainingAlertRedPriority">Prioridade 1 · sobrepõe o amarelo/);
  assert.match(template,/id="remainingAlertYellowPriority">Prioridade 2 · somente fora do vermelho/);
  assert.match(template,/aria-describedby="remainingAlertYellowPriority remainingAlertHelp remainingAlertError"/);
  assert.match(overviewCss,/td.remaining-warning\{color:var\(--overview-remaining-yellow\)\}/);
  assert.match(overviewCss,/overview-alert-swatch-yellow\{background:var\(--overview-remaining-yellow\)\}/);
  assert.match(overviewCss,/overview-alert-swatch-red\{background:var\(--red\)\}/);
});

test('adaptador grava explicitamente e restaura estado anterior em falha sem tocar banco real',async()=>{
  const functions=['saveOverviewTestSetting','editCommissionTestPercent','editRemainingAlert'].map(name=>panel.match(new RegExp(`    async function ${name}\\([^\\n]+`))[0]).join('\n');
  const base=database.create();base.campanhas=[{id:'a',nome_mcc:'Produto exemplo 91%'}];
  let fail=false,writes=0,renders=0,notifications=0;const messages=[];
  const adapter={state:{database:base},CampaignDatabase:database,derivedCache:{},persistLocalBase:async()=>{writes++;if(fail)throw Error('Não salvou');},renderTotals:()=>{renders++;},announceBaseUpdated:()=>{notifications++;},toast:()=>{},fmtPct:format.pct,fmtMoney:format.money,baseChannel:{postMessage:message=>messages.push(json(message))},getOverviewAlertStorage:async()=>({saveRemainingAlerts:async values=>{if(fail)throw Error('Não salvou');return values}})};
  vm.runInNewContext(functions+'\nglobalThis.editCommission=editCommissionTestPercent;globalThis.editAlert=editRemainingAlert;',adapter);
  await adapter.editCommission('a',35);assert.equal(adapter.state.database.campanhas[0].limite_teste_comissao_pct,35);assert.equal(writes,1);assert.equal(renders,1);
  const cache=adapter.derivedCache,savedAt=adapter.state.database.atualizado_em;
  await adapter.editAlert(75,200);assert.equal(adapter.state.database.valor_restante_alerta_minimo,75);assert.equal(adapter.state.database.valor_restante_alerta_amarelo_minimo,200);
  assert.equal(notifications,1);assert.equal(writes,1);assert.equal(renders,1);assert.equal(adapter.derivedCache,cache);assert.equal(adapter.state.database.atualizado_em,savedAt);assert.deepEqual(messages,[{type:'overview-alerts-updated'}]);
  const saved=adapter.state.database;fail=true;await assert.rejects(()=>adapter.editAlert(30,150),/Não salvou/);assert.equal(adapter.state.database,saved);assert.equal(saved.valor_restante_alerta_minimo,75);assert.equal(saved.valor_restante_alerta_amarelo_minimo,200);assert.equal(notifications,1);assert.equal(messages.length,1);
});

test('salvar regras do limite não usa atualização operacional e propaga somente preferências',async()=>{
  const source=panel.match(/    async function editTestLimitSettings\([^\n]+/)[0],base=database.create(),settings={cpaMinimumPercent:85,commissionPercent:45,roiBySales:{1:5,2:15,3:25,4:35}};
  base.atualizado_em='2026-10-06T10:00:00Z';let renders=0;const messages=[];
  const adapter={state:{database:base},derivedCache:{},renderTotals:()=>renders++,baseChannel:{postMessage:message=>messages.push(json(message))},getOverviewTestRuleStorage:async()=>({saveTestLimitSettings:async()=>settings})};
  vm.runInNewContext(source+'\nglobalThis.editRules=editTestLimitSettings;',adapter);
  const result=await adapter.editRules(settings);
  assert.deepEqual(json(result),settings);assert.deepEqual(json(adapter.state.database.regras_limite_teste),settings);assert.equal(adapter.state.database.atualizado_em,'2026-10-06T10:00:00Z');assert.equal(adapter.derivedCache,null);assert.equal(renders,1);assert.deepEqual(messages,[{type:'overview-test-rules-updated'}]);
  assert.doesNotMatch(source,/persistLocalBase|announceBaseUpdated|toast\(/);
  const failedBase=adapter.state.database;adapter.getOverviewTestRuleStorage=async()=>({saveTestLimitSettings:async()=>{throw Error('Falha sintética')}});await assert.rejects(adapter.editRules(settings),/Falha sintética/);assert.equal(adapter.state.database,failedBase);assert.equal(renders,1);assert.equal(messages.length,1);
});

test('salvar cores atualiza só as células, preserva o relatório e aguarda confirmação sem envio duplicado',async()=>{
  let finish,calls=0;const ui=setup({minimum:100,yellowMinimum:200,actionOverrides:{editRemainingAlert:()=>{calls++;return new Promise(resolve=>{finish=resolve})}}});
  const selector='#totalsBody td[data-column="remaining"]';ui.setList(selector,[{remainingValue:'50'},{remainingValue:'150'},{remainingValue:'250'},{remainingValue:''}]);
  const cells=ui.root.querySelectorAll(selector),body=ui.get('#totalsBody').innerHTML,kpis=ui.get('#kpis').innerHTML;
  ui.setList('.overview-remaining-edit',[{}]);const edit=ui.root.querySelectorAll('.overview-remaining-edit')[0];
  ui.link.classList.remove('test-budget-commission-link');ui.link.classList.add('overview-remaining-edit');ui.link.onclick({preventDefault(){},stopPropagation(){}});
  const event={preventDefault(){}},pending=ui.get('#remainingAlertForm').onsubmit(event);
  assert.equal(ui.get('#remainingAlertDialog').open,true);assert.equal(ui.get('#remainingAlertForm').querySelector('[type="submit"]').textContent,'Salvando…');
  await ui.get('#remainingAlertForm').onsubmit(event);assert.equal(calls,1);finish();await pending;
  assert.equal(ui.get('#remainingAlertDialog').open,false);assert.equal(ui.get('#totalsBody').innerHTML,body);assert.equal(ui.get('#kpis').innerHTML,kpis);
  assert.equal(cells[0].classList.contains('negative'),true);assert.equal(cells[0].classList.contains('remaining-warning'),false);
  assert.equal(cells[1].classList.contains('remaining-warning'),true);assert.equal(cells[1].classList.contains('negative'),false);
  for(const cell of cells.slice(2)){assert.equal(cell.classList.contains('negative'),false);assert.equal(cell.classList.contains('remaining-warning'),false)}
  assert.match(edit.getAttribute('title'),/amarelo abaixo de BRL 200.00/);
  ui.controller.refreshRemainingAlerts({minimum:100,yellowMinimum:null});assert.equal(cells[1].classList.contains('remaining-warning'),false);
});

test('a regra neutra exclui amarelo e a atualização entre abas não recarrega MCC nem sincroniza Faturamento',()=>{
  assert.match(overviewCss,/td:not\(\.positive\):not\(\.negative\):not\(\.remaining-warning\)/);
  assert.match(overviewCss,/tbody tr td.remaining-warning\{color:var\(--overview-remaining-yellow\)\}/);
  const receiver=panel.slice(panel.indexOf("if(event.data?.type==='overview-alerts-updated')"),panel.indexOf("const fromMcc=event.data"));
  assert.match(receiver,/loadRemainingAlerts\(\)/);assert.match(receiver,/refreshRemainingAlerts\(settings\)/);
  assert.doesNotMatch(receiver,/restoreLocalBase|syncMccDiaryRowsToBilling|render\(\)|Base atualizada pelo/);
  const ruleReceiver=panel.slice(panel.indexOf("if(event.data?.type==='overview-test-rules-updated')"),panel.indexOf('const fromMcc=event.data'));
  assert.match(ruleReceiver,/loadTestLimitSettings\(\)/);assert.match(ruleReceiver,/derivedCache=null;renderTotals\(\)/);
  assert.doesNotMatch(ruleReceiver,/restoreLocalBase|syncMccDiaryRowsToBilling|announceBaseUpdated|Base atualizada pelo/);
});
