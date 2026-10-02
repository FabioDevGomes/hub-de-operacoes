import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/product-diary/domain.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../src/product-diary/view.js',import.meta.url),'utf8'),context);
const domain=context.window.ProductDiaryDomain,view=context.window.ProductDiaryView;
function setup(initial){
  const dom=createRoot(),titles=[],requests=[];let snapshot=initial;
  const controller=view.mount({root:dom.root,domain,format,getSnapshot:(...args)=>{requests.push(args);return snapshot},
    actions:{setTitle:(...args)=>titles.push(args)}});
  return {...dom,titles,requests,controller,setSnapshot:value=>snapshot=value};
}
const empty=()=>({sheetName:'Oferta <Teste>',rows:[],displayRows:[],manualSalesByDate:new Map(),summary:null,pauseConfirmedAt:null,investment:null});
test('native diary preserves columns, empty data, escaping and selection arguments',()=>{
  const s=setup(empty());s.controller.render('MCC exata','workbook','campaign-123');
  assert.deepEqual(s.requests,[['MCC exata','workbook','campaign-123']]);
  assert.equal((s.get('#productHead').innerHTML.match(/<th>/g)||[]).length,17);
  assert.match(s.get('#productBody').innerHTML,/colspan="17"/);assert.match(s.get('#productSummary').innerHTML,/&lt;Teste&gt;/);
  assert.match(s.get('#productSummary').innerHTML,/<strong>—<\/strong>/);assert.equal(s.get('#rowCount').textContent,'0 dias');
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),true);
});
test('manual-sale rows remain display-only, official zero separate, formats preserved',()=>{
  const rows=[{date:'2026-09-29',cells:{A:{value:'2026-09-29'},C:{value:4},F:{value:0},E:{value:0.25},O:{value:12.34},Q:{value:'<observação>'}}}];
  const adjustments=new Map([['2026-09-29',{pendingConversions:1}],['2026-09-30',{pendingConversions:2}]]),before=JSON.stringify(rows);
  const s=setup({...empty(),rows,displayRows:rows,manualSalesByDate:adjustments,investment:0});
  s.controller.render('MCC exata');
  const html=s.get('#productBody').innerHTML;
  assert.equal((html.match(/class="has-sales"/g)||[]).length,2);assert.match(html,/<span>0<\/span><small[^>]*>\+1 manual · provisória/);
  assert.match(html,/25%/);assert.match(html,/12.34/);assert.match(html,/&lt;observação&gt;/);
  assert.match(s.get('#productSummary').innerHTML,/<span>Conversões<\/span><strong>0<\/strong>/);
  assert.match(s.get('#productSummary').innerHTML,/BRL 0.00/);assert.equal(s.get('#rowCount').textContent,'2 dias');
  assert.equal(JSON.stringify(rows),before);assert.equal(rows.length,1);assert.equal(rows[0].cells.F.value,0);
  s.controller.render('MCC exata');assert.equal(s.get('#productBody').innerHTML,html);
});
test('confirmed pause marks its diary date and hides later daily and provisional rows without mutating history',()=>{
  const rows=[
    {date:'2026-09-29',cells:{A:{value:'2026-09-29'},B:{value:10},Q:{value:'Estado informado pela MCC'}}},
    {date:'2026-09-30',cells:{A:{value:'2026-09-30'},B:{value:99}}},
  ],manualSalesByDate=new Map([['2026-09-29',{pendingConversions:1}],['2026-10-01',{pendingConversions:2}]]),before=JSON.stringify(rows);
  const s=setup({...empty(),rows,displayRows:rows,manualSalesByDate,pauseConfirmedAt:'2026-09-29'});
  s.controller.render('Oferta pausada');
  const html=s.get('#productBody').innerHTML;
  assert.match(html,/Campanha pausada na data 29\/09\/2026/);
  assert.match(html,/Estado informado pela MCC/);
  assert.doesNotMatch(html,/2026-09-30|2026-10-01/,'linhas posteriores e vendas provisórias posteriores não aparecem');
  assert.equal(s.get('#rowCount').textContent,'1 dia');
  assert.match(s.get('#productCaption').textContent,/encerrado na pausa confirmada em 29\/09\/2026/);
  assert.equal(JSON.stringify(rows),before,'o recorte da view não altera o diário persistido');
});
test('legacy summary stays separate, preserves observed zero/absence and returns cleanly to native diary',()=>{
  const summary={historical_number:1,metrics:{investment_brl:{state:'observed',value:0},clicks:{state:'unknown',value:null},commission_brl:{state:'observed',value:0}},
    profit_brl:{state:'derived',value:0},roi_percent:{state:'unknown',value:null},end_date:null};
  const before=JSON.stringify(summary),s=setup({...empty(),summary});
  s.controller.render('Legado','legacy','legacy-id');
  assert.equal(s.get('#productPanelTitle').textContent,'Resumo histórico legado');
  assert.equal(s.get('#productTableWrap').classList.contains('hidden'),true);
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),false);
  assert.equal((s.get('#legacySummaryBody').innerHTML.match(/class="legacy-summary-item"/g)||[]).length,7);
  assert.match(s.get('#legacySummaryBody').innerHTML,/BRL 0.00/);assert.match(s.get('#legacySummaryBody').innerHTML,/Não registrado/);
  assert.match(s.get('#productSummary').innerHTML,/nenhuma série diária foi criada/);
  assert.equal(JSON.stringify(summary),before);
  s.setSnapshot(empty());s.controller.render('Nativa','manifest','native-id');
  assert.equal(s.get('#productPanelTitle').textContent,'Diário de campanha');assert.equal(s.get('#productTableWrap').classList.contains('hidden'),false);
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),true);assert.equal(s.get('#legacySummaryBody').innerHTML,'');
});
test('diary pure date/sheet helpers retain real rows and deduplicate display-only provisional dates',()=>{
  const serial=Date.parse('2026-09-29T00:00:00Z')/86400000+25569;
  const sheet={rows:[{cells:{A:{value:'Cabeçalho'}}},{cells:{A:{value:serial},F:{value:1}}}]};
  assert.equal(domain.sheetDailyRows(sheet).length,1);assert.equal(domain.productDiaryRowDate(sheet.rows[1]),'2026-09-29');
  assert.equal(domain.productDiaryRowDate({cells:{A:{text:'30/09/2026'}}}),'2026-09-30');
  const adjustments=new Map([['2026-09-30',{pendingConversions:1}],['2026-10-01',{pendingConversions:0}]]);
  const rows=domain.productDiaryRowsWithManualSales(domain.sheetDailyRows(sheet),adjustments);
  assert.equal(rows.length,2);assert.equal(rows[1].cells.F,undefined);assert.equal(sheet.rows.length,2);
  assert.equal(domain.productDiaryRowsWithManualSales(rows,adjustments).length,2);
});
