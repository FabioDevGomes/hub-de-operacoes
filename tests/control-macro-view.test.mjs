import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const domain=createRequire(import.meta.url)('../src/control-macro/domain.js');
const source=await readFile(new URL('../src/control-macro/view.js',import.meta.url),'utf8');
const template=await readFile(new URL('../src/control-macro/template.html',import.meta.url),'utf8');
const ctx=vm.createContext({window:{}});vm.runInContext(source,ctx);
function harness(rows=[],{beforeRender}={}){
  const h=createRoot(),state=ctx.window.ControlMacroView.createState();
  h.setList('[data-macro-trend-metric]',['finance','performance','roi','clicks','sales'].map(macroTrendMetric=>({macroTrendMetric})));
  let current=rows,imports=0;
  const controller=ctx.window.ControlMacroView.mount({root:h.root,state,getRows:()=>current,domain,format,onImportHistory:()=>imports++,beforeRender});
  return {...h,state,controller,setRows:rows=>{current=rows},imports:()=>imports};
}
const row={date:'2026-09-29',investment:100,revenue:150,profit:50,roi:50,clicks:10,sales:2,officialSales:1,pendingSales:1,pendingRevenue:20,source:'mixed',observation:'<synthetic>',productSales:[{product:'Wego6',sales:1,amount:433.91,provisional:false},{product:'StopWatt',sales:1,amount:20,provisional:true}]};

