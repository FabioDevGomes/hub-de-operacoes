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
function harness(rows=[]){
  const h=createRoot(),state=ctx.window.ControlMacroView.createState();
  h.setList('[data-macro-trend-metric]',['finance','performance','roi','clicks','sales'].map(macroTrendMetric=>({macroTrendMetric})));
  let current=rows,imports=0;
  const controller=ctx.window.ControlMacroView.mount({root:h.root,state,getRows:()=>current,domain,format,onImportHistory:()=>imports++});
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
  assert.match(h.get('#macroDailyBody').innerHTML,/1 StopWatt \(BRL 20\.00; provisória\)/);
  assert.equal((h.get('#macroKpis').innerHTML.match(/class="card macro-kpi"/g)||[]).length,8,'os sete indicadores mensais e o lucro histórico aparecem na mesma grade');
  assert.match(h.get('#macroKpis').innerHTML,/Lucro total/);
  assert.match(h.get('#macroKpis').innerHTML,/Histórico completo/);
  assert.deepEqual(rows,original);
});
test('Macro removes provisional labels from MCC-confirmed sales and keeps the compact product name',()=>{
  const h=harness([{...row,sales:1,officialSales:1,pendingSales:0,pendingRevenue:0,productSales:[{product:'Wego6',sales:1,amount:433.91,provisional:false}]}]);
  h.state.macroMonth='2026-09';h.controller.render();
  const html=h.get('#macroDailyBody').innerHTML;
  assert.match(html,/<td>1<\/td>/);
  assert.match(html,/1 Wego6 \(BRL 433\.91\)/);
  assert.doesNotMatch(html,/inclui .* provisória|; provisória/);
});
test('Macro month controls preserve selection when data is refreshed',()=>{
  const h=harness([row]);h.state.macroMonth='2026-09';h.controller.render();
  h.get('#macroPreviousMonth').onclick();assert.equal(h.state.macroMonth,'2026-08');
  h.setRows([row]);h.controller.render();assert.equal(h.state.macroMonth,'2026-08');
  h.get('#macroNextMonth').onclick();assert.equal(h.state.macroMonth,'2026-09');
  h.get('#macroCurrentMonth').onclick();assert.equal(h.state.macroMonth,domain.currentMonth());
});
test('Macro empty state, zero and missing values remain distinct',()=>{
  const h=harness([{...row,investment:0,revenue:null,profit:null,roi:null,sales:null,pendingSales:0}]);
  h.state.macroMonth='2026-09';h.controller.render();
  assert.match(h.get('#macroDailyBody').innerHTML,/<td>BRL 0.00<\/td><td>—/);
  h.setRows([]);h.controller.render();assert.match(h.get('#macroDailyBody').innerHTML,/Não há dias com dados/);
});
test('Macro marks sales without product detail and escapes imported product names',()=>{
  const unknown=harness([{...row,observation:'',productSales:[{product:null,sales:2,amount:null,provisional:false}]}]);unknown.state.macroMonth='2026-09';unknown.controller.render();
  assert.match(unknown.get('#macroDailyBody').innerHTML,/2 vendas sem produto identificado/);
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
  assert.match(h.get('#macroTrendChart').innerHTML,/10 cliques ÷ 2 vendas \(oficiais \+ provisórias/);
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
