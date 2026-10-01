import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const domain=createRequire(import.meta.url)('../src/control-macro/domain.js');
const source=await readFile(new URL('../src/control-macro/view.js',import.meta.url),'utf8');
const ctx=vm.createContext({window:{}});vm.runInContext(source,ctx);
function harness(rows=[]){
  const h=createRoot(),state=ctx.window.ControlMacroView.createState();
  h.setList('[data-macro-trend-metric]',['finance','performance','roi','clicks','sales'].map(macroTrendMetric=>({macroTrendMetric})));
  let current=rows,imports=0;
  const controller=ctx.window.ControlMacroView.mount({root:h.root,state,getRows:()=>current,domain,format,onImportHistory:()=>imports++});
  return {...h,state,controller,setRows:rows=>{current=rows},imports:()=>imports};
}
const row={date:'2026-09-29',investment:100,revenue:150,profit:50,roi:50,clicks:10,sales:2,officialSales:1,pendingSales:1,pendingRevenue:20,source:'mixed',observation:'<synthetic>'};

test('Macro renders existing totals, provenance and provisional values without mutating input',()=>{
  const rows=[structuredClone(row)],original=structuredClone(rows),h=harness(rows);h.state.macroMonth='2026-09';h.controller.render();
  assert.match(h.get('#macroKpis').innerHTML,/BRL 100.00/);
  assert.match(h.get('#macroKpis').innerHTML,/1 oficiais · 1 provisórias/);
  assert.match(h.get('#macroDailyBody').innerHTML,/Planilha \+ MCC/);
  assert.match(h.get('#macroDailyBody').innerHTML,/&lt;synthetic&gt;/);
  assert.match(h.get('#macroLifetimeKpis').innerHTML,/Lucro total/);
  assert.deepEqual(rows,original);
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