test('Macro renders existing totals, provenance and provisional values without mutating input',()=>{
  const rows=[structuredClone(row)],original=structuredClone(rows),h=harness(rows);h.state.macroMonth='2026-09';h.controller.render();
  assert.match(h.get('#macroKpis').innerHTML,/BRL 100.00/);
  assert.match(h.get('#macroKpis').innerHTML,/1 oficiais · 1 provisórias/);
  assert.match(h.get('#macroDailyBody').innerHTML,/Planilha \+ MCC/);
  assert.match(h.get('#macroDailyBody').innerHTML,/&lt;synthetic&gt;/);
  assert.match(h.get('#macroDailyBody').innerHTML,/1 Wego6 \(BRL 433\.91\)/);
  assert.match(h.get('#macroDailyBody').innerHTML,/1 StopWatt \(BRL 20\.00\)/);
  assert.match(h.get('#macroDailyFoot').innerHTML,/<th scope="row">Total do mês<\/th>/);
  assert.match(h.get('#macroDailyFoot').innerHTML,/BRL 100\.00.*BRL 150\.00.*BRL 50\.00.*50%.*10.*2/);
  assert.equal((h.get('#macroKpis').innerHTML.match(/class="card macro-kpi"/g)||[]).length,8,'os sete indicadores mensais e o lucro histórico aparecem na mesma grade');
  assert.match(h.get('#macroKpis').innerHTML,/Lucro total/);
  assert.match(h.get('#macroKpis').innerHTML,/Histórico completo/);
  assert.deepEqual(rows,original);
});
test('Macro table footer totals only the selected month and calculates aggregate ROI from summed profit and investment',()=>{
  const rows=[
    {...structuredClone(row),date:'2026-09-29',investment:100,revenue:150,profit:50,roi:50,clicks:10,sales:2},
    {...structuredClone(row),date:'2026-09-28',investment:50,revenue:120,profit:70,roi:140,clicks:5,sales:3},
    {...structuredClone(row),date:'2026-08-31',investment:1000,revenue:900,profit:-100,roi:-10,clicks:500,sales:40},
  ];
  const h=harness(rows);h.state.macroMonth='2026-09';h.controller.render();
  const footer=h.get('#macroDailyFoot').innerHTML;
  assert.match(footer,/BRL 150\.00.*BRL 270\.00.*BRL 120\.00.*80%.*15.*5/);
  assert.doesNotMatch(footer,/1000|900|500|40/,'não inclui linhas de outro mês');
  assert.match(footer,/<td><\/td><td><\/td><td><\/td><\/tr>/,'não inventa totais para colunas fora das sinalizadas');
});
test('Macro rechecks Billing on each render and labels the reconciliation status',async()=>{
  let h,calls=0,fail=false;
  h=harness([row],{beforeRender:async()=>{calls++;if(fail)throw new Error('IndexedDB indisponível');h.state.macroBillingCheckedAt='2026-10-18T12:34:00';h.state.controlMacroBillingCheck={activeRecords:14,billingConversions:14,appliedSales:1,appliedRevenue:225.5,macroAheadSalesDates:0};h.state.macroBillingReadError=null}});
  h.state.macroMonth='2026-09';
  await h.controller.render();
  assert.equal(calls,1);
  assert.match(h.get('#macroBillingStatus').textContent,/14 registros ativos \/ 14 conversões/);
  assert.match(h.get('#macroBillingStatus').textContent,/1 venda incorporada/);
  await h.get('#macroTrendDaily').onclick();
  assert.equal(calls,2,'trocar o gráfico também atualiza a validação com o Faturamento');
  fail=true;await h.controller.render();
  assert.match(h.get('#macroBillingStatus').textContent,/não validado/);
  assert.equal(h.get('#macroBillingStatus').classList.contains('billing-error'),true);
});
test('Macro removes provisional labels from MCC-confirmed sales and keeps the compact product name',()=>{
  const h=harness([{...row,sales:1,officialSales:1,pendingSales:0,pendingRevenue:0,productSales:[{product:'Wego6',sales:1,amount:433.91,provisional:false}]}]);
  h.state.macroMonth='2026-09';h.controller.render();
  const html=h.get('#macroDailyBody').innerHTML;
  assert.match(html,/<td>1<\/td>/);
  assert.match(html,/1 Wego6 \(BRL 433\.91\)/);
  assert.doesNotMatch(html,/inclui .* provisória|; provisória/);
});
test('Macro hides per-row Billing revenue differences while keeping the authoritative revenue',()=>{
  const h=harness([{...row,pendingRevenue:0,billingRevenueDelta:-5}]);h.state.macroMonth='2026-09';h.controller.render();
  const html=h.get('#macroDailyBody').innerHTML;
  assert.match(html,/<td>BRL 150\.00<\/td>/,'a célula continua exibindo a receita consolidada recebida da fonte');
  assert.doesNotMatch(html,/billingRevenueDelta|class="macro-billing-detail"[^>]*>[^<]*Faturamento/);
});
test('Macro shows concise product name, sales count and value for Billing details',()=>{
  const h=harness([{...row,observation:'',productSales:[
    {product:'ResQVac - CTC $49.99 - Presell Page - Accepts PayPal - Including Checkout Event Tracking - (eCommerce / Product) - [US]',sales:1,amount:293.99,billing:true},
    {product:'Slimqa Slim Coffee Booster - German Page - (New)',sales:2,amount:239.68,billing:true},
    {product:'20/09 - Total-Control 04 (CB-BB-US) 85% - US$ 45',sales:1,amount:958.27,billing:true},
  ]}]);
  h.state.macroMonth='2026-09';h.controller.render();
  const html=h.get('#macroDailyBody').innerHTML;
  assert.match(html,/1 ResQVac \(BRL 293\.99\)/);
  assert.match(html,/2 Slimqa Slim Coffee Booster \(BRL 239\.68\)/);
  assert.match(html,/1 Total-Control \(BRL 958\.27\)/);
  assert.doesNotMatch(html,/Presell|PayPal|Checkout Event|German Page|CB-BB|Faturamento\)/);
});
test('Macro month controls preserve selection when data is refreshed',()=>{
  const h=harness([row]);h.state.macroMonth='2026-09';h.controller.render();
  h.get('#macroPreviousMonth').onclick();assert.equal(h.state.macroMonth,'2026-08');
  h.setRows([row]);h.controller.render();assert.equal(h.state.macroMonth,'2026-08');
  h.get('#macroNextMonth').onclick();assert.equal(h.state.macroMonth,'2026-09');
  h.get('#macroCurrentMonth').onclick();assert.equal(h.state.macroMonth,domain.currentMonth());
});
test('Macro uses the compact shared navigator and keeps the current-month action outside it',async()=>{
  const css=await readFile(new URL('../src/control-macro/control-macro.css',import.meta.url),'utf8');
  const nav=css.match(/\.macro-month-nav\{([^}]+)\}/)?.[1];
  assert.match(template,/class="macro-month-nav" role="group" aria-label="Navegação por mês"/);
  assert.match(nav,/background:transparent/);
  assert.match(nav,/align-items:center/);
  assert.match(nav,/border:0/);
  assert.match(template, /class="hub-month-navigation"[\s\S]*?id="macroMonthLabel" class="hub-month-label"[\s\S]*?<\/div>\s*<button id="macroCurrentMonth" class="btn hub-month-current"/);
  assert.doesNotMatch(css,/\.macro-month-label\{/);
  assert.match(css,/@media\(max-width:700px\).*\.macro-month-nav\{[^}]*flex-wrap:wrap/s);
});
test('Macro empty state, zero and missing values remain distinct',()=>{
  const h=harness([{...row,investment:0,revenue:null,profit:null,roi:null,sales:null,pendingSales:0}]);
  h.state.macroMonth='2026-09';h.controller.render();
  assert.match(h.get('#macroDailyBody').innerHTML,/<td>BRL 0.00<\/td><td>—/);
  h.setRows([]);h.controller.render();assert.match(h.get('#macroDailyBody').innerHTML,/Não há dias com dados/);assert.equal(h.get('#macroDailyFoot').innerHTML,'');
});
test('Macro marks sales without product detail and escapes imported product names',()=>{
  const unknown=harness([{...row,observation:'',productSales:[{product:null,sales:2,amount:25,provisional:false}]}]);unknown.state.macroMonth='2026-09';unknown.controller.render();
  assert.match(unknown.get('#macroDailyBody').innerHTML,/2 vendas sem produto identificado/);
  assert.match(unknown.get('#macroDailyBody').innerHTML,/2 vendas sem produto identificado \(BRL 25\.00\)/);
  const untrusted=harness([{...row,observation:'',productSales:[{product:'<img src=x>',sales:1,amount:1,provisional:false}]}]);untrusted.state.macroMonth='2026-09';untrusted.controller.render();
  assert.match(untrusted.get('#macroDailyBody').innerHTML,/&lt;img src=x&gt;/);
  assert.doesNotMatch(untrusted.get('#macroDailyBody').innerHTML,/<img src=x>/);
});
test('Macro charts preserve all metrics, gaps, coverage and aligned performance tracks',()=>{
  const h=harness([row,{...row,date:'2026-09-30',clicks:null,revenue:null,roi:null}]);h.state.macroMonth='2026-09';
  h.get('#macroTrendDaily').onclick();assert.equal(h.state.macroTrendScope,'daily');
  for(const button of h.root.querySelectorAll('[data-macro-trend-metric]')){
    button.onclick();assert.match(h.get('#macroTrendChart').innerHTML,/<svg/);
    assert.match(h.get('#macroTrendChart').innerHTML,/cobertura/);
  }
  h.state.macroTrendMetric='performance';h.controller.renderTrend();
  assert.match(h.get('#macroTrendChart').innerHTML,/macro-trend-performance-svg/);
  assert.match(h.get('#macroTrendChart').innerHTML,/oficiais, .* provisórias/);
  h.get('#macroTrendMonthly').onclick();assert.equal(h.state.macroTrendScope,'monthly');
  h.get('#macroHistoryInput').onchange();assert.equal(h.imports(),1);
  assert.doesNotMatch(source,/indexedDB|localStorage|fetch\(/);
});
test('Macro monthly clicks chart shows each month clicks per sale; daily view stays unchanged',()=>{
  const h=harness([row,{...row,date:'2026-08-29',clicks:0},{...row,date:'2026-07-29',clicks:null}]);h.state.macroMonth='2026-09';
  h.get('#macroTrendDaily').onclick();h.state.macroTrendMetric='clicks';h.controller.renderTrend();
  assert.doesNotMatch(h.get('#macroTrendChart').innerHTML,/macro-chart-bar-average|Cliques por venda/);
  h.get('#macroTrendMonthly').onclick();h.state.macroTrendMetric='clicks';h.controller.renderTrend();
  assert.match(h.get('#macroTrendLegend').innerHTML,/Cliques por venda/);
  assert.match(h.get('#macroTrendChart').innerHTML,/macro-chart-bar-average/);
  assert.match(h.get('#macroTrendChart').innerHTML,/10 cliques ÷ 2 vendas \(oficiais, provisórias e Faturamento/);
  assert.match(h.get('#macroTrendChart').innerHTML,/Evolução de cliques e cliques por venda/);
  assert.match(h.get('#macroTrendChart').innerHTML,/Cliques por venda/,'eixo secundário distingue a escala da taxa da escala de cliques');
  assert.match(template,/No modo Desempenho e na série Cliques por venda, as escalas são independentes/);
});
test('Macro import conflict preview retains shared formatters and performs no writes',async()=>{
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const h=createRoot(),state={};
  const sandbox=vm.createContext({state,$:h.root.querySelector,esc:format.esc,fmtMoney:format.money,
    ControlMacroView:ctx.window.ControlMacroView,ControlMacroDomain:domain,macroHistory:()=>[row]});
  const names=['macroInputDate','macroMoney','openMacroImport'];
  vm.runInContext(names.map(name=>template.split(/\r?\n/).find(line=>line.trimStart().startsWith('function '+name+'('))).join('\n'),sandbox);
  const entries=[{...row,investment:120}],original=structuredClone(entries);
  sandbox.openMacroImport(entries,'synthetic.xlsx');
  assert.match(h.get('#macroImportConflictList').innerHTML,/29\/09\/2026/);
  assert.match(h.get('#macroImportConflictList').innerHTML,/BRL 120.00/);
  assert.equal(h.get('#macroImportModal').classList.contains('hidden'),false);
  assert.deepEqual(entries,original);
});
